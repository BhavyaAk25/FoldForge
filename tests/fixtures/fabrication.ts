import type {
  FabricationIntentV1,
  FabricationProgramV1,
  SheetV1,
} from "@/core/fabrication/types";

export const fixtureSheet = (): SheetV1 => ({
  sheetId: "sheet-a",
  widthMm: 300,
  heightMm: 240,
  printableMarginMm: 5,
  material: {
    materialId: "card-030",
    label: "0.30 mm card",
    thicknessMm: 0.3,
    grainDirection: "y",
  },
});

export const fixtureIntent = (): FabricationIntentV1 => {
  const sheet = fixtureSheet();
  return {
    version: "1",
    intentId: "intent-winged-display",
    sourcePrompt:
      "Make a flat-sheet display with one wing that opens 90 degrees.",
    title: "Winged display",
    objectLabel: "display",
    functionalGoal: "Open one side wing from a flat base.",
    visualDescription: "A rectangular base with one articulated side wing.",
    behavior: "flap",
    requestedSize: { widthMm: 110, heightMm: 60, depthMm: 30 },
    stockOptions: [sheet],
    fabricationBudget: {
      maximumSheets: 1,
      maximumPanels: 4,
      maximumJointAndConnectorCount: 4,
      cutsAllowed: true,
      glueAllowed: false,
    },
    semanticConstraints: [],
    priorities: ["mechanical_simplicity", "fabrication_efficiency"],
    scopeStatus: "supported",
    clarificationQuestion: null,
    unsupportedReason: null,
  };
};

const identityTransform = {
  translationMm: { xMm: 0, yMm: 0, zMm: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
} as const;

export const fixtureProgram = (): FabricationProgramV1 => {
  const sheet = fixtureSheet();
  const coupling = {
    couplingId: "coupling-wing",
    kind: "direct_ratio",
    inputJointId: "joint-wing",
    outputJointIds: ["joint-wing"],
    ratio: 1,
    offset: 0,
    offsetUnit: "deg",
  } as const;
  return {
    version: "1",
    programId: "program-winged-display",
    intentId: "intent-winged-display",
    candidateLabel: "Mechanically simple",
    topologyId: "two-panel-fold",
    topologyVersion: 1,
    behavior: "flap",
    sheets: [sheet],
    modules: [],
    connections: [],
    blueprint: {
      panels: [
        {
          panelId: "panel-base",
          sheetId: sheet.sheetId,
          bodyId: "body-base",
          label: "Base",
          role: "structural",
          widthMm: 80,
          heightMm: 60,
          contour: {
            vertices: [
              { u: 0, v: 0 },
              { u: 1, v: 0 },
              { u: 1, v: 1 },
              { u: 0, v: 1 },
            ],
          },
          innerCutContours: [],
          flatTransform: {
            translationMm: { xMm: 80, yMm: 90 },
            rotationDeg: 0,
          },
          semanticPartIds: ["part-base"],
        },
        {
          panelId: "panel-wing",
          sheetId: sheet.sheetId,
          bodyId: "body-wing",
          label: "Opening wing",
          role: "output",
          widthMm: 30,
          heightMm: 60,
          contour: {
            vertices: [
              { u: 0, v: 0 },
              { u: 1, v: 0 },
              { u: 1, v: 1 },
              { u: 0, v: 1 },
            ],
          },
          innerCutContours: [],
          flatTransform: {
            translationMm: { xMm: 160, yMm: 90 },
            rotationDeg: 0,
          },
          semanticPartIds: ["part-wing"],
        },
      ],
      bodies: [
        {
          bodyId: "body-base",
          label: "Grounded base",
          panelIds: ["panel-base"],
          initialTransform: identityTransform,
          grounded: true,
          semanticPartIds: ["part-base"],
        },
        {
          bodyId: "body-wing",
          label: "Moving wing",
          panelIds: ["panel-wing"],
          initialTransform: identityTransform,
          grounded: false,
          semanticPartIds: ["part-wing"],
        },
      ],
      joints: [
        {
          jointId: "joint-wing",
          kind: "fold",
          parentBodyId: "body-base",
          childBodyId: "body-wing",
          axis: {
            startMm: { xMm: 160, yMm: 90, zMm: 0 },
            endMm: { xMm: 160, yMm: 150, zMm: 0 },
          },
          creasePathId: "crease-wing",
          foldDirection: "valley",
          homeAngleDeg: 0,
          minAngleDeg: 0,
          maxAngleDeg: 90,
        },
      ],
      connectors: [],
      driver: {
        driverId: "driver-wing",
        jointId: "joint-wing",
        label: "Open wing",
        control: "fold",
        minimumValue: 0,
        maximumValue: 90,
        homeValue: 0,
        unit: "deg",
        direction: 1,
      },
      outputs: [
        {
          outputId: "output-wing",
          jointId: "joint-wing",
          bodyId: "body-wing",
          label: "Wing angle",
          minimumValue: 0,
          maximumValue: 90,
          unit: "deg",
          direction: 1,
        },
      ],
      couplings: [coupling],
      semanticParts: [
        {
          semanticPartId: "part-base",
          label: "Base",
          role: "support",
          geometryRefs: [{ kind: "panel", id: "panel-base" }],
        },
        {
          semanticPartId: "part-wing",
          label: "Wing",
          role: "moving output",
          geometryRefs: [{ kind: "panel", id: "panel-wing" }],
        },
      ],
      assemblyOperations: [
        {
          operationId: "assembly-fold-wing",
          order: 1,
          kind: "fold",
          targetRefs: [{ kind: "joint", id: "joint-wing" }],
          dependsOnOperationIds: [],
          instruction:
            "Score the shared edge and fold the wing through its full range.",
        },
      ],
    },
    semanticConstraints: [],
    assemblyStrategy: "fold_only",
    designSummary: "Two topology-defined panels joined by one integral fold.",
  };
};
