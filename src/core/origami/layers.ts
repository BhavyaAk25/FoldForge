import {
  isFolded,
  type CreaseAssignment,
  type CreasePatternV1,
  type Point2,
} from "./crease-pattern";
import { applyIsometry, orientation, type Isometry } from "./fold-rules";

/**
 * Layer order for a flat-folded state: which of every two overlapping faces
 * lies on top, such that no paper passes through paper. Deciding this is
 * NP-hard in general, so this is a bounded search with constraint
 * propagation; it returns null if it runs out of budget or no order exists.
 *
 * One boolean per overlapping pair of faces, constrained by:
 * - fold sense: across a mountain or valley, which face is on top follows
 *   from the assignment and which side the face shows;
 * - taco-tortilla: a face covering part of a fold cannot lie between the
 *   fold's two faces;
 * - taco-taco: two folds along the same line on the same side nest or stay
 *   apart, never interleave;
 * - transitivity: three faces with a common point have no cyclic order.
 */

const EPSILON = 1e-7;
/** Search nodes before giving up; library states need a few hundred. */
const NODE_BUDGET = 200_000;

const cross = (o: Point2, a: Point2, b: Point2): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const area = (polygon: readonly Point2[]): number =>
  polygon.reduce(
    (sum, a, i) =>
      sum + cross({ x: 0, y: 0 }, a, polygon[(i + 1) % polygon.length]!),
    0,
  ) / 2;
const counterClockwise = (polygon: readonly Point2[]): Point2[] =>
  area(polygon) < 0 ? [...polygon].reverse() : [...polygon];

/** Intersection of two counter-clockwise convex polygons (Sutherland-Hodgman). */
const clip = (
  subject: readonly Point2[],
  window: readonly Point2[],
): Point2[] => {
  let output = [...subject];
  for (let i = 0; i < window.length && output.length > 0; i += 1) {
    const a = window[i]!;
    const b = window[(i + 1) % window.length]!;
    const input = output;
    output = [];
    input.forEach((p, j) => {
      const q = input[(j + 1) % input.length]!;
      const [sp, sq] = [cross(a, b, p), cross(a, b, q)];
      if (sp >= 0) output.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        output.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    });
  }
  return output;
};

const overlapArea = (p: readonly Point2[], q: readonly Point2[]): number => {
  const shared = clip(p, q);
  return shared.length < 3 ? 0 : area(shared);
};

/** Whether a convex polygon's interior contains part of segment pq. */
const coversSegment = (
  polygon: readonly Point2[],
  p: Point2,
  q: Point2,
): boolean => {
  let [low, high] = [0, 1];
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const [sp, sq] = [
      cross(a, b, p) / length - EPSILON,
      cross(a, b, q) / length - EPSILON,
    ];
    if (sp <= 0 && sq <= 0) return false;
    if (sp < 0) low = Math.max(low, sp / (sp - sq));
    else if (sq < 0) high = Math.min(high, sp / (sp - sq));
  }
  return high - low > EPSILON;
};

interface Constraint {
  readonly pairs: readonly number[];
  /** False when the assigned values already break the rule. */
  readonly holds: (above: (f: number, g: number) => boolean | null) => boolean;
}

/**
 * A layer order for the state, as a stacking level per face (higher is nearer
 * the viewer; a face sits one level above the highest face it covers) and the
 * pairwise relation, or null. `hint` (higher = nearer) breaks ties so consecutive states stay alike.
 */
export interface LayerOrder {
  readonly levels: number[];
  /** Whether face f lies above face g; null if they do not overlap. */
  readonly above: (f: number, g: number) => boolean | null;
}

export const solveLayerOrder = (
  cp: CreasePatternV1,
  transforms: readonly Isometry[],
  /** Each edge's sense in this state; null where it is not folded yet. */
  assignments: readonly (CreaseAssignment | null)[],
  hint: readonly number[],
): LayerOrder | null => {
  const faces = cp.faces.length;
  const outlines = cp.faces.map((face, f) =>
    counterClockwise(
      face.map((v) => applyIsometry(transforms[f]!, cp.vertices[v]!)),
    ),
  );
  const pairIndex = new Map<number, number>();
  const pairs: [number, number][] = [];
  for (let f = 0; f < faces; f += 1) {
    for (let g = f + 1; g < faces; g += 1) {
      if (overlapArea(outlines[f]!, outlines[g]!) > EPSILON) {
        pairIndex.set(f * faces + g, pairs.length);
        pairs.push([f, g]);
      }
    }
  }
  const pairOf = (f: number, g: number): number | undefined =>
    pairIndex.get(Math.min(f, g) * faces + Math.max(f, g));
  // value[p] = 1: the lower-numbered face is on top; -1: the other; 0: unknown.
  const value = new Int8Array(pairs.length);
  const above = (f: number, g: number): boolean | null => {
    const p = pairOf(f, g);
    if (p === undefined || value[p] === 0) return null;
    return (value[p] === 1) === f < g;
  };

  // Fold sense and the folds themselves.
  const facesOfEdge = new Map<string, number[]>();
  cp.faces.forEach((face, f) =>
    face.forEach((v, i) => {
      const w = face[(i + 1) % face.length]!;
      const key = v < w ? `${v}-${w}` : `${w}-${v}`;
      facesOfEdge.set(key, [...(facesOfEdge.get(key) ?? []), f]);
    }),
  );
  const fixed: { pair: number; top: number }[] = [];
  const tacos: {
    top: number;
    bottom: number;
    from: Point2;
    to: Point2;
    side: number;
  }[] = [];
  for (const [e, edge] of cp.edges.entries()) {
    const pair = facesOfEdge.get(
      edge.a < edge.b ? `${edge.a}-${edge.b}` : `${edge.b}-${edge.a}`,
    );
    const assignment = assignments[e] ?? null;
    if (assignment === null || !isFolded(assignment) || pair?.length !== 2)
      continue;
    const [f, g] = pair as [number, number];
    const index = pairOf(f, g);
    if (index === undefined) return null;
    // Valley seen from the front: a face showing its front has the other on top.
    const top =
      (assignment === "V") === orientation(transforms[f]!) > 0 ? g : f;
    fixed.push({ pair: index, top });
    const from = applyIsometry(transforms[f]!, cp.vertices[edge.a]!);
    const to = applyIsometry(transforms[f]!, cp.vertices[edge.b]!);
    const inside = outlines[f]!.reduce(
      (s, p) => ({
        x: s.x + p.x / outlines[f]!.length,
        y: s.y + p.y / outlines[f]!.length,
      }),
      { x: 0, y: 0 },
    );
    tacos.push({
      top,
      bottom: top === f ? g : f,
      from,
      to,
      side: Math.sign(cross(from, to, inside)),
    });
  }

  const constraints: Constraint[] = [];
  const add = (
    faceList: readonly (readonly [number, number])[],
    holds: Constraint["holds"],
  ) => {
    const indices = faceList.map(([f, g]) => pairOf(f, g));
    if (indices.every((i) => i !== undefined))
      constraints.push({ pairs: indices as number[], holds });
  };
  for (const taco of tacos) {
    outlines.forEach((outline, h) => {
      if (
        h === taco.top ||
        h === taco.bottom ||
        !coversSegment(outline, taco.from, taco.to)
      )
        return;
      add(
        [
          [h, taco.top],
          [h, taco.bottom],
        ],
        (on) => {
          const [a, b] = [on(h, taco.top), on(h, taco.bottom)];
          return a === null || b === null || a === b;
        },
      );
    });
  }
  for (let i = 0; i < tacos.length; i += 1) {
    for (let j = i + 1; j < tacos.length; j += 1) {
      const [s, t] = [tacos[i]!, tacos[j]!];
      if (
        Math.abs(cross(s.from, s.to, t.from)) > EPSILON ||
        Math.abs(cross(s.from, s.to, t.to)) > EPSILON
      )
        continue;
      const d = { x: s.to.x - s.from.x, y: s.to.y - s.from.y };
      const along = (p: Point2) =>
        (p.x - s.from.x) * d.x + (p.y - s.from.y) * d.y;
      const span = d.x * d.x + d.y * d.y;
      const overlap =
        Math.min(span, Math.max(along(t.from), along(t.to))) -
        Math.max(0, Math.min(along(t.from), along(t.to)));
      if (overlap <= EPSILON * span || s.side !== t.side) continue;
      add(
        [
          [s.bottom, t.bottom],
          [s.top, t.bottom],
          [s.top, t.top],
          [t.top, s.bottom],
        ],
        (on) =>
          !(
            on(t.bottom, s.bottom) === true &&
            on(s.top, t.bottom) === true &&
            on(t.top, s.top) === true
          ) &&
          !(
            on(s.bottom, t.bottom) === true &&
            on(t.top, s.bottom) === true &&
            on(s.top, t.top) === true
          ),
      );
    }
  }
  for (const [f, g] of pairs) {
    const shared = clip(outlines[f]!, outlines[g]!);
    for (let h = g + 1; h < faces; h += 1) {
      if (pairOf(f, h) === undefined || pairOf(g, h) === undefined) continue;
      const common = clip(shared, outlines[h]!);
      if (common.length < 3 || area(common) <= EPSILON) continue;
      add(
        [
          [f, g],
          [g, h],
          [f, h],
        ],
        (on) => {
          const [fg, gh, fh] = [on(f, g), on(g, h), on(f, h)];
          if (fg === null || gh === null || fh === null) return true;
          return !(fg && gh && !fh) && !(!fg && !gh && fh);
        },
      );
    }
  }

  const watching = pairs.map(() => [] as number[]);
  constraints.forEach((c, i) => c.pairs.forEach((p) => watching[p]!.push(i)));
  const trail: number[] = [];
  const assign = (pair: number, v: 1 | -1): boolean => {
    const queue: [number, 1 | -1][] = [[pair, v]];
    while (queue.length > 0) {
      const [p, next] = queue.pop()!;
      if (value[p] !== 0) {
        if (value[p] !== next) return false;
        continue;
      }
      value[p] = next;
      trail.push(p);
      for (const c of watching[p]!) {
        const constraint = constraints[c]!;
        if (!constraint.holds(above)) return false;
        const open = constraint.pairs.filter((q) => value[q] === 0);
        if (open.length !== 1) continue;
        // One unknown left: if one value breaks the rule, the other is forced.
        const q = open[0]!;
        const fits = ([1, -1] as const).filter((candidate) => {
          value[q] = candidate;
          const ok = constraint.holds(above);
          value[q] = 0;
          return ok;
        });
        if (fits.length === 0) return false;
        if (fits.length === 1) queue.push([q, fits[0]!]);
      }
    }
    return true;
  };
  const undo = (mark: number) => {
    while (trail.length > mark) value[trail.pop()!] = 0;
  };

  for (const { pair, top } of fixed) {
    if (!assign(pair, top === pairs[pair]![0] ? 1 : -1)) return null;
  }
  let nodes = 0;
  const search = (from: number): boolean => {
    let p = from;
    while (p < pairs.length && value[p] !== 0) p += 1;
    if (p === pairs.length) return true;
    if ((nodes += 1) > NODE_BUDGET) return false;
    const [f, g] = pairs[p]!;
    const preferred: 1 | -1 = (hint[f] ?? 0) >= (hint[g] ?? 0) ? 1 : -1;
    for (const v of [preferred, -preferred as 1 | -1]) {
      const mark = trail.length;
      if (assign(p, v) && search(p + 1)) return true;
      undo(mark);
    }
    return false;
  };
  if (!search(0)) return null;

  // Levels: longest chain of covered faces below each face. A cycle among
  // faces that never share a point is legal origami; it is cut by the hint.
  const below = outlines.map(() => [] as number[]);
  pairs.forEach(([f, g], p) =>
    value[p] === 1 ? below[f]!.push(g) : below[g]!.push(f),
  );
  const levels = new Array<number>(faces).fill(-1);
  const visiting = new Set<number>();
  const levelOf = (f: number): number => {
    if (levels[f]! >= 0) return levels[f]!;
    visiting.add(f);
    let level = 0;
    for (const g of below[f]!) {
      if (visiting.has(g)) continue;
      level = Math.max(level, levelOf(g) + 1);
    }
    visiting.delete(f);
    levels[f] = level;
    return level;
  };
  for (let f = 0; f < faces; f += 1) levelOf(f);
  return { levels, above };
};
