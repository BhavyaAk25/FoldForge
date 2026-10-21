import {
  neckCreature,
  wingedBird,
  type BirdDesign,
  type ModelShape,
  type NeckDesign,
} from "./families";
import { deriveSequence } from "./sequence";

/**
 * Generated origami: a design in one of the model families, chosen to
 * resemble the subject asked for. A design is written as a short id so the
 * same routes, caches, and downloads serve it as serve the library. Only a
 * design whose every step derives (fold rules and layer order) is ever
 * returned; a requested design that does not fold is moved to the nearest
 * one that does.
 */

export type Design =
  | ({ readonly family: "neck" } & NeckDesign)
  | ({ readonly family: "bird" } & BirdDesign);

type Bounds<T> = { readonly [K in keyof T]: readonly [number, number] };

/**
 * What each family can fold, found by deriving a grid of designs: past these
 * the neck crosses the body (lean beyond 14 degrees), the base fold reaches
 * the kite's side flaps (neckAt beyond 0.55), a low head turns up too far, or a bird's point turns too
 * far to fold flat (beyond 70 degrees). Outside them a design is clamped.
 */
const NECK_BOUNDS: Bounds<NeckDesign> = {
  neckAt: [0.45, 0.55],
  leanDeg: [-20, 14],
  headAt: [0.65, 0.9],
  headDeg: [-60, 30],
};
const BIRD_BOUNDS: Bounds<BirdDesign> = {
  neckDeg: [55, 70],
  tailDeg: [55, 70],
  headAt: [0.6, 0.9],
  headTurnDeg: [-150, -60],
  wingDeg: [30, 170],
};
/** Field order in a design id. */
const NECK_FIELDS = ["neckAt", "leanDeg", "headAt", "headDeg"] as const;
const BIRD_FIELDS = [
  "neckDeg",
  "tailDeg",
  "headAt",
  "headTurnDeg",
  "wingDeg",
] as const;

const clamp = (v: number, [lo, hi]: readonly [number, number]) =>
  Math.round(Math.min(hi, Math.max(lo, v)) * 100) / 100;

/** The design with every value inside its family's bounds, rounded for a stable id. */
export const clampDesign = (d: Design): Design => {
  if (d.family === "neck") {
    const b = NECK_BOUNDS;
    return {
      family: "neck",
      neckAt: clamp(d.neckAt, b.neckAt),
      leanDeg: clamp(d.leanDeg, b.leanDeg),
      headAt: clamp(d.headAt, b.headAt),
      headDeg: clamp(d.headDeg, b.headDeg),
    };
  }
  const b = BIRD_BOUNDS;
  return {
    family: "bird",
    neckDeg: clamp(d.neckDeg, b.neckDeg),
    tailDeg: clamp(d.tailDeg, b.tailDeg),
    headAt: clamp(d.headAt, b.headAt),
    headTurnDeg: clamp(d.headTurnDeg, b.headTurnDeg),
    wingDeg: clamp(d.wingDeg, b.wingDeg),
  };
};

/** "neck_0.53_0_0.78_25": the family, then its values in field order. */
export const designId = (d: Design): string =>
  [
    d.family,
    ...(d.family === "neck"
      ? NECK_FIELDS.map((k) => d[k])
      : BIRD_FIELDS.map((k) => d[k])),
  ].join("_");

export const parseDesignId = (id: string): Design | null => {
  const [family, ...rest] = id.split("_");
  const v = rest.map(Number);
  if (v.some((x) => !Number.isFinite(x))) return null;
  const [a = 0, b = 0, c = 0, d = 0, e = 0] = v;
  const design: Design | null =
    family === "neck" && v.length === NECK_FIELDS.length
      ? { family, neckAt: a, leanDeg: b, headAt: c, headDeg: d }
      : family === "bird" && v.length === BIRD_FIELDS.length
        ? {
            family,
            neckDeg: a,
            tailDeg: b,
            headAt: c,
            headTurnDeg: d,
            wingDeg: e,
          }
        : null;
  // Only canonical ids name a design, so one design has one URL.
  return design && designId(clampDesign(design)) === id
    ? clampDesign(design)
    : null;
};

export const designShape = (d: Design, summary: string): ModelShape =>
  d.family === "neck" ? neckCreature(d, summary) : wingedBird(d, summary);

const folds = (d: Design): boolean =>
  deriveSequence(designShape(d, "").sequence).ok;

/**
 * The nearest design that folds: the requested one, else neighbours a step
 * or two away in each value, nearest first. Null when none nearby folds.
 */
export const foldableDesign = (requested: Design): Design | null => {
  const start = clampDesign(requested);
  if (folds(start)) return start;
  // Steps of a tenth of each value's range, one then two either way.
  const nudged = (k: number): Design[] => {
    if (start.family === "neck") {
      return NECK_FIELDS.map((f) => {
        const [lo, hi] = NECK_BOUNDS[f];
        return clampDesign({ ...start, [f]: start[f] + (k * (hi - lo)) / 10 });
      });
    }
    return BIRD_FIELDS.map((f) => {
      const [lo, hi] = BIRD_BOUNDS[f];
      return clampDesign({ ...start, [f]: start[f] + (k * (hi - lo)) / 10 });
    });
  };
  for (const k of [1, -1, 2, -2]) {
    const found = nudged(k).find(folds);
    if (found) return found;
  }
  return null;
};
