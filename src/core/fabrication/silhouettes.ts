import type { FabricationProgramV1 } from "./types";
import { flatWorldPoint } from "./upright";

/**
 * Recognizable outlines for rigid panels.
 *
 * The synthesizer realizes every part as a rectangle, triangle, or trapezoid,
 * which keeps fold edges, packing, and collision tractable but makes a duck or
 * a flower look like a stack of cards. A silhouette replaces the outline of a
 * finished rectangular panel with a shape drawn inside the same rectangle while
 * keeping its single hinge edge intact, so joints, packing, and collision
 * envelopes stay valid. The caller re-runs full verification and keeps the
 * plain rectangle whenever the silhouette panel does not pass.
 *
 * Shapes are authored in a canonical frame: the hinge runs along the bottom
 * edge from (0, 0) to (1, 0), +t points away from the hinge, and points are
 * listed counter-clockwise in normalized (s, t) coordinates within [0, 1]^2.
 */

export const PANEL_SILHOUETTES = [
  "duck",
  "cat",
  "rabbit",
  "heart",
  "flower",
  "tree",
  "house",
  "star",
  "arch",
] as const;

export type PanelSilhouette = (typeof PANEL_SILHOUETTES)[number];

interface CanonicalPoint {
  readonly s: number;
  readonly t: number;
}

// Shortest outline segment we generate, kept well above the verifier's 1 mm
// minimum feature so scaled-down panels still pass.
const MINIMUM_SEGMENT_MM = 2.5;

const point = (s: number, t: number): CanonicalPoint => ({ s, t });

// A sitting duck in side view: chest and beak toward -s, tail toward +s.
const DUCK: readonly CanonicalPoint[] = [
  point(0, 0),
  point(1, 0),
  point(0.97, 0.2),
  point(1, 0.46),
  point(0.86, 0.4),
  point(0.72, 0.46),
  point(0.56, 0.5),
  point(0.44, 0.52),
  point(0.4, 0.62),
  point(0.4, 0.74),
  point(0.37, 0.85),
  point(0.31, 0.94),
  point(0.23, 1),
  point(0.15, 0.95),
  point(0.11, 0.88),
  point(0.1, 0.8),
  point(0, 0.76),
  point(0.1, 0.71),
  point(0.16, 0.66),
  point(0.22, 0.58),
  point(0.2, 0.45),
  point(0.1, 0.3),
  point(0.04, 0.14),
];

// A sitting cat seen from the front: pointed ears, round head, wide haunches.
const CAT: readonly CanonicalPoint[] = [
  point(0, 0),
  point(1, 0),
  point(0.92, 0.12),
  point(0.86, 0.3),
  point(0.78, 0.45),
  point(0.7, 0.52),
  point(0.76, 0.6),
  point(0.78, 0.72),
  point(0.76, 0.82),
  point(0.8, 1),
  point(0.64, 0.88),
  point(0.5, 0.86),
  point(0.36, 0.88),
  point(0.2, 1),
  point(0.24, 0.82),
  point(0.22, 0.72),
  point(0.24, 0.6),
  point(0.3, 0.52),
  point(0.22, 0.45),
  point(0.14, 0.3),
  point(0.08, 0.12),
];

// A sitting rabbit seen from the front, with two tall ears.
const RABBIT: readonly CanonicalPoint[] = [
  point(0, 0),
  point(1, 0),
  point(0.9, 0.12),
  point(0.82, 0.3),
  point(0.72, 0.42),
  point(0.68, 0.5),
  point(0.74, 0.58),
  point(0.74, 0.66),
  point(0.66, 0.72),
  point(0.7, 0.86),
  point(0.68, 1),
  point(0.6, 0.99),
  point(0.57, 0.86),
  point(0.56, 0.74),
  point(0.44, 0.74),
  point(0.43, 0.86),
  point(0.4, 0.99),
  point(0.32, 1),
  point(0.3, 0.86),
  point(0.34, 0.72),
  point(0.26, 0.66),
  point(0.26, 0.58),
  point(0.32, 0.5),
  point(0.28, 0.42),
  point(0.18, 0.3),
  point(0.1, 0.12),
];

/**
 * A heart resting point-down on a low plinth that carries the hinge, from the
 * classic parametric heart x = 16 sin^3 a, y = 13 cos a - 5 cos 2a - 2 cos 3a
 * - cos 4a, normalized so its top lobes touch the far edge.
 */
const HEART: readonly CanonicalPoint[] = (() => {
  const plinthTop = 0.12;
  const gap = 0.12; // radians kept either side of the tip, where it meets the plinth
  const samples = 36;
  const raw = Array.from({ length: samples + 1 }, (_, index) => {
    // Counter-clockwise from just right of the tip, over the top, to its left.
    const angle = Math.PI - gap - (index * (2 * Math.PI - 2 * gap)) / samples;
    return {
      x: 16 * Math.sin(angle) ** 3,
      y:
        13 * Math.cos(angle) -
        5 * Math.cos(2 * angle) -
        2 * Math.cos(3 * angle) -
        Math.cos(4 * angle),
    };
  });
  const maximumY = Math.max(...raw.map((p) => p.y));
  const minimumY = -17;
  const outline = raw.map(({ x, y }) =>
    point(
      0.5 + (x / 16) * 0.46,
      plinthTop + ((y - minimumY) / (maximumY - minimumY)) * (1 - plinthTop),
    ),
  );
  return [
    point(0, 0),
    point(1, 0),
    point(1, plinthTop),
    ...outline,
    point(0, plinthTop),
  ];
})();

const HOUSE: readonly CanonicalPoint[] = [
  point(0, 0),
  point(1, 0),
  point(1, 0.58),
  point(0.5, 1),
  point(0, 0.58),
];

const ARCH: readonly CanonicalPoint[] = [
  point(0, 0),
  point(1, 0),
  point(1, 0.5),
  ...Array.from({ length: 11 }, (_, index) => {
    const angle = (Math.PI * (index + 1)) / 12;
    return point(0.5 + 0.5 * Math.cos(angle), 0.5 + 0.5 * Math.sin(angle));
  }),
  point(0, 0.5),
];

const TREE: readonly CanonicalPoint[] = [
  point(0, 0),
  point(1, 0),
  point(0.58, 0.08),
  point(0.58, 0.2),
  point(0.95, 0.2),
  point(0.68, 0.45),
  point(0.85, 0.45),
  point(0.62, 0.7),
  point(0.75, 0.7),
  point(0.5, 1),
  point(0.25, 0.7),
  point(0.38, 0.7),
  point(0.15, 0.45),
  point(0.32, 0.45),
  point(0.05, 0.2),
  point(0.42, 0.2),
  point(0.42, 0.08),
];

const STAR: readonly CanonicalPoint[] = (() => {
  // A five-point star whose top tip touches the panel's far edge and whose two
  // lower tips rest on a plinth that carries the hinge.
  const centerS = 0.5;
  const outer = 0.45;
  const inner = 0.19;
  const centerT = 1 - outer;
  const vertex = (k: number) => {
    // k indexes star vertices counter-clockwise from the lower-right tip.
    const angle = 1.7 * Math.PI + (k * Math.PI) / 5;
    const radius = k % 2 === 0 ? outer : inner;
    return point(
      centerS + radius * Math.cos(angle),
      centerT + radius * Math.sin(angle),
    );
  };
  const plinthTop = vertex(0).t;
  return [
    point(0, 0),
    point(1, 0),
    point(1, plinthTop),
    ...Array.from({ length: 9 }, (_, k) => vertex(k)),
    point(0, plinthTop),
  ];
})();

/**
 * A stemmed flower: a leafy mound on the hinge, a stem, and a five-petal head.
 * Built in millimetres so the head stays round on any panel aspect ratio.
 */
const flowerOutline = (
  widthMm: number,
  heightMm: number,
): readonly CanonicalPoint[] => {
  const leafTopMm = heightMm * 0.18;
  const radiusMm = Math.min(heightMm * 0.3, widthMm * 0.46);
  const stemHalfMm = Math.min(radiusMm * 0.2, Math.max(1.5, widthMm * 0.04));
  const centerMm = { s: widthMm / 2, t: heightMm - radiusMm };
  const toCanonical = (sMm: number, tMm: number) =>
    point(sMm / widthMm, tMm / heightMm);
  const petalRadius = (angle: number) =>
    radiusMm * (0.7 + 0.3 * Math.cos(5 * (angle - Math.PI / 2)));
  // The head outline leaves the stem's right side and returns on its left.
  const neckAngle = Math.asin(Math.min(0.9, stemHalfMm / (radiusMm * 0.5)));
  const startAngle = -Math.PI / 2 + neckAngle;
  const endAngle = (3 * Math.PI) / 2 - neckAngle;
  const perimeterMm = 2 * Math.PI * radiusMm * 1.3;
  // The grammar allows 64 vertices per panel; the stem and leaves use 10.
  const samples = Math.max(
    20,
    Math.min(48, Math.floor(perimeterMm / MINIMUM_SEGMENT_MM)),
  );
  const head = Array.from({ length: samples + 1 }, (_, index) => {
    const angle = startAngle + ((endAngle - startAngle) * index) / samples;
    const radius = petalRadius(angle);
    return toCanonical(
      centerMm.s + radius * Math.cos(angle),
      centerMm.t + radius * Math.sin(angle),
    );
  });
  const neckMm = centerMm.t - radiusMm * 0.5;
  return [
    point(0, 0),
    point(1, 0),
    toCanonical(widthMm * 0.82, leafTopMm),
    toCanonical(widthMm / 2 + stemHalfMm * 2, leafTopMm * 0.7),
    toCanonical(widthMm / 2 + stemHalfMm, leafTopMm * 0.7),
    toCanonical(widthMm / 2 + stemHalfMm, neckMm),
    ...head,
    toCanonical(widthMm / 2 - stemHalfMm, neckMm),
    toCanonical(widthMm / 2 - stemHalfMm, leafTopMm * 0.7),
    toCanonical(widthMm / 2 - stemHalfMm * 2, leafTopMm * 0.7),
    toCanonical(widthMm * 0.18, leafTopMm),
  ];
};

export const canonicalSilhouette = (
  silhouette: PanelSilhouette,
  hingeLengthMm: number,
  depthMm: number,
): readonly CanonicalPoint[] => {
  switch (silhouette) {
    case "duck":
      return DUCK;
    case "cat":
      return CAT;
    case "rabbit":
      return RABBIT;
    case "heart":
      return HEART;
    case "flower":
      return flowerOutline(hingeLengthMm, depthMm);
    case "tree":
      return TREE;
    case "house":
      return HOUSE;
    case "star":
      return STAR;
    case "arch":
      return ARCH;
  }
};

type UnitSquareEdge = "v0" | "u1" | "v1" | "u0";

const EPSILON = 1e-6;
const AXIS_EPSILON_MM = 0.01;

const isUnitSquare = (vertices: readonly { u: number; v: number }[]) =>
  vertices.length === 4 &&
  vertices.every(
    ({ u, v }) =>
      (Math.abs(u) < EPSILON || Math.abs(u - 1) < EPSILON) &&
      (Math.abs(v) < EPSILON || Math.abs(v - 1) < EPSILON),
  );

const edgeName = (
  a: { u: number; v: number },
  b: { u: number; v: number },
): UnitSquareEdge | null => {
  if (Math.abs(a.v) < EPSILON && Math.abs(b.v) < EPSILON) return "v0";
  if (Math.abs(a.v - 1) < EPSILON && Math.abs(b.v - 1) < EPSILON) return "v1";
  if (Math.abs(a.u) < EPSILON && Math.abs(b.u) < EPSILON) return "u0";
  if (Math.abs(a.u - 1) < EPSILON && Math.abs(b.u - 1) < EPSILON) return "u1";
  return null;
};

// Rotations of the unit square that carry the canonical bottom edge onto each
// panel edge; rotations preserve the counter-clockwise winding.
const toPanelUv = (edge: UnitSquareEdge, { s, t }: CanonicalPoint) => {
  switch (edge) {
    case "v0":
      return { u: s, v: t };
    case "v1":
      return { u: 1 - s, v: 1 - t };
    case "u1":
      return { u: 1 - t, v: s };
    case "u0":
      return { u: t, v: 1 - s };
  }
};

type Panel = FabricationProgramV1["blueprint"]["panels"][number];

const distanceToSegmentMm = (
  p: { xMm: number; yMm: number },
  a: { xMm: number; yMm: number },
  b: { xMm: number; yMm: number },
): number => {
  const dx = b.xMm - a.xMm;
  const dy = b.yMm - a.yMm;
  const lengthSquared = dx * dx + dy * dy;
  const projection = Math.max(
    0,
    Math.min(1, ((p.xMm - a.xMm) * dx + (p.yMm - a.yMm) * dy) / lengthSquared),
  );
  return Math.hypot(
    p.xMm - (a.xMm + projection * dx),
    p.yMm - (a.yMm + projection * dy),
  );
};

/**
 * The single unit-square edge of a panel that carries a fold axis, or null
 * when the panel is not a plain rectangle, carries connectors or inner cuts,
 * or touches more than one joint edge (a base, for example). A free-standing
 * panel with no joints at all (a flat cut-out) uses its bottom edge.
 */
const hingeEdge = (
  program: FabricationProgramV1,
  panel: Panel,
): UnitSquareEdge | null => {
  const vertices = panel.contour.vertices;
  if (!isUnitSquare(vertices) || panel.innerCutContours.length > 0) {
    return null;
  }
  if (program.blueprint.connectors.some((c) => c.panelId === panel.panelId)) {
    return null;
  }
  const joints = program.blueprint.joints.filter(
    (joint) =>
      joint.parentBodyId === panel.bodyId || joint.childBodyId === panel.bodyId,
  );
  if (joints.length === 0) return "v0";
  const hinged = new Set<UnitSquareEdge>();
  vertices.forEach((start, index) => {
    const end = vertices[(index + 1) % vertices.length];
    if (!end) return;
    const name = edgeName(start, end);
    if (!name) return;
    const a = flatWorldPoint(panel, start.u, start.v);
    const b = flatWorldPoint(panel, end.u, end.v);
    for (const joint of joints) {
      // Prismatic joints carry a direction, not a hinge line on an edge.
      if (!("startMm" in joint.axis)) continue;
      if (
        distanceToSegmentMm(joint.axis.startMm, a, b) < AXIS_EPSILON_MM &&
        distanceToSegmentMm(joint.axis.endMm, a, b) < AXIS_EPSILON_MM
      ) {
        hinged.add(name);
      }
    }
  });
  const [only, ...rest] = [...hinged];
  return only && rest.length === 0 ? only : null;
};

/**
 * Whether the canonical +s direction along the hinge points toward +x on the
 * flat sheet (or +y for a hinge parallel to y). Folding rotates about the
 * hinge, so this direction survives into 3D: panels hinged on opposite edges
 * of a base face the same way only if their outlines agree on it.
 */
const facesSheetPositive = (panel: Panel, edge: UnitSquareEdge): boolean => {
  const start = toPanelUv(edge, point(0, 0));
  const end = toPanelUv(edge, point(1, 0));
  const a = flatWorldPoint(panel, start.u, start.v);
  const b = flatWorldPoint(panel, end.u, end.v);
  const dx = b.xMm - a.xMm;
  return Math.abs(dx) > AXIS_EPSILON_MM ? dx > 0 : b.yMm > a.yMm;
};

/** Mirror s -> 1 - s, keeping counter-clockwise order with the hinge first. */
const mirroredOutline = (
  outline: readonly CanonicalPoint[],
): readonly CanonicalPoint[] => {
  const [, , ...rest] = outline;
  return [
    point(0, 0),
    point(1, 0),
    ...rest.toReversed().map(({ s, t }) => point(1 - s, t)),
  ];
};

/**
 * Drops outline points closer than MINIMUM_SEGMENT_MM to the previously kept
 * point (and to the first point), so a shape scaled onto a small or skinny
 * panel never produces an edge below the verifier's minimum feature size. The
 * first two points, the hinge edge, are always kept.
 */
const withoutShortEdges = (
  vertices: readonly { readonly u: number; readonly v: number }[],
  widthMm: number,
  heightMm: number,
): { u: number; v: number }[] => {
  const distanceMm = (
    a: { readonly u: number; readonly v: number },
    b: { readonly u: number; readonly v: number },
  ) => Math.hypot((a.u - b.u) * widthMm, (a.v - b.v) * heightMm);
  const kept = vertices.slice(0, 2).map(({ u, v }) => ({ u, v }));
  const first = vertices[0];
  for (const vertex of vertices.slice(2)) {
    const previous = kept[kept.length - 1];
    if (!previous || !first) continue;
    if (
      distanceMm(previous, vertex) >= MINIMUM_SEGMENT_MM &&
      distanceMm(first, vertex) >= MINIMUM_SEGMENT_MM
    ) {
      kept.push({ u: vertex.u, v: vertex.v });
    }
  }
  return kept;
};

/**
 * Returns the program with each requested panel redrawn as its silhouette.
 * Panels that are not single-hinge rectangles keep their outline unchanged.
 */
export const applyPanelSilhouettes = (
  program: FabricationProgramV1,
  silhouettesByPanelId: ReadonlyMap<string, PanelSilhouette>,
): FabricationProgramV1 => {
  let changed = false;
  const panels = program.blueprint.panels.map((panel) => {
    const silhouette = silhouettesByPanelId.get(panel.panelId);
    if (!silhouette) return panel;
    const edge = hingeEdge(program, panel);
    if (!edge) return panel;
    const alongV = edge === "v0" || edge === "v1";
    const canonical = canonicalSilhouette(
      silhouette,
      alongV ? panel.widthMm : panel.heightMm,
      alongV ? panel.heightMm : panel.widthMm,
    );
    const outline = facesSheetPositive(panel, edge)
      ? canonical
      : mirroredOutline(canonical);
    changed = true;
    return {
      ...panel,
      contour: {
        vertices: withoutShortEdges(
          outline.map((p) => toPanelUv(edge, p)),
          panel.widthMm,
          panel.heightMm,
        ),
      },
    };
  });
  return changed
    ? { ...program, blueprint: { ...program.blueprint, panels } }
    : program;
};

/** Standing-figure silhouettes and the prompt words that select them. */
export const FIGURE_SILHOUETTE_KEYWORDS: Readonly<
  Record<
    Extract<
      PanelSilhouette,
      "duck" | "cat" | "rabbit" | "heart" | "tree" | "house" | "star"
    >,
    readonly string[]
  >
> = {
  duck: [
    "duck",
    "duckling",
    "bird",
    "swan",
    "goose",
    "chick",
    "chicken",
    "hen",
  ],
  cat: ["cat", "kitten", "kitty"],
  rabbit: ["rabbit", "bunny", "bunnies", "hare"],
  heart: ["heart", "valentine"],
  tree: ["tree", "pine", "christmas tree", "fir"],
  house: ["house", "home", "cottage", "cabin", "hut"],
  star: ["star"],
};

export type FigureSilhouette = keyof typeof FIGURE_SILHOUETTE_KEYWORDS;

const FIGURE_ORDER: readonly FigureSilhouette[] = [
  "duck",
  "cat",
  "rabbit",
  "heart",
  "tree",
  "house",
  "star",
];

/** Whole-word (optionally plural) match, so "standard" is not "stand". */
export const containsWord = (text: string, word: string): boolean =>
  new RegExp(
    `\\b${word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}s?\\b`,
    "iu",
  ).test(text);

/** The first figure silhouette whose keyword appears as a whole word. */
export const figureSilhouetteForText = (
  text: string,
): FigureSilhouette | null =>
  FIGURE_ORDER.find((silhouette) =>
    FIGURE_SILHOUETTE_KEYWORDS[silhouette].some((word) =>
      containsWord(text, word),
    ),
  ) ?? null;

/** Named landmarks each figure silhouette visibly carries. */
export const FIGURE_LANDMARKS: Readonly<
  Record<FigureSilhouette, readonly string[]>
> = {
  duck: ["head", "beak", "tail"],
  cat: ["ears", "head", "haunches"],
  rabbit: ["ears", "head", "haunches"],
  heart: ["lobes", "point"],
  tree: ["crown", "trunk"],
  house: ["roof", "walls"],
  star: ["points"],
};
