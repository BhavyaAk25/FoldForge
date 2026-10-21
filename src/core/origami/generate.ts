import {
  animalBody,
  fishOnKite,
  fourLegs,
  neckCreature,
  wingedBird,
  type BirdDesign,
  type FishDesign,
  type FourLegsDesign,
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
  | ({ readonly family: "bird" } & BirdDesign)
  | ({ readonly family: "fish" } & FishDesign)
  | ({ readonly family: "legs" } & FourLegsDesign)
  | ({ readonly family: "standing" } & NeckDesign);

export type Family = Design["family"];

/**
 * Each family's values in id order with the range that folds, found by
 * deriving a grid of designs: past these the neck crosses the body (lean
 * beyond 14 degrees), the base fold reaches the kite's side flaps (neckAt
 * beyond 0.55), a low head turns up too far, or a bird's point turns too far
 * to fold flat (beyond 70 degrees), or a longer fish tail needs a steeper
 * turn to clear the kite's flaps. Outside them a design is clamped.
 */
const FIELDS: {
  readonly [F in Family]: readonly (readonly [string, number, number])[];
} = {
  neck: [
    ["neckAt", 0.45, 0.55],
    ["leanDeg", -20, 14],
    ["headAt", 0.65, 0.9],
    ["headDeg", -60, 30],
  ],
  bird: [
    ["neckDeg", 55, 70],
    ["tailDeg", 55, 70],
    ["headAt", 0.6, 0.9],
    ["headTurnDeg", -150, -60],
    ["wingDeg", 30, 170],
  ],
  fish: [
    ["tailAt", 0.2, 0.3],
    ["tailUpDeg", 50, 120],
  ],
  // Front legs further forward than 160 degrees cross the body's layers.
  legs: [
    ["frontDeg", 160, 170],
    ["hindDeg", 200, 250],
  ],
  // A standing animal's second sheet is a neck design.
  standing: [
    ["neckAt", 0.45, 0.55],
    ["leanDeg", -20, 14],
    ["headAt", 0.65, 0.9],
    ["headDeg", -60, 30],
  ],
};

/** A family's values in id order. */
const valuesOf = (d: Design): number[] => {
  switch (d.family) {
    case "neck":
    case "standing":
      return [d.neckAt, d.leanDeg, d.headAt, d.headDeg];
    case "bird":
      return [d.neckDeg, d.tailDeg, d.headAt, d.headTurnDeg, d.wingDeg];
    case "fish":
      return [d.tailAt, d.tailUpDeg];
    case "legs":
      return [d.frontDeg, d.hindDeg];
  }
};

/** The design with these values, each clamped to its range and rounded for a stable id. */
const designOf = (family: Family, raw: readonly number[]): Design => {
  const v = FIELDS[family].map(
    ([, lo, hi], i) =>
      Math.round(Math.min(hi, Math.max(lo, raw[i] ?? lo)) * 100) / 100,
  );
  const [a = 0, b = 0, c = 0, d = 0, e = 0] = v;
  switch (family) {
    case "neck":
    case "standing":
      return { family, neckAt: a, leanDeg: b, headAt: c, headDeg: d };
    case "bird":
      return {
        family,
        neckDeg: a,
        tailDeg: b,
        headAt: c,
        headTurnDeg: d,
        wingDeg: e,
      };
    case "fish":
      return { family, tailAt: a, tailUpDeg: b };
    case "legs":
      return { family, frontDeg: a, hindDeg: b };
  }
};

/** The design with every value inside its family's range. */
export const clampDesign = (d: Design): Design =>
  designOf(d.family, valuesOf(d));

/** "neck_0.53_0_0.78_25": the family, then its values in id order. */
export const designId = (d: Design): string =>
  [d.family, ...valuesOf(d)].join("_");

const isFamily = (value: string): value is Family =>
  Object.hasOwn(FIELDS, value);

export const parseDesignId = (id: string): Design | null => {
  const [family = "", ...rest] = id.split("_");
  const values = rest.map(Number);
  if (
    !isFamily(family) ||
    values.length !== FIELDS[family].length ||
    values.some((x) => !Number.isFinite(x))
  )
    return null;
  const design = designOf(family, values);
  // Only canonical ids name a design, so one design has one URL.
  return designId(design) === id ? design : null;
};

/** One square of a design: a whole model, or one part of a two-sheet one. */
export interface Sheet {
  readonly label: string;
  readonly model: ModelShape;
  /** Its square's side as a fraction of the first sheet's. */
  readonly scale: number;
}

/**
 * The neck sheet's side against the body's: the classic two-piece
 * proportion, where the neck's kite tucks into the front of the body.
 */
export const NECK_SHEET_SCALE = 0.6;

export const designSheets = (d: Design, summary: string): Sheet[] => {
  switch (d.family) {
    case "neck":
      return [{ label: "", model: neckCreature(d, summary), scale: 1 }];
    case "bird":
      return [{ label: "", model: wingedBird(d, summary), scale: 1 }];
    case "fish":
      return [{ label: "", model: fishOnKite(d, summary), scale: 1 }];
    case "legs":
      return [{ label: "", model: fourLegs(d, summary), scale: 1 }];
    case "standing":
      return [
        { label: "Body and legs", model: animalBody(summary), scale: 1 },
        {
          label: "Neck and head",
          model: neckCreature(
            d,
            "The neck and head: its wide end tucks into the front of the body.",
          ),
          scale: NECK_SHEET_SCALE,
        },
      ];
  }
};

const folds = (d: Design): boolean =>
  designSheets(d, "").every((s) => deriveSequence(s.model.sequence).ok);

/**
 * The nearest design that folds: the requested one, else neighbours a step
 * or two away in each value, nearest first. Null when none nearby folds.
 */
export const foldableDesign = (requested: Design): Design | null => {
  const start = clampDesign(requested);
  if (folds(start)) return start;
  const values = valuesOf(start);
  const fields = FIELDS[start.family];
  // Steps of a tenth of each value's range, one then two either way.
  for (const k of [1, -1, 2, -2]) {
    for (const [i, [, lo, hi]] of fields.entries()) {
      const nudged = values.map((v, j) =>
        j === i ? v + (k * (hi - lo)) / 10 : v,
      );
      const candidate = designOf(start.family, nudged);
      if (folds(candidate)) return candidate;
    }
  }
  return null;
};
