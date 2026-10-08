import { FabricationDesignSpecV3Schema } from "./design-spec";
import type { FabricationDesignSpecV3 } from "./design-spec";
import {
  FIGURE_LANDMARKS,
  containsWord,
  figureSilhouetteForText,
  type PanelSilhouette,
} from "./silhouettes";
import { normalizeFabricationIntentFeasibility } from "./feasibility-normalization";
import type { FabricationIntentV1 } from "./types";

/**
 * Parametric, always-verifiable design templates.
 *
 * The from-scratch synthesizer cannot reliably realize an arbitrary model spec,
 * so common object classes are also expressed as proven parametric patterns
 * (the same shape the passing fixtures use). When from-scratch synthesis
 * exhausts, the pipeline instantiates the matching template at the user's
 * requested dimensions — guaranteeing a real, verified, buildable design rather
 * than an error. A template fit to the user's millimetres is parametric CAD,
 * not a canned winner: it still produces original geometry for this request.
 */

const exactMm = (value: number) => ({
  minimumMm: value,
  preferredMm: value,
  maximumMm: value,
});

const ENCLOSURE_KEYWORDS = [
  "box",
  "case",
  "tray",
  "holder",
  "container",
  "caddy",
  "organizer",
  "organiser",
  "drawer",
  "sleeve",
  "carton",
  "enclosure",
];

const looksLikeEnclosure = (intent: FabricationIntentV1): boolean => {
  const haystack =
    `${intent.objectLabel} ${intent.functionalGoal} ${intent.title}`.toLowerCase();
  return ENCLOSURE_KEYWORDS.some((word) => haystack.includes(word));
};

/**
 * A single-sheet open-top box with four walls folded up from a base and a
 * hinged, tab-locked lid — the proven card-box topology, parameterized by the
 * finished width, height, and depth (in millimetres).
 */
// Matches the template tolerance below (clearanceMm).
const WALL_CLEARANCE_MM = 0.5;

export const enclosureTemplateSpec = (
  widthMm: number,
  heightMm: number,
  depthMm: number,
): FabricationDesignSpecV3 => {
  const w = Math.max(10, Math.round(widthMm));
  const h = Math.max(10, Math.round(heightMm));
  const d = Math.max(8, Math.round(depthMm));
  return FabricationDesignSpecV3Schema.parse({
    version: "3",
    label: "Folded enclosure",
    summary:
      "A one-sheet box with four walls folded up from a base and a hinged, tab-locked lid.",
    parts: [
      {
        key: "base",
        label: "Base",
        role: "support",
        width: exactMm(w),
        height: exactMm(d),
        shapePreference: "rectangle",
      },
      {
        key: "front",
        label: "Front wall",
        role: "wall",
        width: exactMm(w),
        height: exactMm(h),
        shapePreference: "rectangle",
      },
      {
        key: "back",
        label: "Back wall",
        role: "wall",
        width: exactMm(w),
        height: exactMm(h),
        shapePreference: "rectangle",
      },
      // The end walls stand two clearances lower than the front and back so
      // the two wall pairs nest at the corners instead of colliding.
      {
        key: "left",
        label: "Left wall",
        role: "wall",
        width: exactMm(d),
        height: exactMm(h - 2 * WALL_CLEARANCE_MM),
        shapePreference: "rectangle",
      },
      {
        key: "right",
        label: "Right wall",
        role: "wall",
        width: exactMm(d),
        height: exactMm(h - 2 * WALL_CLEARANCE_MM),
        shapePreference: "rectangle",
      },
      {
        key: "lid",
        label: "Hinged lid",
        role: "closure",
        width: exactMm(w),
        height: exactMm(d),
        shapePreference: "rectangle",
      },
    ],
    relations: [
      {
        key: "base-front",
        kind: "fold",
        partAKey: "base",
        partBKey: "front",
        angleRangeDeg: { minimum: 90, home: 90, maximum: 90 },
      },
      {
        key: "base-back",
        kind: "fold",
        partAKey: "base",
        partBKey: "back",
        angleRangeDeg: { minimum: 90, home: 90, maximum: 90 },
      },
      {
        key: "base-left",
        kind: "fold",
        partAKey: "base",
        partBKey: "left",
        angleRangeDeg: { minimum: 90, home: 90, maximum: 90 },
      },
      {
        key: "base-right",
        kind: "fold",
        partAKey: "base",
        partBKey: "right",
        angleRangeDeg: { minimum: 90, home: 90, maximum: 90 },
      },
      {
        key: "lid-motion",
        kind: "open_close",
        partAKey: "back",
        partBKey: "lid",
        angleRangeDeg: { minimum: 0, home: 90, maximum: 90 },
      },
      {
        key: "lid-lock",
        kind: "lock",
        partAKey: "lid",
        partBKey: "front",
        lockStyle: "tab_slot",
      },
    ],
    materialConstraints: {
      materialLabel: "Cardstock",
      thickness: { minimumMm: 0.2, preferredMm: 0.3, maximumMm: 0.5 },
    },
    sheetConstraints: { minimumSheets: 1, maximumSheets: 1 },
    glueAllowed: false,
    driver: {
      relationKey: "lid-motion",
      label: "Open or close the lid",
      control: "fold",
    },
    outputs: [
      {
        key: "lid-angle",
        relationKey: "lid-motion",
        partKey: "lid",
        label: "Lid angle",
      },
    ],
    visibleLandmarks: [
      {
        key: "base-landmark",
        label: "base",
        partKeys: ["base"],
        importance: "required",
      },
      {
        key: "lid-landmark",
        label: "lid",
        partKeys: ["lid"],
        importance: "required",
      },
      {
        key: "lid-lock-landmark",
        label: "lid lock",
        partKeys: ["lid", "front"],
        importance: "required",
      },
    ],
    aestheticPreferences: [
      "simple rectangular enclosure with a tab-locked lid",
    ],
    priorities: ["mechanical_simplicity", "fabrication_efficiency"],
    tolerances: { dimensionMm: 2, clearanceMm: 0.5, angleDeg: 2 },
  });
};

const figureText = (intent: FabricationIntentV1): string =>
  `${intent.objectLabel} ${intent.functionalGoal} ${intent.title} ${intent.sourcePrompt}`;

const looksLikeFigure = (intent: FabricationIntentV1): boolean =>
  figureSilhouetteForText(figureText(intent)) !== null;

/**
 * A static stand-up figure: two matching silhouette sides folded upright from
 * the long edges of a base, so the figure reads from either side. The
 * assembled envelope is width x height x depth, matching the requested size.
 */
const figureLandmarks = (silhouette: PanelSilhouette): readonly string[] =>
  silhouette === "flower" || silhouette === "arch"
    ? [silhouette]
    : FIGURE_LANDMARKS[silhouette];

export const figureTemplateSpec = (
  widthMm: number,
  heightMm: number,
  depthMm: number,
  silhouette: PanelSilhouette = "duck",
  // What the user asked for, when it differs from the outline used (a robot
  // drawn with the neutral arch outline is still labelled a robot).
  objectName: string = silhouette,
): FabricationDesignSpecV3 => {
  // A side profile runs along the longer footprint axis: a rat requested as
  // 60 wide by 130 deep is 130 long, standing on a 60-deep base.
  const w = Math.max(30, Math.round(Math.max(widthMm, depthMm)));
  const h = Math.max(30, Math.round(heightMm));
  const d = Math.max(12, Math.round(Math.min(widthMm, depthMm)));
  const name = objectName.trim().toLowerCase().slice(0, 80) || silhouette;
  const side = (key: string, label: string) => ({
    key,
    label,
    role: "structural" as const,
    width: exactMm(w),
    height: exactMm(h),
    shapePreference: "rectangle" as const,
    silhouette,
  });
  const foldUp = (key: string, partBKey: string) => ({
    key,
    kind: "fold" as const,
    partAKey: "base",
    partBKey,
    angleRangeDeg: { minimum: 90, home: 90, maximum: 90 },
  });
  return FabricationDesignSpecV3Schema.parse({
    version: "3",
    label: `Stand-up ${name}`,
    summary: `A fold-only stand-up ${name}: two sides with the ${silhouette} outline folded upright from a shared base.`,
    parts: [
      {
        key: "base",
        label: "Base",
        role: "support",
        width: exactMm(w),
        height: exactMm(d),
        shapePreference: "rectangle",
      },
      side("body", `${name} body, front side`),
      side("back", `${name} body, back side`),
    ],
    relations: [foldUp("base-body", "body"), foldUp("base-back", "back")],
    materialConstraints: {
      materialLabel: "Cardstock",
      thickness: { minimumMm: 0.2, preferredMm: 0.3, maximumMm: 0.5 },
    },
    sheetConstraints: { minimumSheets: 1, maximumSheets: 1 },
    glueAllowed: false,
    driver: null,
    outputs: [],
    visibleLandmarks: figureLandmarks(silhouette).map((landmark) => ({
      key: landmark,
      label: landmark,
      partKeys: ["body", "back"],
      importance: "required",
    })),
    aestheticPreferences: [`${silhouette} silhouette, fold-only`],
    priorities: ["visual_expression", "mechanical_simplicity"],
    tolerances: { dimensionMm: 2, clearanceMm: 0.5, angleDeg: 2 },
  });
};

const POPUP_KEYWORDS = [
  "pop-up",
  "pop up",
  "popup",
  "flower",
  "petal",
  "vertical-lift",
  "vertical lift",
  "greeting card",
  "birthday card",
];

const looksLikePopUp = (intent: FabricationIntentV1): boolean => {
  const haystack =
    `${intent.objectLabel} ${intent.functionalGoal} ${intent.title} ${intent.sourcePrompt}`.toLowerCase();
  return POPUP_KEYWORDS.some((word) => haystack.includes(word));
};

/**
 * A pop-up card: a flat card panel with a "flower" panel that rises from it as
 * the card opens and folds flat when it closes — the proven one-driver open/
 * close mechanism. The open (home) pose spans width x height x depth so it
 * satisfies the requested-size check.
 */
const capitalized = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

export const popUpCardTemplateSpec = (
  widthMm: number,
  heightMm: number,
  depthMm: number,
  popUpShape: PanelSilhouette = "flower",
): FabricationDesignSpecV3 => {
  const w = Math.max(40, Math.round(widthMm));
  const h = Math.max(40, Math.round(heightMm));
  const d = Math.max(12, Math.round(depthMm));
  return FabricationDesignSpecV3Schema.parse({
    version: "3",
    label: `Pop-up ${popUpShape} card`,
    summary: `A one-sheet card with a ${popUpShape} panel that rises as the card opens and folds flat when it closes.`,
    parts: [
      {
        key: "card",
        label: "Card",
        role: "support",
        width: exactMm(w),
        height: exactMm(h),
        shapePreference: "rectangle",
      },
      {
        key: popUpShape,
        label: capitalized(popUpShape),
        role: "moving",
        width: exactMm(w),
        // The pop-up's height is the requested pop-up depth, which keeps the
        // assembled envelope equal to the requested size.
        height: exactMm(d),
        shapePreference: "rectangle",
        silhouette: popUpShape,
      },
    ],
    relations: [
      {
        key: "open",
        kind: "open_close",
        partAKey: "card",
        partBKey: popUpShape,
        angleRangeDeg: { minimum: 0, home: 90, maximum: 90 },
      },
    ],
    materialConstraints: {
      materialLabel: "Cardstock",
      thickness: { minimumMm: 0.2, preferredMm: 0.3, maximumMm: 0.5 },
    },
    sheetConstraints: { minimumSheets: 1, maximumSheets: 1 },
    glueAllowed: false,
    driver: {
      relationKey: "open",
      label: "Open or close the card",
      control: "fold",
    },
    outputs: [
      {
        key: `${popUpShape}-rise`,
        relationKey: "open",
        partKey: popUpShape,
        label: `${capitalized(popUpShape)} rises as the card opens`,
      },
    ],
    visibleLandmarks: [
      {
        key: "card-landmark",
        label: "card",
        partKeys: ["card"],
        importance: "required",
      },
      {
        key: `${popUpShape}-landmark`,
        label: popUpShape,
        partKeys: [popUpShape],
        importance: "required",
      },
    ],
    aestheticPreferences: [
      `a card that opens with a rising ${popUpShape} panel`,
    ],
    priorities: ["mechanical_simplicity", "fabrication_efficiency"],
    tolerances: { dimensionMm: 2, clearanceMm: 0.5, angleDeg: 2 },
  });
};

// Deeper than this, a request is a 3D object, not a flat cut-out.
const MAXIMUM_FLAT_DEPTH_MM = 5;

export const CUTOUT_KEYWORDS = [
  "bookmark",
  "gift tag",
  "tag",
  "ornament",
  "coaster",
  "cutout",
  "cut-out",
  "decoration",
] as const;

export const STAND_KEYWORDS = [
  "stand",
  "easel",
  "dock",
  "display stand",
] as const;

const mentions = (
  intent: FabricationIntentV1,
  keywords: readonly string[],
): boolean => {
  const haystack = figureText(intent);
  return keywords.some((word) => containsWord(haystack, word));
};

/**
 * A flat cut-out (bookmark, tag, ornament, coaster): one panel drawn as the
 * silhouette named in the request, or a rounded tag outline otherwise.
 */
export const cutoutTemplateSpec = (
  widthMm: number,
  heightMm: number,
  silhouette: PanelSilhouette,
): FabricationDesignSpecV3 => {
  const w = Math.max(20, Math.round(widthMm));
  const h = Math.max(20, Math.round(heightMm));
  return FabricationDesignSpecV3Schema.parse({
    version: "3",
    label: `${silhouette === "arch" ? "Rounded" : silhouette} cut-out`,
    summary: `A single flat ${silhouette}-shaped piece cut from card.`,
    parts: [
      {
        key: "shape",
        label: `${silhouette} shape`,
        role: "structural",
        width: exactMm(w),
        height: exactMm(h),
        shapePreference: "rectangle",
        silhouette,
      },
    ],
    relations: [],
    materialConstraints: {
      materialLabel: "Cardstock",
      thickness: { minimumMm: 0.2, preferredMm: 0.3, maximumMm: 0.5 },
    },
    sheetConstraints: { minimumSheets: 1, maximumSheets: 1 },
    glueAllowed: false,
    driver: null,
    outputs: [],
    visibleLandmarks: [
      {
        key: "outline",
        label: `${silhouette} outline`,
        partKeys: ["shape"],
        importance: "required",
      },
    ],
    aestheticPreferences: [`flat ${silhouette} silhouette`],
    priorities: ["visual_expression", "fabrication_efficiency"],
    tolerances: { dimensionMm: 2, clearanceMm: 0.5, angleDeg: 2 },
  });
};

/**
 * A fold-only desk stand for a phone, tablet, or card: a base with an upright
 * back and a low front lip folded up from opposite edges, so the item rests
 * in the channel against the back. Envelope: width x height x depth.
 */
export const standTemplateSpec = (
  widthMm: number,
  heightMm: number,
  depthMm: number,
): FabricationDesignSpecV3 => {
  const w = Math.max(30, Math.round(widthMm));
  const h = Math.max(30, Math.round(heightMm));
  const d = Math.max(20, Math.round(depthMm));
  // Tall enough to stop a device sliding off, low enough to leave the screen clear.
  const lip = Math.min(h - 10, Math.max(8, Math.round(h * 0.2)));
  const panel = (
    key: string,
    label: string,
    role: FabricationDesignSpecV3["parts"][number]["role"],
    height: number,
  ) => ({
    key,
    label,
    role,
    width: exactMm(w),
    height: exactMm(height),
    shapePreference: "rectangle" as const,
  });
  const foldUp = (key: string, partBKey: string) => ({
    key,
    kind: "fold" as const,
    partAKey: "base",
    partBKey,
    angleRangeDeg: { minimum: 90, home: 90, maximum: 90 },
  });
  return FabricationDesignSpecV3Schema.parse({
    version: "3",
    label: "Desk stand",
    summary:
      "A fold-only stand: an upright back and a front lip folded up from a base.",
    parts: [
      panel("base", "Base", "support", d),
      panel("back", "Back rest", "structural", h),
      panel("lip", "Front lip", "structural", lip),
    ],
    relations: [foldUp("base-back", "back"), foldUp("base-lip", "lip")],
    materialConstraints: {
      materialLabel: "Cardstock",
      thickness: { minimumMm: 0.2, preferredMm: 0.3, maximumMm: 0.5 },
    },
    sheetConstraints: { minimumSheets: 1, maximumSheets: 1 },
    glueAllowed: false,
    driver: null,
    outputs: [],
    visibleLandmarks: [
      {
        key: "back-rest",
        label: "back rest",
        partKeys: ["back"],
        importance: "required",
      },
      {
        key: "front-lip",
        label: "front lip",
        partKeys: ["lip"],
        importance: "required",
      },
    ],
    aestheticPreferences: ["simple upright stand with a front lip"],
    priorities: ["mechanical_simplicity", "fabrication_efficiency"],
    tolerances: { dimensionMm: 2, clearanceMm: 0.5, angleDeg: 2 },
  });
};

/** The ready-made design families a request can fall back to. */
export const TEMPLATE_ARCHETYPES = [
  "enclosure",
  "stand",
  "cutout",
  "figure",
  "popup_card",
] as const;

export type TemplateArchetype = (typeof TEMPLATE_ARCHETYPES)[number];

/**
 * The model's own choice of the closest family and outline. Used when no
 * keyword rule matches, so an object nobody listed ("a rat") still lands on a
 * sensible, verifiable design instead of an error.
 */
export interface TemplateHint {
  readonly archetype: TemplateArchetype;
  readonly silhouette: PanelSilhouette | null;
}

const specFromHint = (
  hint: TemplateHint,
  widthMm: number,
  heightMm: number,
  depthMm: number,
  objectName: string,
): FabricationDesignSpecV3 => {
  switch (hint.archetype) {
    case "enclosure":
      return enclosureTemplateSpec(widthMm, heightMm, depthMm);
    case "stand":
      return standTemplateSpec(widthMm, heightMm, depthMm);
    case "cutout":
      return cutoutTemplateSpec(widthMm, heightMm, hint.silhouette ?? "arch");
    case "figure":
      // Without a fitting outline the neutral arch is used, never an animal.
      return figureTemplateSpec(
        widthMm,
        heightMm,
        depthMm,
        hint.silhouette ?? "arch",
        objectName,
      );
    case "popup_card":
      return popUpCardTemplateSpec(
        widthMm,
        heightMm,
        depthMm,
        hint.silhouette ?? "flower",
      );
  }
};

interface TemplateDescriptor {
  /** Whether this template class serves the request. */
  readonly matches: (intent: FabricationIntentV1) => boolean;
  /** Build the parametric spec for the finished width/height/depth (mm). */
  readonly build: (
    widthMm: number,
    heightMm: number,
    depthMm: number,
    intent: FabricationIntentV1,
  ) => FabricationDesignSpecV3;
}

const buildFigure: TemplateDescriptor["build"] = (w, h, d, intent) =>
  figureTemplateSpec(
    w,
    h,
    d,
    figureSilhouetteForText(figureText(intent)) ?? "duck",
  );

const TEMPLATE_DESCRIPTORS: readonly TemplateDescriptor[] = [
  // A "star bookmark" is a flat cut-out, not a stand-up star.
  {
    // Only for genuinely flat requests: a model may call a 100 mm-deep
    // stand-up bunny an "Easter decoration".
    matches: (intent) =>
      mentions(intent, CUTOUT_KEYWORDS) &&
      (intent.requestedSize.depthMm ?? 0) <= MAXIMUM_FLAT_DEPTH_MM,
    build: (w, h, _d, intent) =>
      cutoutTemplateSpec(
        w,
        h,
        figureSilhouetteForText(figureText(intent)) ?? "arch",
      ),
  },
  {
    matches: (intent) =>
      intent.behavior === "static" && looksLikeFigure(intent),
    build: buildFigure,
  },
  {
    matches: looksLikePopUp,
    // The rising panel takes the shape the request names (a heart, a star),
    // a flower otherwise.
    build: (w, h, d, intent) =>
      popUpCardTemplateSpec(
        w,
        h,
        d,
        figureSilhouetteForText(figureText(intent)) ?? "flower",
      ),
  },
  // Before enclosures, so "phone stand holder" is a stand, not a box.
  {
    matches: (intent) =>
      mentions(intent, STAND_KEYWORDS) && !looksLikeFigure(intent),
    build: (w, h, d) => standTemplateSpec(w, h, d),
  },
  { matches: looksLikeEnclosure, build: enclosureTemplateSpec },
  { matches: looksLikeFigure, build: buildFigure },
];

/**
 * The proven parametric template for a request, or null when no template class
 * matches (the caller then keeps the original from-scratch failure).
 */
export const templateSpecForIntent = (
  intent: FabricationIntentV1,
  hint: TemplateHint | null = null,
): FabricationDesignSpecV3 | null => {
  const { widthMm, heightMm, depthMm } = intent.requestedSize;
  const hasEnvelope =
    typeof widthMm === "number" &&
    typeof heightMm === "number" &&
    typeof depthMm === "number" &&
    widthMm > 0 &&
    heightMm > 0 &&
    depthMm > 0;
  if (!hasEnvelope) return null;
  const descriptor = TEMPLATE_DESCRIPTORS.find((candidate) =>
    candidate.matches(intent),
  );
  if (descriptor) return descriptor.build(widthMm, heightMm, depthMm, intent);
  return hint
    ? specFromHint(hint, widthMm, heightMm, depthMm, intent.objectLabel)
    : null;
};

/**
 * The request reduced to what a template can honour: the same object, size,
 * and stock, the behavior the matching template actually has, and no
 * model-authored semantic constraints. Null when no template matches.
 */
export const templateIntentFor = (
  intent: FabricationIntentV1,
  hint: TemplateHint | null = null,
): FabricationIntentV1 | null => {
  const spec = templateSpecForIntent(intent, hint);
  if (!spec) return null;
  return normalizeFabricationIntentFeasibility({
    ...intent,
    behavior: spec.driver ? "open_close" : "static",
    semanticConstraints: [],
  });
};
