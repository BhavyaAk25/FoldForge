import {
  isFolded,
  onBorder,
  type CreasePatternV1,
  type Point2,
} from "./crease-pattern";

/**
 * Local and global flat-foldability checks for a crease pattern.
 *
 * - Maekawa: at every interior vertex, |mountains - valleys| = 2.
 * - Kawasaki: at every interior vertex, the alternating sum of the angles
 *   between consecutive folded creases is 180 degrees.
 * - Consistency: unfolding face by face (reflecting across each fold) must
 *   place every crease at the same spot from both sides, around every loop.
 *
 * Together these guarantee a flat-folded shape exists. They do not decide a
 * non-crossing layer order, which is NP-hard in general; library models are
 * also checked by the folding simulator.
 */

export type FoldRuleFailure =
  | {
      readonly rule: "maekawa";
      readonly vertex: number;
      readonly mountains: number;
      readonly valleys: number;
    }
  | {
      readonly rule: "kawasaki";
      readonly vertex: number;
      readonly errorDeg: number;
    }
  | {
      readonly rule: "consistency";
      readonly edge: number;
      readonly gap: number;
    };

/** 2D isometry x -> R x + t, where R may include a reflection. */
export interface Isometry {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
}

const IDENTITY: Isometry = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

export const applyIsometry = (m: Isometry, p: Point2): Point2 => ({
  x: m.a * p.x + m.b * p.y + m.tx,
  y: m.c * p.x + m.d * p.y + m.ty,
});

/** +1 when the face shows its front, -1 when it is turned over. */
export const orientation = (m: Isometry): 1 | -1 =>
  m.a * m.d - m.b * m.c > 0 ? 1 : -1;

/** Inverse of an isometry: R is orthogonal, so R^-1 = R^T. */
export const invertIsometry = (m: Isometry): Isometry => ({
  a: m.a,
  b: m.c,
  c: m.b,
  d: m.d,
  tx: -(m.a * m.tx + m.c * m.ty),
  ty: -(m.b * m.tx + m.d * m.ty),
});

const compose = (outer: Isometry, inner: Isometry): Isometry => ({
  a: outer.a * inner.a + outer.b * inner.c,
  b: outer.a * inner.b + outer.b * inner.d,
  c: outer.c * inner.a + outer.d * inner.c,
  d: outer.c * inner.b + outer.d * inner.d,
  tx: outer.a * inner.tx + outer.b * inner.ty + outer.tx,
  ty: outer.c * inner.tx + outer.d * inner.ty + outer.ty,
});

/** Reflection across the line through p and q. */
const reflectionAcross = (p: Point2, q: Point2): Isometry => {
  const angle = Math.atan2(q.y - p.y, q.x - p.x);
  const cos2 = Math.cos(2 * angle);
  const sin2 = Math.sin(2 * angle);
  const linear = { a: cos2, b: sin2, c: sin2, d: -cos2, tx: 0, ty: 0 };
  const moved = applyIsometry(linear, p);
  return { ...linear, tx: p.x - moved.x, ty: p.y - moved.y };
};

/** Kawasaki tolerance: well inside a 2 degree fabrication tolerance. */
const KAWASAKI_TOLERANCE_DEG = 0.01;
/** Consistency tolerance in unit-sheet coordinates (1e-6 of the sheet). */
const CONSISTENCY_TOLERANCE = 1e-6;

const localRuleFailures = (cp: CreasePatternV1): FoldRuleFailure[] => {
  const failures: FoldRuleFailure[] = [];
  cp.vertices.forEach((vertex, index) => {
    if (onBorder(vertex)) return;
    const folds = cp.edges
      .filter(
        (edge) =>
          isFolded(edge.assignment) && (edge.a === index || edge.b === index),
      )
      .map((edge) => {
        const other = cp.vertices[edge.a === index ? edge.b : edge.a]!;
        return {
          assignment: edge.assignment,
          angle: Math.atan2(other.y - vertex.y, other.x - vertex.x),
        };
      })
      .sort((p, q) => p.angle - q.angle);
    if (folds.length === 0) return;
    const mountains = folds.filter((f) => f.assignment === "M").length;
    const valleys = folds.length - mountains;
    if (Math.abs(mountains - valleys) !== 2) {
      failures.push({ rule: "maekawa", vertex: index, mountains, valleys });
    }
    let alternating = 0;
    folds.forEach((fold, i) => {
      const next = folds[(i + 1) % folds.length]!;
      const sector =
        (next.angle - fold.angle + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
      alternating += i % 2 === 0 ? sector : -sector;
    });
    const errorDeg = (Math.abs(alternating) * 180) / Math.PI;
    if (folds.length % 2 !== 0 || errorDeg > KAWASAKI_TOLERANCE_DEG) {
      failures.push({ rule: "kawasaki", vertex: index, errorDeg });
    }
  });
  return failures;
};

/**
 * Flat-folded placement of every face, found by reflecting across folded
 * creases while walking the faces outward from `root`, which stays in place.
 */
export const flatFoldedFaces = (
  cp: CreasePatternV1,
  root = 0,
): {
  readonly transforms: readonly Isometry[];
  readonly failures: FoldRuleFailure[];
} => {
  const edgeFaces = new Map<string, number[]>();
  cp.faces.forEach((face, faceIndex) => {
    face.forEach((vertex, i) => {
      const next = face[(i + 1) % face.length]!;
      const key = vertex < next ? `${vertex}-${next}` : `${next}-${vertex}`;
      edgeFaces.set(key, [...(edgeFaces.get(key) ?? []), faceIndex]);
    });
  });
  const transforms: (Isometry | null)[] = cp.faces.map(() => null);
  transforms[root] = IDENTITY;
  const queue = [root];
  while (queue.length > 0) {
    const face = queue.shift()!;
    for (const edge of cp.edges) {
      const key =
        edge.a < edge.b ? `${edge.a}-${edge.b}` : `${edge.b}-${edge.a}`;
      const pair = edgeFaces.get(key) ?? [];
      if (pair.length !== 2 || !pair.includes(face)) continue;
      const neighbour = pair[0] === face ? pair[1]! : pair[0]!;
      if (transforms[neighbour]) continue;
      const step = isFolded(edge.assignment)
        ? reflectionAcross(cp.vertices[edge.a]!, cp.vertices[edge.b]!)
        : IDENTITY;
      transforms[neighbour] = compose(transforms[face]!, step);
      queue.push(neighbour);
    }
  }
  const placed = transforms.map((t) => t ?? IDENTITY);
  const failures: FoldRuleFailure[] = [];
  cp.edges.forEach((edge, edgeIndex) => {
    const key = edge.a < edge.b ? `${edge.a}-${edge.b}` : `${edge.b}-${edge.a}`;
    const pair = edgeFaces.get(key) ?? [];
    if (pair.length !== 2) return;
    const [left, right] = pair as [number, number];
    let gap = 0;
    for (const vertex of [edge.a, edge.b]) {
      const p = applyIsometry(placed[left]!, cp.vertices[vertex]!);
      const q = applyIsometry(placed[right]!, cp.vertices[vertex]!);
      gap = Math.max(gap, Math.hypot(p.x - q.x, p.y - q.y));
    }
    if (gap > CONSISTENCY_TOLERANCE) {
      failures.push({ rule: "consistency", edge: edgeIndex, gap });
    }
  });
  return { transforms: placed, failures };
};

export interface FoldRuleReport {
  readonly flatFoldable: boolean;
  readonly interiorVertices: number;
  readonly failures: readonly FoldRuleFailure[];
}

export const checkFoldRules = (cp: CreasePatternV1): FoldRuleReport => {
  const failures = [...localRuleFailures(cp), ...flatFoldedFaces(cp).failures];
  return {
    flatFoldable: failures.length === 0,
    interiorVertices: cp.vertices.filter((v) => !onBorder(v)).length,
    failures,
  };
};
