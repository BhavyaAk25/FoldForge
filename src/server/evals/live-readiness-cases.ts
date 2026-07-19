import type { ExpectedLiveIntentConstraints } from "./live-constraint-evidence";
import type { LiveAcceptanceContract } from "./live-acceptance-evidence";

export interface LiveReadinessCaseDefinition {
  readonly caseId: string;
  readonly prompt: string;
  readonly expected: ExpectedLiveIntentConstraints;
  readonly requiresRepairEvidence: boolean;
  readonly requiredCandidateCount: 1 | 3;
  readonly acceptanceContract: LiveAcceptanceContract | null;
}

const A3_SHEET_SIZE_MM = { widthMm: 297, heightMm: 420 } as const;

export const LIVE_READINESS_CASES: readonly LiveReadinessCaseDefinition[] = [
  {
    caseId: "live-hinged-counter-display",
    prompt:
      "Design a one-sheet counter display 140 mm wide, 100 mm high, and 45 mm deep. An 80 by 60 mm front flap must rotate from flat to 60 degrees and the whole display must fold flat. Use one 297 by 420 mm sheet of 0.4 mm cardstock, allow cuts, and use no glue.",
    expected: {
      widthMm: 140,
      heightMm: 100,
      depthMm: 45,
      materialThicknessMm: 0.4,
      requiredMaterialTerms: ["cardstock"],
      sheetSizeMm: A3_SHEET_SIZE_MM,
      maximumSheets: 1,
      behavior: "rotate",
      cutsAllowed: true,
      glueAllowed: false,
      motion: { unit: "deg", maximumValue: 60, tolerance: 1 },
      requiredSemanticKinds: ["fold_flat"],
      requiredDimensionTargetsMm: [80, 60],
      requiredDescriptionTerms: ["display", "flap"],
    },
    requiresRepairEvidence: true,
    requiredCandidateCount: 3,
    acceptanceContract: null,
  },
  {
    caseId: "live-organizer",
    prompt:
      "Make a two-sheet desk organizer 210 mm wide, 110 mm high, and 95 mm deep. Pull the front tray 70 mm to open two mirrored side wings. Use two 297 by 420 mm sheets of 0.4 mm cardstock, allow cuts, and use no glue.",
    expected: {
      widthMm: 210,
      heightMm: 110,
      depthMm: 95,
      materialThicknessMm: 0.4,
      requiredMaterialTerms: ["cardstock"],
      sheetSizeMm: A3_SHEET_SIZE_MM,
      maximumSheets: 2,
      behavior: "open_close",
      cutsAllowed: true,
      glueAllowed: false,
      motion: { unit: "mm", maximumValue: 70, tolerance: 1 },
      requiredSemanticKinds: ["symmetry"],
      requiredDimensionTargetsMm: [],
      requiredDescriptionTerms: ["tray", "wing"],
    },
    requiresRepairEvidence: false,
    requiredCandidateCount: 3,
    acceptanceContract: null,
  },
  {
    caseId: "live-sample-sorter",
    prompt:
      "Create a two-sheet sample sorter 190 mm wide, 80 mm high, and 120 mm deep. Sliding a 60 mm front control must separate three rigid trays. Use two 297 by 420 mm sheets of 0.6 mm board, allow cuts, and use no glue.",
    expected: {
      widthMm: 190,
      heightMm: 80,
      depthMm: 120,
      materialThicknessMm: 0.6,
      requiredMaterialTerms: ["board"],
      sheetSizeMm: A3_SHEET_SIZE_MM,
      maximumSheets: 2,
      behavior: "slide",
      cutsAllowed: true,
      glueAllowed: false,
      motion: { unit: "mm", maximumValue: 60, tolerance: 1 },
      requiredSemanticKinds: [],
      requiredDimensionTargetsMm: [],
      requiredDescriptionTerms: ["sorter", "tray"],
    },
    requiresRepairEvidence: false,
    requiredCandidateCount: 3,
    acceptanceContract: null,
  },
  {
    caseId: "live-tabbed-box",
    prompt:
      "Make a one-sheet tab-locked box 120 mm wide, 75 mm high, and 55 mm deep. Use one 297 by 420 mm sheet of 0.4 mm cardstock, allow cuts, and use no glue. The finished box is static.",
    expected: {
      widthMm: 120,
      heightMm: 75,
      depthMm: 55,
      materialThicknessMm: 0.4,
      requiredMaterialTerms: ["cardstock"],
      sheetSizeMm: A3_SHEET_SIZE_MM,
      maximumSheets: 1,
      behavior: "static",
      cutsAllowed: true,
      glueAllowed: false,
      motion: null,
      requiredSemanticKinds: [],
      requiredDimensionTargetsMm: [],
      requiredDescriptionTerms: ["box", "tab"],
    },
    requiresRepairEvidence: false,
    requiredCandidateCount: 3,
    acceptanceContract: null,
  },
  {
    caseId: "live-expanding-display",
    prompt:
      "Build a two-sheet tabletop display 180 mm wide, 130 mm high, and 70 mm deep. A 50 mm pull tab must expand two mirrored side panels by 45 mm and collapse them flat. Use two 297 by 420 mm sheets of 0.5 mm card, allow cuts, and use no glue.",
    expected: {
      widthMm: 180,
      heightMm: 130,
      depthMm: 70,
      materialThicknessMm: 0.5,
      requiredMaterialTerms: ["card"],
      sheetSizeMm: A3_SHEET_SIZE_MM,
      maximumSheets: 2,
      behavior: "expand_collapse",
      cutsAllowed: true,
      glueAllowed: false,
      motion: { unit: "mm", maximumValue: 45, tolerance: 1 },
      requiredSemanticKinds: ["symmetry", "fold_flat"],
      requiredDimensionTargetsMm: [],
      requiredDescriptionTerms: ["display", "panel"],
    },
    requiresRepairEvidence: false,
    requiredCandidateCount: 3,
    acceptanceContract: null,
  },
];

/**
 * A deliberately small acceptance case for proving the complete live path
 * without relabeling a one-case run as the sealed release evaluation.
 */
export const LIVE_SOL_ACCEPTANCE_CASE: LiveReadinessCaseDefinition = {
  caseId: "live-sol-playing-card-box-acceptance",
  prompt:
    "Make a static playing-card box from one sheet of 0.4 mm cardstock. The assembled box must be exactly 70 mm wide, 95 mm high, and 25 mm deep. Use one 210 by 297 mm sheet with 5 mm printable margins, allow cuts, and use no glue. Use a base (the bottom), front, back, left side, right side, and hinged lid. The lid must close with one reciprocal tab-and-slot lock. Keep the construction to exactly six rectangular panels, five fold joints, and that one tab-slot pair. Name the six panel landmarks base, front, back, left, right, and lid. The assembled box is the home state.",
  expected: {
    widthMm: 70,
    heightMm: 95,
    depthMm: 25,
    materialThicknessMm: 0.4,
    requiredMaterialTerms: ["cardstock"],
    sheetSizeMm: { widthMm: 210, heightMm: 297 },
    printableMarginMm: 5,
    maximumSheets: 1,
    behavior: "static",
    cutsAllowed: true,
    glueAllowed: false,
    motion: null,
    requiredSemanticKinds: [],
    requiredDimensionTargetsMm: [],
    requiredDescriptionTerms: ["box", "lid", "tab"],
  },
  requiresRepairEvidence: false,
  requiredCandidateCount: 1,
  acceptanceContract: {
    behavior: "static",
    assemblyStrategy: "tab_slot",
    panels: [
      { name: "base", role: "structural", widthMm: 70, heightMm: 95 },
      { name: "front", role: "structural", widthMm: 70, heightMm: 25 },
      { name: "back", role: "structural", widthMm: 70, heightMm: 25 },
      { name: "left", role: "structural", widthMm: 25, heightMm: 95 },
      { name: "right", role: "structural", widthMm: 25, heightMm: 95 },
      { name: "lid", role: "output", widthMm: 70, heightMm: 95 },
    ],
    foldConnections: [
      { parentPanelName: "base", childPanelName: "front" },
      { parentPanelName: "base", childPanelName: "back" },
      { parentPanelName: "base", childPanelName: "left" },
      { parentPanelName: "base", childPanelName: "right" },
      { parentPanelName: "back", childPanelName: "lid" },
    ],
    connectorPairs: [{ tabPanelName: "lid", slotPanelName: "front" }],
    sheet: {
      widthMm: 210,
      heightMm: 297,
      printableMarginMm: 5,
      stockThicknessMm: 0.4,
    },
    homeEnvelopeSpansMm: [70, 95, 25],
    motion: null,
    exports: {
      foldExpected: false,
      glbAnimationCount: 0,
      glbMotionSampleCount: 0,
    },
  },
};

/**
 * A second, opt-in acceptance case proves the live path can author a real
 * articulated design. It is not run by the default paid acceptance command.
 */
export const LIVE_SOL_MOTION_ACCEPTANCE_CASE: LiveReadinessCaseDefinition = {
  caseId: "live-sol-articulated-flap-acceptance",
  prompt:
    "Make an articulated one-sheet cardstock display with exactly two rectangular panels: a stationary structural base 80 mm wide by 60 mm high and an output flap 30 mm wide by 60 mm high. Join the base's right edge to the flap's left edge with exactly one valley fold and no connectors. Use one fold driver and one output to rotate the flap from flat at 0 degrees to 90 degrees, with 0 degrees as home. The maximum swept envelope must be exactly 110 mm wide, 60 mm high, and 30 mm deep. Use one 210 by 297 mm sheet of 0.4 mm cardstock with 5 mm printable margins, allow cuts, and use no glue.",
  expected: {
    widthMm: 110,
    heightMm: 60,
    depthMm: 30,
    materialThicknessMm: 0.4,
    requiredMaterialTerms: ["cardstock"],
    sheetSizeMm: { widthMm: 210, heightMm: 297 },
    printableMarginMm: 5,
    maximumSheets: 1,
    behavior: "flap",
    cutsAllowed: true,
    glueAllowed: false,
    motion: { unit: "deg", maximumValue: 90, tolerance: 1 },
    requiredSemanticKinds: [],
    requiredDimensionTargetsMm: [80, 60, 30],
    requiredDescriptionTerms: ["display", "flap"],
  },
  requiresRepairEvidence: false,
  requiredCandidateCount: 1,
  acceptanceContract: {
    behavior: "flap",
    assemblyStrategy: "fold_only",
    panels: [
      { name: "base", role: "structural", widthMm: 80, heightMm: 60 },
      { name: "flap", role: "output", widthMm: 30, heightMm: 60 },
    ],
    foldConnections: [{ parentPanelName: "base", childPanelName: "flap" }],
    connectorPairs: [],
    sheet: {
      widthMm: 210,
      heightMm: 297,
      printableMarginMm: 5,
      stockThicknessMm: 0.4,
    },
    homeEnvelopeSpansMm: null,
    motion: {
      control: "fold",
      minimumValue: 0,
      maximumValue: 90,
      homeValue: 0,
      outputCount: 1,
      baseSampleCount: 201,
    },
    exports: {
      foldExpected: true,
      glbAnimationCount: 1,
      glbMotionSampleCount: 11,
    },
  },
};
