import { normalizeFabricationIntentFeasibility } from "./feasibility-normalization";
import { sha256Hex } from "../sha256";
import {
  FIGURE_SILHOUETTE_KEYWORDS,
  FIGURE_LANDMARKS,
  figureSilhouetteForText,
} from "./silhouettes";
import type { FabricationIntentV1, SemanticConstraintV1 } from "./types";

/**
 * Deterministic prompt reader used when no AI provider is configured (or the
 * provider fails). It recognizes the three object classes that have proven
 * parametric templates and reads an optional "W x H x D" size. Anything else
 * returns null so the caller can say honestly that the prompt needs AI.
 */

export type PromptTemplateClass = "enclosure" | "pop_up_card" | "figure";

interface ClassProfile {
  readonly keywords: readonly string[];
  readonly title: string;
  readonly behavior: FabricationIntentV1["behavior"];
  readonly defaultSizeMm: readonly [number, number, number];
  readonly functionalGoal: string;
  readonly visualDescription: string;
  readonly landmarks: readonly string[];
}

// Ordered by precedence: a "pop-up card box" is a card, a "duck box" is a box.
const PROFILES: Readonly<Record<PromptTemplateClass, ClassProfile>> = {
  pop_up_card: {
    keywords: [
      "pop-up",
      "pop up",
      "popup",
      "greeting card",
      "birthday card",
      "flower card",
      "card that opens",
    ],
    title: "Pop-up card",
    behavior: "open_close",
    defaultSizeMm: [105, 148, 30],
    functionalGoal:
      "A card that raises a panel as it opens and folds flat when closed.",
    visualDescription: "A folded card with a rising pop-up panel.",
    landmarks: ["card", "flower"],
  },
  enclosure: {
    keywords: [
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
    ],
    title: "Folded box",
    behavior: "open_close",
    defaultSizeMm: [90, 60, 40],
    functionalGoal: "A single-sheet box with a hinged, tab-locked lid.",
    visualDescription: "A rectangular folded enclosure.",
    landmarks: [],
  },
  figure: {
    // Matched through figureSilhouetteForText; listed for documentation.
    keywords: Object.values(FIGURE_SILHOUETTE_KEYWORDS).flat(),
    title: "Stand-up figure",
    behavior: "static",
    defaultSizeMm: [120, 90, 30],
    functionalGoal: "A static stand-up figure folded from one sheet.",
    visualDescription: "Two matching silhouette sides folded up from a base.",
    landmarks: [],
  },
};

const CLASS_ORDER: readonly PromptTemplateClass[] = [
  "pop_up_card",
  "enclosure",
  "figure",
];

export const promptTemplateClass = (
  prompt: string,
): PromptTemplateClass | null => {
  const text = prompt.toLowerCase();
  return (
    CLASS_ORDER.find((templateClass) =>
      templateClass === "figure"
        ? figureSilhouetteForText(text) !== null
        : PROFILES[templateClass].keywords.some((keyword) =>
            text.includes(keyword),
          ),
    ) ?? null
  );
};

/** Title and landmarks for the class, specialized by figure silhouette. */
const profileFor = (
  templateClass: PromptTemplateClass,
  prompt: string,
): ClassProfile => {
  const profile = PROFILES[templateClass];
  if (templateClass !== "figure") return profile;
  const silhouette = figureSilhouetteForText(prompt) ?? "duck";
  return {
    ...profile,
    title: `Stand-up ${silhouette}`,
    functionalGoal: `A static stand-up ${silhouette} folded from one sheet.`,
    visualDescription: `Two ${silhouette}-shaped sides folded up from a base.`,
    landmarks: FIGURE_LANDMARKS[silhouette],
  };
};
const UNIT_TO_MM: Readonly<Record<string, number>> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  inch: 25.4,
  inches: 25.4,
  '"': 25.4,
};

const NUMBER = String.raw`(\d+(?:\.\d+)?)`;
const SEPARATOR = String.raw`\s*(?:x|×|by|\*)\s*`;
const UNIT = String.raw`\s*(mm|cm|inches|inch|in|")?`;
const SIZE_PATTERN = new RegExp(
  `${NUMBER}${UNIT}${SEPARATOR}${NUMBER}${UNIT}(?:${SEPARATOR}${NUMBER}${UNIT})?`,
  "iu",
);

// A-series card formats (portrait width x height, millimetres).
const PAPER_SIZES_MM: Readonly<Record<string, readonly [number, number]>> = {
  a4: [210, 297],
  a5: [148, 210],
  a6: [105, 148],
};

// Keeps parsed sizes inside what one sheet of the template can realize.
const MINIMUM_SIZE_MM = 10;
const MAXIMUM_SIZE_MM = 400;

const clampSizeMm = (value: number): number =>
  Math.min(MAXIMUM_SIZE_MM, Math.max(MINIMUM_SIZE_MM, Math.round(value)));

// "70 mm wide", "9.5 cm tall", "1 in deep"; each axis read independently.
const AXIS_WORDS: Readonly<Record<"widthMm" | "heightMm" | "depthMm", string>> =
  {
    widthMm: "wide|width|across",
    heightMm: "tall|high|height",
    depthMm: "deep|depth|thick",
  };

const namedAxisMm = (prompt: string, words: string): number | null => {
  const match = new RegExp(
    `${NUMBER}\\s*(mm|cm|inches|inch|in)\\b\\s*(?:${words})\\b`,
    "iu",
  ).exec(prompt);
  const unit = match?.[2]?.toLowerCase();
  return match?.[1] && unit
    ? clampSizeMm(Number(match[1]) * (UNIT_TO_MM[unit] ?? 1))
    : null;
};

/**
 * Reads "W x H [x D]" with optional mm/cm/in units (the last stated unit
 * applies to unitless numbers), per-axis phrases such as "70 mm wide", or an
 * A4/A5/A6 card format.
 */
export const parsePromptSizeMm = (
  prompt: string,
): {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly depthMm: number | null;
} | null => {
  const widthMm = namedAxisMm(prompt, AXIS_WORDS.widthMm);
  const heightMm = namedAxisMm(prompt, AXIS_WORDS.heightMm);
  if (widthMm !== null && heightMm !== null) {
    return {
      widthMm,
      heightMm,
      depthMm: namedAxisMm(prompt, AXIS_WORDS.depthMm),
    };
  }
  const match = SIZE_PATTERN.exec(prompt);
  if (match) {
    const units = [match[2], match[4], match[6]].map((unit) =>
      unit?.toLowerCase(),
    );
    const fallbackUnit = units.findLast((unit) => unit !== undefined) ?? "mm";
    const toMm = (
      value: string | undefined,
      unit: string | undefined,
    ): number | null =>
      value === undefined
        ? null
        : clampSizeMm(Number(value) * (UNIT_TO_MM[unit ?? fallbackUnit] ?? 1));
    const widthMm = toMm(match[1], units[0]);
    const heightMm = toMm(match[3], units[1]);
    if (widthMm !== null && heightMm !== null) {
      return { widthMm, heightMm, depthMm: toMm(match[5], units[2]) };
    }
  }
  const paper = /\b(a[4-6])\b/iu.exec(prompt)?.[1]?.toLowerCase();
  const paperSize = paper ? PAPER_SIZES_MM[paper] : undefined;
  return paperSize
    ? { widthMm: paperSize[0], heightMm: paperSize[1], depthMm: null }
    : null;
};

const recognizableForm = (
  profile: ClassProfile,
): readonly SemanticConstraintV1[] =>
  profile.landmarks.length === 0
    ? []
    : [
        {
          constraintId: "constraint-recognizable-form",
          kind: "recognizable_form",
          hard: true,
          source: "user",
          label: profile.title,
          semanticPartIds: profile.landmarks.map(
            (landmark) => `part-${landmark}`,
          ),
          requiredLandmarks: [...profile.landmarks],
          evaluation: "landmark_geometry",
        },
      ];

/** Builds a template-ready intent from a prompt, or null for an unrecognized object. */
export const intentFromPromptKeywords = (
  prompt: string,
): FabricationIntentV1 | null => {
  const templateClass = promptTemplateClass(prompt);
  if (!templateClass) return null;
  const profile = profileFor(templateClass, prompt);
  const parsed = parsePromptSizeMm(prompt);
  const [defaultWidth, defaultHeight, defaultDepth] = profile.defaultSizeMm;
  const sourcePrompt = prompt.trim().slice(0, 4_000);
  return normalizeFabricationIntentFeasibility({
    version: "1",
    intentId: `intent-keyword-${sha256Hex(sourcePrompt).slice(0, 16)}`,
    sourcePrompt,
    title: profile.title,
    objectLabel: profile.title.toLowerCase(),
    functionalGoal: profile.functionalGoal,
    visualDescription: profile.visualDescription,
    behavior: profile.behavior,
    requestedSize: {
      widthMm: parsed?.widthMm ?? defaultWidth,
      heightMm: parsed?.heightMm ?? defaultHeight,
      depthMm:
        parsed?.depthMm ??
        (templateClass === "pop_up_card"
          ? // A pop-up rises about half the card height when no depth is given.
            Math.round((parsed?.heightMm ?? defaultHeight) / 2)
          : defaultDepth),
    },
    stockOptions: [
      {
        sheetId: "sheet-1",
        widthMm: 300,
        heightMm: 300,
        printableMarginMm: 5,
        material: {
          materialId: "cardstock-030",
          label: "Cardstock",
          thicknessMm: 0.3,
          grainDirection: "none",
        },
      },
    ],
    fabricationBudget: {
      maximumSheets: 1,
      maximumPanels: 24,
      maximumJointAndConnectorCount: 24,
      cutsAllowed: true,
      glueAllowed: false,
    },
    semanticConstraints: recognizableForm(profile),
    priorities: ["mechanical_simplicity", "fabrication_efficiency"],
    scopeStatus: "supported",
    clarificationQuestion: null,
    unsupportedReason: null,
  });
};
