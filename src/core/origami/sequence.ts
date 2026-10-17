import { err, ok, type Result } from "../result";
import {
  buildCreasePattern,
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
       * The moving part of a flap turns inside out: pushed in between the
       * flap's own layers (inside) or wrapped around them (outside).
       */
      readonly kind: "inside-reverse" | "outside-reverse";
      readonly instruction: string;
      readonly line: FoldLine;
      readonly toward: Point2;
      readonly layers?: (face: FaceSample) => boolean;
      /** A paper point in the flap's layer nearest the viewer. */
      readonly top: Point2;
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
  /** The anchor (or a reverse fold's top point) lies on a crease, not in a face. */
  | { readonly kind: "anchor_lost"; readonly step: number }
  /** A pattern of creases folded all at once can only start a sequence. */
  | { readonly kind: "base_not_first"; readonly step: number }
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

const foldedState = (
  cp: CreasePatternV1,
  anchor: Point2,
): FoldedState | null => {
  const transforms = foldedTransforms(cp, anchor);
  return transforms ? { cp, transforms } : null;
};

/**
 * Seen from the front, a fold toward the viewer is a valley; a face that
 * currently shows its back sees the opposite.
 */
const senseFor = (towardViewer: boolean, transform: Isometry): "M" | "V" =>
  towardViewer === orientation(transform) > 0 ? "V" : "M";

/** Applies one fold to the current pattern and returns the new crease segments. */
const applyFold = (
  state: FoldedState,
  step: Extract<FoldStep, { line: FoldLine }>,
): {
  readonly segments: CreaseSegment[];
  readonly added: CreaseSegment[];
  readonly moving: (paper: Point2) => boolean;
} | null => {
  const { cp, transforms } = state;
  const direction = sub(step.line.to, step.line.from);
  const side = (folded: Point2) =>
    cross(direction, sub(folded, step.line.from));
  const movingSign = Math.sign(side(step.toward));
  const samples = cp.faces.map((face, index): FaceSample => {
    const paper = centroid(polygon(cp, face));
    return { paper, folded: applyIsometry(transforms[index]!, paper) };
  });
  const takesPart = samples.map((sample) => step.layers?.(sample) ?? true);
  // In a reverse fold, layers on either side of every crease the line crosses
  // face opposite ways and turn opposite ways, so all new creases share one
  // sense: the top layer goes behind for an inside reverse fold.
  let reverse: "M" | "V" | null = null;
  if (step.kind === "inside-reverse" || step.kind === "outside-reverse") {
    const top = faceAt(cp, step.top);
    if (top < 0) return null;
    reverse = senseFor(step.kind === "outside-reverse", transforms[top]!);
  }
  const added: CreaseSegment[] = [];
  cp.faces.forEach((face, index) => {
    if (!takesPart[index]) return;
    const inverse = invertIsometry(transforms[index]!);
    const from = applyIsometry(inverse, step.line.from);
    const along = sub(applyIsometry(inverse, step.line.to), from);
    const assignment =
      reverse ?? senseFor(step.kind === "valley", transforms[index]!);
    for (const [p, q] of clipSegment(polygon(cp, face), from, along)) {
      added.push({ from: p, to: q, assignment });
    }
  });
  const moving = (paper: Point2): boolean => {
    const face = cp.faces.findIndex((f) => contains(polygon(cp, f), paper));
    if (face < 0 || !takesPart[face]) return false;
    return (
      Math.sign(side(applyIsometry(transforms[face]!, paper))) === movingSign
    );
  };
  return { segments: [...segmentsOf(cp), ...added], added, moving };
};

/**
 * An inside reverse fold turns the moving part of the flap inside out, so
 * every existing crease between two moving faces changes sense.
 */
const reverseInside = (
  cp: CreasePatternV1,
  added: readonly CreaseSegment[],
  moving: (paper: Point2) => boolean,
): CreaseSegment[] => {
  const facesOfEdge = new Map<string, number[]>();
  cp.faces.forEach((face, index) => {
    face.forEach((v, i) => {
      const w = face[(i + 1) % face.length]!;
      const key = v < w ? `${v}-${w}` : `${w}-${v}`;
      facesOfEdge.set(key, [...(facesOfEdge.get(key) ?? []), index]);
    });
  });
  const movingFace = cp.faces.map((face) =>
    moving(centroid(polygon(cp, face))),
  );
  return cp.edges.flatMap((edge, index) => {
    if (edge.assignment === "B") return [];
    const key = edge.a < edge.b ? `${edge.a}-${edge.b}` : `${edge.b}-${edge.a}`;
    const isNew = added.some((s) => onSegment(midpoint(cp, index), s));
    const inside = (facesOfEdge.get(key) ?? []).every((f) => movingFace[f]);
    const assignment =
      !isNew && inside && isFolded(edge.assignment)
        ? flip(edge.assignment as "M" | "V")
        : edge.assignment;
    return [
      { from: cp.vertices[edge.a]!, to: cp.vertices[edge.b]!, assignment },
    ];
  });
};

export const deriveSequence = (
  sequence: FoldSequence,
): Result<DerivedStep[], SequenceError> => {
  let segments: CreaseSegment[] = [];
  const steps: DerivedStep[] = [];
  for (const [index, step] of sequence.steps.entries()) {
    let added: readonly CreaseSegment[];
    if (step.kind === "creases" && index > 0)
      return err({ kind: "base_not_first", step: index });
    if (step.kind === "creases") {
      added = step.segments;
      segments = [...segments, ...step.segments];
    } else {
      const current = buildCreasePattern(segments);
      if (!current.ok)
        return err({ kind: "pattern", step: index, error: current.error });
      const state = foldedState(current.value, sequence.anchor);
      if (!state) return err({ kind: "anchor_lost", step: index });
      const folded = applyFold(state, step);
      if (!folded) return err({ kind: "anchor_lost", step: index });
      added = folded.added;
      segments = folded.segments;
      if (step.kind === "inside-reverse" || step.kind === "outside-reverse") {
        const built = buildCreasePattern(segments);
        if (!built.ok)
          return err({ kind: "pattern", step: index, error: built.error });
        segments = reverseInside(built.value, added, folded.moving);
      }
    }
    const built = buildCreasePattern(segments);
    if (!built.ok)
      return err({ kind: "pattern", step: index, error: built.error });
    const report = checkFoldRules(built.value);
    if (!report.flatFoldable)
      return err({
        kind: "not_flat_foldable",
        step: index,
        pattern: built.value,
        failures: report.failures,
      });
    steps.push({
      step,
      instruction: step.instruction,
      pattern: built.value,
      added: edgesAlong(built.value, added).map((e) => ({
        from: built.value.vertices[built.value.edges[e]!.a]!,
        to: built.value.vertices[built.value.edges[e]!.b]!,
        assignment: built.value.edges[e]!.assignment as "M" | "V",
      })),
    });
  }
  return ok(steps);
};
