import type { OrigamiModelId } from "./catalog";
import type { CreaseSegment, Point2 } from "./crease-pattern";
import {
  FROG_BASE,
  FROG_NARROW_STEPS,
  fourLegs,
  frogCorner,
  across,
  BIRD_ANCHOR,
  BIRD_BASE,
  BIRD_BASE_STEP,
  crease,
  neckCreature,
  p,
  ray,
  wings,
  wingedBird,
  type ModelShape,
} from "./families";
import {
  type HowToStep,
  BIRD_BASE_HOW,
  FISH_BASE_HOW,
  FROG_BASE_HOW,
  SQUARE_BASE_HOW,
  WATERBOMB_BASE_HOW,
} from "./how-to";
import type { FaceSample, FoldLine, FoldStep } from "./sequence";

/**
 * The origami library. Bases are crease patterns that collapse all at once;
 * models are bases (or a plain sheet) followed by the folds a person makes.
 * Coordinates are on the unit sheet; fold lines are in the folded frame,
 * where the face holding `anchor` never moves. The crane and the swan are
 * designs in the families of `families.ts`, which generated models share.
 */

export interface OrigamiModel extends ModelShape {
  readonly id: OrigamiModelId;
}

const R = Math.SQRT1_2;
const SQUARE_BASE: readonly CreaseSegment[] = [
  crease(p(0.5, 0), p(0.5, 1), "M"),
  crease(p(0, 0.5), p(1, 0.5), "M"),
  crease(p(1, 0), p(0, 1), "V"),
];

const WATERBOMB_BASE: readonly CreaseSegment[] = [
  crease(p(0, 0), p(1, 1), "V"),
  crease(p(1, 0), p(0, 1), "V"),
  crease(p(0, 0.5), p(1, 0.5), "M"),
];

/** Kite folds from two opposite corners, then the side corners rabbit-eared. */
const FISH_BASE: readonly CreaseSegment[] = [
  ...[
    [p(0, 0), p(R, 1 - R)],
    [p(0, 0), p(1 - R, R)],
    [p(1, 1), p(R, 1 - R)],
    [p(1, 1), p(1 - R, R)],
  ].map(([a, b]) => crease(a!, b!, "V")),
  crease(p(0, 1), p(1 - R, R), "V"),
  crease(p(1 - R, R), p(R, 1 - R), "M"),
  crease(p(R, 1 - R), p(1, 0), "V"),
];

const base = (
  id: OrigamiModelId,
  segments: readonly CreaseSegment[],
  instruction: string,
  howTo: readonly HowToStep[],
  anchor: Point2,
  summary: string,
): OrigamiModel => ({
  id,
  summary,
  sequence: {
    anchor,
    steps: [{ kind: "creases", instruction, segments, howTo }],
  },
  viewDeg: 0,
});

/** The traditional crane (orizuru): the winged bird's original design. */
const CRANE: OrigamiModel = {
  id: "crane",
  ...wingedBird(
    {
      neckDeg: 67.5,
      tailDeg: 67.5,
      headAt: 0.8,
      headTurnDeg: -105,
      wingDeg: 90,
    },
    "The traditional crane (orizuru), folded from a bird base.",
  ),
};

const FLAPPING_BIRD: OrigamiModel = {
  id: "flapping-bird",
  summary: "The traditional flapping bird: pull the tail and the wings flap.",
  viewDeg: -90,
  sequence: {
    anchor: BIRD_ANCHOR,
    steps: [
      BIRD_BASE_STEP,
      {
        kind: "inside-reverse",
        instruction:
          "Inside-reverse-fold one lower point up between the wings to make the neck.",
        line: ray(
          p(0.5 - 0.02 / Math.tan((67.5 * Math.PI) / 180), -0.02),
          67.5,
          0.4,
        ),
        toward: p(0.9, 0.02),
        layers: (f) => f.folded.y > 1e-6 && f.folded.x > 0.3,
      },
      {
        kind: "inside-reverse",
        instruction:
          "Inside-reverse-fold the other lower point up to make the tail.",
        line: ray(
          p(0.5 - 0.02 / Math.tan((67.5 * Math.PI) / 180), 0.02),
          -67.5,
          0.4,
        ),
        toward: p(0.9, -0.02),
        layers: (f) => f.folded.y < -1e-6 && f.folded.x > 0.3,
      },
      {
        kind: "inside-reverse",
        instruction:
          "Inside-reverse-fold the tip of the neck to form the head.",
        line: across(p(0.203, 0.297), 82.5, 0.06),
        toward: p(0.15, 0.35),
        layers: (f) => f.folded.y > 0.1,
      },
      ...wings(60),
    ],
  },
};

/** Nose at the top edge's midpoint (0.5, 1); the right half stays put. */
const PAPER_PLANE: OrigamiModel = {
  id: "paper-plane",
  summary: "A dart paper plane folded from a square.",
  viewDeg: 0,
  sequence: {
    anchor: p(0.53, 0.3),
    steps: [
      {
        kind: "valley",
        instruction:
          "Fold the top left corner down so the top edge lies on the vertical centre line.",
        line: { from: p(0.5, 1), to: p(0, 0.5) },
        toward: p(0.05, 0.95),
      },
      {
        kind: "valley",
        instruction: "Fold the top right corner the same way.",
        line: { from: p(0.5, 1), to: p(1, 0.5) },
        toward: p(0.95, 0.95),
      },
      {
        kind: "valley",
        instruction: "Fold the new left edge to the centre line again.",
        line: ray(p(0.5, 1), 247.5, 1.2),
        toward: p(0.05, 0.4),
      },
      {
        kind: "valley",
        instruction: "Fold the new right edge to the centre line.",
        line: ray(p(0.5, 1), -67.5, 1.2),
        toward: p(0.95, 0.4),
      },
      {
        kind: "mountain",
        instruction: "Fold the plane in half behind along the centre line.",
        line: { from: p(0.5, -0.1), to: p(0.5, 1.1) },
        toward: p(0.3, 0.5),
      },
      {
        kind: "valley",
        instruction:
          "Fold the front wing down, leaving a narrow body below the nose.",
        line: { from: p(0.605, -0.05), to: p(0.5, 1) },
        toward: p(0.9, 0.3),
        layers: (f) => f.paper.x > 0.5,
        openDeg: 90,
      },
      {
        kind: "mountain",
        instruction:
          "Fold the back wing down to match, then open both wings level.",
        line: { from: p(0.605, -0.05), to: p(0.5, 1) },
        toward: p(0.9, 0.3),
        layers: (f) => f.paper.x < 0.5,
        openDeg: 90,
      },
    ],
  },
};

const CUP_TIP = Math.tan(Math.PI / 8); // (1, CUP_TIP): where the first corner lands
const PAPER_CUP: OrigamiModel = {
  id: "cup",
  summary: "A cup that really holds water, from five folds.",
  viewDeg: 135,
  sequence: {
    anchor: p(0.6, 0.3),
    steps: [
      {
        kind: "valley",
        instruction:
          "Fold the square in half along the diagonal into a triangle.",
        line: { from: p(-0.05, -0.05), to: p(1.05, 1.05) },
        toward: p(0.2, 0.8),
      },
      {
        kind: "valley",
        instruction:
          "Fold one bottom corner across so its top edge runs parallel to the folded base.",
        line: { from: p(1 - CUP_TIP, 0), to: p(CUP_TIP, CUP_TIP) },
        toward: p(0.05, 0.02),
      },
      {
        kind: "valley",
        instruction: "Fold the other corner across the same way.",
        line: { from: p(1, CUP_TIP), to: p(1 - CUP_TIP, 1 - CUP_TIP) },
        toward: p(0.98, 0.95),
      },
      {
        kind: "valley",
        instruction: "Fold the front top flap down into the cup.",
        line: { from: p(1 - CUP_TIP, 0), to: p(1, CUP_TIP) },
        toward: p(0.99, 0.01),
        layers: (f) => f.paper.y > f.paper.x,
      },
      {
        kind: "mountain",
        instruction: "Fold the back top flap down behind, then open the cup.",
        line: { from: p(1 - CUP_TIP, 0), to: p(1, CUP_TIP) },
        toward: p(0.99, 0.01),
        layers: (f) => f.paper.y < f.paper.x,
      },
    ],
  },
};

/**
 * Dog face: a triangle folded behind (coloured side out, point down), the
 * two top corners folded down as hanging ears about 37 degrees off the top
 * edge, and the chin tucked behind.
 */
const DOG_FACE: OrigamiModel = {
  id: "dog-face",
  summary: "A puppy's face with floppy ears, from four folds.",
  viewDeg: -135,
  sequence: {
    anchor: p(0.75, 0.8),
    steps: [
      {
        kind: "mountain",
        instruction:
          "Fold the square in half behind, corner to corner, into a triangle pointing down.",
        line: { from: p(-0.05, 1.05), to: p(1.05, -0.05) },
        toward: p(0.1, 0.1),
      },
      {
        kind: "valley",
        instruction:
          "Fold the left corner down so it hangs beside the face as an ear.",
        line: { from: p(0.297, 0.703), to: p(0.258, 1) },
        toward: p(0.02, 0.99),
      },
      {
        kind: "valley",
        instruction:
          "Fold the right corner down the same way for the other ear.",
        line: { from: p(0.703, 0.297), to: p(1, 0.258) },
        toward: p(0.99, 0.02),
      },
      {
        kind: "mountain",
        instruction: "Fold the bottom point behind to square off the chin.",
        line: { from: p(0.78, 1), to: p(1, 0.78) },
        toward: p(0.99, 0.99),
      },
    ],
  },
};

/**
 * Cat face: a triangle folded behind (point down), each top corner folded
 * down to the point to make a diamond, then each of those flaps folded back
 * up as an ear. In the folded frame the top edge runs from (0, 1) to (1, 0)
 * and the chin is at (1, 1). An ear's fold runs from the flap's folded edge
 * to its outer corner, a boundary point, never across the flap's hinge; from
 * (0.65, 0.65) it lifts the tip about 0.15 above the top edge.
 */
const CAT_FACE: OrigamiModel = {
  id: "cat-face",
  summary: "A cat's face with pointed ears, from six folds.",
  viewDeg: -135,
  sequence: {
    anchor: p(0.75, 0.8),
    steps: [
      {
        kind: "mountain",
        instruction:
          "Fold the square in half behind, corner to corner, into a triangle pointing down.",
        line: { from: p(-0.05, 1.05), to: p(1.05, -0.05) },
        toward: p(0.1, 0.1),
      },
      {
        kind: "valley",
        instruction: "Fold the left corner down to the bottom point.",
        line: { from: p(0.5, 0.45), to: p(0.5, 1.05) },
        toward: p(0.05, 0.95),
      },
      {
        kind: "valley",
        instruction: "Fold the right corner down to the bottom point too.",
        line: { from: p(0.45, 0.5), to: p(1.05, 0.5) },
        toward: p(0.95, 0.05),
      },
      {
        kind: "valley",
        instruction:
          "Fold the left flap's point back up past the top edge for an ear.",
        line: { from: p(0.65, 0.65), to: p(0.5, 1) },
        toward: p(0.97, 0.99),
        // Both layers of the left flap: front paper left of centre, and the
        // back half's paper that folded onto it.
        layers: ({ paper: { x, y } }) => (x + y > 1 ? x < 0.5 : y > 0.5),
      },
      {
        kind: "valley",
        instruction: "Fold the right flap up the same way for the other ear.",
        line: { from: p(0.65, 0.65), to: p(1, 0.5) },
        toward: p(0.99, 0.97),
        layers: ({ paper: { x, y } }) => (x + y > 1 ? y < 0.5 : x > 0.5),
      },
      {
        kind: "mountain",
        instruction: "Fold the bottom point behind for the chin.",
        line: { from: p(0.82, 1.02), to: p(1.02, 0.82) },
        toward: p(0.99, 0.99),
      },
    ],
  },
};

/** A fold line through two points, run past both so it crosses every layer. */
const through = (a: Point2, b: Point2): FoldLine => ({
  from: p(a.x - (b.x - a.x) / 2, a.y - (b.y - a.y) / 2),
  to: p(b.x + (b.x - a.x) / 2, b.y + (b.y - a.y) / 2),
});

/**
 * A fox's face: the triangle's side corners fold straight up past the top
 * edge as tall ears, and the bottom point stays sharp for the snout. Each
 * ear line is the perpendicular bisector of the corner and its ear tip.
 */
const FOX_EAR_TIP = p(0.22, 0.45);
const foxEar = (tip: Point2, corner: Point2): FoldLine => {
  const mid = p((tip.x + corner.x) / 2, (tip.y + corner.y) / 2);
  const d = p(corner.y - tip.y, tip.x - corner.x);
  return {
    from: p(mid.x - 2 * d.x, mid.y - 2 * d.y),
    to: p(mid.x + 2 * d.x, mid.y + 2 * d.y),
  };
};
const FOX_FACE: OrigamiModel = {
  id: "fox-face",
  summary: "A fox's face with tall ears and a pointed snout, from three folds.",
  viewDeg: -135,
  sequence: {
    anchor: p(0.75, 0.8),
    steps: [
      {
        kind: "mountain",
        instruction:
          "Fold the square in half behind, corner to corner, into a triangle pointing down.",
        line: { from: p(-0.05, 1.05), to: p(1.05, -0.05) },
        toward: p(0.1, 0.1),
      },
      {
        kind: "valley",
        instruction:
          "Fold the left corner up so its point stands well above the top edge: an ear.",
        line: foxEar(FOX_EAR_TIP, p(0, 1)),
        toward: p(0.02, 0.98),
      },
      {
        kind: "valley",
        instruction: "Fold the right corner up the same way for the other ear.",
        line: foxEar(p(FOX_EAR_TIP.y, FOX_EAR_TIP.x), p(1, 0)),
        toward: p(0.98, 0.02),
      },
    ],
  },
};

/**
 * The fortune teller (cootie catcher): all four corners to the centre, then
 * again on the back. Its play shape is pushed out by hand from this square.
 */
const FORTUNE_TELLER: OrigamiModel = {
  id: "fortune-teller",
  summary:
    "The classic fortune teller. Once folded flat, crease it in half both ways, push the four corners together, and slip your fingers under the flaps to open and close it.",
  viewDeg: 0,
  sequence: {
    anchor: p(0.5, 0.5),
    steps: [
      ...(
        [
          [p(0, 0.5), p(0.5, 0), p(0.05, 0.05)],
          [p(0.5, 1), p(1, 0.5), p(0.95, 0.95)],
          [p(0, 0.5), p(0.5, 1), p(0.05, 0.95)],
          [p(0.5, 0), p(1, 0.5), p(0.95, 0.05)],
        ] as const
      ).map(([a, b, toward], i): FoldStep => ({
        kind: "valley",
        instruction:
          i === 0
            ? "Crease both diagonals to find the centre, then fold one corner to it."
            : "Fold the next corner to the centre.",
        line: through(a, b),
        toward,
      })),
      ...(
        [
          [p(0.25, 0.25), p(0.75, 0.25), p(0.5, 0.05)],
          [p(0.75, 0.25), p(0.75, 0.75), p(0.95, 0.5)],
          [p(0.25, 0.75), p(0.75, 0.75), p(0.5, 0.95)],
          [p(0.25, 0.25), p(0.25, 0.75), p(0.05, 0.5)],
        ] as const
      ).map(([a, b, toward], i): FoldStep => ({
        kind: "mountain",
        instruction:
          i === 0
            ? "Turn over and fold a corner of the new square to the centre."
            : "Fold the next corner to the centre.",
        line: through(a, b),
        toward,
      })),
    ],
  },
};

/**
 * The samurai helmet (kabuto): a triangle whose side corners come down and
 * go back up as flaps, their tips turned out as horns, and the front corner
 * rolled up twice as the brim.
 */
const flapA = (f: FaceSample) => f.paper.x - f.paper.y > 0.5;
const flapB = (f: FaceSample) => f.paper.y - f.paper.x > 0.5;
const frontCorner = (f: FaceSample) => f.paper.x > 0.5 && f.paper.y > 0.5;
const SAMURAI_HELMET: OrigamiModel = {
  id: "samurai-helmet",
  summary:
    "The traditional kabuto. Open the bottom and it sits on a head (from a large sheet) or a desk.",
  viewDeg: 45,
  colorDown: true,
  sequence: {
    anchor: p(0.3, 0.4),
    steps: [
      {
        kind: "valley",
        instruction:
          "Start coloured side down. Fold in half along the diagonal into a triangle, point down.",
        line: through(p(0, 1), p(1, 0)),
        toward: p(0.95, 0.95),
      },
      {
        kind: "valley",
        instruction: "Fold one side corner down to the bottom point.",
        line: through(p(0.5, 0), p(0.5, 0.5)),
        toward: p(0.9, 0.05),
      },
      {
        kind: "valley",
        instruction: "Fold the other side corner down too, making a diamond.",
        line: through(p(0, 0.5), p(0.5, 0.5)),
        toward: p(0.05, 0.9),
      },
      {
        kind: "valley",
        instruction: "Fold the first flap's bottom point up to the top point.",
        line: through(p(0, 0.5), p(0.5, 0)),
        toward: p(0.05, 0.05),
        layers: (f) => f.paper.x > 0.5 && f.paper.y < 0.5,
      },
      {
        kind: "valley",
        instruction: "Fold the other flap's point up to match.",
        line: through(p(0, 0.5), p(0.5, 0)),
        toward: p(0.05, 0.05),
        layers: (f) => f.paper.y > 0.5 && f.paper.x < 0.5,
      },
      {
        kind: "valley",
        instruction:
          "Fold that flap's top point down and out to the side: a horn.",
        line: through(p(0.3, 0.3), p(0.7, 0.5)),
        toward: p(0.48, 0.48),
        layers: flapA,
      },
      {
        kind: "valley",
        instruction: "Fold the other point out the same way.",
        line: through(p(0.3, 0.3), p(0.5, 0.7)),
        toward: p(0.48, 0.48),
        layers: flapB,
      },
      {
        kind: "valley",
        instruction:
          "Fold the bottom corner of the front layer up, a little below the middle.",
        line: through(p(0, 0.3), p(0.3, 0)),
        toward: p(0.02, 0.02),
        layers: frontCorner,
      },
      {
        kind: "valley",
        instruction: "Fold it up again along the base of the horns: the brim.",
        line: through(p(0, 0.4), p(0.4, 0)),
        toward: p(0.17, 0.17),
        layers: frontCorner,
      },
      {
        kind: "mountain",
        instruction:
          "Fold the back corner up behind, inside the helmet, then open the bottom.",
        line: through(p(0, 0.3), p(0.3, 0)),
        toward: p(0.05, 0.05),
        layers: (f) => f.paper.x + f.paper.y < 0.6,
      },
    ],
  },
};

/**
 * Heart: the top edge folded to the centre and the bottom edge up to meet
 * it make a strip from y = 0.375 to 0.75; its four corners go behind to
 * round the lobes and the notch; then each half of the bottom edge folds up
 * at 45 degrees from the bottom centre, which makes the point and lifts the
 * two lobes above the strip. The strip's top corners become the lobes' outer
 * corners and its bottom corners meet at the notch.
 */
const HEART_CORNER = 0.08;
const heartCorner = (x: number, y: number): FoldLine => {
  const [sx, sy] = [x < 0.5 ? 1 : -1, y > 0.5 ? -1 : 1];
  return {
    from: p(x, y + sy * HEART_CORNER),
    to: p(x + sx * HEART_CORNER, y),
  };
};
const HEART: OrigamiModel = {
  id: "heart",
  summary: "A flat heart from one square, folded with no cuts.",
  viewDeg: 0,
  colorDown: true,
  sequence: {
    anchor: p(0.5, 0.62),
    steps: [
      {
        kind: "valley",
        instruction:
          "Start coloured side down and fold the top edge down to the horizontal centre.",
        line: { from: p(-0.05, 0.75), to: p(1.05, 0.75) },
        toward: p(0.5, 0.95),
      },
      {
        kind: "valley",
        instruction: "Fold the bottom edge up to meet the top fold.",
        line: { from: p(-0.05, 0.375), to: p(1.05, 0.375) },
        toward: p(0.5, 0.05),
      },
      ...(
        [
          [0, 0.75, "top left"],
          [1, 0.75, "top right"],
          [0, 0.375, "bottom left"],
          [1, 0.375, "bottom right"],
        ] as const
      ).map(([x, y, name]): FoldStep => ({
        kind: "mountain",
        instruction: `Fold the ${name} corner of the strip behind.`,
        line: heartCorner(x, y),
        toward: p(x + (x < 0.5 ? 0.01 : -0.01), y + (y > 0.5 ? -0.01 : 0.01)),
      })),
      {
        kind: "valley",
        instruction:
          "Fold the right half of the bottom edge up to the centre line, from the bottom centre.",
        line: { from: p(0.5, 0.375), to: p(0.95, 0.825) },
        toward: p(0.95, 0.4),
      },
      {
        kind: "valley",
        instruction: "Fold the left half up the same way to finish the heart.",
        line: { from: p(0.5, 0.375), to: p(0.05, 0.825) },
        toward: p(0.05, 0.4),
      },
    ],
  },
};

/**
 * Tulip: a triangle folded behind (point up), then each bottom corner folded
 * up along a line from the bottom centre at 145 degrees to the bottom edge,
 * which sets its tip just beside the top point as a side petal (a fold at
 * angle a from the edge turns the corner by 2a - 180 about the centre).
 */
const TULIP: OrigamiModel = {
  id: "tulip",
  summary: "A tulip head with three petals, from three folds.",
  viewDeg: 45,
  sequence: {
    anchor: p(0.8, 0.9),
    steps: [
      {
        kind: "mountain",
        instruction:
          "Fold the square in half behind, corner to corner, into a triangle pointing up.",
        line: { from: p(-0.05, 1.05), to: p(1.05, -0.05) },
        toward: p(0.1, 0.1),
      },
      {
        kind: "valley",
        instruction:
          "Fold the left corner up from the bottom centre so its point stands beside the top point.",
        line: { from: p(0.5, 0.5), to: p(0.403, 1.05) },
        toward: p(0.02, 0.99),
      },
      {
        kind: "valley",
        instruction:
          "Fold the right corner up the same way for the third petal.",
        line: { from: p(0.5, 0.5), to: p(1.05, 0.403) },
        toward: p(0.99, 0.02),
      },
    ],
  },
};

/** The classic swan: the neck creature's original design. */
const SWAN: OrigamiModel = {
  id: "swan",
  ...neckCreature(
    { neckAt: 0.53, leanDeg: 0, headAt: 0.78, headDeg: 25 },
    "The classic swan from a kite base: long neck, folded head.",
  ),
};

/**
 * Box (an open tray) from one square: lines a fifth of the way in from each
 * edge are the walls' hinges, the walls stand at 90 degrees, and each corner
 * square folds in half along its diagonal and lies against the outside of a
 * wall (one of its edges folds 180 degrees, the other 90, turning the same
 * way round the box). It ends as a 3D form, proven by every loop of faces
 * closing; a second square 5% larger folded the same way is its lid.
 */
const BOX_WALL = 0.2;
const boxForm = (from: Point2, to: Point2): number => {
  const [lo, hi] = [BOX_WALL, 1 - BOX_WALL];
  if (Math.abs(from.x - to.x) > 1e-9 && Math.abs(from.y - to.y) > 1e-9)
    return 180; // a corner's diagonal
  const [mx, my] = [(from.x + to.x) / 2, (from.y + to.y) / 2];
  const outside = (v: number) => v < lo - 1e-6 || v > hi + 1e-6;
  // A crease inside a corner square continues a hinge line past the base.
  if (!outside(mx) && !outside(my)) return 90;
  const vertical = Math.abs(from.x - to.x) < 1e-9;
  // Corners alternate which edge folds flat, so the flaps all wrap one way.
  const left = mx < 0.5;
  const bottom = my < 0.5;
  const flat = left === bottom ? vertical : !vertical;
  return flat ? 180 : 90;
};
const BOX_SEGMENTS: readonly CreaseSegment[] = (() => {
  const [w, W] = [BOX_WALL, 1 - BOX_WALL];
  const flat = (from: Point2, to: Point2) =>
    crease(from, to, boxForm(from, to) === 180 ? "M" : "V");
  return [
    // The base's edges: walls fold up.
    crease(p(w, w), p(W, w), "V"),
    crease(p(W, w), p(W, W), "V"),
    crease(p(W, W), p(w, W), "V"),
    crease(p(w, W), p(w, w), "V"),
    // The hinge lines continued through each corner square.
    flat(p(w, 0), p(w, w)),
    flat(p(0, w), p(w, w)),
    flat(p(W, 0), p(W, w)),
    flat(p(W, w), p(1, w)),
    flat(p(W, W), p(W, 1)),
    flat(p(W, W), p(1, W)),
    flat(p(0, W), p(w, W)),
    flat(p(w, W), p(w, 1)),
    // Each corner square folds in half.
    crease(p(0, 0), p(w, w), "V"),
    crease(p(1, 0), p(W, w), "V"),
    crease(p(1, 1), p(W, W), "V"),
    crease(p(0, 1), p(w, W), "V"),
  ];
})();
const BOX: OrigamiModel = {
  id: "box",
  summary:
    "An open box from one square, no cuts or glue; fold a second square 5% larger the same way for its lid.",
  viewDeg: 0,
  sequence: {
    anchor: p(0.5, 0.5),
    steps: [
      {
        kind: "creases",
        instruction:
          "Crease lines a fifth of the way in from each edge, both ways, and each corner square's diagonal. Stand the four walls up, fold each corner square in half, and lay it against the outside of the next wall.",
        segments: BOX_SEGMENTS,
        form: boxForm,
      },
    ],
  },
};

/**
 * Lily from the frog base. In the folded frame the base lies folded along
 * x = 0.5 with the sheet's centre (the closed point, the stem) at the top
 * and the four corners (the open end, the petals) at the bottom. Each side
 * of each flap is narrowed to the centre: a crease from the closed point
 * bisecting the edge and the axis (about 79 degrees below level). Paper
 * regions name the layers: a quadrant is the side around one edge's
 * midpoint, split at the line through it and the centre; a petal is the
 * paper round one corner. A folder turns the flaps like pages to reach
 * each side; the states between are the ones checked. Then each petal folds
 * out across the widest part and stays part-open, so the flower stands.
 */
const LILY: OrigamiModel = {
  id: "lily",
  summary:
    "The traditional lily from the frog base: a slender stem and four petals folded open. Curl each petal over a pencil to finish it.",
  viewDeg: 180,
  sequence: {
    anchor: p(0.5, 0.06),
    steps: [
      {
        kind: "creases",
        instruction:
          "Fold a frog base, closed point down: a square base with every flap squashed and petal-folded.",
        segments: FROG_BASE,
        howTo: FROG_BASE_HOW,
      },
      ...FROG_NARROW_STEPS,
      // Petals alternate toward and away from you, so the lily opens all round.
      ...[1, 2, 3, 0].map((corner, i): FoldStep => ({
        kind: i % 2 === 0 ? "valley" : "mountain",
        instruction:
          i === 0
            ? "Fold the front petal out and down across the widest part, and leave it standing open."
            : i % 2 === 1
              ? "Open the petal behind it the same way, toward the back."
              : "Turn to the next petal and open it toward you.",
        line: { from: p(0.3, 0), to: p(0.8, 0) },
        toward: p(0.52, -0.2),
        layers: frogCorner(corner),
        openDeg: 115,
      })),
    ],
  },
};

/** The frog: the four-legged family's original design. */
const FROG: OrigamiModel = {
  id: "frog",
  ...fourLegs(
    { frontDeg: 160, hindDeg: 210 },
    "A frog from the frog base, seen from above: a pointed body with its front legs out and its hind legs back.",
  ),
};

export const ORIGAMI_MODELS: readonly OrigamiModel[] = [
  CRANE,
  FLAPPING_BIRD,
  PAPER_PLANE,
  PAPER_CUP,
  FORTUNE_TELLER,
  SAMURAI_HELMET,
  FOX_FACE,
  DOG_FACE,
  CAT_FACE,
  HEART,
  TULIP,
  BOX,
  LILY,
  FROG,
  SWAN,
  base(
    "bird-base",
    BIRD_BASE,
    "Crease both diagonals and midlines, collapse into a square base, kite-fold the lower edges to the centre, then petal-fold the front and back.",
    BIRD_BASE_HOW,
    BIRD_ANCHOR,
    "The base for the crane, the flapping bird, and many birds.",
  ),
  base(
    "square-base",
    SQUARE_BASE,
    "Mountain-fold both midlines, valley-fold one diagonal, and collapse the sheet into a small square.",
    SQUARE_BASE_HOW,
    p(0.3, 0.1),
    "Also called the preliminary base; the start of the bird and frog bases.",
  ),
  base(
    "waterbomb-base",
    WATERBOMB_BASE,
    "Valley-fold both diagonals, mountain-fold the horizontal midline, and collapse into a triangle.",
    WATERBOMB_BASE_HOW,
    p(0.5, 0.1),
    "A triangle with two flaps on each side; the start of the waterbomb balloon.",
  ),
  base(
    "fish-base",
    FISH_BASE,
    "Kite-fold two opposite corners toward the diagonal, then rabbit-ear the two side corners.",
    FISH_BASE_HOW,
    p(0.2, 0.15),
    "A long diamond with two small flaps; the start of the fish and the whale.",
  ),
  base(
    "frog-base",
    FROG_BASE,
    "Fold a square base, squash-fold each of its four flaps, then petal-fold all four squashed flaps.",
    FROG_BASE_HOW,
    p(0.5, 0.06),
    "Four long flaps around a narrow diamond; the start of the frog and the lily.",
  ),
];
