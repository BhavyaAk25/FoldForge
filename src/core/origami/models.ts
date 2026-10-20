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
  /** Folded starting coloured side down, so the colour ends up outside. */
  readonly colorDown?: true;
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

/** Quarter turn about the sheet centre. */
const turn = (q: Point2, times: number): Point2 =>
  times === 0 ? q : turn(p(1 - q.y, q.x), times - 1);

/**
 * Square base with all four flaps squashed and petal-folded. Each squash
 * leaves a point S = (sqrt(2)/4, 1/2 - sqrt(2)/4) beside every edge midpoint,
 * where 22.5-degree creases from the corner, the centre, and the midpoint
 * meet. The centre has 16 creases, so one diagonal half is a mountain to
 * keep Maekawa's 9 against 7; the layer solver confirms a stacking exists.
 */
const FROG_S = Math.SQRT2 / 4;
const FROG_BASE: readonly CreaseSegment[] = [
  ...[0, 1, 2, 3].flatMap((t) => {
    const [left, right] = [
      p(FROG_S, 0.5 - FROG_S),
      p(1 - FROG_S, 0.5 - FROG_S),
    ];
    return [
      crease(turn(p(0, 0), t), turn(left, t), "M"),
      crease(turn(p(1, 0), t), turn(right, t), "M"),
      crease(turn(p(0.5, 0), t), turn(left, t), "M"),
      crease(turn(p(0.5, 0), t), turn(right, t), "M"),
      crease(CENTRE, turn(left, t), "M"),
      crease(CENTRE, turn(right, t), "M"),
      crease(turn(left, t), turn(p(FROG_S, 0), t), "V"),
      crease(turn(right, t), turn(p(1 - FROG_S, 0), t), "V"),
      crease(turn(p(0.5, 0), t), CENTRE, "V"),
      crease(turn(p(0, 0), t), CENTRE, t === 0 ? "M" : "V"),
    ];
  }),
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
      },
      {
        // No layer order lets an inside reverse fold pass here (the solver
        // proves it), so the head is an outside reverse fold, a common way to
        // fold the crane's head.
        kind: "outside-reverse",
        instruction:
          "Outside-reverse-fold the tip of the neck down to form the head.",
        line: across(p(0.217, 0.283), 82.5, 0.06),
        toward: p(0.15, 0.35),
        layers: (f) => f.folded.y > 0.1,
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
 * The kite folds keep each point's distance from the tip corner, so the
 * swan's neck is the paper nearer that corner than the neck's base fold; this
 * leaves out the kite's corner flaps, which lie in the body.
 */
const NECK = (f: FaceSample) => Math.hypot(f.paper.x, f.paper.y) < 0.76;

/**
 * Swan: a kite, narrowed behind into a long point, the point folded up as
 * the neck, the body folded in half, the neck inside-reverse-folded upright
 * between the body's halves, and its tip outside-reverse-folded forward.
 */
const SWAN: OrigamiModel = {
  id: "swan",
  summary: "The classic swan from a kite base: long neck, folded head.",
  viewDeg: -45,
  colorDown: true,
  sequence: {
    anchor: p(0.8, 0.86),
    steps: [
      {
        kind: "valley",
        instruction:
          "Start coloured side down, crease the diagonal, and fold one edge to it.",
        line: ray(p(0, 0), 22.5, 1.6),
        toward: p(0.9, 0.05),
      },
      {
        kind: "valley",
        instruction: "Fold the other edge to the diagonal too, making a kite.",
        line: ray(p(0, 0), 67.5, 1.6),
        toward: p(0.05, 0.9),
      },
      {
        kind: "mountain",
        instruction:
          "Turn over and fold one long edge to the centre, narrowing the point.",
        line: ray(p(0, 0), 33.75, 1.6),
        toward: p(0.9, 0.3),
      },
      {
        kind: "mountain",
        instruction: "Fold the other long edge to the centre.",
        line: ray(p(0, 0), 56.25, 1.6),
        toward: p(0.3, 0.9),
      },
      {
        kind: "valley",
        instruction: "Fold the narrow point up to the top: this is the neck.",
        line: { from: p(0.2, 0.86), to: p(0.86, 0.2) },
        toward: p(0.1, 0.1),
      },
      {
        kind: "valley",
        instruction: "Fold the body in half along the centre.",
        line: { from: p(-0.05, -0.05), to: p(1.1, 1.1) },
        toward: p(0.3, 0.7),
      },
      {
        kind: "inside-reverse",
        instruction:
          "Pull the neck up between the body's halves (inside reverse fold) and flatten.",
        line: { from: p(0.56, 0.51), to: p(0.56, 0.81) },
        toward: p(0.85, 0.85),
        layers: NECK,
      },
      {
        kind: "outside-reverse",
        instruction:
          "Fold the top of the neck forward around itself (outside reverse fold) for the head.",
        // The neck now runs from (0.56, 0.56) up to its tip near (0.07, 1.05).
        line: across(p(0.168, 0.952), 167.5, 0.15),
        toward: p(0.05, 1.07),
        layers: NECK,
      },
    ],
  },
};

export const ORIGAMI_MODELS: readonly OrigamiModel[] = [
  CRANE,
  FLAPPING_BIRD,
  PAPER_PLANE,
  PAPER_CUP,
  DOG_FACE,
  SWAN,
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
  base(
    "frog-base",
    FROG_BASE,
    "Fold a square base, squash-fold each of its four flaps, then petal-fold all four squashed flaps.",
    p(0.5, 0.06),
    "Four long flaps around a narrow diamond; the start of the frog and the lily.",
  ),
];
