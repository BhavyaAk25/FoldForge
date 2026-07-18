import { describe, expect, it } from "vitest";
import { z } from "zod";

import { FABRICATION_LIMITS } from "@/core/fabrication/limits";
import { parseFabricationContract } from "@/core/fabrication/result";
import {
  CandidateV2Schema,
  FabricationIntentV1Schema,
  FabricationIRV1Schema,
  FabricationProgramV1Schema,
  ProgramPatchV1Schema,
  VerificationReportV2Schema,
} from "@/core/fabrication/schemas";
import type {
  CandidateV2,
  ConnectorV1,
  FabricationIRV1,
  FabricationIntentV1,
  FabricationProgramV1,
  FoldJointV1,
  ProgramPatchV1,
  VerificationReportV2,
} from "@/core/fabrication/types";

const HASH = "0".repeat(64);

const sheet = {
  sheetId: "sheet-1",
  widthMm: 216,
  heightMm: 279,
  printableMarginMm: 6,
  material: {
    materialId: "cover-80lb",
    label: "80 lb cover stock",
    thicknessMm: 0.25,
    grainDirection: "y",
  },
} as const;

const intent = {
  version: "1",
  intentId: "intent-1",
  sourcePrompt: "Make a simple folded display with one moving flap.",
  title: "Moving display",
  objectLabel: "display",
  functionalGoal: "Hold a recognizable display and move one flap.",
  visualDescription: "A compact symmetric display.",
  behavior: "flap",
  requestedSize: { widthMm: 120, heightMm: 150, depthMm: 40 },
  stockOptions: [sheet],
  fabricationBudget: {
    maximumSheets: 1,
    maximumPanels: 8,
    maximumJointAndConnectorCount: 8,
    cutsAllowed: true,
    glueAllowed: false,
  },
  semanticConstraints: [],
  priorities: ["mechanical_simplicity", "visual_expression"],
  scopeStatus: "supported",
  clarificationQuestion: null,
  unsupportedReason: null,
} satisfies FabricationIntentV1;

const identityTransform = {
  translationMm: { xMm: 0, yMm: 0, zMm: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
} as const;

const body = {
  bodyId: "body-1",
  label: "Main body",
  panelIds: ["panel-1"],
  initialTransform: identityTransform,
  grounded: true,
  semanticPartIds: ["part-main"],
} as const;

const program = {
  version: "1",
  programId: "program-1",
  intentId: intent.intentId,
  candidateLabel: "Direct declarative candidate",
  topologyId: "model-authored-1",
  topologyVersion: 1,
  behavior: "flap",
  sheets: [sheet],
  modules: [],
  connections: [],
  blueprint: {
    panels: [
      {
        panelId: "panel-1",
        sheetId: sheet.sheetId,
        bodyId: body.bodyId,
        label: "Main panel",
        role: "structural",
        widthMm: 100,
        heightMm: 120,
        contour: {
          vertices: [
            { u: 0, v: 0 },
            { u: 1, v: 0 },
            { u: 0, v: 1 },
          ],
        },
        innerCutContours: [],
        flatTransform: {
          translationMm: { xMm: 10, yMm: 10 },
          rotationDeg: 0,
        },
        semanticPartIds: ["part-main"],
      },
    ],
    bodies: [body],
    joints: [],
    connectors: [],
    driver: null,
    outputs: [],
    couplings: [],
    semanticParts: [
      {
        semanticPartId: "part-main",
        label: "Main silhouette",
        role: "primary form",
        geometryRefs: [{ kind: "panel", id: "panel-1" }],
      },
    ],
    assemblyOperations: [],
  },
  semanticConstraints: [],
  assemblyStrategy: "fold_only",
  designSummary: "Direct panel geometry without a hidden registry template.",
} satisfies FabricationProgramV1;

const ir = {
  version: "1",
  irId: "ir-1",
  programId: program.programId,
  unit: "mm",
  behavior: "flap",
  requestedSize: intent.requestedSize,
  sheets: [sheet],
  paths: [
    {
      pathId: "path-cut-1",
      sheetId: sheet.sheetId,
      panelId: "panel-1",
      kind: "cut",
      points: [
        { xMm: 10, yMm: 10 },
        { xMm: 110, yMm: 10 },
        { xMm: 10, yMm: 130 },
      ],
      closed: true,
      strokeWidthMm: 0.1,
    },
  ],
  panels: [
    {
      panelId: "panel-1",
      sheetId: sheet.sheetId,
      bodyId: body.bodyId,
      label: "Main panel",
      role: "structural",
      contour: {
        vertices: [
          { xMm: 0, yMm: 0 },
          { xMm: 100, yMm: 0 },
          { xMm: 0, yMm: 120 },
        ],
      },
      innerCutContours: [],
      thicknessMm: sheet.material.thicknessMm,
      flatTransform: {
        translationMm: { xMm: 10, yMm: 10 },
        rotationDeg: 0,
      },
      semanticPartIds: ["part-main"],
    },
  ],
  bodies: [body],
  joints: [],
  connectors: [],
  driver: null,
  outputs: [],
  couplings: [],
  semanticParts: program.blueprint.semanticParts,
  semanticConstraints: [],
  assemblyOperations: [],
} satisfies FabricationIRV1;

const report = {
  version: "2",
  reportId: "report-1",
  candidateId: "candidate-1",
  programId: program.programId,
  irId: ir.irId,
  irHash: HASH,
  valid: true,
  completedStage: "scoring",
  failedAtStage: null,
  checks: [
    {
      checkId: "schema.contract",
      stage: "schema",
      status: "pass",
      message: "The canonical contract is valid.",
      actual: { value: true, unit: null },
      expected: { value: true, unit: null },
      geometryRefs: [],
      failureId: null,
    },
  ],
  failures: [],
  metrics: [],
  motionSummary: null,
  exportEquivalence: [],
} satisfies VerificationReportV2;

const patch = {
  version: "1",
  patchId: "patch-1",
  programId: program.programId,
  baseProgramHash: HASH,
  repairCycle: 1,
  diagnosis: "The panel is too narrow for the requested landmark spacing.",
  operations: [
    {
      operationId: "patch-op-1",
      operation: "set_number",
      path: "/blueprint/panels/panel-1/widthMm",
      value: 110,
      expectedCurrentValue: 100,
      unit: "mm",
      failureIds: ["geometry.panel_width#panel-1"],
      reason: "Increase landmark spacing.",
      expectedEffect: "The width check should pass after recompilation.",
    },
  ],
  authoredBy: "ai",
  changesIntent: false,
} satisfies ProgramPatchV1;

const candidate = {
  version: "2",
  candidateId: report.candidateId,
  label: "Verified candidate",
  rank: 1,
  selectionStatus: "eligible",
  intent,
  program,
  ir,
  verification: report,
  score: {
    eligible: true,
    totalScore: 88,
    components: [
      {
        componentId: "simplicity",
        label: "Mechanical simplicity",
        normalizedScore: 88,
        weight: 1,
        weightedScore: 88,
        evidenceCheckIds: ["schema.contract"],
      },
    ],
    rankingReason: "Verified with a simple single-panel topology.",
  },
  provenance: {
    provenanceId: "provenance-1",
    compilerVersion: "0.2.0",
    inputHash: HASH,
    intentHash: HASH,
    programHash: HASH,
    irHash: HASH,
    modelId: "gpt-5.6-sol",
    modelResponseId: "response-1",
    modelPlanHash: HASH,
    planExpanderVersion: "1",
    generatedAtIso: "2026-07-14T12:00:00.000Z",
    deterministicSeed: 20260714,
    parentCandidateId: null,
    appliedPatchIds: [],
    repairCycle: 0,
  },
  exportMetadata: {
    status: "not_generated",
    requestedFormats: [],
    artifacts: [],
    calibrationLengthMm: 100,
    selectedCandidateId: null,
    sourceEquivalent: false,
    foldOmissionReason: null,
  },
} satisfies CandidateV2;

const foldJoint = (index: number): FoldJointV1 => ({
  jointId: `joint-${index}`,
  kind: "fold",
  parentBodyId: "body-1",
  childBodyId: "body-1",
  axis: {
    startMm: { xMm: 0, yMm: 0, zMm: 0 },
    endMm: { xMm: 1, yMm: 0, zMm: 0 },
  },
  creasePathId: "path-cut-1",
  foldDirection: "valley",
  homeAngleDeg: 0,
  minAngleDeg: 0,
  maxAngleDeg: 180,
});

const tabConnector = (index: number): ConnectorV1 => ({
  connectorId: `connector-${index}`,
  kind: "tab",
  panelId: "panel-1",
  mateConnectorId: `mate-${index}`,
  contour: {
    vertices: [
      { xMm: 0, yMm: 0 },
      { xMm: 2, yMm: 0 },
      { xMm: 0, yMm: 2 },
    ],
  },
  rootEdge: {
    start: { xMm: 0, yMm: 0 },
    end: { xMm: 2, yMm: 0 },
  },
  insertionDirection: { x: 0, y: 0, z: 1 },
  clearanceMm: 0.5,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const expectStrictRequiredObjects = (schemaNode: unknown): void => {
  if (Array.isArray(schemaNode)) {
    for (const item of schemaNode) expectStrictRequiredObjects(item);
    return;
  }
  if (!isRecord(schemaNode)) return;

  if (schemaNode.type === "object") {
    expect(schemaNode.additionalProperties).toBe(false);
    expect(isRecord(schemaNode.properties)).toBe(true);
    if (isRecord(schemaNode.properties)) {
      const propertyNames = Object.keys(schemaNode.properties).sort();
      const required = Array.isArray(schemaNode.required)
        ? schemaNode.required.map(String).sort()
        : [];
      expect(required).toEqual(propertyNames);
    }
  }

  for (const value of Object.values(schemaNode)) {
    expectStrictRequiredObjects(value);
  }
};

describe("fabrication contract schemas", () => {
  it("accepts all six canonical versioned contracts", () => {
    expect(FabricationIntentV1Schema.parse(intent)).toEqual(intent);
    expect(FabricationProgramV1Schema.parse(program)).toEqual(program);
    expect(FabricationIRV1Schema.parse(ir)).toEqual(ir);
    expect(VerificationReportV2Schema.parse(report)).toEqual(report);
    expect(ProgramPatchV1Schema.parse(patch)).toEqual(patch);
    expect(CandidateV2Schema.parse(candidate)).toEqual(candidate);
  });

  it("emits strict Responses-compatible JSON Schema objects", () => {
    const schemas = [
      FabricationIntentV1Schema,
      FabricationProgramV1Schema,
      FabricationIRV1Schema,
      VerificationReportV2Schema,
      ProgramPatchV1Schema,
      CandidateV2Schema,
    ] as const;

    for (const schema of schemas) {
      expectStrictRequiredObjects(z.toJSONSchema(schema));
    }
  });

  it("requires nullable properties and rejects additional properties", () => {
    const withoutNullable = { ...intent };
    Reflect.deleteProperty(withoutNullable, "clarificationQuestion");
    expect(FabricationIntentV1Schema.safeParse(withoutNullable).success).toBe(
      false,
    );

    const withExtra = {
      ...program,
      blueprint: {
        ...program.blueprint,
        panels: [
          {
            ...program.blueprint.panels[0],
            hiddenTemplateName: "stand",
          },
        ],
      },
    };
    expect(FabricationProgramV1Schema.safeParse(withExtra).success).toBe(false);
  });

  it("bounds model-authored normalized contours and panel vertices", () => {
    const outOfRange = {
      ...program,
      blueprint: {
        ...program.blueprint,
        panels: [
          {
            ...program.blueprint.panels[0],
            contour: {
              vertices: [
                { u: 0, v: 0 },
                { u: 1.01, v: 0 },
                { u: 0, v: 1 },
              ],
            },
          },
        ],
      },
    };
    expect(FabricationProgramV1Schema.safeParse(outOfRange).success).toBe(
      false,
    );

    const tooManyVertices = {
      ...ir,
      panels: [
        {
          ...ir.panels[0],
          contour: {
            vertices: Array.from(
              { length: FABRICATION_LIMITS.maximumVerticesPerPanel + 1 },
              (_, index) => ({ xMm: index, yMm: index % 2 }),
            ),
          },
        },
      ],
    };
    expect(FabricationIRV1Schema.safeParse(tooManyVertices).success).toBe(
      false,
    );
  });

  it("enforces the combined joint and connector limit", () => {
    const overLimit = {
      ...ir,
      joints: Array.from({ length: 13 }, (_, index) => foldJoint(index)),
      connectors: Array.from({ length: 12 }, (_, index) => tabConnector(index)),
    };
    const result = FabricationIRV1Schema.safeParse(overLimit);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === "connectors"),
      ).toBe(true);
    }
  });

  it("enforces output, repair-cycle, and patch-operation limits", () => {
    const tooManyOutputs = {
      ...ir,
      outputs: Array.from(
        { length: FABRICATION_LIMITS.maximumOutputCount + 1 },
        (_, index) => ({
          outputId: `output-${index}`,
          jointId: `joint-${index}`,
          bodyId: "body-1",
          label: `Output ${index}`,
          minimumValue: 0,
          maximumValue: 10,
          unit: "mm" as const,
          direction: 1 as const,
        }),
      ),
    };
    expect(FabricationIRV1Schema.safeParse(tooManyOutputs).success).toBe(false);

    expect(
      ProgramPatchV1Schema.safeParse({
        ...patch,
        repairCycle: FABRICATION_LIMITS.maximumRepairCycles + 1,
      }).success,
    ).toBe(false);
    expect(
      ProgramPatchV1Schema.safeParse({
        ...patch,
        operations: Array.from(
          { length: FABRICATION_LIMITS.maximumPatchOperationsPerCycle + 1 },
          (_, index) => ({
            ...patch.operations[0],
            operationId: `patch-op-${index}`,
          }),
        ),
      }).success,
    ).toBe(false);
  });

  it("does not allow hard failures to be labelled valid", () => {
    const contradictoryReport = {
      ...report,
      failures: [
        {
          failureId: "collision.panel_overlap#panel-1",
          category: "collision",
          stage: "collision",
          severity: "hard",
          message: "Two panels intersect during motion.",
          actual: { value: true, unit: null },
          expected: { value: false, unit: null },
          geometryRefs: [{ kind: "panel", id: "panel-1" }],
          repairableProgramPaths: [
            "/blueprint/panels/panel-1/flatTransform/translationMm/xMm",
          ],
        },
      ],
    };
    expect(
      VerificationReportV2Schema.safeParse(contradictoryReport).success,
    ).toBe(false);

    expect(
      CandidateV2Schema.safeParse({
        ...candidate,
        verification: {
          ...report,
          valid: false,
          failedAtStage: "collision",
        },
      }).success,
    ).toBe(false);
  });

  it("returns exhaustive typed parse failures instead of throwing", () => {
    const result = parseFabricationContract(
      "FabricationIntentV1",
      FabricationIntentV1Schema,
      { ...intent, version: "99" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("contract_validation");
      expect(result.error.contract).toBe("FabricationIntentV1");
      expect(result.error.issues[0]?.path).toContain("version");
    }
  });
});
