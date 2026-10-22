import { err, ok, type Result } from "../result";
import type { HowToStep } from "./how-to";
import {
  buildCreasePattern,
  type CreaseAssignment,
  isFolded,
  type CreasePatternError,
  type CreasePatternV1,
  type CreaseSegment,
  type Point2,
} from "./crease-pattern";
import {
  applyIsometry,
  checkFoldRules,
  flatFoldedFaces,
  invertIsometry,
  orientation,
  type FoldRuleFailure,
  type Isometry,
} from "./fold-rules";
import { closure, facePlacements, type FormAngle } from "./form";
import { solveLayerOrder, type LayerOrder } from "./layers";

/**
 * Folding sequences: a model is written as the folds a person makes, and the
 * crease pattern is derived from them, so the instructions and the pattern
 * cannot disagree.
 *
 * Each fold acts on the current flat-folded state. Its line is a segment in
 * the folded frame (the face holding `anchor` stays put); the crease it leaves in
 * every face it crosses is that line mapped back onto the paper. Whether the
 * new crease is a mountain or a valley follows from which way the fold goes
 * and whether that face currently shows its front or its back.
 */

/** A fold line drawn across the folded model, from one point to another. */
export interface FoldLine {
  readonly from: Point2;
  readonly to: Point2;
}

export interface FaceSample {
  /** Face centroid on the unfolded sheet. */
  readonly paper: Point2;
  /** The same point in the current folded state. */
  readonly folded: Point2;
}

export type FoldStep =
  | {
      readonly kind: "creases";
      readonly instruction: string;
      readonly segments: readonly CreaseSegment[];
      /**
       * A 3D form instead of a flat collapse: each crease's final angle (a
       * box's walls stand at 90 degrees). It must be the only step; it is
       * proven by closing every loop of faces, not by flat-folding rules.
       */
      readonly form?: FormAngle;
      /** How to fold this base by hand, step by step (`how-to.ts`). */
      readonly howTo?: readonly HowToStep[];
    }
  | {
      /** valley: the flap comes toward the viewer. mountain: it goes behind. */
      readonly kind: "valley" | "mountain";
      readonly instruction: string;
      readonly line: FoldLine;
      /** Any folded-frame point on the side of the line that moves. */
      readonly toward: Point2;
      /** Faces that take part; all faces by default. */
      readonly layers?: (face: FaceSample) => boolean;
      /** Animation only: how far this fold ends open; 180 lies flat. */
      readonly openDeg?: number;
    }
  | {
      /**
       * A page turn: the flap (the faces `layers` picks) swings over the axis
       * `line`, which runs along creases joining it to the rest. Those hinge
       * creases change between folded and flat; no new crease is made.
       */
      readonly kind: "turn";
      readonly instruction: string;
      readonly line: FoldLine;
      readonly layers: (face: FaceSample) => boolean;
    }
  | {
      /**
       * The moving part of a flap turns inside out: pushed in between the
       * flap's own layers (inside) or wrapped around them (outside).
       */
      readonly kind: "inside-reverse" | "outside-reverse";
      readonly instruction: string;
      readonly line: FoldLine;
      readonly toward: Point2;
      readonly layers?: (face: FaceSample) => boolean;
    };

export interface FoldSequence {
  /** A paper point whose face never moves; it fixes the folded frame. */
  readonly anchor: Point2;
  readonly steps: readonly FoldStep[];
}

export interface DerivedStep {
  readonly step: FoldStep;
  readonly instruction: string;
  /** Crease pattern after this step. */
  readonly pattern: CreasePatternV1;
  /** Creases made in this step, as segments on the sheet. */
  readonly added: readonly CreaseSegment[];
}

export type SequenceError =
  | {
      readonly kind: "pattern";
      readonly step: number;
      readonly error: CreasePatternError;
    }
  /** The anchor lies on a crease or off the sheet, not in a face. */
  | { readonly kind: "anchor_lost"; readonly step: number }
  /** The fold line crosses none of the faces that take part. */
  | { readonly kind: "fold_misses"; readonly step: number }
  /** No stacking of the layers avoids paper passing through paper. */
  | { readonly kind: "layers_cross"; readonly step: number }
  /** A pattern of creases folded all at once can only start a sequence. */
  | { readonly kind: "base_not_first"; readonly step: number }
  /** A 3D form must be a sequence's only step: nothing folds flat after it. */
  | { readonly kind: "form_not_alone"; readonly step: number }
  /** The 3D form's faces do not meet: rigid paper cannot hold it. */
  | { readonly kind: "form_open"; readonly step: number }
  | {
      readonly kind: "not_flat_foldable";
      readonly step: number;
      readonly pattern: CreasePatternV1;
      readonly failures: readonly FoldRuleFailure[];
    };

const EPSILON = 1e-9;

const sub = (p: Point2, q: Point2): Point2 => ({ x: p.x - q.x, y: p.y - q.y });
const cross = (p: Point2, q: Point2): number => p.x * q.y - p.y * q.x;

const polygon = (cp: CreasePatternV1, face: readonly number[]): Point2[] =>
  face.map((v) => cp.vertices[v]!);

/** Area centroid, which lies inside any convex face. */
const centroid = (points: readonly Point2[]): Point2 => {
  let area = 0;
  let x = 0;
  let y = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]!;
    const w = cross(p, q);
    area += w;
    x += (p.x + q.x) * w;
    y += (p.y + q.y) * w;
  });
  return { x: x / (3 * area), y: y / (3 * area) };
};

const contains = (points: readonly Point2[], p: Point2): boolean => {
  let inside = false;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]!;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)
    ) {
      inside = !inside;
    }
  });
  return inside;
};

const onBoundary = (points: readonly Point2[], p: Point2): boolean =>
  points.some((a, i) => {
    const b = points[(i + 1) % points.length]!;
    const e = sub(b, a);
    const t = ((p.x - a.x) * e.x + (p.y - a.y) * e.y) / (e.x * e.x + e.y * e.y);
    return (
      t > -EPSILON &&
      t < 1 + EPSILON &&
      Math.abs(cross(e, sub(p, a))) / Math.hypot(e.x, e.y) < 1e-7
    );
  });

/** Pieces of the segment p + t d (0 <= t <= 1) that lie inside the polygon. */
const clipSegment = (
  points: readonly Point2[],
  p: Point2,
  d: Point2,
): [Point2, Point2][] => {
  const hits: number[] = [0, 1];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]!;
    const e = sub(b, a);
    const denominator = cross(d, e);
    if (Math.abs(denominator) < EPSILON) return;
    const t = cross(sub(a, p), e) / denominator;
    const u = cross(sub(a, p), d) / denominator;
    if (u > -EPSILON && u < 1 + EPSILON && t > 0 && t < 1) hits.push(t);
  });
  const sorted = [
    ...new Set(hits.map((t) => Math.round(t * 1e10) / 1e10)),
  ].sort((s, t) => s - t);
  const at = (t: number): Point2 => ({ x: p.x + d.x * t, y: p.y + d.y * t });
  const pieces: [Point2, Point2][] = [];
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    const middle = at((sorted[i]! + sorted[i + 1]!) / 2);
    // A piece along the face's own edge folds a raw edge or an existing crease: no new crease.
    if (
      sorted[i + 1]! - sorted[i]! > 1e-7 &&
      contains(points, middle) &&
      !onBoundary(points, middle)
    ) {
      pieces.push([at(sorted[i]!), at(sorted[i + 1]!)]);
    }
  }
  return pieces;
};

const onSegment = (p: Point2, s: CreaseSegment): boolean => {
  const d = sub(s.to, s.from);
  const offset = sub(p, s.from);
  const t = (offset.x * d.x + offset.y * d.y) / (d.x * d.x + d.y * d.y);
  return (
    Math.abs(cross(d, offset)) / Math.hypot(d.x, d.y) < 1e-7 &&
    t > -1e-9 &&
    t < 1 + 1e-9
  );
};

const midpoint = (cp: CreasePatternV1, edge: number): Point2 => {
  const { a, b } = cp.edges[edge]!;
  return {
    x: (cp.vertices[a]!.x + cp.vertices[b]!.x) / 2,
    y: (cp.vertices[a]!.y + cp.vertices[b]!.y) / 2,
  };
};

/**
 * The sense of every edge of `finalPattern` in an earlier state `state`: the
 * assignment of the state's crease it lies along, or null if not creased yet.
 */
export const assignmentsIn = (
  finalPattern: CreasePatternV1,
  state: CreasePatternV1 | null,
): (CreaseAssignment | null)[] =>
  finalPattern.edges.map((_, e) => {
    if (!state) return null;
    const m = midpoint(finalPattern, e);
    const along = state.edges.find((edge) =>
      onSegment(m, {
        from: state.vertices[edge.a]!,
        to: state.vertices[edge.b]!,
        assignment: "F",
      }),
    );
    return along?.assignment ?? null;
  });

/** Indices of the edges of `cp` that lie along any of the segments. */
export const edgesAlong = (
  cp: CreasePatternV1,
  segments: readonly CreaseSegment[],
): number[] =>
  cp.edges.flatMap((_, e) =>
    segments.some((s) => onSegment(midpoint(cp, e), s)) ? [e] : [],
  );

const segmentsOf = (cp: CreasePatternV1): CreaseSegment[] =>
  cp.edges.flatMap((e) =>
    e.assignment === "B"
      ? []
      : [
          {
            from: cp.vertices[e.a]!,
            to: cp.vertices[e.b]!,
            assignment: e.assignment,
          },
        ],
  );

const flip = (assignment: "M" | "V"): "M" | "V" =>
  assignment === "M" ? "V" : "M";

interface FoldedState {
  readonly cp: CreasePatternV1;
  readonly transforms: readonly Isometry[];
  /** The solved layer order of this state. */
  readonly order: LayerOrder;
}

/** Index of the face containing a paper point, or -1. */
export const faceAt = (cp: CreasePatternV1, point: Point2): number =>
  cp.faces.findIndex((face) => contains(polygon(cp, face), point));

/** Area centroid of a face on the unfolded sheet. */
export const faceCentroid = (cp: CreasePatternV1, face: number): Point2 =>
  centroid(polygon(cp, cp.faces[face]!));

/** Folded placement of every face, with the anchor's face held still. */
export const foldedTransforms = (
  cp: CreasePatternV1,
  anchor: Point2,
): readonly Isometry[] | null => {
  const root = faceAt(cp, anchor);
  return root < 0 ? null : flatFoldedFaces(cp, root).transforms;
};

/** The folded state with its layer order, or null if either cannot be found. */
const foldedState = (
  cp: CreasePatternV1,
  anchor: Point2,
): FoldedState | null => {
  const transforms = foldedTransforms(cp, anchor);
  if (!transforms) return null;
  const order = solveLayerOrder(
    cp,
    transforms,
    cp.edges.map((edge) => edge.assignment),
    cp.faces.map(() => 0),
  );
  return order ? { cp, transforms, order } : null;
};

/**
 * Seen from the front, a fold toward the viewer is a valley; a face that
 * currently shows its back sees the opposite.
 */
const senseFor = (towardViewer: boolean, transform: Isometry): "M" | "V" =>
  towardViewer === orientation(transform) > 0 ? "V" : "M";

interface AppliedFold {
  readonly segments: CreaseSegment[];
  readonly added: CreaseSegment[];
  /** For a paper point: whether its face moves, and whether it is in the near half. */
  readonly moving: (paper: Point2) => {
    readonly moves: boolean;
    readonly near: boolean;
  };
  /** Stacking levels of the faces the line crosses, for choosing a reverse fold's split. */
  readonly crossedLevels: readonly number[];
}

/**
 * Applies one fold to the current state. A reverse fold opens the flap into a
 * near half (layers above `split`) and a far half: for an inside reverse fold
 * the near half folds away from the viewer and the far half toward, and the
 * other way round for an outside one.
 */
const applyFold = (
  state: FoldedState,
  step: Extract<FoldStep, { toward: Point2 }>,
  split: number,
): AppliedFold | null => {
  const { cp, transforms } = state;
  const { levels, above } = state.order;
  const direction = sub(step.line.to, step.line.from);
  const side = (folded: Point2) =>
    cross(direction, sub(folded, step.line.from));
  const movingSign = Math.sign(side(step.toward));
  const samples = cp.faces.map((face, index): FaceSample => {
    const paper = centroid(polygon(cp, face));
    return { paper, folded: applyIsometry(transforms[index]!, paper) };
  });
  const takesPart = samples.map((sample) => step.layers?.(sample) ?? true);
  const pieces = cp.faces.map((face, index) => {
    if (!takesPart[index]) return [];
    const inverse = invertIsometry(transforms[index]!);
    const from = applyIsometry(inverse, step.line.from);
    const along = sub(applyIsometry(inverse, step.line.to), from);
    return clipSegment(polygon(cp, face), from, along);
  });
  const crossed = pieces.flatMap((list, index) =>
    list.length > 0 ? [index] : [],
  );
  if (crossed.length === 0) return null;
  const reverse =
    step.kind === "inside-reverse" || step.kind === "outside-reverse";
  // Crossed layers split by height at the line. Any other face is in the near
  // half if it lies above a far crossed layer it overlaps (or, overlapping
  // only near ones, above one of them); global heights mean nothing there.
  const nearCrossed = new Set(crossed.filter((f) => levels[f]! > split));
  const farCrossed = crossed.filter((f) => !nearCrossed.has(f));
  const isNear = (face: number): boolean => {
    if (crossed.includes(face)) return nearCrossed.has(face);
    for (const c of farCrossed) {
      const relation = above(face, c);
      if (relation !== null) return relation;
    }
    for (const c of nearCrossed) {
      const relation = above(face, c);
      if (relation !== null) return relation;
    }
    return levels[face]! > split;
  };
  const towardViewer = (face: number): boolean =>
    reverse
      ? isNear(face) === (step.kind === "outside-reverse")
      : step.kind === "valley";
  const added = pieces.flatMap((list, index) =>
    list.map(([p, q]) => ({
      from: p,
      to: q,
      assignment: senseFor(towardViewer(index), transforms[index]!),
    })),
  );
  const moving = (paper: Point2) => {
    const face = faceAt(cp, paper);
    const moves =
      face >= 0 &&
      takesPart[face]! &&
      Math.sign(side(applyIsometry(transforms[face]!, paper))) === movingSign;
    return { moves, near: moves && isNear(face) };
  };
  return {
    segments: [...segmentsOf(cp), ...added],
    added,
    moving,
    crossedLevels: crossed.map((f) => levels[f]!),
  };
};

/**
 * In a reverse fold each half of the flap keeps its own creases; the creases
 * joining the moving near half to the moving far half (the spine that turns
 * inside out) change sense.
 */
const reverseSpine = (
  cp: CreasePatternV1,
  added: readonly CreaseSegment[],
  moving: AppliedFold["moving"],
): CreaseSegment[] => {
  const facesOfEdge = new Map<string, number[]>();
  cp.faces.forEach((face, index) => {
    face.forEach((v, i) => {
      const w = face[(i + 1) % face.length]!;
      const key = v < w ? `${v}-${w}` : `${w}-${v}`;
      facesOfEdge.set(key, [...(facesOfEdge.get(key) ?? []), index]);
    });
  });
  const where = cp.faces.map((face) => moving(centroid(polygon(cp, face))));
  return cp.edges.flatMap((edge, index) => {
    if (edge.assignment === "B") return [];
    const key = edge.a < edge.b ? `${edge.a}-${edge.b}` : `${edge.b}-${edge.a}`;
    const [f, g] = facesOfEdge.get(key) ?? [];
    const isNew = added.some((s) => onSegment(midpoint(cp, index), s));
    const spine =
      f !== undefined &&
      g !== undefined &&
      where[f]!.moves &&
      where[g]!.moves &&
      where[f]!.near !== where[g]!.near;
    const assignment =
      !isNew && spine && isFolded(edge.assignment)
        ? flip(edge.assignment as "M" | "V")
        : edge.assignment;
    return [
      { from: cp.vertices[edge.a]!, to: cp.vertices[edge.b]!, assignment },
    ];
  });
};

/**
 * Closure tolerance for a 3D form, in sheet widths: 1e-6 is 0.15 micrometres
 * on a 150 mm square, so only rounding is forgiven.
 */
const FORM_CLOSURE = 1e-6;

/** A 3D form's pattern, checked: every loop of faces closes at the final angles. */
const formedPattern = (
  segments: readonly CreaseSegment[],
  anchor: Point2,
  form: FormAngle,
  step: number,
): Result<CreasePatternV1, SequenceError> => {
  const built = buildCreasePattern(segments);
  if (!built.ok) return err({ kind: "pattern", step, error: built.error });
  const root = faceAt(built.value, anchor);
  if (root < 0) return err({ kind: "anchor_lost", step });
  const placements = facePlacements(built.value, root, 1, form);
  return closure(built.value, placements) <= FORM_CLOSURE
    ? ok(built.value)
    : err({ kind: "form_open", step });
};

/**
 * The segments after a page turn: every crease along the axis that joins a
 * flap face to a face that stays toggles between folded and flat. Flat ones
 * fold the way that brings the flap over the front (or the back). Null if no
 * crease lies along the axis between the flap and the rest.
 */
const turnSegments = (
  state: FoldedState,
  step: Extract<FoldStep, { kind: "turn" }>,
  overFront: boolean,
): CreaseSegment[] | null => {
  const { cp, transforms } = state;
  const inFlap = cp.faces.map((face, index) => {
    const paper = centroid(polygon(cp, face));
    return step.layers({
      paper,
      folded: applyIsometry(transforms[index]!, paper),
    });
  });
  const facesOf = new Map<string, number[]>();
  cp.faces.forEach((face, f) =>
    face.forEach((v, i) => {
      const w = face[(i + 1) % face.length]!;
      const key = v < w ? `${v}-${w}` : `${w}-${v}`;
      facesOf.set(key, [...(facesOf.get(key) ?? []), f]);
    }),
  );
  const direction = sub(step.line.to, step.line.from);
  const length = Math.hypot(direction.x, direction.y);
  const onAxis = (p: Point2) =>
    Math.abs(cross(direction, sub(p, step.line.from))) / length < 1e-6;
  let toggled = 0;
  const segments = cp.edges.flatMap((edge): CreaseSegment[] => {
    if (edge.assignment === "B") return [];
    const [from, to] = [cp.vertices[edge.a]!, cp.vertices[edge.b]!];
    const pair =
      facesOf.get(
        edge.a < edge.b ? `${edge.a}-${edge.b}` : `${edge.b}-${edge.a}`,
      ) ?? [];
    const hinge =
      pair.length === 2 &&
      inFlap[pair[0]!] !== inFlap[pair[1]!] &&
      onAxis(applyIsometry(transforms[pair[0]!]!, from)) &&
      onAxis(applyIsometry(transforms[pair[0]!]!, to));
    if (!hinge) return [{ from, to, assignment: edge.assignment }];
    toggled += 1;
    const staying = inFlap[pair[0]!] ? pair[1]! : pair[0]!;
    return [
      {
        from,
        to,
        assignment: isFolded(edge.assignment)
          ? "F"
          : senseFor(overFront, transforms[staying]!),
      },
    ];
  });
  return toggled > 0 ? segments : null;
};

/** A step's pattern, checked: flat-foldable and with a non-crossing layer order. */
const checkedPattern = (
  segments: readonly CreaseSegment[],
  anchor: Point2,
  step: number,
): Result<CreasePatternV1, SequenceError> => {
  const built = buildCreasePattern(segments);
  if (!built.ok) return err({ kind: "pattern", step, error: built.error });
  const report = checkFoldRules(built.value);
  if (!report.flatFoldable) {
    return err({
      kind: "not_flat_foldable",
      step,
      pattern: built.value,
      failures: report.failures,
    });
  }
  if (!foldedState(built.value, anchor)) {
    return foldedTransforms(built.value, anchor)
      ? err({ kind: "layers_cross", step })
      : err({ kind: "anchor_lost", step });
  }
  return ok(built.value);
};

export const deriveSequence = (
  sequence: FoldSequence,
): Result<DerivedStep[], SequenceError> => {
  let segments: CreaseSegment[] = [];
  const steps: DerivedStep[] = [];
  for (const [index, step] of sequence.steps.entries()) {
    if (step.kind === "creases" && index > 0)
      return err({ kind: "base_not_first", step: index });
    let added: readonly CreaseSegment[] =
      step.kind === "creases" ? step.segments : [];
    let result: Result<CreasePatternV1, SequenceError>;
    if (step.kind === "creases" && step.form) {
      if (sequence.steps.length > 1)
        return err({ kind: "form_not_alone", step: index });
      segments = [...step.segments];
      result = formedPattern(segments, sequence.anchor, step.form, index);
    } else if (step.kind === "creases") {
      segments = [...step.segments];
      result = checkedPattern(segments, sequence.anchor, index);
    } else if (step.kind === "turn") {
      const current = buildCreasePattern(segments);
      if (!current.ok)
        return err({ kind: "pattern", step: index, error: current.error });
      const state = foldedState(current.value, sequence.anchor);
      if (!state) return err({ kind: "anchor_lost", step: index });
      result = err({ kind: "fold_misses", step: index });
      // Over the front first; a flap that cannot pass there goes round the back.
      for (const overFront of [true, false]) {
        const next = turnSegments(state, step, overFront);
        if (!next) break;
        result = checkedPattern(next, sequence.anchor, index);
        if (result.ok) {
          segments = next;
          break;
        }
      }
    } else {
      const current = buildCreasePattern(segments);
      if (!current.ok)
        return err({ kind: "pattern", step: index, error: current.error });
      const state = foldedState(current.value, sequence.anchor);
      if (!state) return err({ kind: "anchor_lost", step: index });
      const probe = applyFold(state, step, Infinity);
      if (!probe) return err({ kind: "fold_misses", step: index });
      // A reverse fold may open the flap between any two crossed layers; try
      // the most even split first and keep the first that folds flat.
      const levels = [...new Set(probe.crossedLevels)].sort((p, q) => p - q);
      const splits =
        step.kind === "inside-reverse" || step.kind === "outside-reverse"
          ? levels.slice(0, -1).sort((p, q) => {
              const balance = (t: number) =>
                Math.abs(
                  probe.crossedLevels.filter((l) => l > t).length * 2 -
                    probe.crossedLevels.length,
                );
              return balance(p) - balance(q);
            })
          : [Infinity];
      result = err({ kind: "layers_cross", step: index });
      for (const split of splits) {
        const folded = applyFold(state, step, split)!;
        let next = folded.segments;
        if (step.kind === "inside-reverse" || step.kind === "outside-reverse") {
          const built = buildCreasePattern(next);
          if (!built.ok)
            return err({ kind: "pattern", step: index, error: built.error });
          next = reverseSpine(built.value, folded.added, folded.moving);
        }
        const attempt = checkedPattern(next, sequence.anchor, index);
        if (attempt.ok || splits.length === 1) {
          result = attempt;
          segments = next;
          added = folded.added;
          if (attempt.ok) break;
        }
      }
    }
    if (!result.ok) return result;
    const pattern = result.value;
    steps.push({
      step,
      instruction: step.instruction,
      pattern,
      added: edgesAlong(pattern, added).map((e) => ({
        from: pattern.vertices[pattern.edges[e]!.a]!,
        to: pattern.vertices[pattern.edges[e]!.b]!,
        assignment: pattern.edges[e]!.assignment as "M" | "V",
      })),
    });
  }
  return ok(steps);
};
