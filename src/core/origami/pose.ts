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

/**
 * Pose during move `index`. A face last turned by an earlier fold that stops
 * short of flat (a wing opened to 90 degrees) stays at that angle.
 */
const movePose = (input: PoseInput, index: number, u: number): number[] =>
  input.faces.flatMap((face, f) => {
    const move = input.moves[index]!;
    if (move.axes) return collapsedFace(input, f, index, u);
    if (move.moving[f]) return turnedFace(input, f, index, u);
    for (let j = index - 1; j >= 0; j -= 1) {
      if (!input.moves[j]!.moving[f]) continue;
      if (input.moves[j]!.endDeg < 180) return turnedFace(input, f, j, 1);
      break;
    }
    const keyframe = input.keyframes[index]!;
    return face.flatMap((v) => {
      const p = applyIsometry(keyframe.transforms[f]!, input.vertices[v]!);
      return [p.x, p.y, (keyframe.layers[f] ?? 0) * gapFor(input)];
    });
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
