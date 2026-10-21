import type { CreasePatternV1, Point2 } from "./crease-pattern";
import type { Isometry } from "./fold-rules";
import { solveLayerOrder } from "./layers";
import {
  assignmentsIn,
  faceAt,
  faceCentroid,
  foldedTransforms,
  type DerivedStep,
  type FoldLine,
} from "./sequence";
import { facePlacements, place, type FormAngle } from "./form";
import { simulateFolding } from "./simulate";

/**
 * Animation data for a derived folding sequence, compact enough to send to
 * the browser, which only interpolates rotations.
 *
 * - `collapse`: a base folded all at once (bird base, waterbomb base) is
 *   simulated as bars and hinges; each frame gives every face corner's 3D
 *   position.
 * - `keyframes`: the exact flat-folded state before the first fold and after
 *   each fold, as one isometry and one stacking rank per face.
 * - `moves`: each fold turns its moving faces 180 degrees about the fold line,
 *   which is exactly how a flap swings over.
 *
 * Every per-face array is indexed by the faces of the final pattern.
 */

export interface FoldKeyframe {
  readonly transforms: readonly Isometry[];
  /**
   * Stacking level per face; higher is nearer the viewer. A face sits one
   * level above the highest face beneath it that it overlaps, so the stack is
   * only as thick as the paper really is at each spot.
   */
  readonly layers: readonly number[];
}

export interface FoldMove {
  readonly line: FoldLine;
  readonly moving: readonly boolean[];
  /** +1: the flap swings toward the viewer; -1: behind. */
  readonly swing: 1 | -1;
  readonly endDeg: number;
}

export interface FoldAnimation {
  readonly faces: readonly (readonly number[])[];
  /** Per frame, x, y, z for every corner of every face in order. */
  readonly collapse: readonly (readonly number[])[] | null;
  /** Largest bar strain in the collapsed base (0.001 = 0.1%); paper bends more on the way. */
  readonly collapseStrain: number | null;
  readonly keyframes: readonly FoldKeyframe[];
  readonly moves: readonly FoldMove[];
  /** The collapse ends as a 3D form (a box), not flat: it is shown as it stands. */
  readonly formed: boolean;
}

const IDENTITY: Isometry = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const round = (n: number): number => Math.round(n * 1e4) / 1e4;
const same = (s: Isometry, t: Isometry): boolean =>
  [s.a - t.a, s.b - t.b, s.c - t.c, s.d - t.d, s.tx - t.tx, s.ty - t.ty].every(
    (d) => Math.abs(d) < 1e-7,
  );

/** For each final face, the face of `cp` it lies in. */
const containing = (
  finalPattern: CreasePatternV1,
  cp: CreasePatternV1,
): number[] =>
  finalPattern.faces.map((_, face) =>
    faceAt(cp, faceCentroid(finalPattern, face)),
  );

/** A simulated collapse is shown only if it ends this close to rigid paper. */
const RIGID_ENOUGH = 0.01;
const COLLAPSE_FRAMES = 16;

/** Frames turning faces about their creases along a tree (see `facePlacements`). */
const treeFrames = (
  base: CreasePatternV1,
  finalPattern: CreasePatternV1,
  anchorFace: number,
  angle: FormAngle | null,
): number[][] => {
  const owner = containing(finalPattern, base);
  return Array.from({ length: COLLAPSE_FRAMES + 1 }, (_, i) => {
    const placements = facePlacements(
      base,
      anchorFace,
      i / COLLAPSE_FRAMES,
      angle,
    );
    return finalPattern.faces.flatMap((corners, face) =>
      corners.flatMap((v) =>
        place(placements[owner[face]!]!, finalPattern.vertices[v]!).map(round),
      ),
    );
  });
};

const collapseFrames = (
  base: CreasePatternV1,
  finalPattern: CreasePatternV1,
  anchor: Point2,
  form: FormAngle | null,
): {
  readonly frames: number[][];
  readonly heights: number[];
  readonly strain: number | null;
} => {
  const anchorFace = faceAt(base, anchor);
  // A 3D form is placed exactly (derivation proved it closes); it stays
  // standing, so nothing needs stacking.
  if (form) {
    return {
      frames: treeFrames(base, finalPattern, anchorFace, form),
      heights: finalPattern.faces.map(() => 0),
      strain: null,
    };
  }
  const simulation = simulateFolding(base, {
    frames: COLLAPSE_FRAMES,
    pinned: base.faces[anchorFace] ?? [],
  });
  if (simulation.finalStrain > RIGID_ENOUGH) {
    // Flat at the end: no heights to order by, so the solver decides alone.
    return {
      frames: treeFrames(base, finalPattern, anchorFace, null),
      heights: finalPattern.faces.map(() => 0),
      strain: null,
    };
  }
  const owner = containing(finalPattern, base);
  // A face moves rigidly with the first three corners of the base face it lies in.
  const placeIn = (
    positions: readonly number[],
    face: number,
    p: Point2,
  ): [number, number, number] => {
    const corners = base.faces[face]!;
    const at = (i: number) => {
      const v = corners[i]!;
      return {
        paper: base.vertices[v]!,
        x: positions[3 * v]!,
        y: positions[3 * v + 1]!,
        z: positions[3 * v + 2]!,
      };
    };
    const [o, a, b] = [at(0), at(1), at(2)];
    const u = { x: a.paper.x - o.paper.x, y: a.paper.y - o.paper.y };
    const v = { x: b.paper.x - o.paper.x, y: b.paper.y - o.paper.y };
    const det = u.x * v.y - u.y * v.x;
    const d = { x: p.x - o.paper.x, y: p.y - o.paper.y };
    const s = (d.x * v.y - d.y * v.x) / det;
    const t = (u.x * d.y - u.y * d.x) / det;
    return [
      o.x + s * (a.x - o.x) + t * (b.x - o.x),
      o.y + s * (a.y - o.y) + t * (b.y - o.y),
      o.z + s * (a.z - o.z) + t * (b.z - o.z),
    ];
  };
  const frames = simulation.frames.map((frame) =>
    finalPattern.faces.flatMap((corners, face) =>
      corners.flatMap((v) =>
        placeIn(frame.positions, owner[face]!, finalPattern.vertices[v]!).map(
          round,
        ),
      ),
    ),
  );
  const last = simulation.frames.at(-1)!.positions;
  const heights = finalPattern.faces.map(
    (_, face) =>
      placeIn(last, owner[face]!, faceCentroid(finalPattern, face))[2],
  );
  return { frames, heights, strain: simulation.finalStrain };
};

/** Turning a flap over puts it on top (or underneath), in reverse order. */
const restack = (
  layers: readonly number[],
  moving: readonly boolean[],
  swing: 1 | -1,
  reverse: boolean,
): number[] => {
  const moved = layers.filter((_, i) => moving[i]);
  if (moved.length === 0 || reverse) return [...layers];
  const [lowAll, highAll] = [Math.min(...layers), Math.max(...layers)];
  const [lowMoved, highMoved] = [Math.min(...moved), Math.max(...moved)];
  return layers.map((layer, i) =>
    !moving[i]
      ? layer
      : swing > 0
        ? highAll + 1 + (highMoved - layer)
        : lowAll - 1 - (layer - lowMoved),
  );
};

/**
 * Animation for a sequence `deriveSequence` accepted. Its guarantees (a base
 * only first, the anchor in a face at every step) are invariants here.
 */
export const animateSequence = (
  steps: readonly DerivedStep[],
  anchor: Point2,
): FoldAnimation => {
  const finalPattern = steps.at(-1)!.pattern;
  const first = steps[0]!;
  const hasBase = first.step.kind === "creases";
  const form = first.step.kind === "creases" ? (first.step.form ?? null) : null;
  const transformsAt = (cp: CreasePatternV1): Isometry[] => {
    const transforms = foldedTransforms(cp, anchor);
    if (!transforms)
      throw new Error(
        "The anchor left the sheet after derivation accepted it.",
      );
    return containing(finalPattern, cp).map(
      (face) => transforms[face] ?? IDENTITY,
    );
  };

  const collapse = hasBase
    ? collapseFrames(first.pattern, finalPattern, anchor, form)
    : null;
  // Back-to-front order: by height in the simulated base, or one flat layer.
  const order = finalPattern.faces.map(() => 0);
  collapse?.heights
    .map((height, face) => ({ height, face }))
    .sort((p, q) => p.height - q.height)
    .forEach(({ face }, rank) => (order[face] = rank));
  // A 3D form has no flat state: its one keyframe is the creased sheet.
  const keyframes: FoldKeyframe[] = [
    {
      transforms:
        hasBase && !form
          ? transformsAt(first.pattern)
          : finalPattern.faces.map(() => IDENTITY),
      layers: order,
    },
  ];
  const states: (CreasePatternV1 | null)[] = [hasBase ? first.pattern : null];
  const moves: FoldMove[] = [];
  for (const { step, pattern } of steps.slice(hasBase ? 1 : 0)) {
    if (step.kind === "creases")
      throw new Error("A base step appeared after the first step.");
    const before = keyframes.at(-1)!;
    const after = transformsAt(pattern);
    const moving = after.map((t, face) => !same(t, before.transforms[face]!));
    const swing: 1 | -1 = step.kind === "mountain" ? -1 : 1;
    const reverse =
      step.kind === "inside-reverse" || step.kind === "outside-reverse";
    const endDeg =
      step.kind === "valley" || step.kind === "mountain"
        ? (step.openDeg ?? 180)
        : 180;
    moves.push({ line: step.line, moving, swing, endDeg });
    keyframes.push({
      transforms: after,
      layers: restack(before.layers, moving, swing, reverse),
    });
    states.push(pattern);
  }
  // Each state's stacking comes from the layer-order solver (derivation
  // already proved one exists); the fold-history order only breaks ties so
  // consecutive states look alike. A 3D form's one keyframe is the flat,
  // unfolded sheet, where nothing overlaps.
  const stacked = keyframes.map((k, i) => {
    if (form) return k;
    const solved = solveLayerOrder(
      finalPattern,
      k.transforms,
      assignmentsIn(finalPattern, states[i] ?? null),
      k.layers,
    );
    if (!solved) throw new Error("A derived state has no layer order.");
    return { transforms: k.transforms, layers: solved.levels };
  });
  return {
    faces: finalPattern.faces,
    collapse: collapse?.frames ?? null,
    collapseStrain: collapse?.strain ?? null,
    keyframes: stacked.map((k) => ({
      transforms: k.transforms.map((t) => ({
        a: round(t.a),
        b: round(t.b),
        c: round(t.c),
        d: round(t.d),
        tx: round(t.tx),
        ty: round(t.ty),
      })),
      layers: k.layers,
    })),
    moves,
    formed: form !== null,
  };
};
