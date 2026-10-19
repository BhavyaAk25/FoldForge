import { err, ok, type Result } from "../result";
import {
  add,
  cross,
  dot,
  faceNormal,
  mapMesh,
  normalize,
  rotate,
  sub,
  type Mesh,
  type Vec3,
} from "./geometry";
import { box, ellipsoid, frustum } from "./primitives";
import {
  unfold,
  type Cut,
  type Fold,
  type Island,
  type Printable,
  type Vec2,
} from "./unfold";

/**
 * A papercraft model from parts: each part is a low-poly solid with a size,
 * position, rotation, and colour. Parts are separate closed pieces glued
 * where they touch, so no solid geometry operations are needed. Each part is
 * unfolded on its own and its islands are packed onto printable sheets.
 */

export type Shape =
  | {
      readonly kind: "ellipsoid";
      readonly segments?: number;
      readonly rings?: number;
    }
  | { readonly kind: "box" }
  /** n-sided cross-section; `top` scales the top end (0 = cone, 1 = prism). */
  | { readonly kind: "taper"; readonly sides: number; readonly top: number };

export interface PartSpec {
  readonly id: string;
  readonly name: string;
  readonly shape: Shape;
  /** Full extents along x, y, z before rotation, mm. */
  readonly size: Vec3;
  readonly position: Vec3;
  /** Degrees about x, then y, then z. */
  readonly rotation?: Vec3;
  readonly color: string;
}

/** A printed circle (an eye, a nostril) where a ray from the part centre leaves it. */
export interface DecalSpec {
  readonly part: string;
  readonly direction: Vec3;
  readonly radiusMm: number;
  readonly color: string;
}

export interface PapercraftSpec {
  readonly title: string;
  readonly parts: readonly PartSpec[];
  readonly decals?: readonly DecalSpec[];
}

export interface Sheet {
  readonly widthMm: number;
  readonly heightMm: number;
}

export const A4: Sheet = { widthMm: 210, heightMm: 297 };
const MARGIN_MM = 10;
const GAP_MM = 4;

export interface PlacedIsland {
  readonly part: string;
  readonly color: string;
  readonly faces: readonly {
    readonly face: number;
    readonly points: readonly Vec2[];
  }[];
  readonly folds: readonly Fold[];
  readonly cuts: readonly Cut[];
  readonly decals: readonly {
    readonly centre: Vec2;
    readonly radiusMm: number;
    readonly color: string;
  }[];
}

export interface PapercraftModel {
  readonly title: string;
  readonly parts: readonly {
    readonly id: string;
    readonly name: string;
    readonly color: string;
    readonly mesh: Mesh;
  }[];
  /** Decals in 3D for the preview: centre, outward normal, radius. */
  readonly decals: readonly {
    readonly centre: Vec3;
    readonly normal: Vec3;
    readonly radiusMm: number;
    readonly color: string;
  }[];
  readonly sheet: Sheet;
  readonly pages: readonly (readonly PlacedIsland[])[];
}

export type PapercraftError =
  | { readonly kind: "unknown_part"; readonly part: string }
  | { readonly kind: "too_large"; readonly part: string };

const meshOf = (part: PartSpec): Mesh => {
  const [w, d, h] = part.size;
  const local =
    part.shape.kind === "box"
      ? box(w, d, h)
      : part.shape.kind === "ellipsoid"
        ? ellipsoid(w / 2, d / 2, h / 2, part.shape.segments, part.shape.rings)
        : frustum(part.shape.sides, w / 2, d / 2, part.shape.top, h);
  return mapMesh(local, (p) =>
    add(rotate(p, part.rotation ?? [0, 0, 0]), part.position),
  );
};

/** The affine map from a face's 3D plane to its place on paper. */
const paperPoint = (
  mesh: Mesh,
  face: number,
  flat: readonly Vec2[],
  p: Vec3,
): Vec2 => {
  const corners = mesh.faces[face]!.map((v) => mesh.vertices[v]!);
  const [o, a] = [corners[0]!, corners[1]!];
  const u = normalize(sub(a, o));
  const w = cross(faceNormal(mesh, face), u);
  const [s, t] = [dot(sub(p, o), u), dot(sub(p, o), w)];
  const [O, A] = [flat[0]!, flat[1]!];
  const l = Math.hypot(A[0] - O[0], A[1] - O[1]);
  const [ux, uy] = [(A[0] - O[0]) / l, (A[1] - O[1]) / l];
  // Flat faces keep their orientation (printed side up), so w maps to u turned left.
  return [O[0] + s * ux - t * uy, O[1] + s * uy + t * ux];
};

/** The face a ray from `origin` along `direction` leaves through, and where. */
const exitPoint = (
  mesh: Mesh,
  origin: Vec3,
  direction: Vec3,
): { face: number; point: Vec3 } | null => {
  let best: { face: number; point: Vec3; distance: number } | null = null;
  mesh.faces.forEach((corners, face) => {
    const n = faceNormal(mesh, face);
    const denominator = dot(n, direction);
    if (denominator <= 1e-9) return;
    const distance =
      dot(n, sub(mesh.vertices[corners[0]!]!, origin)) / denominator;
    const point = add(origin, [
      direction[0] * distance,
      direction[1] * distance,
      direction[2] * distance,
    ]);
    const inside = corners.every((v, i) => {
      const next = mesh.vertices[corners[(i + 1) % corners.length]!]!;
      return (
        dot(
          cross(sub(next, mesh.vertices[v]!), sub(point, mesh.vertices[v]!)),
          n,
        ) >= -1e-9
      );
    });
    if (inside && distance > 0 && (!best || distance < best.distance))
      best = { face, point, distance };
  });
  return best;
};

const rotateFlat = (p: Vec2, angle: number): Vec2 => [
  p[0] * Math.cos(angle) - p[1] * Math.sin(angle),
  p[0] * Math.sin(angle) + p[1] * Math.cos(angle),
];

/** Moves every point of an island (and its decals) by one rigid map. */
const moveIsland = (
  island: PlacedIsland,
  f: (p: Vec2) => Vec2,
): PlacedIsland => ({
  ...island,
  faces: island.faces.map((face) => ({
    face: face.face,
    points: face.points.map(f),
  })),
  folds: island.folds.map((fold) => ({
    ...fold,
    from: f(fold.from),
    to: f(fold.to),
  })),
  cuts: island.cuts.map((cut) => ({
    ...cut,
    from: f(cut.from),
    to: f(cut.to),
    tab: cut.tab ? cut.tab.map(f) : null,
  })),
  decals: island.decals.map((d) => ({ ...d, centre: f(d.centre) })),
});

/** Turn each island to its smallest upright bounding box, then pack shelves onto pages. */
const pack = (
  islands: readonly PlacedIsland[],
  sheet: Sheet,
): PlacedIsland[][] | null => {
  const [W, H] = [
    sheet.widthMm - 2 * MARGIN_MM,
    sheet.heightMm - 2 * MARGIN_MM,
  ];
  const boxed = islands.map((island) => {
    let best: { island: PlacedIsland; w: number; h: number } | null = null;
    for (let degrees = 0; degrees < 180; degrees += 5) {
      const turned = moveIsland(island, (p) =>
        rotateFlat(p, (degrees * Math.PI) / 180),
      );
      const points = [
        ...turned.faces.flatMap((f) => f.points),
        ...turned.cuts.flatMap((c) => c.tab ?? []),
      ];
      const [minX, minY] = [
        Math.min(...points.map((p) => p[0])),
        Math.min(...points.map((p) => p[1])),
      ];
      const w = Math.max(...points.map((p) => p[0])) - minX;
      const h = Math.max(...points.map((p) => p[1])) - minY;
      if (w > W || h > H) continue;
      if (!best || w * h < best.w * best.h)
        best = {
          island: moveIsland(turned, (p) => [p[0] - minX, p[1] - minY]),
          w,
          h,
        };
    }
    return best;
  });
  if (boxed.some((b) => b === null)) return null;
  const pages: PlacedIsland[][] = [];
  let [x, y, row] = [0, 0, 0];
  let page: PlacedIsland[] = [];
  for (const b of [...boxed].sort((p, q) => q!.h - p!.h)) {
    const { island, w, h } = b!;
    if (x + w > W) [x, y, row] = [0, y + row + GAP_MM, 0];
    if (y + h > H) {
      pages.push(page);
      [page, x, y, row] = [[], 0, 0, 0];
    }
    page.push(
      moveIsland(island, (p) => [p[0] + MARGIN_MM + x, p[1] + MARGIN_MM + y]),
    );
    [x, row] = [x + w + GAP_MM, Math.max(row, h)];
  }
  if (page.length > 0) pages.push(page);
  return pages;
};

export const buildPapercraft = (
  spec: PapercraftSpec,
  sheet: Sheet = A4,
): Result<PapercraftModel, PapercraftError> => {
  const printable: Printable = {
    longMm: Math.max(sheet.widthMm, sheet.heightMm) - 2 * MARGIN_MM,
    shortMm: Math.min(sheet.widthMm, sheet.heightMm) - 2 * MARGIN_MM,
  };
  const parts = spec.parts.map((part) => ({ spec: part, mesh: meshOf(part) }));
  for (const decal of spec.decals ?? []) {
    if (!parts.some((p) => p.spec.id === decal.part))
      return err({ kind: "unknown_part", part: decal.part });
  }
  const decals3d: PapercraftModel["decals"][number][] = [];
  const islands: PlacedIsland[] = [];
  let label = 1;
  for (const { spec: part, mesh } of parts) {
    const unfolded = unfold(mesh, printable, label);
    label = unfolded.nextLabel;
    const placed = unfolded.islands.map((island) => ({
      part: part.id,
      color: part.color,
      faces: island.faces,
      folds: island.folds,
      cuts: island.cuts,
      decals: [] as { centre: Vec2; radiusMm: number; color: string }[],
    }));
    for (const decal of (spec.decals ?? []).filter((d) => d.part === part.id)) {
      const direction = normalize(
        rotate(decal.direction, part.rotation ?? [0, 0, 0]),
      );
      const hit = exitPoint(mesh, part.position, direction);
      if (!hit) continue;
      decals3d.push({
        centre: hit.point,
        normal: faceNormal(mesh, hit.face),
        radiusMm: decal.radiusMm,
        color: decal.color,
      });
      const island = placed.find((i) =>
        i.faces.some((f) => f.face === hit.face),
      )!;
      const flat = island.faces.find((f) => f.face === hit.face)!.points;
      island.decals.push({
        centre: paperPoint(mesh, hit.face, flat, hit.point),
        radiusMm: decal.radiusMm,
        color: decal.color,
      });
    }
    islands.push(...placed);
  }
  // Pages use SVG coordinates (y down). Mirror each island into them so the
  // printed side shows the outside of the model, not its mirror image.
  const pages = pack(
    islands.map((island) => moveIsland(island, ([x, y]) => [x, -y])),
    sheet,
  );
  if (!pages) {
    const big = islands.find((island) => pack([island], sheet) === null)!;
    return err({ kind: "too_large", part: big.part });
  }
  return ok({
    title: spec.title,
    parts: parts.map(({ spec: part, mesh }) => ({
      id: part.id,
      name: part.name,
      color: part.color,
      mesh,
    })),
    decals: decals3d,
    sheet,
    pages,
  });
};
