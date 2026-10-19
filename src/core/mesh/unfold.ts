import {
  cross,
  dot,
  edgeKey,
  faceNormal,
  faceCentre,
  length,
  normalize,
  scale,
  sub,
  type Mesh,
  type Vec3,
} from "./geometry";

/**
 * Unfolds a closed mesh into flat islands for printing.
 *
 * An island grows one face at a time across its longest uncut edge; a face is
 * attached only if its flat image does not overlap any face already placed,
 * so islands never overlap themselves. Attaching across an edge is an exact
 * rotation about that edge, so the island refolds to the mesh. Every edge
 * left unattached is a cut: its two sides share a number, and one side gets
 * a glue tab if the tab fits without covering paper.
 */

export type Vec2 = readonly [number, number];

export interface NetFace {
  readonly face: number;
  /** The face's corners on paper, in the mesh face's vertex order (CCW). */
  readonly points: readonly Vec2[];
}

export interface Fold {
  readonly from: Vec2;
  readonly to: Vec2;
  /** Bend from flat, degrees. Mountain folds away from the printed side. */
  readonly angleDeg: number;
  readonly mountain: boolean;
}

export interface Cut {
  readonly from: Vec2;
  readonly to: Vec2;
  /** Shared by the two sides of a cut, so the edges can be matched. */
  readonly label: number;
  readonly tab: readonly Vec2[] | null;
}

export interface Island {
  readonly faces: readonly NetFace[];
  readonly folds: readonly Fold[];
  readonly cuts: readonly Cut[];
}

/** Paper tolerance: overlaps smaller than this are touching, not overlapping. */
const TOUCH_MM = 0.02;
/** Tab heights tried in turn; a crowded seam gets a smaller tab. */
const TAB_HEIGHTS_MM = [7, 4.5, 3, 2];

/** The printable area of a sheet; no island may outgrow it. */
export interface Printable {
  readonly longMm: number;
  readonly shortMm: number;
}

const sub2 = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const len2 = (a: Vec2): number => Math.hypot(a[0], a[1]);

/** Separating-axis test for convex polygons; touching edges do not count. */
export const convexOverlap = (
  p: readonly Vec2[],
  q: readonly Vec2[],
): boolean => {
  for (const polygon of [p, q]) {
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i]!;
      const b = polygon[(i + 1) % polygon.length]!;
      const edge = sub2(b, a);
      const n: Vec2 = [
        -edge[1] / (len2(edge) || 1),
        edge[0] / (len2(edge) || 1),
      ];
      const project = (points: readonly Vec2[]) =>
        points.map((v) => v[0] * n[0] + v[1] * n[1]);
      const [pp, qq] = [project(p), project(q)];
      if (
        Math.min(Math.max(...pp), Math.max(...qq)) -
          Math.max(Math.min(...pp), Math.min(...qq)) <=
        TOUCH_MM
      )
        return false;
    }
  }
  return true;
};

interface EdgeUse {
  readonly face: number;
  readonly index: number;
}

const edgeUses = (mesh: Mesh): Map<string, EdgeUse[]> => {
  const uses = new Map<string, EdgeUse[]>();
  mesh.faces.forEach((face, f) =>
    face.forEach((v, i) => {
      const key = edgeKey(v, face[(i + 1) % face.length]!);
      uses.set(key, [...(uses.get(key) ?? []), { face: f, index: i }]);
    }),
  );
  return uses;
};

/** The first face of an island, laid flat in its own plane. */
const layFlat = (mesh: Mesh, face: number): Vec2[] => {
  const corners = mesh.faces[face]!.map((v) => mesh.vertices[v]!);
  const origin = corners[0]!;
  const u = normalize(sub(corners[1]!, origin));
  const w = cross(faceNormal(mesh, face), u);
  return corners.map((p) => [dot(sub(p, origin), u), dot(sub(p, origin), w)]);
};

/**
 * A face attached across the edge from a to b (3D) whose flat ends are A, B.
 * Each corner keeps its distance along and from the edge, on the side away
 * from the face already placed (which lies to the left of A to B).
 */
const attach = (
  mesh: Mesh,
  face: number,
  a: Vec3,
  b: Vec3,
  A: Vec2,
  B: Vec2,
): Vec2[] => {
  const e = sub(b, a);
  const e2 = sub2(B, A);
  const away: Vec2 = [e2[1] / len2(e2), -e2[0] / len2(e2)];
  return mesh.faces[face]!.map((v) => {
    const offset = sub(mesh.vertices[v]!, a);
    const t = dot(offset, e) / dot(e, e);
    const h = length(sub(offset, scale(e, t)));
    return [A[0] + t * e2[0] + h * away[0], A[1] + t * e2[1] + h * away[1]];
  });
};

/** Glue tab on the outside of edge A to B of a CCW polygon (outside is to the right). */
const tabOn = (A: Vec2, B: Vec2, height: number): Vec2[] => {
  const e = sub2(B, A);
  const l = len2(e);
  const [ux, uy] = [e[0] / l, e[1] / l];
  const [nx, ny] = [uy, -ux];
  const inset = Math.min(height, l / 2.5);
  return [
    A,
    B,
    [B[0] + nx * height - ux * inset, B[1] + ny * height - uy * inset],
    [A[0] + nx * height + ux * inset, A[1] + ny * height + uy * inset],
  ];
};

const fits = (points: readonly Vec2[], printable: Printable): boolean => {
  const w =
    Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0]));
  const h =
    Math.max(...points.map((p) => p[1])) - Math.min(...points.map((p) => p[1]));
  // Room for the tabs on both sides as well.
  const margin = 2 * TAB_HEIGHTS_MM[0]!;
  return (
    Math.max(w, h) + margin <= printable.longMm &&
    Math.min(w, h) + margin <= printable.shortMm
  );
};

interface Unfolding {
  readonly islands: Island[];
  readonly nextLabel: number;
  /** Cut edges where neither side had room for a glue tab. */
  readonly untabbed: readonly string[];
}

/**
 * Unfolds, then retries with each untabbed seam joined first (making it a
 * fold), keeping the attempt with the fewest seams that lack a tab.
 */
export const unfold = (
  mesh: Mesh,
  printable: Printable,
  firstLabel = 1,
): Unfolding => {
  let best: Unfolding | null = null;
  // Smaller islands leave more room for tabs; split only as far as needed.
  for (const pieces of [1, 2, 3, 4, 6]) {
    const maxFaces = Math.ceil(mesh.faces.length / pieces);
    const prefer = new Set<string>();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const next = unfoldOnce(mesh, printable, firstLabel, prefer, maxFaces);
      if (!best || next.untabbed.length < best.untabbed.length) best = next;
      if (best.untabbed.length === 0) return best;
      for (const key of next.untabbed) prefer.add(key);
    }
  }
  return best!;
};

const unfoldOnce = (
  mesh: Mesh,
  printable: Printable,
  firstLabel: number,
  prefer: ReadonlySet<string>,
  maxFaces: number,
): Unfolding => {
  const uses = edgeUses(mesh);
  const placed = new Map<number, { island: number; points: Vec2[] }>();
  const islands: { faces: NetFace[]; folds: Fold[]; joined: Set<string> }[] =
    [];
  const area = (f: number) => {
    const corners = mesh.faces[f]!.map((v) => mesh.vertices[v]!);
    let n: Vec3 = [0, 0, 0];
    for (let i = 1; i + 1 < corners.length; i += 1) {
      const c = cross(
        sub(corners[i]!, corners[0]!),
        sub(corners[i + 1]!, corners[0]!),
      );
      n = [n[0] + c[0], n[1] + c[1], n[2] + c[2]];
    }
    return length(n);
  };
  const order = mesh.faces.map((_, f) => f).sort((p, q) => area(q) - area(p));

  for (const seed of order) {
    if (placed.has(seed)) continue;
    const island = {
      faces: [] as NetFace[],
      folds: [] as Fold[],
      joined: new Set<string>(),
    };
    const id = islands.push(island) - 1;
    const put = (face: number, points: Vec2[]) => {
      placed.set(face, { island: id, points });
      island.faces.push({ face, points });
    };
    put(seed, layFlat(mesh, seed));
    const refused = new Set<string>();
    for (;;) {
      // The longest edge from a placed face of this island to an unplaced face.
      let best: {
        from: number;
        index: number;
        to: number;
        size: number;
      } | null = null;
      for (const { face } of island.faces) {
        const corners = mesh.faces[face]!;
        corners.forEach((v, i) => {
          const w = corners[(i + 1) % corners.length]!;
          const key = edgeKey(v, w);
          if (refused.has(key)) return;
          const other = uses.get(key)?.find((use) => use.face !== face);
          if (!other || placed.has(other.face)) return;
          const size =
            length(sub(mesh.vertices[w]!, mesh.vertices[v]!)) +
            (prefer.has(key) ? 1e6 : 0);
          if (!best || size > best.size)
            best = { from: face, index: i, to: other.face, size };
        });
      }
      if (!best || island.faces.length >= maxFaces) break;
      const { from, index, to } = best as {
        from: number;
        index: number;
        to: number;
      };
      const corners = mesh.faces[from]!;
      const [v, w] = [corners[index]!, corners[(index + 1) % corners.length]!];
      const flat = placed.get(from)!.points;
      const points = attach(
        mesh,
        to,
        mesh.vertices[v]!,
        mesh.vertices[w]!,
        flat[index]!,
        flat[(index + 1) % corners.length]!,
      );
      const grown = [...island.faces.flatMap((f) => f.points), ...points];
      if (
        !fits(grown, printable) ||
        island.faces.some((f) => convexOverlap(f.points, points))
      ) {
        refused.add(edgeKey(v, w));
        continue;
      }
      put(to, points);
      island.joined.add(edgeKey(v, w));
      const [n1, n2] = [faceNormal(mesh, from), faceNormal(mesh, to)];
      const bend =
        (Math.acos(Math.max(-1, Math.min(1, dot(n1, n2)))) * 180) / Math.PI;
      // Convex edge: the neighbour's centre lies behind this face's plane.
      const mountain =
        dot(n1, sub(faceCentre(mesh, to), faceCentre(mesh, from))) < 0;
      island.folds.push({
        from: flat[index]!,
        to: flat[(index + 1) % corners.length]!,
        angleDeg: bend,
        mountain,
      });
    }
  }

  // Cuts: every edge not joined inside an island, numbered once per pair.
  let label = firstLabel;
  const labels = new Map<string, number>();
  const cuts: Cut[][] = islands.map(() => []);
  const tabbed = new Set<string>();
  const polygonsOf = (id: number): Vec2[][] => [
    ...islands[id]!.faces.map((f) => [...f.points]),
    ...cuts[id]!.flatMap((c) => (c.tab ? [[...c.tab]] : [])),
  ];
  mesh.faces.forEach((corners, face) => {
    const { island, points } = placed.get(face)!;
    corners.forEach((v, i) => {
      const key = edgeKey(v, corners[(i + 1) % corners.length]!);
      if (islands[island]!.joined.has(key)) return;
      if (!labels.has(key)) labels.set(key, label++);
      const [A, B] = [points[i]!, points[(i + 1) % corners.length]!];
      // The first side that can hold a tab without covering paper gets it.
      let tab: Vec2[] | null = null;
      if (!tabbed.has(key)) {
        // Full length first; near a pointed corner (a fan of thin
        // triangles) only part of the edge has room, away from the point.
        const along = (t: number): Vec2 => [
          A[0] + (B[0] - A[0]) * t,
          A[1] + (B[1] - A[1]) * t,
        ];
        const spans: [number, number][] = [
          [0, 1],
          [0.3, 1],
          [0, 0.7],
          [0.45, 1],
          [0, 0.55],
        ];
        search: for (const height of TAB_HEIGHTS_MM) {
          for (const [s0, s1] of spans) {
            const [P, Q] = [along(s0), along(s1)];
            const candidate = tabOn(
              P,
              Q,
              Math.min(height, len2(sub2(Q, P)) * 0.4),
            );
            if (!polygonsOf(island).some((p) => convexOverlap(p, candidate))) {
              tab = candidate;
              tabbed.add(key);
              break search;
            }
          }
        }
      }
      cuts[island]!.push({ from: A, to: B, label: labels.get(key)!, tab });
    });
  });
  const untabbed = [...labels.keys()].filter((key) => !tabbed.has(key));
  return {
    islands: islands.map((island, id) => ({
      faces: island.faces,
      folds: island.folds,
      cuts: cuts[id]!,
    })),
    nextLabel: label,
    untabbed,
  };
};
