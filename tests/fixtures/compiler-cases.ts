import type { RawConstraintCompilation } from "@/server/ai/contracts";

type ExpectedStatus =
  "ready" | "needs_clarification" | "unsupported" | "infeasible";

export interface CompilerCase {
  readonly name: string;
  readonly raw: RawConstraintCompilation;
  readonly expectedStatus: ExpectedStatus;
}

const length = (
  value: number | null,
  unit: "mm" | "cm" | "in" | null,
  evidence: string,
) => ({ value, unit, evidence });

const mass = (
  value: number | null,
  unit: "g" | "kg" | "oz" | "lb" | null,
  evidence: string,
) => ({ value, unit, evidence });

export const BASE_RAW_COMPILATION: RawConstraintCompilation = {
  objectWidth: length(71.5, "mm", "71.5 mm wide"),
  objectHeight: length(147.6, "mm", "147.6 mm tall"),
  objectDepth: length(7.8, "mm", "7.8 mm deep"),
  objectMass: mass(172, "g", "172 g"),
  orientation: "portrait",
  targetViewingAngleDeg: 65,
  angleToleranceDeg: 5,
  sheetWidth: length(215.9, "mm", "US Letter width"),
  sheetHeight: length(279.4, "mm", "US Letter height"),
  printableMargin: length(6.35, "mm", "quarter inch margin"),
  materialProfile: "cover_110lb",
  maximumActiveCreaseCount: 5,
  cutsAllowed: true,
  maximumCutCount: 2,
  glueAllowed: false,
  mustFoldFlat: true,
  priorities: ["stability", "simplicity", "compactness"],
  explicitRequirements: ["phone stand", "no glue"],
  inferredDefaults: [],
  unresolvedQuestions: [],
  contradictoryRequirements: [],
  supportedScopeStatus: "supported",
  feasibilityStatus: "feasible",
  clarifyingQuestion: "",
  interpretationSummary: "A supported portrait phone stand.",
};

const withRaw = (
  name: string,
  update: Partial<RawConstraintCompilation>,
  expectedStatus: ExpectedStatus = "ready",
): CompilerCase => ({
  name,
  raw: { ...BASE_RAW_COMPILATION, ...update },
  expectedStatus,
});

const missing = (
  field: "objectWidth" | "objectHeight" | "objectDepth" | "objectMass",
): CompilerCase =>
  withRaw(
    `missing ${field}`,
    {
      [field]:
        field === "objectMass"
          ? mass(null, null, "not provided")
          : length(null, null, "not provided"),
      supportedScopeStatus: "needs_clarification",
      feasibilityStatus: "unknown",
      unresolvedQuestions: [`Missing ${field}`],
      clarifyingQuestion: "What are the missing device measurements and units?",
    },
    "needs_clarification",
  );

export const COMPILER_CASES: readonly CompilerCase[] = [
  withRaw("metric millimetres", {}),
  withRaw("metric centimetres", {
    objectWidth: length(7.15, "cm", "7.15 cm"),
    objectHeight: length(14.76, "cm", "14.76 cm"),
    objectDepth: length(0.78, "cm", "0.78 cm"),
  }),
  withRaw("imperial inches", {
    objectWidth: length(2.815, "in", "2.815 inches"),
    objectHeight: length(5.811, "in", "5.811 inches"),
    objectDepth: length(0.307, "in", "0.307 inches"),
  }),
  withRaw("mixed length units", {
    objectWidth: length(7.15, "cm", "7.15 cm"),
    objectHeight: length(5.811, "in", "5.811 inches"),
    objectDepth: length(7.8, "mm", "7.8 mm"),
  }),
  withRaw("mass kilograms", { objectMass: mass(0.172, "kg", "0.172 kg") }),
  withRaw("mass ounces", { objectMass: mass(6.067, "oz", "6.067 oz") }),
  withRaw("mass pounds", { objectMass: mass(0.379, "lb", "0.379 lb") }),
  withRaw("portrait request", { orientation: "portrait" }),
  withRaw("landscape request", { orientation: "landscape" }),
  withRaw("default orientation", { orientation: null }),
  withRaw("default angle", {
    targetViewingAngleDeg: null,
    angleToleranceDeg: null,
  }),
  withRaw("A4 sheet", {
    sheetWidth: length(210, "mm", "A4"),
    sheetHeight: length(297, "mm", "A4"),
  }),
  withRaw("default Letter sheet", {
    sheetWidth: length(null, null, "not provided"),
    sheetHeight: length(null, null, "not provided"),
  }),
  withRaw("no cuts", { cutsAllowed: false, maximumCutCount: 0 }),
  withRaw("no glue", { glueAllowed: false }),
  withRaw("four-crease limit", { maximumActiveCreaseCount: 4 }),
  withRaw(
    "contradictory requirements",
    {
      contradictoryRequirements: [
        "No cuts and dual locking slots are both mandatory",
      ],
      feasibilityStatus: "infeasible",
    },
    "infeasible",
  ),
  withRaw(
    "unsupported laptop",
    {
      supportedScopeStatus: "unsupported",
      feasibilityStatus: "infeasible",
      interpretationSummary: "Laptop stands are outside the supported family.",
    },
    "unsupported",
  ),
  withRaw(
    "unsupported heavy tablet",
    { objectMass: mass(0.75, "kg", "0.75 kg") },
    "unsupported",
  ),
  missing("objectWidth"),
  missing("objectHeight"),
  missing("objectDepth"),
  missing("objectMass"),
  withRaw("light tablet", {
    objectWidth: length(135, "mm", "135 mm"),
    objectHeight: length(210, "mm", "210 mm"),
    objectDepth: length(8, "mm", "8 mm"),
    objectMass: mass(420, "g", "420 g"),
  }),
  withRaw(
    "impossibly small sheet",
    {
      sheetWidth: length(100, "mm", "100 mm"),
      sheetHeight: length(120, "mm", "120 mm"),
    },
    "infeasible",
  ),
  withRaw("unsupported angle", { targetViewingAngleDeg: 85 }, "infeasible"),
  withRaw("65 lb cover", { materialProfile: "cover_65lb" }),
  withRaw("simplicity priority", { priorities: ["simplicity"] }),
];
