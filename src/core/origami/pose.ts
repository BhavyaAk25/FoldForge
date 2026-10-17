import type { FoldKeyframe, FoldMove } from "./animate";
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
}

/** Separation between stacked layers, in sheet widths. */
const LAYER_GAP = 0.004;
/** Share of the collapse step spent settling from the simulated pose to the exact flat one. */
const SETTLE = 0.2;

const ease = (u: number): number => u * u * (3 - 2 * u);

const keyframePose = (input: PoseInput, keyframe: FoldKeyframe): number[] =>
  input.faces.flatMap((face, f) =>
    face.flatMap((v) => {
      const p = applyIsometry(keyframe.transforms[f]!, input.vertices[v]!);
      return [p.x, p.y, (keyframe.layers[f] ?? 0) * LAYER_GAP];
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

/** One face's corners turned about move `index`'s line, `u` of the way through it. */
const turnedFace = (
  input: PoseInput,
  face: number,
  index: number,
  u: number,
): number[] => {
  const before = input.keyframes[index]!;
  const after = input.keyframes[index + 1]!;
  const move = input.moves[index]!;
  const angle = (move.endDeg * Math.PI * ease(u)) / 180;
  const origin = move.line.from;
  const length = Math.hypot(
    move.line.to.x - origin.x,
    move.line.to.y - origin.y,
  );
  const along = {
    x: (move.line.to.x - origin.x) / length,
    y: (move.line.to.y - origin.y) / length,
  };
  const normal = { x: -along.y, y: along.x };
  const z =
    ((before.layers[face] ?? 0) +
      ((after.layers[face] ?? 0) - (before.layers[face] ?? 0)) * ease(u)) *
    LAYER_GAP;
  return input.faces[face]!.flatMap((v) => {
    const p = applyIsometry(before.transforms[face]!, input.vertices[v]!);
    const offset = { x: p.x - origin.x, y: p.y - origin.y };
    const t = offset.x * along.x + offset.y * along.y;
    const d = offset.x * normal.x + offset.y * normal.y;
    return [
      origin.x + along.x * t + normal.x * d * Math.cos(angle),
      origin.y + along.y * t + normal.y * d * Math.cos(angle),
      z + move.swing * Math.abs(d) * Math.sin(angle),
    ];
  });
};

/**
 * Pose during move `index`. A face last turned by an earlier fold that stops
 * short of flat (a wing opened to 90 degrees) stays at that angle.
 */
const movePose = (input: PoseInput, index: number, u: number): number[] =>
  input.faces.flatMap((face, f) => {
    if (input.moves[index]!.moving[f]) return turnedFace(input, f, index, u);
    for (let j = index - 1; j >= 0; j -= 1) {
      if (!input.moves[j]!.moving[f]) continue;
      if (input.moves[j]!.endDeg < 180) return turnedFace(input, f, j, 1);
      break;
    }
    const keyframe = input.keyframes[index]!;
    return face.flatMap((v) => {
      const p = applyIsometry(keyframe.transforms[f]!, input.vertices[v]!);
      return [p.x, p.y, (keyframe.layers[f] ?? 0) * LAYER_GAP];
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
    if (u <= 1 - SETTLE) return collapsePose(input.collapse, u / (1 - SETTLE));
    return lerp(
      collapsePose(input.collapse, 1),
      keyframePose(input, input.keyframes[0]!),
      ease((u - (1 - SETTLE)) / SETTLE),
    );
  }
  return movePose(input, step - (input.collapse ? 1 : 0), u);
};
