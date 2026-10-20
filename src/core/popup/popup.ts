import earcut from "earcut";

/**
 * V-fold pop-up cards, solved exactly.
 *
 * The card's spine runs along y; page i opens to direction
 * p_i = (+-sin(theta/2), 0, cos(theta/2)) as the card opens from theta = 0
 * (closed) to 180 degrees (flat). A V-fold piece is a cut shape folded down
 * its centre and glued to both pages along tab lines from a shared apex on
 * the spine; each tab line makes angle alpha with the spine on its page, and
 * angle phi with the centre fold on the piece. The centre fold lies in the
 * plane of symmetry at angle beta from the spine, fixed by the piece's rigid
 * half (its tab line keeps angle phi to the fold):
 *
 *   cos(alpha) cos(beta) + sin(alpha) cos(theta / 2) sin(beta) = cos(phi)
 *
 * which has a real solution through the whole swing exactly when phi >=
 * alpha. Every position below follows from that one equation.
 */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

export interface VFold {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  /** Where the apex sits on the spine, mm from the card's bottom edge. */
  readonly apexMm: number;
  readonly alphaDeg: number;
  readonly phiDeg: number;
  /**
   * One half of the piece in its own frame: s along the centre fold from the
   * apex, t across it (t >= 0, toward the tab). The other half mirrors it.
   * It must stay between the fold (t = 0) and the tab line.
   */
  readonly half: readonly Vec2[];
  /** Length of each glue tab along its tab line, from the apex. */
  readonly tabMm: number;
  /** Coloured regions printed on the piece, in the half's frame (mirrored too). */
  readonly prints: readonly {
    readonly points: readonly Vec2[];
    readonly color: string;
  }[];
}

export interface PopupCard {
  readonly title: string;
  /** Each page: width out from the spine, height along it. */
  readonly pageWidthMm: number;
  readonly pageHeightMm: number;
  readonly cardColor: string;
  readonly pieces: readonly VFold[];
}

const rad = (d: number) => (d * Math.PI) / 180;
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(...a));

/** The direction page `side` (+1 right, -1 left) opens to at card angle theta. */
export const pageDirection = (thetaDeg: number, side: 1 | -1): Vec3 => [
  side * Math.sin(rad(thetaDeg) / 2),
  0,
  Math.cos(rad(thetaDeg) / 2),
];

/** The fold angle beta at card angle theta, or null if the piece cannot reach. */
export const foldAngle = (piece: VFold, thetaDeg: number): number | null => {
  const [alpha, phi] = [rad(piece.alphaDeg), rad(piece.phiDeg)];
  const a = Math.cos(alpha);
  const b = Math.sin(alpha) * Math.cos(rad(thetaDeg) / 2);
  const r = Math.hypot(a, b);
  const c = Math.cos(phi) / r;
  if (c > 1 + 1e-12 || c < -1 - 1e-12) return null;
  // The rising branch: equal to alpha + phi when closed.
  return Math.atan2(b, a) + Math.acos(Math.max(-1, Math.min(1, c)));
};

/** Maps a point of half `side` of the piece into 3D at card angle theta. */
export const piecePoint = (
  piece: VFold,
  thetaDeg: number,
  side: 1 | -1,
  [s, t]: Vec2,
): Vec3 => {
  const beta = foldAngle(piece, thetaDeg) ?? rad(piece.alphaDeg + piece.phiDeg);
  const apex: Vec3 = [0, piece.apexMm, 0];
  const fold: Vec3 = [0, Math.cos(beta), Math.sin(beta)];
  const tab = add(
    scale([0, 1, 0], Math.cos(rad(piece.alphaDeg))),
    scale(pageDirection(thetaDeg, side), Math.sin(rad(piece.alphaDeg))),
  );
  const across = sub(tab, scale(fold, dot(tab, fold)));
  // Fully closed, the tab lies along the fold's plane; any in-plane
  // perpendicular toward the page keeps the piece flat on it.
  const n =
    Math.hypot(...across) > 1e-9
      ? normalize(across)
      : normalize(cross(fold, [side, 0, 0]));
  return add(apex, add(scale(fold, s), scale(n, t)));
};

/** A page corner or edge point (r out from the spine, y along it) at card angle theta. */
export const pagePoint = (
  thetaDeg: number,
  side: 1 | -1,
  r: number,
  y: number,
): Vec3 => add([0, y, 0], scale(pageDirection(thetaDeg, side), r));

/** Triangles of one half, in the half's frame. */
export const halfTriangles = (piece: VFold): [Vec2, Vec2, Vec2][] => {
  const flat = piece.half.flatMap((p) => [p[0], p[1]]);
  const index = earcut(flat);
  const out: [Vec2, Vec2, Vec2][] = [];
  for (let i = 0; i + 2 < index.length; i += 3)
    out.push([
      piece.half[index[i]!]!,
      piece.half[index[i + 1]!]!,
      piece.half[index[i + 2]!]!,
    ]);
  return out;
};

export type PopupFailure =
  | {
      readonly check: "unreachable";
      readonly piece: string;
      readonly thetaDeg: number;
    }
  | { readonly check: "outside_tab_line"; readonly piece: string }
  | { readonly check: "sticks_out_closed"; readonly piece: string }
  | {
      readonly check: "through_page";
      readonly piece: string;
      readonly thetaDeg: number;
    }
  | {
      readonly check: "collision";
      readonly pieces: readonly [string, string];
      readonly thetaDeg: number;
    };

/** Opening angles the swing is checked at; closed (0) is checked separately. */
const SWING = Array.from({ length: 36 }, (_, i) => 5 * (i + 1));
const TOLERANCE_MM = 0.05;

/** Whether two 3D triangles cross (any edge of one passes through the other). */
const trianglesCross = (p: readonly Vec3[], q: readonly Vec3[]): boolean => {
  const edgeHits = (edges: readonly Vec3[], tri: readonly Vec3[]) => {
    const [a, b, c] = tri as [Vec3, Vec3, Vec3];
    const n = cross(sub(b, a), sub(c, a));
    const area = Math.hypot(...n);
    if (area < 1e-9) return false;
    for (let i = 0; i < 3; i += 1) {
      const [u, v] = [edges[i]!, edges[(i + 1) % 3]!];
      const [du, dv] = [dot(n, sub(u, a)) / area, dot(n, sub(v, a)) / area];
      // Strictly through the plane, beyond tolerance on both sides.
      if (du * dv >= 0 || Math.min(Math.abs(du), Math.abs(dv)) < TOLERANCE_MM)
        continue;
      const x = add(u, scale(sub(v, u), du / (du - dv)));
      const inside = [a, b, c].every((corner, k) => {
        const next = [a, b, c][(k + 1) % 3]!;
        return (
          dot(cross(sub(next, corner), sub(x, corner)), n) > TOLERANCE_MM * area
        );
      });
      if (inside) return true;
    }
    return false;
  };
  return edgeHits(p, q) || edgeHits(q, p);
};

/** Every check a printed V-fold card must pass to open and close cleanly. */
export const verifyPopup = (card: PopupCard): PopupFailure[] => {
  const failures: PopupFailure[] = [];
  for (const piece of card.pieces) {
    const limit = Math.tan(rad(piece.phiDeg));
    if (
      piece.half.some(
        ([s, t]) =>
          t < -TOLERANCE_MM ||
          (s > 0 && t > s * limit + TOLERANCE_MM && piece.phiDeg < 90),
      )
    ) {
      failures.push({ check: "outside_tab_line", piece: piece.id });
    }
    for (const theta of [0, ...SWING]) {
      if (foldAngle(piece, theta) === null)
        failures.push({
          check: "unreachable",
          piece: piece.id,
          thetaDeg: theta,
        });
    }
    // Closed, the piece lies flat in the page plane: it must stay inside the card.
    const closed = piece.half.map((p) => piecePoint(piece, 0, 1, p));
    if (
      closed.some(
        ([, y, z]) =>
          y < -TOLERANCE_MM ||
          y > card.pageHeightMm + TOLERANCE_MM ||
          z > card.pageWidthMm + TOLERANCE_MM ||
          z < -TOLERANCE_MM,
      )
    ) {
      failures.push({ check: "sticks_out_closed", piece: piece.id });
    }
  }
  const triangles = card.pieces.map((piece) => ({
    piece,
    tris: halfTriangles(piece),
  }));
  for (const theta of SWING) {
    const placed = triangles.map(({ piece, tris }) => ({
      id: piece.id,
      tris: ([1, -1] as const).flatMap((side) =>
        tris.map((tri) => tri.map((p) => piecePoint(piece, theta, side, p))),
      ),
    }));
    // Between the pages: on the inner side of both page planes.
    for (const { id, tris } of placed) {
      const outside = ([1, -1] as const).some((side) => {
        const inward = cross([0, 1, 0], pageDirection(theta, side));
        const sign = side === 1 ? -1 : 1;
        return tris.some((tri) =>
          tri.some((p) => sign * dot(inward, p) < -TOLERANCE_MM),
        );
      });
      if (outside)
        failures.push({ check: "through_page", piece: id, thetaDeg: theta });
    }
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const [a, b] = [placed[i]!, placed[j]!];
        if (a.tris.some((ta) => b.tris.some((tb) => trianglesCross(ta, tb)))) {
          failures.push({
            check: "collision",
            pieces: [a.id, b.id],
            thetaDeg: theta,
          });
        }
      }
    }
  }
  return failures;
};
