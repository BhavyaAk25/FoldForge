import type { CreaseSegment, Point2 } from "./crease-pattern";
import { ANIMAL_BODY_HOW, BIRD_BASE_HOW, FROG_BASE_HOW } from "./how-to";
import type { FaceSample, FoldLine, FoldSequence, FoldStep } from "./sequence";

/**
 * Model families: a verified base shaped by reverse folds whose positions and
 * angles are parameters. A library model is one design in its family; a
 * generated model is another, chosen to resemble the subject asked for.
 * Every design still has to derive (fold rules and layer order at every
 * step) before it is shown; `generate.ts` searches nearby designs when one
 * does not.
 *
 * Coordinates are on the unit sheet; fold lines are in the folded frame,
 * where the face holding the anchor never moves.
 */

/** A model before it has an id: library entries and generated designs alike. */
export interface ModelShape {
  readonly summary: string;
  readonly sequence: FoldSequence;
  /** Rotation that shows the finished model upright, in degrees. */
  readonly viewDeg: number;
  /** Folded starting coloured side down, so the colour ends up outside. */
  readonly colorDown?: true;
}

export const p = (x: number, y: number): Point2 => ({ x, y });
export const crease = (
  from: Point2,
  to: Point2,
  assignment: "M" | "V",
): CreaseSegment => ({ from, to, assignment });
const rad = (deg: number) => (deg * Math.PI) / 180;
/** The point `distance` from `origin` toward `deg`. */
const along = (origin: Point2, deg: number, distance: number): Point2 =>
  p(
    origin.x + distance * Math.cos(rad(deg)),
    origin.y + distance * Math.sin(rad(deg)),
  );
/** A fold line from a point, at an angle in degrees, of a given length. */
export const ray = (from: Point2, deg: number, length: number): FoldLine => ({
  from,
  to: along(from, deg, length),
});
/** A fold line centred on a point. */
export const across = (
  centre: Point2,
  deg: number,
  half: number,
): FoldLine => ({
  from: along(centre, deg + 180, half),
  to: along(centre, deg, half),
});
/**
 * A reverse fold turns a flap pointing toward `fromDeg` to point toward
 * `toDeg`: reflection in a line at angle a sends direction d to 2a - d, so
 * the line lies halfway between them.
 */
const turnLine = (fromDeg: number, toDeg: number) => (fromDeg + toDeg) / 2;

/** Classic 22.5-degree geometry: a corner bisected toward a midline meets it at K from the edge. */
const K = Math.tan(Math.PI / 8) / 2;
export const CENTRE = p(0.5, 0.5);
const [D1, D2, D3, D4] = [p(0.5, K), p(1 - K, 0.5), p(0.5, 1 - K), p(K, 0.5)];

/** Square base, kite folds front and back, then petal folds; corners (0,0) and (1,1) become the petals. */
export const BIRD_BASE: readonly CreaseSegment[] = [
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

/**
 * Bird-base frame (anchor in the face (0,0)-D1-(1,0)): the petal tips sit at
 * (0, 0), the leg tips at (1, 0), and the sheet centre at (1 - sqrt(2)/2, 0),
 * all on the axis y = 0. Front layers come from the half x + y < 1.
 */
export const BIRD_ANCHOR = p(0.5, 0.05);
export const BIRD_BASE_STEP: FoldStep = {
  kind: "creases",
  instruction:
    "Fold a bird base: crease both diagonals and midlines, collapse into a square base, kite-fold the lower edges to the centre, then petal-fold the front and back.",
  segments: BIRD_BASE,
  howTo: BIRD_BASE_HOW,
};
const front = (f: FaceSample): boolean => f.paper.x + f.paper.y < 1;
const back = (f: FaceSample): boolean => !front(f);

/**
 * Winged bird on the bird base (the crane's family): both lower points are
 * narrowed, reverse-folded up as neck and tail, the neck's tip turned into a
 * head, and the wings brought down.
 */
export interface BirdDesign {
  /** Angle of the neck's reverse-fold line from the axis; the neck then points at twice it. */
  readonly neckDeg: number;
  readonly tailDeg: number;
  /** Where the head fold sits along the neck, 0 at its base and 1 at its tip. */
  readonly headAt: number;
  /** How far the head turns from the neck's direction (negative bends it down). */
  readonly headTurnDeg: number;
  /** How far the wings end open: 180 lies flat, 90 stands out sideways. */
  readonly wingDeg: number;
}

const NARROW = 180 - 11.25;

/** Both wings brought down along the top of the body, ending `openDeg` open. */
export const wings = (openDeg: number): FoldStep[] =>
  (["valley", "mountain"] as const).map((kind) => ({
    kind,
    instruction:
      kind === "valley"
        ? "Fold the front wing down along the top of the body."
        : "Fold the back wing down to match.",
    line: { from: p(0.28, -0.16), to: p(0.28, 0.16) },
    toward: p(0.1, 0),
    layers: (f: FaceSample) =>
      (kind === "valley" ? front(f) : back(f)) &&
      Math.abs(f.folded.y) < 0.16 &&
      f.folded.x < 0.5,
    openDeg,
  }));

export const wingedBird = (d: BirdDesign, summary: string): ModelShape => {
  // The thin points run from (0.5, 0) to their tips at (1, 0); a reverse
  // fold through (0.5, 0) at angle a turns one to point at 2a.
  const base = p(0.5, 0);
  const neckDir = 2 * d.neckDeg;
  const head = along(base, neckDir, 0.5 * d.headAt);
  const narrow = (
    kind: "valley" | "mountain",
    deg: number,
    instruction: string,
  ): FoldStep => ({
    kind,
    instruction,
    line: ray(p(1, 0), deg, 0.75),
    toward: p(0.5, deg > 0 ? 0.15 : -0.15),
    layers: kind === "valley" ? front : back,
  });
  const point = (deg: number, side: 1 | -1, instruction: string): FoldStep => ({
    kind: "inside-reverse",
    instruction,
    // Just off the axis, so the line meets the layers on its own side.
    line: ray(
      p(0.5 - 0.02 / Math.tan(rad(deg)), -0.02 * side),
      side * deg,
      0.4,
    ),
    toward: p(0.9, 0.02 * side),
    layers: (f) => side * f.folded.y > 1e-6 && f.folded.x > 0.3,
  });
  return {
    summary,
    viewDeg: -90,
    sequence: {
      anchor: BIRD_ANCHOR,
      steps: [
        BIRD_BASE_STEP,
        narrow(
          "valley",
          NARROW,
          "Fold the lower right edge of the front layers to the centre line.",
        ),
        narrow(
          "valley",
          -NARROW,
          "Fold the lower left edge of the front layers to the centre line.",
        ),
        narrow(
          "mountain",
          NARROW,
          "Turn over and repeat on the right: lower edge to the centre line.",
        ),
        narrow(
          "mountain",
          -NARROW,
          "Repeat on the left so both lower points are thin.",
        ),
        point(
          d.neckDeg,
          1,
          "Inside-reverse-fold one thin point up between the wings to make the neck.",
        ),
        point(
          d.tailDeg,
          -1,
          "Inside-reverse-fold the other point up to make the tail.",
        ),
        {
          // An inside reverse fold cannot pass here (the layer solver proves
          // it for the crane), so the head is an outside reverse fold.
          kind: "outside-reverse",
          instruction:
            "Outside-reverse-fold the tip of the neck down to form the head.",
          line: across(head, neckDir + d.headTurnDeg / 2, 0.06),
          toward: along(base, neckDir, 0.495),
          layers: (f) => f.folded.y > 0.1,
        },
        ...wings(d.wingDeg),
      ],
    },
  };
};

/** A kite from the corner (0, 0), narrowed into a long point. */
const kiteSteps: readonly FoldStep[] = [
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
];

/**
 * Neck creature on the kite (the swan's family): a kite narrowed into a long
 * point, the point folded up over the body, the body folded in half, the
 * neck pulled up between the halves, and its tip turned into a head. In the
 * folded frame the body's fold runs along x = y, the tip starts at (0, 0),
 * and the page shows the body's fold level with the neck up and the head
 * toward the left (viewDeg -45, so frame angle a is screen angle a - 45).
 */
export interface NeckDesign {
  /** Where the neck folds up along the diagonal: longer necks fold further in. */
  readonly neckAt: number;
  /** The neck's lean forward from upright, in degrees (negative leans back). */
  readonly leanDeg: number;
  /** Where the head fold sits along the neck, 0 at its base and 1 at its tip. */
  readonly headAt: number;
  /** The head's direction above level-forward, in degrees (negative points down). */
  readonly headDeg: number;
}

export const neckCreature = (d: NeckDesign, summary: string): ModelShape => {
  const n = d.neckAt;
  // The neck turns up just past its base fold. The kite folds keep each
  // point's distance from the tip corner, so the neck is the paper nearer
  // that corner than the base fold; that leaves out the kite's corner flaps.
  const neckBase = p(n + 0.03, n + 0.03);
  const isNeck = (f: FaceSample) =>
    Math.hypot(f.paper.x, f.paper.y) < n * Math.SQRT2 + 0.01;
  // Upright on screen is frame 135; forward (screen left) is frame 225.
  const neckDir = 135 + d.leanDeg;
  const neckLine = turnLine(45, neckDir);
  // The tip folded over the base fold lands at (2n, 2n).
  const neckLength = (2 * n - neckBase.x) * Math.SQRT2;
  const headDir = 225 - d.headDeg;
  return {
    summary,
    viewDeg: -45,
    colorDown: true,
    sequence: {
      anchor: p(0.8, 0.86),
      steps: [
        ...kiteSteps,
        {
          kind: "valley",
          instruction:
            "Fold the narrow point up over the body: this is the neck.",
          line: across(p(n, n), -45, 0.47),
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
          line: across(along(neckBase, neckLine, 0.1), neckLine, 0.15),
          toward: along(neckBase, 45, 0.3),
          layers: isNeck,
        },
        {
          kind: "outside-reverse",
          instruction:
            "Fold the top of the neck around itself (outside reverse fold) for the head.",
          line: across(
            along(neckBase, neckDir, d.headAt * neckLength),
            turnLine(neckDir, headDir),
            0.15,
          ),
          toward: along(neckBase, neckDir, 1.05 * neckLength),
          layers: isNeck,
        },
      ],
    },
  };
};

/**
 * Fish on the kite: the kite narrowed, folded in half along its length (the
 * fold is the belly, the wide end the head), and the long point turned up
 * as the tail by an outside reverse fold. Same frame and view as the neck
 * creature: the belly level, the head to the right, the tail to the left.
 */
export interface FishDesign {
  /** Where the tail turns along the diagonal, from the tip: smaller is a shorter tail. */
  readonly tailAt: number;
  /** How far the tail flicks up from straight back, in degrees. */
  readonly tailUpDeg: number;
}

export const fishOnKite = (d: FishDesign, summary: string): ModelShape => {
  const tailBase = p(d.tailAt, d.tailAt);
  // The tail points back along the diagonal (frame 225); up on screen is
  // frame 135, so turning it up lowers the angle.
  const tailLine = turnLine(225, 225 - d.tailUpDeg);
  return {
    summary,
    viewDeg: -45,
    colorDown: true,
    sequence: {
      anchor: p(0.8, 0.86),
      steps: [
        // Only the kite itself: narrowing it would make the body too thin
        // and the tail a spike rather than a fin.
        ...kiteSteps.slice(0, 2),
        {
          kind: "valley",
          instruction:
            "Fold the kite in half along its length: the fold is the belly.",
          line: { from: p(-0.05, -0.05), to: p(1.1, 1.1) },
          toward: p(0.3, 0.7),
        },
        {
          kind: "inside-reverse",
          instruction:
            "Push the long point up between its layers (inside reverse fold) for the tail.",
          line: across(along(tailBase, tailLine, 0.1), tailLine, 0.15),
          toward: along(tailBase, 225, 0.2),
        },
      ],
    },
  };
};

/**
 * Square base with all four flaps squashed and petal-folded (the frog
 * base), and the folds the lily and the four-legged family share. In the
 * folded frame the base lies folded along x = 0.5 with the sheet's centre
 * (the closed point) at the top and the four corners (the open end) at the
 * bottom. Paper regions name the layers: a quadrant is the side around one
 * edge's midpoint, split at the line through it and the centre; a corner is
 * the paper round one corner of the sheet.
 */
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
export const FROG_BASE: readonly CreaseSegment[] = [
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

export const frogQuadrant =
  (q: number, half: 1 | -1) =>
  ({ paper }: FaceSample): boolean => {
    const [u, v] = [paper.x - 0.5, paper.y - 0.5];
    const side = Math.abs(u) > Math.abs(v) ? (u > 0 ? 1 : 3) : v > 0 ? 2 : 0;
    return side === q && Math.sign(q % 2 === 0 ? u : v) === half;
  };
export const frogCorner =
  (corner: number) =>
  ({ paper }: FaceSample): boolean =>
    paper.x - 0.5 < 0 === (corner === 0 || corner === 3) &&
    paper.y - 0.5 < 0 === (corner === 0 || corner === 1);
const NARROW_ORDER: readonly (readonly [number, 1 | -1])[] = [
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 1],
  [2, 1],
  [2, -1],
  [3, 1],
  [3, -1],
];
export const FROG_NARROW_STEPS: readonly FoldStep[] = NARROW_ORDER.map(
  ([q, half], i): FoldStep => ({
    kind: "valley",
    instruction:
      i === 0
        ? "Fold the lower edge of the top layer to the centre crease, narrowing it toward the closed point."
        : i % 2 === 1
          ? "Fold the other lower edge of this flap to the centre crease too."
          : "Turn the flaps like pages to bring the next side to the front, and fold its lower edge to the centre.",
    line: ray(p(0.5, 0.5), -79.1, 0.8),
    toward: p(0.64, 0.15),
    layers: frogQuadrant(q, half),
  }),
);

/**
 * Four legs seen from above, on the frog base: the base narrowed, two
 * quadrants turned like pages so two flaps lie each side of the axis, and
 * each flap inside-reverse-folded out as a leg just below the body. The
 * front legs come out level or a little forward, the hind legs back.
 */
export interface FourLegsDesign {
  /** The left front leg's direction (the right mirrors it): 180 is straight out. */
  readonly frontDeg: number;
  /** The left hind leg's direction: 270 would be straight back. */
  readonly hindDeg: number;
}

/** A flap points straight back (270); a reverse fold through a point just below the body turns it to dirDeg. */
const legLine = (dirDeg: number): FoldLine =>
  across(p(0.5, -0.02), (270 + dirDeg) / 2, 0.2);

export const fourLegs = (d: FourLegsDesign, summary: string): ModelShape => ({
  summary,
  viewDeg: 0,
  sequence: {
    anchor: p(0.5, 0.06),
    steps: [
      {
        kind: "creases",
        instruction:
          "Fold a frog base, closed point up: a square base with every flap squashed and petal-folded.",
        segments: FROG_BASE,
        howTo: FROG_BASE_HOW,
      },
      ...FROG_NARROW_STEPS,
      {
        kind: "turn",
        instruction:
          "Turn two flaps over like pages, so two lie on each side of the centre.",
        line: { from: p(0.5, -0.5), to: p(0.5, 1) },
        layers: (f) =>
          [0, 1].some((q) =>
            ([1, -1] as const).some((half) => frogQuadrant(q, half)(f)),
          ),
      },
      ...(
        [
          [
            0,
            d.frontDeg,
            "Inside-reverse-fold one lower point out to the left for a front leg.",
          ],
          [
            2,
            180 - d.frontDeg,
            "Do the same on the right for the other front leg.",
          ],
          [
            3,
            d.hindDeg,
            "Inside-reverse-fold the next point out and back for a hind leg.",
          ],
          [
            1,
            540 - d.hindDeg,
            "And the last point on the right for the other hind leg.",
          ],
        ] as const
      ).map(([corner, dirDeg, instruction]): FoldStep => ({
        kind: "inside-reverse",
        instruction,
        line: legLine(dirDeg),
        toward: p(0.5, -0.19),
        layers: frogCorner(corner),
      })),
    ],
  },
});

/**
 * A standing animal's body: every edge folds in to the centre with each
 * corner squashed out as a point (the double boat, or pig, base), and the
 * whole folds in half so the four points hang down as two pairs of legs.
 * Written for the corner (0, 0) and mirrored to the others; the midline
 * creases lie on both mirrors, so they are listed once.
 */
const BODY_CORNER: readonly CreaseSegment[] = [
  crease(p(0, 0), p(0.125, 0.125), "V"),
  crease(p(0.125, 0.125), p(0.25, 0.25), "M"),
  crease(p(0.25, 0), p(0.125, 0.125), "M"),
  crease(p(0.125, 0.125), p(0, 0.25), "M"),
  crease(p(0.25, 0.25), p(0.5, 0), "M"),
  crease(p(0.25, 0.25), p(0.25, 0.5), "M"),
  crease(p(0.25, 0.25), p(0.5, 0.25), "V"),
];
const mirrored = (s: CreaseSegment, mx: boolean, my: boolean) => {
  const m = ({ x, y }: Point2) => p(mx ? 1 - x : x, my ? 1 - y : y);
  return crease(m(s.from), m(s.to), s.assignment as "M" | "V");
};
export const ANIMAL_BODY: readonly CreaseSegment[] = [
  ...[false, true].flatMap((mx) =>
    [false, true].flatMap((my) => BODY_CORNER.map((s) => mirrored(s, mx, my))),
  ),
  ...[false, true].flatMap((mx) => [
    mirrored(crease(p(0, 0.5), p(0.25, 0.5), "V"), mx, false),
    mirrored(crease(p(0.25, 0.5), p(0.5, 0.5), "M"), mx, false),
  ]),
];

export const animalBody = (summary: string): ModelShape => ({
  summary,
  viewDeg: 0,
  sequence: {
    anchor: p(0.5, 0.45),
    steps: [
      {
        kind: "creases",
        instruction:
          "Fold each edge in to the centre, squashing every corner out as a point, then fold the whole in half so the four points hang down as legs.",
        segments: ANIMAL_BODY,
        howTo: ANIMAL_BODY_HOW,
      },
    ],
  },
});
