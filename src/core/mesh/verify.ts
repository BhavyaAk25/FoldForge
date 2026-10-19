import {
  edgeKey,
  faceNormal,
  faceCentre,
  dot,
  sub,
  volume,
  type Mesh,
} from "./geometry";
import type { PapercraftModel } from "./model";
import { convexOverlap, type Vec2 } from "./unfold";

/**
 * Checks a papercraft model from scratch, trusting nothing the builder did:
 *
 * - every part is a closed, outward-facing solid with flat faces;
 * - every printed face is an exact copy of its 3D face (so the net refolds
 *   to the model within REFOLD_MM), and the two faces on each fold meet;
 * - every cut edge has a partner of equal length with the same number, and
 *   one of the pair carries a glue tab;
 * - no paper overlaps other paper, and everything is inside the page margins.
 */

export type PapercraftFailure =
  | { readonly check: "open_surface"; readonly part: string }
  | { readonly check: "inside_out"; readonly part: string }
  | {
      readonly check: "warped_face";
      readonly part: string;
      readonly face: number;
    }
  | {
      readonly check: "refold";
      readonly part: string;
      readonly face: number;
      readonly errorMm: number;
    }
  /** A fold whose two faces do not meet edge to edge on paper. */
  | { readonly check: "fold_gap"; readonly part: string }
  | { readonly check: "unpaired_cut"; readonly label: number }
  | { readonly check: "untabbed_cut"; readonly label: number }
  | { readonly check: "overlap"; readonly page: number }
  | { readonly check: "off_page"; readonly page: number };

/** The refold tolerance from FABRICATION_SPEC: closure residual at most 0.1 mm. */
export const REFOLD_MM = 0.1;
const FLAT_MM = 0.01;

const meshFailures = (part: string, mesh: Mesh): PapercraftFailure[] => {
  const failures: PapercraftFailure[] = [];
  const uses = new Map<string, number>();
  mesh.faces.forEach((face) =>
    face.forEach((v, i) => {
      const key = edgeKey(v, face[(i + 1) % face.length]!);
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }),
  );
  if ([...uses.values()].some((n) => n !== 2))
    failures.push({ check: "open_surface", part });
  if (volume(mesh) <= 0) failures.push({ check: "inside_out", part });
  mesh.faces.forEach((face, f) => {
    const n = faceNormal(mesh, f);
    const p0 = mesh.vertices[face[0]!]!;
    if (
      face.some((v) => Math.abs(dot(n, sub(mesh.vertices[v]!, p0))) > FLAT_MM)
    ) {
      failures.push({ check: "warped_face", part, face: f });
    }
  });
  // Outward: each face's normal points away from the part's centre of faces.
  const centre = mesh.faces
    .map((_, f) => faceCentre(mesh, f))
    .reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
  const middle = [
    centre[0] / mesh.faces.length,
    centre[1] / mesh.faces.length,
    centre[2] / mesh.faces.length,
  ] as const;
  if (
    mesh.faces.some(
      (_, f) => dot(faceNormal(mesh, f), sub(faceCentre(mesh, f), middle)) <= 0,
    )
  ) {
    failures.push({ check: "inside_out", part });
  }
  return failures;
};

const distance2 = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export const verifyPapercraft = (
  model: PapercraftModel,
): PapercraftFailure[] => {
  const failures: PapercraftFailure[] = model.parts.flatMap((p) =>
    meshFailures(p.id, p.mesh),
  );
  const meshes = new Map(model.parts.map((p) => [p.id, p.mesh]));
  const cutLengths = new Map<number, number[]>();
  const tabbed = new Set<number>();

  model.pages.forEach((page, pageIndex) => {
    for (const island of page) {
      const mesh = meshes.get(island.part)!;
      // Refold: every pair of corners keeps its 3D distance on paper, which
      // makes each flat face congruent to its 3D face.
      for (const { face, points } of island.faces) {
        const corners = mesh.faces[face]!;
        let worst = 0;
        corners.forEach((a, i) =>
          corners.forEach((b, j) => {
            if (j <= i) return;
            const real = Math.sqrt(
              sub(mesh.vertices[b]!, mesh.vertices[a]!).reduce(
                (s, x) => s + x * x,
                0,
              ),
            );
            worst = Math.max(
              worst,
              Math.abs(real - distance2(points[i]!, points[j]!)),
            );
          }),
        );
        // Printed side up: a mirrored face would keep its lengths but fold
        // inside out. Pages are y-down, so an outside face winds clockwise.
        const signed = points.reduce((sum, p, i) => {
          const q = points[(i + 1) % points.length]!;
          return sum + p[0] * q[1] - q[0] * p[1];
        }, 0);
        if (worst > REFOLD_MM || signed >= 0)
          failures.push({
            check: "refold",
            part: island.part,
            face,
            errorMm: worst,
          });
      }
      // Each fold must be an edge both of its faces draw at the same place.
      const drawn = new Map<string, Vec2[][]>();
      for (const { face, points } of island.faces) {
        const corners = mesh.faces[face]!;
        corners.forEach((v, i) => {
          const w = corners[(i + 1) % corners.length]!;
          const key = edgeKey(v, w);
          drawn.set(key, [
            ...(drawn.get(key) ?? []),
            [points[i]!, points[(i + 1) % corners.length]!],
          ]);
        });
      }
      const joined = [...drawn.values()].filter(
        (pair) =>
          pair.length === 2 &&
          distance2(pair[0]![0]!, pair[1]![1]!) < FLAT_MM &&
          distance2(pair[0]![1]!, pair[1]![0]!) < FLAT_MM,
      ).length;
      if (joined !== island.folds.length)
        failures.push({ check: "fold_gap", part: island.part });
      for (const cut of island.cuts) {
        cutLengths.set(cut.label, [
          ...(cutLengths.get(cut.label) ?? []),
          distance2(cut.from, cut.to),
        ]);
        if (cut.tab) tabbed.add(cut.label);
      }
    }
    const polygons = page.flatMap((island) => [
      ...island.faces.map((f) => f.points),
      ...island.cuts.flatMap((c) => (c.tab ? [c.tab] : [])),
    ]);
    if (
      polygons.some((p) =>
        p.some(
          ([x, y]) =>
            x < 0 ||
            y < 0 ||
            x > model.sheet.widthMm ||
            y > model.sheet.heightMm,
        ),
      )
    ) {
      failures.push({ check: "off_page", page: pageIndex });
    }
    outer: for (let i = 0; i < polygons.length; i += 1) {
      for (let j = i + 1; j < polygons.length; j += 1) {
        if (convexOverlap(polygons[i]!, polygons[j]!)) {
          failures.push({ check: "overlap", page: pageIndex });
          break outer;
        }
      }
    }
  });
  for (const [label, lengths] of cutLengths) {
    if (lengths.length !== 2 || Math.abs(lengths[0]! - lengths[1]!) > REFOLD_MM)
      failures.push({ check: "unpaired_cut", label });
    if (!tabbed.has(label)) failures.push({ check: "untabbed_cut", label });
  }
  return failures;
};
