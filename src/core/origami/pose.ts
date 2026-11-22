import type { FoldKeyframe, FoldMove } from "./animate";
import type { FoldLine } from "./sequence";
import type { Point2 } from "./crease-pattern";
import { applyIsometry } from "./fold-rules";

/**
 * 3D pose of a folding sequence at a point on its timeline, as x, y, z for
 * every corner of every face (faces in pattern order). Position `at` runs from
 * 0 to the number of steps: whole numbers are the states between steps.
 */

export interface PoseInput {
  readonly vertices: readonly Point2[];
  readonly faces: readonly (readonly number[])[];
  readonly collapse: readonly (readonly number[])[] | null;
  readonly keyframes: readonly FoldKeyframe[];
  readonly moves: readonly FoldMove[];
  /** The collapse ends as a 3D form: it stays as folded instead of settling flat. */
  readonly formed?: boolean;
}

/**
 * Separation between stacked layers, in sheet widths: enough to tell layers
 * apart, but a thick model (a frog base holds dozens) stays at most
 * MAX_STACK thick so it still looks like folded paper.
 */
const LAYER_GAP = 0.004;
const MAX_STACK = 0.03;
const gaps = new WeakMap<readonly FoldKeyframe[], number>();
const gapFor = (input: PoseInput): number => {
  const known = gaps.get(input.keyframes);
  if (known !== undefined) return known;
  const deepest = Math.max(
    1,
    ...input.keyframes.flatMap((k) => k.layers.map(Math.abs)),
  );
  const gap = Math.min(LAYER_GAP, MAX_STACK / deepest);
  gaps.set(input.keyframes, gap);
  return gap;
};
/** Share of the collapse step spent settling from the simulated pose to the exact flat one. */
const SETTLE = 0.2;

const ease = (u: number): number => u * u * (3 - 2 * u);

const keyframePose = (input: PoseInput, keyframe: FoldKeyframe): number[] =>
  input.faces.flatMap((face, f) =>
    face.flatMap((v) => {
      const p = applyIsometry(keyframe.transforms[f]!, input.vertices[v]!);
      return [p.x, p.y, (keyframe.layers[f] ?? 0) * gapFor(input)];
    }),
  );

const lerp = (
  from: readonly number[],
  to: readonly number[],
  u: number,
): number[] => from.map((value, i) => value + (to[i]! - value) * u);

const collapsePose = (
  frames: readonly (readonly number[])[],
  u: number,
): number[] => {
  const position = Math.min(1, Math.max(0, u)) * (frames.length - 1);
  const index = Math.min(frames.length - 2, Math.floor(position));
  return lerp(frames[index]!, frames[index + 1]!, position - index);
};

/**
 * One face's corners turned about its line in move `index` (the fold line,
 * or the face's own axis in a collapse), `u` of the way through it.
 */
const turnedFace = (
  input: PoseInput,
  face: number,
  index: number,
  u: number,
): number[] => {
  const before = input.keyframes[index]!;
  const after = input.keyframes[index + 1]!;
  const move = input.moves[index]!;
  const axis = move.axes?.[face] ?? { line: move.line, swing: move.swing };
  const angle = (move.endDeg * Math.PI * ease(u)) / 180;
  const origin = axis.line.from;
  const length = Math.hypot(
    axis.line.to.x - origin.x,
    axis.line.to.y - origin.y,
  );
  const along = {
    x: (axis.line.to.x - origin.x) / length,
    y: (axis.line.to.y - origin.y) / length,
  };
  const normal = { x: -along.y, y: along.x };
  // A fold that stops short of flat (a wing opened partway) never turns the
  // flap's layers past each other, so they keep their order from before;
  // the keyframe after is the fully folded stack, reversed.
  const target = move.endDeg < 180 ? before : after;
  const z =
    ((before.layers[face] ?? 0) +
      ((target.layers[face] ?? 0) - (before.layers[face] ?? 0)) * ease(u)) *
    gapFor(input);
  return input.faces[face]!.flatMap((v) => {
    const p = applyIsometry(before.transforms[face]!, input.vertices[v]!);
    const offset = { x: p.x - origin.x, y: p.y - origin.y };
    const t = offset.x * along.x + offset.y * along.y;
    const d = offset.x * normal.x + offset.y * normal.y;
    return [
      origin.x + along.x * t + normal.x * d * Math.cos(angle),
      origin.y + along.y * t + normal.y * d * Math.cos(angle),
      z + axis.swing * Math.abs(d) * Math.sin(angle),
    ];
  });
};

/** A point turned about an in-plane line in 3D: (along, across, up). */
const frameOf = (line: FoldLine) => {
  const length = Math.hypot(line.to.x - line.from.x, line.to.y - line.from.y);
  const along = {
    x: (line.to.x - line.from.x) / length,
    y: (line.to.y - line.from.y) / length,
  };
  return { origin: line.from, along, normal: { x: -along.y, y: along.x } };
};

/**
 * One face during a collapse: it turns over its own axis (if it has one),
 * then the whole model turns with the shared turn (if any). At the end the
 * two make up exactly the face's motion between the keyframes.
 */
const collapsedFace = (
  input: PoseInput,
  face: number,
  index: number,
  u: number,
): number[] => {
  const move = input.moves[index]!;
  const from = input.keyframes[index]!;
  const to = input.keyframes[index + 1]!;
  const own = move.axes?.[face] ?? null;
  const angle = Math.PI * ease(u);
  const z0 = (from.layers[face] ?? 0) * gapFor(input);
  let points = input.faces[face]!.map((v) => {
    const p = applyIsometry(from.transforms[face]!, input.vertices[v]!);
    return { x: p.x, y: p.y, z: z0 };
  });
  if (!own && !move.turn && move.moving[face]) {
    // Slides without turning over: straight there.
    const z1 = (to.layers[face] ?? 0) * gapFor(input);
    return input.faces[face]!.flatMap((v, i) => {
      const q = applyIsometry(to.transforms[face]!, input.vertices[v]!);
      const p = points[i]!;
      const e = ease(u);
      return [p.x + (q.x - p.x) * e, p.y + (q.y - p.y) * e, z0 + (z1 - z0) * e];
    });
  }
  if (own) {
    const { origin, along, normal } = frameOf(own.line);
    points = points.map((p) => {
      const o = { x: p.x - origin.x, y: p.y - origin.y };
      const t = o.x * along.x + o.y * along.y;
      const d = o.x * normal.x + o.y * normal.y;
      return {
        x: origin.x + along.x * t + normal.x * d * Math.cos(angle),
        y: origin.y + along.y * t + normal.y * d * Math.cos(angle),
        z: p.z + own.swing * Math.abs(d) * Math.sin(angle),
      };
    });
  }
  if (move.turn) {
    // The whole model turns over: a true rotation, so z flips with it.
    const { origin, along, normal } = frameOf(move.turn.line);
    points = points.map((p) => {
      const o = { x: p.x - origin.x, y: p.y - origin.y };
      const t = o.x * along.x + o.y * along.y;
      const d = o.x * normal.x + o.y * normal.y;
      const [d1, z1] = [
        d * Math.cos(angle) - p.z * Math.sin(angle),
        d * Math.sin(angle) + p.z * Math.cos(angle),
      ];
      return {
        x: origin.x + along.x * t + normal.x * d1,
        y: origin.y + along.y * t + normal.y * d1,
        z: z1,
      };
    });
  }
  return points.flatMap((p) => [p.x, p.y, p.z]);
};

/** A face corner in the flat frame: x, y, and h, its height off the face's flat plane. */
interface Lifted {
  readonly x: number;
  readonly y: number;
  readonly h: number;
}

/**
 * A rigid turn of a face's corners by `deg` about an in-plane line, lifting
 * toward `swing`; `side` is the side of the line the face lies on.
 */
const bend = (
  points: readonly Lifted[],
  line: FoldLine,
  deg: number,
  swing: 1 | -1,
  side: number,
): Lifted[] => {
  const { origin, along, normal } = frameOf(line);
  const [c, s] = [
    Math.cos((deg * Math.PI) / 180),
    Math.sin((deg * Math.PI) / 180),
  ];
  return points.map((p) => {
    const o = { x: p.x - origin.x, y: p.y - origin.y };
    const t = o.x * along.x + o.y * along.y;
    const u = side * (o.x * normal.x + o.y * normal.y);
    const [u2, h2] = [u * c - swing * p.h * s, swing * u * s + p.h * c];
    return {
      x: origin.x + along.x * t + normal.x * side * u2,
      y: origin.y + along.y * t + normal.y * side * u2,
      h: h2,
    };
  });
};

/** Which side of a line a point lies on: +1 or -1. */
const sideOf = (line: FoldLine, q: Point2): number =>
  Math.sign(
    (line.to.x - line.from.x) * (q.y - line.from.y) -
      (line.to.y - line.from.y) * (q.x - line.from.x),
  ) || 1;

/**
 * A face that does not fold in move `index`: where it lies flat, unless
 * folds since its last full fold left it turned. Curls (the move itself
 * when `curlU` is given, then earlier ones) bend it in the flat frame,
 * outermost line first; a fold that stopped short of flat before them
 * then turns the curled face from its place before that fold.
 */
const restingFace = (
  input: PoseInput,
  face: number,
  index: number,
  curlU: number | null,
): number[] => {
  const curls: { move: FoldMove; u: number }[] =
    curlU === null ? [] : [{ move: input.moves[index]!, u: curlU }];
  let partial: number | null = null;
  for (let j = index - 1; j >= 0; j -= 1) {
    const move = input.moves[j]!;
    if (!move.moving[face]) continue;
    if (move.bends) curls.push({ move, u: 1 });
    else {
      if (move.endDeg < 180) partial = j;
      break;
    }
  }
  if (curls.length === 0 && partial !== null)
    return turnedFace(input, face, partial, 1);
  const keyframe = input.keyframes[index]!;
  const corners = input.faces[face]!;
  let points: Lifted[] = corners.map((v) => ({
    ...applyIsometry(keyframe.transforms[face]!, input.vertices[v]!),
    h: 0,
  }));
  const centre = {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  };
  for (const { move, u } of curls)
    for (const b of [...move.bends!].reverse())
      if (b.moving[face])
        points = bend(
          points,
          b.line,
          move.endDeg * ease(u),
          move.swing,
          sideOf(b.line, centre),
        );
  let base = (keyframe.layers[face] ?? 0) * gapFor(input);
  if (partial !== null) {
    // Back to the face's place before that fold (turned over about its
    // line), then turned by the fold's own angle, as `turnedFace` does.
    const move = input.moves[partial]!;
    const { origin, normal } = frameOf(move.line);
    const flipped = points.map((p) => {
      const d = (p.x - origin.x) * normal.x + (p.y - origin.y) * normal.y;
      return { x: p.x - 2 * d * normal.x, y: p.y - 2 * d * normal.y, h: -p.h };
    });
    const mirrored = {
      x:
        centre.x -
        2 *
          ((centre.x - origin.x) * normal.x +
            (centre.y - origin.y) * normal.y) *
          normal.x,
      y:
        centre.y -
        2 *
          ((centre.x - origin.x) * normal.x +
            (centre.y - origin.y) * normal.y) *
          normal.y,
    };
    points = bend(
      flipped,
      move.line,
      move.endDeg,
      move.swing,
      sideOf(move.line, mirrored),
    );
    base = (input.keyframes[partial]!.layers[face] ?? 0) * gapFor(input);
  }
  return points.flatMap((p) => [p.x, p.y, base + p.h]);
};

/**
 * Pose during move `index`. A face last turned by an earlier fold that stops
 * short of flat (a wing opened to 90 degrees) stays at that angle; curled
 * faces keep their curl.
 */
const movePose = (input: PoseInput, index: number, u: number): number[] =>
  input.faces.flatMap((_, f) => {
    const move = input.moves[index]!;
    if (move.axes) return collapsedFace(input, f, index, u);
    if (move.moving[f] && !move.bends) return turnedFace(input, f, index, u);
    return restingFace(
      input,
      f,
      index,
      move.bends && move.moving[f] ? u : null,
    );
  });

export const stepCount = (input: PoseInput): number =>
  input.moves.length + (input.collapse ? 1 : 0);

export const poseAt = (input: PoseInput, at: number): number[] => {
  const total = stepCount(input);
  const clamped = Math.min(total, Math.max(0, at));
  const step = Math.min(total - 1, Math.floor(clamped));
  const u = clamped - step;
  if (total === 0) return keyframePose(input, input.keyframes[0]!);
  if (input.collapse && step === 0) {
    if (input.formed) return collapsePose(input.collapse, u);
    if (u <= 1 - SETTLE) return collapsePose(input.collapse, u / (1 - SETTLE));
    return lerp(
      collapsePose(input.collapse, 1),
      keyframePose(input, input.keyframes[0]!),
      ease((u - (1 - SETTLE)) / SETTLE),
    );
  }
  return movePose(input, step - (input.collapse ? 1 : 0), u);
};

/**
 * A tucked sheet's depths moved in between the first sheet's layers: its
 * whole stack squeezed into a thin slab at their median depth, so it shows
 * only where it comes out past the first sheet's outline. The median, not
 * the middle of the range, since a few wrapped layers (a band folded over a
 * back) can stack far deeper than the rest of the sheet.
 */
export const tuckedDepths = (
  outer: readonly number[],
  inner: readonly number[],
): number[] => {
  const sorted = [...outer].sort((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const half = ((sorted.at(-1) ?? 0) - (sorted[0] ?? 0)) / 10;
  const [from, to] = [Math.min(...inner), Math.max(...inner)];
  const span = to - from || 1;
  return inner.map((z) => middle - half + (2 * half * (z - from)) / span);
};
