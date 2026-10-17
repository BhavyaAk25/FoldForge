import type { OrigamiModelId } from "./catalog";
import type { CreaseSegment, Point2 } from "./crease-pattern";
import type { FaceSample, FoldLine, FoldSequence } from "./sequence";

/**
 * The origami library. Bases are crease patterns that collapse all at once;
 * models are bases (or a plain sheet) followed by the folds a person makes.
 * Coordinates are on the unit sheet; fold lines are in the folded frame,
 * where the face holding `anchor` never moves.
 *
 * Classic 22.5-degree geometry: a corner bisected toward a midline meets it
 * at K = tan(22.5) / 2 from the edge.
 */

export interface OrigamiModel {
  readonly id: OrigamiModelId;
  readonly summary: string;
  readonly sequence: FoldSequence;
  /** Rotation that shows the finished model upright, in degrees. */
  readonly viewDeg: number;
}

const K = Math.tan(Math.PI / 8) / 2;
const R = Math.SQRT1_2;
const p = (x: number, y: number): Point2 => ({ x, y });
const crease = (
  from: Point2,
  to: Point2,
  assignment: "M" | "V",
): CreaseSegment => ({ from, to, assignment });
/** A fold line from a point, at an angle in degrees, of a given length. */
const ray = (from: Point2, deg: number, length: number): FoldLine => {
  const r = (deg * Math.PI) / 180;
  return {
    from,
    to: p(from.x + length * Math.cos(r), from.y + length * Math.sin(r)),
  };
};
/** A fold line centred on a point. */
const across = (centre: Point2, deg: number, half: number): FoldLine => {
  const r = (deg * Math.PI) / 180;
  const d = p(half * Math.cos(r), half * Math.sin(r));
  return {
    from: p(centre.x - d.x, centre.y - d.y),
    to: p(centre.x + d.x, centre.y + d.y),
  };
};

const CENTRE = p(0.5, 0.5);
const [D1, D2, D3, D4] = [p(0.5, K), p(1 - K, 0.5), p(0.5, 1 - K), p(K, 0.5)];

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

/** Square base, kite folds front and back, then petal folds; corners (0,0) and (1,1) become the petals. */
const BIRD_BASE: readonly CreaseSegment[] = [
  ...[
    [p(0, 0), D1],
    [p(0, 0), D4],
    [p(1, 0), D1],
    [p(1, 0), D2],
    [p(1, 1), D2],
    [p(1, 1), D3],
    [p(0, 1), D3],
    [p(0, 1), D4],
    [CENTRE, D1],
    [CENTRE, D2],
    [CENTRE, D3],
    [CENTRE, D4],
  ].map(([a, b]) => crease(a!, b!, "M")),
  crease(D1, D4, "V"),
  crease(D2, D3, "V"),
  crease(p(1, 0), p(0, 1), "V"),
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
  anchor: Point2,
  summary: string,
): OrigamiModel => ({
  id,
  summary,
  sequence: { anchor, steps: [{ kind: "creases", instruction, segments }] },
  viewDeg: 0,
});

/**
 * Bird-base frame (anchor in the face (0,0)-D1-(1,0)): the petal tips sit at
 * (0, 0), the leg tips at (1, 0), and the sheet centre at (1 - sqrt(2)/2, 0),
 * all on the axis y = 0. Front layers come from the half x + y < 1.
 */
const BIRD_ANCHOR = p(0.5, 0.05);
const front = (f: FaceSample): boolean => f.paper.x + f.paper.y < 1;
const back = (f: FaceSample): boolean => !front(f);

const wings = (openDeg: number) => [
  {
    kind: "valley" as const,
    instruction: "Fold the front wing down along the top of the body.",
    line: { from: p(0.28, -0.16), to: p(0.28, 0.16) },
    toward: p(0.1, 0),
    layers: (f: FaceSample) =>
      front(f) && Math.abs(f.folded.y) < 0.16 && f.folded.x < 0.5,
    openDeg,
  },
  {
    kind: "mountain" as const,
    instruction: "Fold the back wing down to match.",
    line: { from: p(0.28, -0.16), to: p(0.28, 0.16) },
    toward: p(0.1, 0),
    layers: (f: FaceSample) =>
      back(f) && Math.abs(f.folded.y) < 0.16 && f.folded.x < 0.5,
    openDeg,
  },
];

const NARROW = 180 - 11.25;

const CRANE: OrigamiModel = {
  id: "crane",
  summary: "The traditional crane (orizuru), folded from a bird base.",
  viewDeg: -90,
  sequence: {
    anchor: BIRD_ANCHOR,
    steps: [
      {
        kind: "creases",
        instruction:
          "Fold a bird base: crease both diagonals and midlines, collapse into a square base, kite-fold the lower edges to the centre, then petal-fold the front and back.",
        segments: BIRD_BASE,
      },
      {
        kind: "valley",
        instruction:
          "Fold the lower right edge of the front layers to the centre line.",
        line: ray(p(1, 0), NARROW, 0.75),
        toward: p(0.5, 0.15),
        layers: front,
      },
      {
        kind: "valley",
        instruction:
          "Fold the lower left edge of the front layers to the centre line.",
        line: ray(p(1, 0), -NARROW, 0.75),
        toward: p(0.5, -0.15),
        layers: front,
      },
      {
        kind: "mountain",
        instruction:
          "Turn over and repeat on the right: lower edge to the centre line.",
        line: ray(p(1, 0), NARROW, 0.75),
        toward: p(0.5, 0.15),
        layers: back,
      },
      {
        kind: "mountain",
        instruction: "Repeat on the left so both lower points are thin.",
        line: ray(p(1, 0), -NARROW, 0.75),
        toward: p(0.5, -0.15),
        layers: back,
      },
      {
        kind: "inside-reverse",
        instruction:
          "Inside-reverse-fold one thin point up between the wings to make the neck.",
        line: ray(
          p(0.5 - 0.02 / Math.tan((67.5 * Math.PI) / 180), -0.02),
          67.5,
          0.4,
        ),
        toward: p(0.9, 0.02),
        layers: (f) => f.folded.y > 1e-6 && f.folded.x > 0.3,
        top: p(0.6, 0.13),
      },
      {
        kind: "inside-reverse",
        instruction: "Inside-reverse-fold the other point up to make the tail.",
        line: ray(
          p(0.5 - 0.02 / Math.tan((67.5 * Math.PI) / 180), 0.02),
          -67.5,
          0.4,
        ),
        toward: p(0.9, -0.02),
        layers: (f) => f.folded.y < -1e-6 && f.folded.x > 0.3,
        top: p(0.13, 0.6),
      },
      {
        kind: "inside-reverse",
        instruction:
          "Inside-reverse-fold the tip of the neck to form the head.",
        line: across(p(0.217, 0.283), 82.5, 0.06),
        toward: p(0.15, 0.35),
        layers: (f) => f.folded.y > 0.1,
        top: p(0.9, 0.03),
      },
      ...wings(90),
    ],
  },
};

const FLAPPING_BIRD: OrigamiModel = {
  id: "flapping-bird",
  summary: "The traditional flapping bird: pull the tail and the wings flap.",
  viewDeg: -90,
  sequence: {
    anchor: BIRD_ANCHOR,
    steps: [
      { ...CRANE.sequence.steps[0]! },
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
        top: p(0.6, 0.13),
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
        top: p(0.13, 0.6),
      },
      {
        kind: "inside-reverse",
        instruction:
          "Inside-reverse-fold the tip of the neck to form the head.",
        line: across(p(0.203, 0.297), 82.5, 0.06),
        toward: p(0.15, 0.35),
        layers: (f) => f.folded.y > 0.1,
        top: p(0.9, 0.03),
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

export const ORIGAMI_MODELS: readonly OrigamiModel[] = [
  CRANE,
  FLAPPING_BIRD,
  PAPER_PLANE,
  PAPER_CUP,
  base(
    "bird-base",
    BIRD_BASE,
    "Crease both diagonals and midlines, collapse into a square base, kite-fold the lower edges to the centre, then petal-fold the front and back.",
    BIRD_ANCHOR,
    "The base for the crane, the flapping bird, and many birds.",
  ),
  base(
    "square-base",
    SQUARE_BASE,
    "Mountain-fold both midlines, valley-fold one diagonal, and collapse the sheet into a small square.",
    p(0.3, 0.1),
    "Also called the preliminary base; the start of the bird and frog bases.",
  ),
  base(
    "waterbomb-base",
    WATERBOMB_BASE,
    "Valley-fold both diagonals, mountain-fold the horizontal midline, and collapse into a triangle.",
    p(0.5, 0.1),
    "A triangle with two flaps on each side; the start of the waterbomb balloon.",
  ),
  base(
    "fish-base",
    FISH_BASE,
    "Kite-fold two opposite corners toward the diagonal, then rabbit-ear the two side corners.",
    p(0.2, 0.15),
    "A long diamond with two small flaps; the start of the fish and the whale.",
  ),
];
