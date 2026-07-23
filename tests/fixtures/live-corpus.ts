import type { FabricationIntentV1 } from "@/core/fabrication/types";

/**
 * A corpus of realistic, PRE-normalization intents + GPT-5.6 Sol design specs
 * captured from (or representative of) the live homepage prompts. Each case
 * must yield a real, verified design through the full
 * intent-normalization -> programs -> compile -> verify path — either the
 * model's own spec built as-is ("synthesis") or the parametric template
 * ("template"). This guards the reliability work: any change that reintroduces
 * `bounded_search_exhausted` for these flagship prompts fails the suite.
 */

export interface LiveCorpusCase {
  readonly name: string;
  readonly intent: FabricationIntentV1;
  readonly designSpec: unknown;
  /** Minimum acceptable outcome: a verified design must be produced. */
  readonly mustProduceDesign: true;
}

const cardstock = (thicknessMm: number) => ({
  materialId: "cardstock",
  label: "Cardstock",
  thicknessMm,
  grainDirection: "none" as const,
});

const a4 = (thicknessMm: number) => [
  {
    sheetId: "sheet-a4",
    widthMm: 210,
    heightMm: 297,
    printableMarginMm: 5,
    material: cardstock(thicknessMm),
  },
];

const budget = {
  maximumSheets: 1,
  maximumPanels: 24,
  maximumJointAndConnectorCount: 24,
  cutsAllowed: true,
  glueAllowed: false,
} as const;

const supported = {
  scopeStatus: "supported" as const,
  clarificationQuestion: null,
  unsupportedReason: null,
};

const dimRange = (value: number) => ({
  minimumMm: value - 1,
  preferredMm: value,
  maximumMm: value + 1,
});

// ── Card box: the exact over-constrained live shape (A4, 0.5 mm, a lock on
// every seam, and a model-invented >=10 mm2 tab/slot contact constraint). ──
const cardBoxOverConstrained = (): LiveCorpusCase => ({
  name: "playing-card box (over-constrained live spec)",
  mustProduceDesign: true,
  intent: {
    version: "1",
    intentId: "intent-card-box",
    sourcePrompt:
      "Make a small box from one sheet of cardstock that holds a standard deck of playing cards. About 70 mm wide, 95 mm tall, 25 mm deep. Add a lid with a tab so it stays closed. Avoid glue.",
    title: "Glue-Free Playing Card Box",
    objectLabel: "playing-card box",
    functionalGoal:
      "A one-sheet cardstock box with an opening lid and a tab closure.",
    visualDescription: "A rectangular cardstock box with a tab-locked lid.",
    behavior: "open_close",
    requestedSize: { widthMm: 70, heightMm: 95, depthMm: 25 },
    stockOptions: a4(0.5),
    fabricationBudget: budget,
    semanticConstraints: [
      {
        constraintId: "constraint-lid-lock-contact",
        hard: true,
        source: "user",
        kind: "contact",
        geometryRefs: [
          { kind: "connector", id: "connector-lid-lock-tab" },
          { kind: "connector", id: "connector-lid-lock-slot" },
        ],
        minimumAreaMm2: 10,
        during: "closed",
      },
    ],
    priorities: ["mechanical_simplicity", "fabrication_efficiency"],
    ...supported,
  },
  designSpec: {
    version: "3",
    label: "Card box",
    summary: "A closed box locked on every seam.",
    parts: [
      { key: "base", label: "base", role: "support", ...boxPart(70, 25) },
      { key: "front", label: "front", role: "wall", ...boxPart(70, 95) },
      { key: "back", label: "back", role: "wall", ...boxPart(70, 95) },
      { key: "left", label: "left", role: "wall", ...boxPart(25, 95) },
      { key: "right", label: "right", role: "wall", ...boxPart(25, 95) },
      { key: "lid", label: "lid", role: "closure", ...boxPart(70, 25) },
    ],
    relations: [
      touch("a1", "base", "front"),
      touch("a2", "base", "back"),
      touch("a3", "base", "left"),
      touch("a4", "base", "right"),
      touch("a5", "front", "left"),
      touch("a6", "front", "right"),
      touch("a7", "back", "left"),
      touch("a8", "back", "right"),
      {
        key: "lid-motion",
        partAKey: "back",
        partBKey: "lid",
        kind: "open_close",
        angleRangeDeg: { minimum: 0, home: 90, maximum: 90 },
      },
      lock("l1", "lid", "front"),
      lock("l2", "front", "left"),
      lock("l3", "front", "right"),
      lock("l4", "back", "left"),
      lock("l5", "base", "front"),
    ],
    materialConstraints: {
      materialLabel: "Cardstock",
      thickness: { minimumMm: 0.5, preferredMm: 0.5, maximumMm: 0.5 },
    },
    sheetConstraints: { minimumSheets: 1, maximumSheets: 1 },
    glueAllowed: false,
    driver: { relationKey: "lid-motion", label: "lid", control: "fold" },
    outputs: [
      { key: "o", relationKey: "lid-motion", partKey: "lid", label: "lid" },
    ],
    visibleLandmarks: [
      { key: "b", label: "base", partKeys: ["base"], importance: "required" },
      { key: "l", label: "lid", partKeys: ["lid"], importance: "required" },
    ],
    aestheticPreferences: ["box"],
    priorities: ["mechanical_simplicity"],
    tolerances: { dimensionMm: 1, clearanceMm: 0.6, angleDeg: 3 },
  },
});

// ── Static faceted duck (a hard-to-synthesize model spec). ──
const facetedDuck = (): LiveCorpusCase => ({
  name: "static faceted duck",
  mustProduceDesign: true,
  intent: {
    version: "1",
    intentId: "intent-duck",
    sourcePrompt:
      "Make a static, faceted duck crease pattern from one sheet of cardstock with a body, head, and beak. Fold-only, no glue.",
    title: "Faceted Duck",
    objectLabel: "faceted duck crease pattern",
    functionalGoal: "A fold-only faceted duck with a body, head, and beak.",
    visualDescription: "A faceted duck silhouette.",
    behavior: "static",
    requestedSize: { widthMm: 120, heightMm: 90, depthMm: 30 },
    stockOptions: a4(0.3),
    fabricationBudget: budget,
    semanticConstraints: [
      {
        constraintId: "constraint-duck-form",
        hard: true,
        source: "user",
        kind: "recognizable_form",
        label: "faceted duck",
        semanticPartIds: ["part-body", "part-head", "part-beak"],
        requiredLandmarks: ["body", "head", "beak"],
        evaluation: "landmark_geometry",
      },
    ],
    priorities: ["mechanical_simplicity"],
    ...supported,
  },
  designSpec: {
    version: "3",
    label: "duck",
    summary: "faceted duck",
    parts: [
      { key: "body", label: "body", role: "structural", ...boxPart(90, 80) },
      { key: "head", label: "head", role: "structural", ...triPart(45, 45) },
      { key: "beak", label: "beak", role: "decorative", ...triPart(22, 15) },
    ],
    relations: [
      {
        key: "bh",
        partAKey: "body",
        partBKey: "head",
        kind: "fold",
        angleRangeDeg: { minimum: 40, home: 45, maximum: 50 },
      },
      {
        key: "hb",
        partAKey: "head",
        partBKey: "beak",
        kind: "fold",
        angleRangeDeg: { minimum: 40, home: 45, maximum: 50 },
      },
    ],
    materialConstraints: {
      materialLabel: "Cardstock",
      thickness: { minimumMm: 0.3, preferredMm: 0.3, maximumMm: 0.3 },
    },
    sheetConstraints: { minimumSheets: 1, maximumSheets: 1 },
    glueAllowed: false,
    driver: null,
    outputs: [],
    visibleLandmarks: [
      { key: "b", label: "body", partKeys: ["body"], importance: "required" },
      { key: "h", label: "head", partKeys: ["head"], importance: "required" },
      { key: "k", label: "beak", partKeys: ["beak"], importance: "required" },
    ],
    aestheticPreferences: ["duck"],
    priorities: ["mechanical_simplicity"],
    tolerances: { dimensionMm: 1, clearanceMm: 0.5, angleDeg: 3 },
  },
});

// ── Pop-up flower card (a coupled five-petal spec the synthesizer can't build). ──
const popUpFlower = (): LiveCorpusCase => ({
  name: "pop-up flower card",
  mustProduceDesign: true,
  intent: {
    version: "1",
    intentId: "intent-flower",
    sourcePrompt:
      "Make a birthday card from one sheet of cardstock. When the card opens, a five-petal flower rises from the center and folds flat when it closes. Fits an A6 envelope.",
    title: "Pop-up Flower Card",
    objectLabel: "pop-up flower card",
    functionalGoal:
      "A card that opens and a flower rises, then folds flat when closed.",
    visualDescription: "A pop-up card with a rising flower.",
    behavior: "open_close",
    requestedSize: { widthMm: 105, heightMm: 148, depthMm: 30 },
    stockOptions: a4(0.3),
    fabricationBudget: budget,
    semanticConstraints: [
      {
        constraintId: "constraint-flower-form",
        hard: true,
        source: "user",
        kind: "recognizable_form",
        label: "pop-up flower card",
        semanticPartIds: ["part-card", "part-flower"],
        requiredLandmarks: ["card", "flower"],
        evaluation: "landmark_geometry",
      },
    ],
    priorities: ["mechanical_simplicity"],
    ...supported,
  },
  designSpec: {
    version: "3",
    label: "flower card",
    summary: "pop-up",
    parts: [
      { key: "card", label: "card", role: "support", ...boxPart(105, 148) },
      { key: "stem", label: "stem", role: "moving", ...boxPart(10, 50) },
      { key: "p1", label: "p1", role: "moving", ...triPart(28, 28) },
      { key: "p2", label: "p2", role: "moving", ...triPart(28, 28) },
      { key: "p3", label: "p3", role: "moving", ...triPart(28, 28) },
    ],
    relations: [
      {
        key: "open",
        partAKey: "card",
        partBKey: "stem",
        kind: "open_close",
        angleRangeDeg: { minimum: 0, home: 90, maximum: 120 },
      },
      {
        key: "f1",
        partAKey: "stem",
        partBKey: "p1",
        kind: "fold",
        angleRangeDeg: { minimum: 30, home: 45, maximum: 60 },
      },
      {
        key: "f2",
        partAKey: "stem",
        partBKey: "p2",
        kind: "fold",
        angleRangeDeg: { minimum: 30, home: 45, maximum: 60 },
      },
      {
        key: "f3",
        partAKey: "stem",
        partBKey: "p3",
        kind: "fold",
        angleRangeDeg: { minimum: 30, home: 45, maximum: 60 },
      },
    ],
    materialConstraints: {
      materialLabel: "Cardstock",
      thickness: { minimumMm: 0.3, preferredMm: 0.3, maximumMm: 0.3 },
    },
    sheetConstraints: { minimumSheets: 1, maximumSheets: 1 },
    glueAllowed: false,
    driver: { relationKey: "open", label: "open", control: "fold" },
    outputs: [
      { key: "out", relationKey: "open", partKey: "stem", label: "rises" },
    ],
    visibleLandmarks: [
      { key: "c", label: "card", partKeys: ["card"], importance: "required" },
      { key: "f", label: "flower", partKeys: ["stem"], importance: "required" },
    ],
    aestheticPreferences: ["flower"],
    priorities: ["mechanical_simplicity"],
    tolerances: { dimensionMm: 1, clearanceMm: 0.5, angleDeg: 3 },
  },
});

function boxPart(widthMm: number, heightMm: number) {
  return {
    width: dimRange(widthMm),
    height: dimRange(heightMm),
    shapePreference: "rectangle" as const,
  };
}

function triPart(widthMm: number, heightMm: number) {
  return {
    width: dimRange(widthMm),
    height: dimRange(heightMm),
    shapePreference: "triangle" as const,
  };
}

function touch(key: string, partAKey: string, partBKey: string) {
  return { key, partAKey, partBKey, kind: "touch" as const };
}

function lock(key: string, partAKey: string, partBKey: string) {
  return {
    key,
    partAKey,
    partBKey,
    kind: "lock" as const,
    lockStyle: "tab_slot" as const,
  };
}

export const liveCorpus = (): readonly LiveCorpusCase[] => [
  cardBoxOverConstrained(),
  facetedDuck(),
  popUpFlower(),
];
