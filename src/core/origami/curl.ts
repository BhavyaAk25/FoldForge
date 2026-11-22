import { poseAt, stepCount, type PoseInput } from "./pose";

/**
 * The 3D proof of a curl. Its bend lines are flat in the crease proof, and
 * a bend is rigid on each side, so the paper never stretches; what remains
 * is that curled paper must not pass through other paper. This counts the
 * crossings between a curled face and any face it does not touch on the
 * sheet, halfway through each curl and at the end. The layers of one flap
 * bend together (the view only spaces them apart), so they are not
 * compared with each other; paper swept through another flap or through
 * paper that stays does count.
 */

type Vec = readonly [number, number, number];

const minus = (p: Vec, q: Vec): Vec => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p: Vec, q: Vec): number => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const crossV = (p: Vec, q: Vec): Vec => [
  p[1] * q[2] - p[2] * q[1],
  p[2] * q[0] - p[0] * q[2],
  p[0] * q[1] - p[1] * q[0],
];

/** Tolerance in sheet widths, well under the gap between stacked layers. */
const EPS = 1e-4;

/** Whether an edge of `a` passes through the inside of the convex polygon `b`. */
const pierces = (a: readonly Vec[], b: readonly Vec[]): boolean => {
  const n = crossV(minus(b[1]!, b[0]!), minus(b[2]!, b[0]!));
  const length = Math.hypot(...n);
  if (length < 1e-12) return false;
  const unit: Vec = [n[0] / length, n[1] / length, n[2] / length];
  return a.some((p, i) => {
    const q = a[(i + 1) % a.length]!;
    const [dp, dq] = [dot(minus(p, b[0]!), unit), dot(minus(q, b[0]!), unit)];
    if (!(dp > EPS && dq < -EPS) && !(dp < -EPS && dq > EPS)) return false;
    const t = dp / (dp - dq);
    const r: Vec = [
      p[0] + (q[0] - p[0]) * t,
      p[1] + (q[1] - p[1]) * t,
      p[2] + (q[2] - p[2]) * t,
    ];
    // Inside b, clear of its edges: on the inner side of every one.
    return b.every((v, k) => {
      const w = b[(k + 1) % b.length]!;
      const inward = crossV(unit, minus(w, v));
      const reach = Math.hypot(...inward);
      return dot(minus(r, v), inward) / reach > EPS;
    });
  });
};

const facesAt = (input: PoseInput, at: number): Vec[][] => {
  const flat = poseAt(input, at);
  let k = 0;
  return input.faces.map((face) =>
    face.map((): Vec => {
      const v: Vec = [flat[k]!, flat[k + 1]!, flat[k + 2]!];
      k += 3;
      return v;
    }),
  );
};

export const curlCollisions = (input: PoseInput): number => {
  const offset = input.collapse ? 1 : 0;
  const curls = input.moves.flatMap((move, i) => (move.bends ? [i] : []));
  if (curls.length === 0) return 0;
  const curled = input.faces.map((_, f) =>
    curls.some((i) => input.moves[i]!.moving[f]),
  );
  const shared = (f: number, g: number) =>
    input.faces[f]!.some((v) => input.faces[g]!.includes(v));
  // One flap's layers bend together, so only separate flaps are compared:
  // a flap is curled faces joined edge to edge.
  const flap = input.faces.map((_, f) => (curled[f] ? f : -1));
  const root = (f: number): number => (flap[f] === f ? f : root(flap[f]!));
  input.faces.forEach((a, f) =>
    input.faces.forEach((b, g) => {
      if (!curled[f] || !curled[g] || g <= f) return;
      if (a.filter((v) => b.includes(v)).length >= 2) flap[root(g)] = root(f);
    }),
  );
  const times = [...curls.map((i) => i + offset + 0.5), stepCount(input)];
  let crossings = 0;
  for (const at of times) {
    const faces = facesAt(input, at);
    faces.forEach((a, f) => {
      if (!curled[f]) return;
      faces.forEach((b, g) => {
        if (
          g === f ||
          (curled[g] && (g < f || root(g) === root(f))) ||
          shared(f, g)
        )
          return;
        if (pierces(a, b) || pierces(b, a)) crossings += 1;
      });
    });
  }
  return crossings;
};
