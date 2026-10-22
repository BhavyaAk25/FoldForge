import type { CreaseSegment, Point2 } from "./crease-pattern";

/**
 * How to fold each base by hand. A base is checked and animated as one
 * collapse, which a beginner cannot follow from one sentence; these are the
 * classic hand sequences that reach the same crease pattern, shown under the
 * base's step and printed on the instruction sheet.
 *
 * A sub-step may name a picture: creases to make on the flat square, or a
 * folded state the server derives and checks like any other ("square-base"
 * from the library, or "self", the base this step folds).
 */
export type HowToShow =
  | { readonly creases: readonly CreaseSegment[] }
  | { readonly folded: "square-base" | "self" };

export interface HowToStep {
  readonly text: string;
  readonly show: HowToShow | null;
}

const p = (x: number, y: number): Point2 => ({ x, y });
const line = (
  from: Point2,
  to: Point2,
  assignment: "M" | "V",
): CreaseSegment => ({ from, to, assignment });
const DIAGONALS = [line(p(0, 0), p(1, 1), "V"), line(p(1, 0), p(0, 1), "V")];
const MIDLINES = [
  line(p(0.5, 0), p(0.5, 1), "M"),
  line(p(0, 0.5), p(1, 0.5), "M"),
];

const SQUARE_BASE_STEPS: readonly HowToStep[] = [
  {
    text: "Coloured side up, fold in half along each diagonal and unfold.",
    show: { creases: DIAGONALS },
  },
  {
    text: "Turn over. Fold in half edge to edge, both ways, and unfold.",
    show: { creases: MIDLINES },
  },
  {
    text: "Turn back. Hold the sheet by two opposite edge midpoints and bring three corners down onto the fourth, letting the creases collapse it into a small square (the square base).",
    show: { folded: "square-base" },
  },
];

export const SQUARE_BASE_HOW: readonly HowToStep[] = SQUARE_BASE_STEPS;

export const BIRD_BASE_HOW: readonly HowToStep[] = [
  ...SQUARE_BASE_STEPS,
  {
    text: "With the open end toward you, fold the lower edges of the front flaps to the centre line. Fold the top triangle down over them, crease hard, then unfold these three folds.",
    show: null,
  },
  {
    text: "Lift the bottom corner of the front layer up along the top crease; the sides fold in to the centre on the creases you made. Flatten this long diamond (a petal fold).",
    show: null,
  },
  {
    text: "Turn over and repeat the last two steps on the back.",
    show: { folded: "self" },
  },
];

export const FROG_BASE_HOW: readonly HowToStep[] = [
  ...SQUARE_BASE_STEPS,
  {
    text: "Lift one flap upright, open it, and squash it flat so its crease lies on the centre line. Squash the other three flaps the same way.",
    show: null,
  },
  {
    text: "On each squashed flap, fold the lower edges to the centre line, fold the top down over them, and unfold; then lift the bottom point up so the sides fold in (a petal fold). Do all four.",
    show: { folded: "self" },
  },
];

export const WATERBOMB_BASE_HOW: readonly HowToStep[] = [
  {
    text: "Coloured side up, fold in half along each diagonal and unfold.",
    show: { creases: DIAGONALS },
  },
  {
    text: "Turn over. Fold in half edge to edge across the middle and unfold.",
    show: { creases: [line(p(0, 0.5), p(1, 0.5), "M")] },
  },
  {
    text: "Turn back. Push the two ends of that midline in toward the centre so the top half collapses into a triangle with two flaps on each side (the waterbomb base).",
    show: { folded: "self" },
  },
];

export const FISH_BASE_HOW: readonly HowToStep[] = [
  {
    text: "Fold in half along one diagonal and unfold.",
    show: { creases: [line(p(0, 0), p(1, 1), "V")] },
  },
  {
    text: "Fold two edges that meet at one end of that diagonal in to lie along it (a kite), and unfold. Do the same from the other end.",
    show: {
      creases: [
        line(p(0, 0), p(Math.SQRT1_2, 1 - Math.SQRT1_2), "V"),
        line(p(0, 0), p(1 - Math.SQRT1_2, Math.SQRT1_2), "V"),
        line(p(1, 1), p(Math.SQRT1_2, 1 - Math.SQRT1_2), "V"),
        line(p(1, 1), p(1 - Math.SQRT1_2, Math.SQRT1_2), "V"),
      ],
    },
  },
  {
    text: "Refold all four edges at once: the two side corners pinch out into small flaps. Fold each flap down toward the nearer end (rabbit ears) and flatten.",
    show: { folded: "self" },
  },
];

const QUARTERS = [0.25, 0.5, 0.75].flatMap((t) => [
  line(p(t, 0), p(t, 1), "V"),
  line(p(0, t), p(1, t), "V"),
]);
const CORNER_SQUARES = [
  [0, 0],
  [0.75, 0],
  [0, 0.75],
  [0.75, 0.75],
].flatMap(([x = 0, y = 0]) => [
  line(p(x, y), p(x + 0.25, y + 0.25), "V"),
  line(p(x + 0.25, y), p(x, y + 0.25), "V"),
]);

export const ANIMAL_BODY_HOW: readonly HowToStep[] = [
  {
    text: "Fold in half both ways and unfold. Fold every edge to the centre line and unfold, so the creases divide the square into 16 small squares.",
    show: { creases: QUARTERS },
  },
  {
    text: "Fold each corner square in half along both of its diagonals and unfold.",
    show: { creases: CORNER_SQUARES },
  },
  {
    text: "Fold the top and bottom edges to the centre. Then fold the left and right edges to the centre too, pulling the trapped corners out so each makes a triangular point (a double boat base).",
    show: null,
  },
  {
    text: "Fold the whole in half along its length, points outward, so the four points hang down as legs.",
    show: { folded: "self" },
  },
];
