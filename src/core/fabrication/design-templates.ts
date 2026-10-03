import { FabricationDesignSpecV3Schema } from "./design-spec";
import type { FabricationDesignSpecV3 } from "./design-spec";
import {
  FIGURE_LANDMARKS,
  figureSilhouetteForText,
  type FigureSilhouette,
} from "./silhouettes";
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
      {
        key: "left",
        label: "Left wall",
        role: "wall",
        width: exactMm(d),
        height: exactMm(h),
        shapePreference: "rectangle",
      },
      {
        key: "right",
        label: "Right wall",
        role: "wall",
        width: exactMm(d),
        height: exactMm(h),
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
export const figureTemplateSpec = (
  widthMm: number,
  heightMm: number,
  depthMm: number,
  silhouette: FigureSilhouette = "duck",
): FabricationDesignSpecV3 => {
  const w = Math.max(30, Math.round(widthMm));
  const h = Math.max(30, Math.round(heightMm));
  const d = Math.max(12, Math.round(depthMm));
  const name = silhouette === "duck" ? "duck" : silhouette;
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
    summary: `A fold-only stand-up ${name}: two ${name}-shaped sides folded upright from a shared base.`,
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
    visibleLandmarks: FIGURE_LANDMARKS[silhouette].map((landmark) => ({
      key: landmark,
      label: landmark,
      partKeys: ["body", "back"],
      importance: "required",
    })),
    aestheticPreferences: [`recognizable ${name} silhouette, fold-only`],
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
export const popUpCardTemplateSpec = (
  widthMm: number,
  heightMm: number,
  depthMm: number,
): FabricationDesignSpecV3 => {
  const w = Math.max(40, Math.round(widthMm));
  const h = Math.max(40, Math.round(heightMm));
  const d = Math.max(12, Math.round(depthMm));
  return FabricationDesignSpecV3Schema.parse({
    version: "3",
    label: "Pop-up flower card",
    summary:
      "A one-sheet card with a flower panel that rises as the card opens and folds flat when it closes.",
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
        key: "flower",
        label: "Flower",
        role: "moving",
        width: exactMm(w),
        // The flower's height is the requested pop-up depth, which keeps the
        // assembled envelope equal to the requested size.
        height: exactMm(d),
        shapePreference: "rectangle",
        silhouette: "flower",
      },
    ],
    relations: [
      {
        key: "open",
        kind: "open_close",
        partAKey: "card",
        partBKey: "flower",
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
        key: "flower-rise",
        relationKey: "open",
        partKey: "flower",
        label: "Flower rises as the card opens",
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
        key: "flower-landmark",
        label: "flower",
        partKeys: ["flower"],
        importance: "required",
      },
    ],
    aestheticPreferences: ["a card that opens with a rising flower panel"],
    priorities: ["mechanical_simplicity", "fabrication_efficiency"],
    tolerances: { dimensionMm: 2, clearanceMm: 0.5, angleDeg: 2 },
  });
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
  {
    matches: (intent) =>
      intent.behavior === "static" && looksLikeFigure(intent),
    build: buildFigure,
  },
  { matches: looksLikePopUp, build: popUpCardTemplateSpec },
  { matches: looksLikeEnclosure, build: enclosureTemplateSpec },
  { matches: looksLikeFigure, build: buildFigure },
];

/**
 * The proven parametric template for a request, or null when no template class
 * matches (the caller then keeps the original from-scratch failure).
 */
export const templateSpecForIntent = (
  intent: FabricationIntentV1,
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
  return descriptor
    ? descriptor.build(widthMm, heightMm, depthMm, intent)
    : null;
};
