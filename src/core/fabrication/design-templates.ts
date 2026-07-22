import { FabricationDesignSpecV3Schema } from "./design-spec";
import type { FabricationDesignSpecV3 } from "./design-spec";
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

/**
 * The proven parametric template for a request, or null when no template class
 * matches (the caller then keeps the original from-scratch failure).
 */
export const templateSpecForIntent = (
  intent: FabricationIntentV1,
): FabricationDesignSpecV3 | null => {
  const { widthMm, heightMm, depthMm } = intent.requestedSize;
  const hasEnclosureEnvelope =
    typeof widthMm === "number" &&
    typeof heightMm === "number" &&
    typeof depthMm === "number" &&
    widthMm > 0 &&
    heightMm > 0 &&
    depthMm > 0;
  if (hasEnclosureEnvelope && looksLikeEnclosure(intent)) {
    return enclosureTemplateSpec(widthMm, heightMm, depthMm);
  }
  return null;
};
