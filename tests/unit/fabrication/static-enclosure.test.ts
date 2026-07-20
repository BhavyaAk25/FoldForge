import { describe, expect, it } from "vitest";

import {
  buildFabricationCandidate,
  finalizeFabricationCandidate,
} from "@/core/fabrication/candidate";
import { compileFabricationProgram } from "@/core/fabrication/compiler";
import {
  dxfArtifactMatchesSource,
  glbArtifactMatchesSource,
  sourceIrHash,
} from "@/core/fabrication/export";
import { evaluateMotionState } from "@/core/fabrication/kinematics";
import { expandFabricationPlan } from "@/core/fabrication/planning";
import type {
  FabricationIntentV1,
  FabricationPlanV1,
  PlannedPanelBlueprintV1,
  Point3Mm,
} from "@/core/fabrication/types";
import { verifyFabricationIr } from "@/core/fabrication/verification";

const rectangle = {
  vertices: [
    { u: 0, v: 0 },
    { u: 1, v: 0 },
    { u: 1, v: 1 },
    { u: 0, v: 1 },
  ],
} as const;

const panel = (
  panelId: string,
  bodyId: string,
  label: string,
  widthMm: number,
  heightMm: number,
  xMm: number,
  yMm: number,
): PlannedPanelBlueprintV1 => ({
  panelId,
  sheetId: "sheet-box",
  bodyId,
  label,
  role: panelId === "panel-lid" ? "output" : "structural",
  widthMm,
  heightMm,
  contour: rectangle,
  innerCutContours: [],
  flatTransform: {
    translationMm: { xMm, yMm },
    rotationDeg: 0,
  },
  semanticPartIds: [`part-${panelId.slice("panel-".length)}`],
});

const identityTransform = {
  translationMm: { xMm: 0, yMm: 0, zMm: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
} as const;

const axis = (startMm: Point3Mm, endMm: Point3Mm) => ({ startMm, endMm });

const intentAndPlan = (): {
  readonly intent: FabricationIntentV1;
  readonly plan: FabricationPlanV1;
} => {
  const sheet = {
    sheetId: "sheet-box",
    widthMm: 216,
    heightMm: 279,
    printableMarginMm: 5,
    material: {
      materialId: "card-035",
      label: "0.35 mm cardstock",
      thicknessMm: 0.35,
      grainDirection: "y" as const,
    },
  };
  const panels = [
    panel("panel-base", "body-base", "Base", 70, 95, 73, 30),
    panel("panel-front", "body-front", "Front wall", 70, 25, 73, 5),
    panel("panel-back", "body-back", "Back wall", 70, 25, 73, 125),
    panel("panel-left", "body-left", "Left wall", 25, 95, 48, 30),
    panel("panel-right", "body-right", "Right wall", 25, 95, 143, 30),
    panel("panel-lid", "body-lid", "Locking lid", 70, 95, 73, 150),
  ];
  const bodies = panels.map((value) => ({
    bodyId: value.bodyId,
    label: `${value.label} body`,
    panelIds: [value.panelId],
    initialTransform: identityTransform,
    grounded: value.bodyId === "body-base",
    semanticPartIds: value.semanticPartIds,
  }));
  const joints = [
    {
      jointId: "joint-front",
      kind: "fold" as const,
      parentBodyId: "body-base",
      childBodyId: "body-front",
      axis: axis({ xMm: 73, yMm: 30, zMm: 0 }, { xMm: 143, yMm: 30, zMm: 0 }),
      creasePathId: "crease-front",
      foldDirection: "valley" as const,
      homeAngleDeg: 90,
      minAngleDeg: 90,
      maxAngleDeg: 90,
    },
    {
      jointId: "joint-back",
      kind: "fold" as const,
      parentBodyId: "body-base",
      childBodyId: "body-back",
      axis: axis({ xMm: 143, yMm: 125, zMm: 0 }, { xMm: 73, yMm: 125, zMm: 0 }),
      creasePathId: "crease-back",
      foldDirection: "valley" as const,
      homeAngleDeg: 90,
      minAngleDeg: 90,
      maxAngleDeg: 90,
    },
    {
      jointId: "joint-left",
      kind: "fold" as const,
      parentBodyId: "body-base",
      childBodyId: "body-left",
      axis: axis({ xMm: 73, yMm: 125, zMm: 0 }, { xMm: 73, yMm: 30, zMm: 0 }),
      creasePathId: "crease-left",
      foldDirection: "valley" as const,
      homeAngleDeg: 90,
      minAngleDeg: 90,
      maxAngleDeg: 90,
    },
    {
      jointId: "joint-right",
      kind: "fold" as const,
      parentBodyId: "body-base",
      childBodyId: "body-right",
      axis: axis({ xMm: 143, yMm: 30, zMm: 0 }, { xMm: 143, yMm: 125, zMm: 0 }),
      creasePathId: "crease-right",
      foldDirection: "valley" as const,
      homeAngleDeg: 90,
      minAngleDeg: 90,
      maxAngleDeg: 90,
    },
    {
      jointId: "joint-lid",
      kind: "fold" as const,
      parentBodyId: "body-back",
      childBodyId: "body-lid",
      axis: axis({ xMm: 143, yMm: 150, zMm: 0 }, { xMm: 73, yMm: 150, zMm: 0 }),
      creasePathId: "crease-lid",
      foldDirection: "valley" as const,
      homeAngleDeg: 90,
      minAngleDeg: 90,
      maxAngleDeg: 90,
    },
  ];
  const connectors = [
    {
      connectorId: "connector-lid-tab",
      kind: "tab" as const,
      panelId: "panel-lid",
      mateConnectorId: "connector-front-slot",
      contour: {
        vertices: [
          { xMm: 28, yMm: 88 },
          { xMm: 42, yMm: 88 },
          { xMm: 42, yMm: 94 },
          { xMm: 28, yMm: 94 },
        ],
      },
      rootEdge: {
        start: { xMm: 28, yMm: 88 },
        end: { xMm: 42, yMm: 88 },
      },
      insertionDirection: { x: 0, y: 1, z: 0 },
      clearanceMm: 0.6,
    },
    {
      connectorId: "connector-front-slot",
      kind: "slot" as const,
      panelId: "panel-front",
      mateConnectorId: "connector-lid-tab",
      centerline: {
        start: { xMm: 27, yMm: 2 },
        end: { xMm: 43, yMm: 2 },
      },
      widthMm: 1.2,
      insertionDirection: { x: 0, y: -1, z: 0 },
      clearanceMm: 0.6,
    },
  ];
  const semanticParts = panels.map((value) => ({
    semanticPartId: value.semanticPartIds[0]!,
    label: value.label,
    role:
      value.panelId === "panel-lid"
        ? "locking lid and insertion tab"
        : value.panelId === "panel-front"
          ? "front wall and receiving slot"
          : "enclosure panel",
    geometryRefs: [
      { kind: "panel" as const, id: value.panelId },
      ...(value.panelId === "panel-lid"
        ? [
            {
              kind: "connector" as const,
              id: "connector-lid-tab",
            },
          ]
        : value.panelId === "panel-front"
          ? [
              {
                kind: "connector" as const,
                id: "connector-front-slot",
              },
            ]
          : []),
    ],
  }));
  const cornerContacts = [
    {
      label: "front-left",
      firstPanelId: "panel-front",
      secondPanelId: "panel-left",
    },
    {
      label: "front-right",
      firstPanelId: "panel-front",
      secondPanelId: "panel-right",
    },
    {
      label: "back-left",
      firstPanelId: "panel-back",
      secondPanelId: "panel-left",
    },
    {
      label: "back-right",
      firstPanelId: "panel-back",
      secondPanelId: "panel-right",
    },
    {
      label: "lid-left",
      firstPanelId: "panel-lid",
      secondPanelId: "panel-left",
    },
    {
      label: "lid-right",
      firstPanelId: "panel-lid",
      secondPanelId: "panel-right",
    },
  ].map(({ label, firstPanelId, secondPanelId }) => ({
    constraintId: `constraint-contact-${label}`,
    kind: "contact" as const,
    hard: true,
    source: "program" as const,
    geometryRefs: [
      { kind: "panel" as const, id: firstPanelId },
      { kind: "panel" as const, id: secondPanelId },
    ],
    minimumAreaMm2: 0,
    during: "rest" as const,
  }));
  const intent: FabricationIntentV1 = {
    version: "1",
    intentId: "intent-static-tab-locked-box",
    sourcePrompt:
      "Make a one-sheet cardstock box about 70 mm wide, 95 mm tall, and 25 mm deep with a locking tab lid.",
    title: "Tab-locked playing-card box",
    objectLabel: "rectangular cardstock box",
    functionalGoal:
      "Enclose a standard deck with four folded walls and a tab-locked lid.",
    visualDescription:
      "A rectangular enclosure with a flush lid and centered insertion tab.",
    behavior: "static",
    requestedSize: { widthMm: 70, heightMm: 95, depthMm: 25 },
    stockOptions: [sheet],
    fabricationBudget: {
      maximumSheets: 1,
      maximumPanels: 6,
      maximumJointAndConnectorCount: 7,
      cutsAllowed: true,
      glueAllowed: false,
    },
    semanticConstraints: cornerContacts,
    priorities: ["mechanical_simplicity", "fabrication_efficiency"],
    scopeStatus: "supported",
    clarificationQuestion: null,
    unsupportedReason: null,
  };
  return {
    intent,
    plan: {
      version: "1",
      candidateLabel: "One-sheet tab-locked enclosure",
      topologyId: "six-panel-fold-tree-with-lid-lock",
      panels,
      bodies,
      joints,
      connectors,
      driver: null,
      outputs: [],
      couplings: [],
      semanticParts,
      assemblyStrategy: "tab_slot",
      designSummary:
        "A continuous cross net folds into four walls and a flush lid secured by one reciprocal tab and slot.",
    },
  };
};

describe("static rectangular enclosure", () => {
  const verifyReducedCorner = (
    panelOverrides: Readonly<
      Partial<Record<string, Partial<PlannedPanelBlueprintV1>>>
    >,
    candidateId: string,
  ) => {
    const { intent, plan } = intentAndPlan();
    const retainedPanelIds = new Set([
      "panel-base",
      "panel-front",
      "panel-left",
    ]);
    const retainedBodyIds = new Set(["body-base", "body-front", "body-left"]);
    const contact = intent.semanticConstraints.find(
      (constraint) =>
        constraint.constraintId === "constraint-contact-front-left",
    );
    if (!contact) throw new Error("Front-left contact fixture missing.");
    const reducedIntent: FabricationIntentV1 = {
      ...intent,
      requestedSize: { widthMm: 70, heightMm: 95, depthMm: 25 },
      fabricationBudget: {
        ...intent.fabricationBudget,
        maximumPanels: 3,
        maximumJointAndConnectorCount: 2,
      },
      semanticConstraints: [contact],
    };
    const reducedPlan: FabricationPlanV1 = {
      ...plan,
      panels: plan.panels
        .filter((value) => retainedPanelIds.has(value.panelId))
        .map((value) => ({
          ...value,
          ...(panelOverrides[value.panelId] ?? {}),
        })),
      bodies: plan.bodies.filter((value) => retainedBodyIds.has(value.bodyId)),
      joints: plan.joints.filter((value) =>
        retainedBodyIds.has(value.childBodyId),
      ),
      connectors: [],
      semanticParts: plan.semanticParts
        .filter((part) =>
          part.geometryRefs.some(
            (reference) =>
              reference.kind === "panel" && retainedPanelIds.has(reference.id),
          ),
        )
        .map((part) => ({
          ...part,
          geometryRefs: part.geometryRefs.filter(
            (reference) =>
              reference.kind !== "connector" &&
              (reference.kind !== "panel" ||
                retainedPanelIds.has(reference.id)),
          ),
        })),
      assemblyStrategy: "fold_only",
    };
    const expanded = expandFabricationPlan(reducedIntent, reducedPlan, 1);
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return null;
    const compiled = compileFabricationProgram(reducedIntent, expanded.value);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return null;
    return verifyFabricationIr(compiled.value, candidateId);
  };

  it("rejects an orthogonal interior crossing beyond a declared boundary seam", () => {
    const report = verifyReducedCorner(
      {
        "panel-front": {
          widthMm: 80,
          flatTransform: {
            translationMm: { xMm: 63, yMm: 5 },
            rotationDeg: 0,
          },
          contour: {
            vertices: [
              { u: 0.125, v: 0 },
              { u: 1, v: 0 },
              { u: 1, v: 1 },
              { u: 0.125, v: 1 },
              { u: 0, v: 0.75 },
              { u: 0.125, v: 0.5 },
            ],
          },
        },
      },
      "candidate-interior-crossing-contact",
    );

    expect(report?.failedAtStage).toBe("collision");
    expect(report?.failures[0]).toMatchObject({
      failureId: "collision.minimum_clearance",
      geometryRefs: expect.arrayContaining([
        { kind: "panel", id: "panel-front" },
        { kind: "panel", id: "panel-left" },
      ]),
    });
  });

  it("rejects a seam whose boundary is inset by 0.2 mm", () => {
    const insetRatio = 0.2 / 95;
    const report = verifyReducedCorner(
      {
        "panel-left": {
          contour: {
            vertices: [
              { u: 0, v: insetRatio },
              { u: 1, v: 0 },
              { u: 1, v: 1 },
              { u: 0, v: 1 - insetRatio },
            ],
          },
        },
      },
      "candidate-inward-contact-seam",
    );

    expect(report?.failedAtStage).toBe("collision");
    expect(report?.failures[0]?.failureId).toBe("collision.minimum_clearance");
  });

  it("rejects a reciprocal connector away from the panel crossing", () => {
    const { intent, plan } = intentAndPlan();
    const expanded = expandFabricationPlan(
      intent,
      {
        ...plan,
        panels: plan.panels.map((value) =>
          value.panelId === "panel-lid" ? { ...value, heightMm: 100 } : value,
        ),
      },
      1,
    );
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return;
    const compiled = compileFabricationProgram(intent, expanded.value);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const report = verifyFabricationIr(
      compiled.value,
      "candidate-connector-away-from-crossing",
    );

    expect(report.failedAtStage).toBe("collision");
    expect(report.failures[0]).toMatchObject({
      failureId: "collision.minimum_clearance",
      geometryRefs: expect.arrayContaining([
        { kind: "panel", id: "panel-front" },
        { kind: "panel", id: "panel-lid" },
      ]),
    });
  });

  it("rejects an assembled lock whose slot is beyond the tab reach", () => {
    const { intent, plan } = intentAndPlan();
    const expanded = expandFabricationPlan(
      intent,
      {
        ...plan,
        connectors: plan.connectors.map((connector) =>
          connector.kind === "slot"
            ? {
                ...connector,
                centerline: {
                  start: { xMm: 27, yMm: 20 },
                  end: { xMm: 43, yMm: 20 },
                },
              }
            : connector,
        ),
      },
      1,
    );
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return;
    const compiled = compileFabricationProgram(intent, expanded.value);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const report = verifyFabricationIr(
      compiled.value,
      "candidate-unreachable-tab-lock",
    );
    expect(report.failedAtStage).toBe("connections");
    expect(
      report.failures.some((failure) =>
        failure.failureId.startsWith("connections.connector_mate_reach"),
      ),
    ).toBe(true);
  });

  it("compiles and verifies one exact tab-locked home state and its exports", () => {
    const { intent, plan } = intentAndPlan();
    const expanded = expandFabricationPlan(intent, plan, 1);
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return;
    const compiled = compileFabricationProgram(intent, expanded.value);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const home = evaluateMotionState(compiled.value);
    expect(home.ok).toBe(true);
    if (!home.ok) return;
    const points = Object.values(home.value.panelVertices).flat();
    const spansMm = {
      width:
        Math.max(...points.map((point) => point.xMm)) -
        Math.min(...points.map((point) => point.xMm)),
      height:
        Math.max(...points.map((point) => point.yMm)) -
        Math.min(...points.map((point) => point.yMm)),
      depth:
        Math.max(...points.map((point) => point.zMm)) -
        Math.min(...points.map((point) => point.zMm)),
    };
    expect(spansMm.width).toBeCloseTo(70, 9);
    expect(spansMm.height).toBeCloseTo(95, 9);
    expect(spansMm.depth).toBeCloseTo(25, 9);

    const candidateId = "candidate-static-tab-locked-box";
    const report = verifyFabricationIr(compiled.value, candidateId);
    expect(report.failures).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.completedStage).toBe("scoring");
    const built = buildFabricationCandidate({
      candidateId,
      intent,
      program: expanded.value,
      selectionStatus: "selected",
      provenance: {
        compilerVersion: "static-enclosure-regression-1",
        generatedAtIso: "2026-07-18T00:00:00.000Z",
        deterministicSeed: 20260714,
        modelId: null,
        modelResponseId: null,
        modelPlanHash: null,
        planExpanderVersion: "2",
        parentCandidateId: null,
        appliedPatchIds: [],
        repairCycle: 0,
      },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const finalized = finalizeFabricationCandidate({
      candidate: built.value,
      requestedFormats: ["svg", "dxf", "glb", "json", "fold"],
    });
    expect(finalized.ok).toBe(true);
    if (!finalized.ok) return;
    expect(finalized.value.foldOmission).toMatchObject({
      code: "connector_semantics",
    });
    expect(finalized.value.candidate.exportMetadata).toMatchObject({
      status: "verified",
      sourceEquivalent: true,
    });
    expect(
      finalized.value.candidate.verification.exportEquivalence.map((check) => [
        check.format,
        check.status,
      ]),
    ).toEqual([
      ["svg", "pass"],
      ["dxf", "pass"],
      ["glb", "pass"],
      ["json", "pass"],
    ]);
    expect(
      finalized.value.artifacts.map((artifact) => artifact.format),
    ).toEqual(["svg", "dxf", "glb", "json"]);
    const dxf = finalized.value.artifacts.find(
      (artifact) => artifact.format === "dxf",
    );
    const glb = finalized.value.artifacts.find(
      (artifact) => artifact.format === "glb",
    );
    expect(dxf?.metadata.sourceIrHash).toBe(sourceIrHash(compiled.value));
    expect(glb?.metadata.sourceIrHash).toBe(sourceIrHash(compiled.value));
    if (!dxf || !glb) return;
    expect(
      dxfArtifactMatchesSource(
        dxf.bytes,
        compiled.value,
        candidateId,
        finalized.value.candidate.provenance,
      ),
    ).toBe(true);
    expect(
      glbArtifactMatchesSource(
        glb.bytes,
        compiled.value,
        candidateId,
        finalized.value.candidate.provenance,
      ),
    ).toBe(true);
  });
});
