/**
 * How to fold each base by hand. A base is checked and animated as one
 * collapse, which a beginner cannot follow from one sentence; these are the
 * classic hand sequences that reach the same crease pattern, shown under the
 * base's step and printed on the instruction sheet.
 */

const SQUARE_BASE_STEPS = [
  "Coloured side up, fold in half along each diagonal and unfold.",
  "Turn over. Fold in half edge to edge, both ways, and unfold.",
  "Turn back. Hold the sheet by two opposite edge midpoints and bring three corners down onto the fourth, letting the creases collapse it into a small square (the square base).",
] as const;

export const SQUARE_BASE_HOW: readonly string[] = SQUARE_BASE_STEPS;

export const BIRD_BASE_HOW: readonly string[] = [
  ...SQUARE_BASE_STEPS,
  "With the open end toward you, fold the lower edges of the front flaps to the centre line. Fold the top triangle down over them, crease hard, then unfold these three folds.",
  "Lift the bottom corner of the front layer up along the top crease; the sides fold in to the centre on the creases you made. Flatten this long diamond (a petal fold).",
  "Turn over and repeat the last two steps on the back.",
];

export const FROG_BASE_HOW: readonly string[] = [
  ...SQUARE_BASE_STEPS,
  "Lift one flap upright, open it, and squash it flat so its crease lies on the centre line. Squash the other three flaps the same way.",
  "On each squashed flap, fold the lower edges to the centre line, fold the top down over them, and unfold; then lift the bottom point up so the sides fold in (a petal fold). Do all four.",
];

export const WATERBOMB_BASE_HOW: readonly string[] = [
  "Coloured side up, fold in half along each diagonal and unfold.",
  "Turn over. Fold in half edge to edge across the middle and unfold.",
  "Turn back. Push the two ends of that midline in toward the centre so the top half collapses into a triangle with two flaps on each side (the waterbomb base).",
];

export const FISH_BASE_HOW: readonly string[] = [
  "Fold in half along one diagonal and unfold.",
  "Fold two edges that meet at one end of that diagonal in to lie along it (a kite), and unfold. Do the same from the other end.",
  "Refold all four edges at once: the two side corners pinch out into small flaps. Fold each flap down toward the nearer end (rabbit ears) and flatten.",
];

export const ANIMAL_BODY_HOW: readonly string[] = [
  "Fold in half both ways and unfold. Fold every edge to the centre line and unfold, so the creases divide the square into 16 small squares.",
  "Fold each corner square in half along both of its diagonals and unfold.",
  "Fold the top and bottom edges to the centre. Then fold the left and right edges to the centre too, pulling the trapped corners out so each makes a triangular point (a double boat base).",
  "Fold the whole in half along its length, points outward, so the four points hang down as legs.",
];
