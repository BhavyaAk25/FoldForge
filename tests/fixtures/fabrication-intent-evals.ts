import type { FabricationIntentV1 } from "@/core/fabrication/types";

export interface FabricationIntentEvalCase {
  readonly caseId: string;
  readonly prompt: string;
  readonly expectedStatus: FabricationIntentV1["scopeStatus"];
  readonly expected: {
    readonly widthMm: number;
    readonly heightMm: number;
    readonly depthMm: number;
    readonly behavior: FabricationIntentV1["behavior"];
    readonly maximumSheets: number;
    readonly glueAllowed: boolean;
    readonly cutsAllowed: boolean;
  };
  readonly mockedIntent: FabricationIntentV1;
}

const A4_SHEET = {
  sheetId: "sheet-a4-eval",
  widthMm: 210,
  heightMm: 297,
  printableMarginMm: 5,
  material: {
    materialId: "eval-cardstock",
    label: "0.4 mm evaluation cardstock",
    thicknessMm: 0.4,
    grainDirection: "y" as const,
  },
};

const behaviors = [
  ["stays fixed", "static"],
  ["opens and closes", "open_close"],
  ["uses one flap", "flap"],
  ["rotates", "rotate"],
  ["slides", "slide"],
  ["expands and collapses", "expand_collapse"],
] as const;

const objectLabels = [
  "desk organizer",
  "sample holder",
  "display sign",
  "gift carton",
  "sorting tray",
] as const;

const supportedCase = (index: number): FabricationIntentEvalCase => {
  const imperial = index % 2 === 1;
  const width = imperial ? 3 + (index % 4) * 0.5 : 80 + (index % 5) * 10;
  const height = imperial ? 2.5 + (index % 3) * 0.5 : 60 + (index % 4) * 10;
  const depth = imperial ? 0.5 + (index % 3) * 0.25 : 15 + (index % 4) * 5;
  const unit = imperial ? "in" : "mm";
  const scale = imperial ? 25.4 : 1;
  const expected = {
    widthMm: width * scale,
    heightMm: height * scale,
    depthMm: depth * scale,
    behavior: behaviors[index % behaviors.length]![1],
    maximumSheets: 1,
    glueAllowed: false,
    cutsAllowed: true,
  } as const;
  const label = objectLabels[index % objectLabels.length]!;
  const prompt = `Design a ${label}, ${width} ${unit} wide by ${height} ${unit} high by ${depth} ${unit} deep, that ${behaviors[index % behaviors.length]![0]}. Use one A4 cardstock sheet, allow cuts, and use no glue.`;
  const caseId = `supported-${String(index + 1).padStart(3, "0")}`;
  return {
    caseId,
    prompt,
    expectedStatus: "supported",
    expected,
    mockedIntent: {
      version: "1",
      intentId: `intent-eval-${caseId}`,
      sourcePrompt: prompt,
      title: `Evaluation ${label}`,
      objectLabel: label,
      functionalGoal: `${behaviors[index % behaviors.length]![0]} within the stated envelope.`,
      visualDescription: `A bounded flat-sheet ${label}.`,
      behavior: expected.behavior,
      requestedSize: {
        widthMm: expected.widthMm,
        heightMm: expected.heightMm,
        depthMm: expected.depthMm,
      },
      stockOptions: [A4_SHEET],
      fabricationBudget: {
        maximumSheets: expected.maximumSheets,
        maximumPanels: 12,
        maximumJointAndConnectorCount: 12,
        cutsAllowed: expected.cutsAllowed,
        glueAllowed: expected.glueAllowed,
      },
      semanticConstraints: [],
      priorities: ["fabrication_efficiency", "mechanical_simplicity"],
      scopeStatus: "supported",
      clarificationQuestion: null,
      unsupportedReason: null,
    },
  };
};

export const SUPPORTED_FABRICATION_INTENT_CASES = Object.freeze(
  Array.from({ length: 100 }, (_, index) => supportedCase(index)),
);

const unsupportedPrompts = [
  "Make a powered cardboard robot with motors and sensors.",
  "Create an unrestricted smooth sculpture as a watertight production mesh.",
  "Design a paper spring and guarantee its force for ten thousand cycles.",
  "Build a four-driver closed-loop linkage with arbitrary constraints.",
  "Make a fabric mechanism whose cloth deformation is physically accurate.",
] as const;

const clarificationPrompts = [
  "Make a box for my product.",
  "Create a moving display but choose all essential dimensions for me.",
  "Design a fitted insert without knowing the object size.",
  "Make a fold-flat holder with an unspecified required travel.",
  "Create a carton but do not assume its width, height, or depth.",
] as const;

const boundaryCase = (
  index: number,
  status: "unsupported" | "needs_clarification",
): FabricationIntentEvalCase => {
  const prompt =
    status === "unsupported"
      ? unsupportedPrompts[index % unsupportedPrompts.length]!
      : clarificationPrompts[index % clarificationPrompts.length]!;
  const caseId = `${status}-${String(index + 1).padStart(3, "0")}`;
  const expected = {
    widthMm: 100,
    heightMm: 100,
    depthMm: 25,
    behavior: "static" as const,
    maximumSheets: 1,
    glueAllowed: false,
    cutsAllowed: true,
  };
  return {
    caseId,
    prompt,
    expectedStatus: status,
    expected,
    mockedIntent: {
      version: "1",
      intentId: `intent-eval-${caseId}`,
      sourcePrompt: prompt,
      title: "Boundary evaluation request",
      objectLabel: "unresolved fabrication request",
      functionalGoal: "Refuse or clarify without inventing essential intent.",
      visualDescription: "No fabricated geometry is authorized yet.",
      behavior: "static",
      requestedSize: { widthMm: 100, heightMm: 100, depthMm: 25 },
      stockOptions: [A4_SHEET],
      fabricationBudget: {
        maximumSheets: 1,
        maximumPanels: 12,
        maximumJointAndConnectorCount: 12,
        cutsAllowed: true,
        glueAllowed: false,
      },
      semanticConstraints: [],
      priorities: ["mechanical_simplicity"],
      scopeStatus: status,
      clarificationQuestion:
        status === "needs_clarification"
          ? "What are the required width, height, depth, and motion range?"
          : null,
      unsupportedReason:
        status === "unsupported"
          ? "The request requires behavior outside the bounded rigid flat-sheet grammar."
          : null,
    },
  };
};

export const BOUNDARY_FABRICATION_INTENT_CASES = Object.freeze([
  ...Array.from({ length: 20 }, (_, index) =>
    boundaryCase(index, "unsupported"),
  ),
  ...Array.from({ length: 20 }, (_, index) =>
    boundaryCase(index, "needs_clarification"),
  ),
]);

export const ALL_FABRICATION_INTENT_CASES = Object.freeze([
  ...SUPPORTED_FABRICATION_INTENT_CASES,
  ...BOUNDARY_FABRICATION_INTENT_CASES,
]);
