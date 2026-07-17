import type { ExpectedLiveIntentConstraints } from "./live-constraint-evidence";

export interface LiveReadinessCaseDefinition {
  readonly caseId: string;
  readonly prompt: string;
  readonly expected: ExpectedLiveIntentConstraints;
  readonly requiresRepairEvidence: boolean;
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
  },
];
