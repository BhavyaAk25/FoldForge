import { describe, expect, it } from "vitest";

import {
  compileFabricationProgram,
  fabricationIrHash,
} from "@/core/fabrication/compiler";
import {
  createFacetedDuckGiftBoxShowcase,
  createModularCableOrganizerShowcase,
  createPullTabPopUpFlowerShowcase,
} from "@/core/fabrication/examples";
import {
  cutPathFromShape,
  derivePanelBoundaryCutPaths,
} from "@/core/fabrication/path-topology";
import { transformPoint2 } from "@/core/fabrication/polygon";
import type {
  FabricationIRV1,
  PanelV1,
  SemanticConstraintV1,
} from "@/core/fabrication/types";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

const compile = (
  intent = fixtureIntent(),
  program = fixtureProgram(),
): FabricationIRV1 => {
  const result = compileFabricationProgram(intent, program);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

const organizerIr = (): FabricationIRV1 => {
  const showcase = createModularCableOrganizerShowcase();
  return compile(showcase.intent, showcase.program);
};

const flowerIr = (): FabricationIRV1 => {
  const showcase = createPullTabPopUpFlowerShowcase();
  return compile(showcase.intent, showcase.program);
};

const replacePanelAndOuterPath = (
  ir: FabricationIRV1,
  panel: PanelV1,
): FabricationIRV1 => {
  const boundaryPaths = derivePanelBoundaryCutPaths(panel, ir.joints).map(
    (shape) => cutPathFromShape(shape, panel),
  );
  return {
    ...ir,
    panels: ir.panels.map((item) =>
      item.panelId === panel.panelId ? panel : item,
    ),
    paths: [
      ...ir.paths.filter(
        (path) =>
          !(
            path.panelId === panel.panelId &&
            path.pathId.startsWith(`${panel.panelId}.cut.edge-`)
          ),
      ),
      ...boundaryPaths,
    ],
  };
};

const replacePanelInnerContours = (
  ir: FabricationIRV1,
  panel: PanelV1,
): FabricationIRV1 => ({
  ...ir,
  panels: ir.panels.map((item) =>
    item.panelId === panel.panelId ? panel : item,
  ),
  paths: ir.paths.map((path) => {
    if (!path.pathId.startsWith(`${panel.panelId}.cut.inner-`)) return path;
    const index = Number(path.pathId.split("-").at(-1)) - 1;
    const contour = panel.innerCutContours[index];
    return contour
      ? {
          ...path,
          points: contour.vertices.map((point) =>
            transformPoint2(point, panel.flatTransform),
          ),
        }
      : path;
  }),
});

const expectStageFailure = (
  ir: FabricationIRV1,
  stage: string,
  failureId: string,
): void => {
  const report = verifyFabricationIr(ir, "candidate-stage-boundary");
  expect(report.failedAtStage).toBe(stage);
  expect(report.failures.map((failure) => failure.failureId)).toContain(
    failureId,
  );
};

describe("fabrication verifier geometry and connection stages", () => {
  it("rejects small-area, sub-feature, invalid-inner-cut, and missing source contours", () => {
    const ir = compile();
    const base = ir.panels[0]!;
    const tiny: PanelV1 = {
      ...base,
      contour: {
        vertices: [
          { xMm: 0, yMm: 0 },
          { xMm: 4, yMm: 0 },
          { xMm: 0, yMm: 4 },
        ],
      },
    };
    expectStageFailure(
      replacePanelAndOuterPath(ir, tiny),
      "panel_geometry",
      `geometry.simple_panel#${base.panelId}`,
    );

    const narrowEdge: PanelV1 = {
      ...base,
      contour: {
        vertices: [
          { xMm: 0, yMm: 0 },
          { xMm: 0.5, yMm: 0 },
          { xMm: 80, yMm: 0 },
          { xMm: 80, yMm: 60 },
          { xMm: 0, yMm: 60 },
        ],
      },
    };
    expectStageFailure(
      replacePanelAndOuterPath(ir, narrowEdge),
      "panel_geometry",
      `geometry.minimum_feature#${base.panelId}`,
    );

    const organizer = organizerIr();
    const organizerPanel = organizer.panels[0]!;
    const outsideInner: PanelV1 = {
      ...organizerPanel,
      innerCutContours: [
        {
          vertices: [
            { xMm: -2, yMm: -2 },
            { xMm: 2, yMm: -2 },
            { xMm: 2, yMm: 2 },
            { xMm: -2, yMm: 2 },
          ],
        },
        ...organizerPanel.innerCutContours.slice(1),
      ],
    };
    expectStageFailure(
      {
        ...organizer,
        panels: [outsideInner],
      },
      "panel_geometry",
      `geometry.inner_cut#${organizerPanel.panelId}.inner-1`,
    );

    expectStageFailure(
      {
        ...ir,
        paths: ir.paths.filter(
          (path) => path.pathId !== `${base.panelId}.cut.edge-1`,
        ),
      },
      "panel_geometry",
      `geometry.source_path#${base.panelId}.cut.edge-1`,
    );
  });

  it("accepts cyclic reversal of a source contour", () => {
    const ir = compile();
    const pathId = `${ir.panels[0]!.panelId}.cut.edge-1`;
    const reversed = {
      ...ir,
      paths: ir.paths.map((path) =>
        path.pathId === pathId
          ? { ...path, points: path.points.toReversed() }
          : path,
      ),
    };
    expect(verifyFabricationIr(reversed, "candidate-reversed-path").valid).toBe(
      true,
    );
  });

  it("rejects weak cutout ligaments, tiny inner edges, crowded holes, and hollow shells", () => {
    const ir = organizerIr();
    const panel = ir.panels[0]!;
    const original = panel.innerCutContours;
    const verifyFirstFailure = (
      candidateId: string,
      firstContour: PanelV1["innerCutContours"][number],
      expectedFailureId: string,
      remaining = original.slice(1),
    ): void => {
      const changed = {
        ...panel,
        innerCutContours: [firstContour, ...remaining],
      };
      const report = verifyFabricationIr(
        replacePanelInnerContours(ir, changed),
        candidateId,
      );
      expect(report.failedAtStage).toBe("panel_geometry");
      expect(report.failures.map((failure) => failure.failureId)).toContain(
        expectedFailureId,
      );
    };

    verifyFirstFailure(
      "candidate-inner-edge",
      {
        vertices: [
          { xMm: 23.4, yMm: 17.6 },
          { xMm: 23.9, yMm: 17.6 },
          { xMm: 32.5, yMm: 62.4 },
          { xMm: 23.4, yMm: 62.4 },
        ],
      },
      `geometry.inner_minimum_feature#${panel.panelId}.inner-1`,
    );
    verifyFirstFailure(
      "candidate-thin-ligament",
      {
        vertices: [
          { xMm: 0.2, yMm: 10 },
          { xMm: 20, yMm: 10 },
          { xMm: 20, yMm: 70 },
          { xMm: 0.2, yMm: 70 },
        ],
      },
      `geometry.inner_ligament#${panel.panelId}.inner-1`,
    );

    const crowdedSecond = {
      vertices: [
        { xMm: 33, yMm: 17.6 },
        { xMm: 42, yMm: 17.6 },
        { xMm: 42, yMm: 62.4 },
        { xMm: 33, yMm: 62.4 },
      ],
    };
    const crowdedPanel = {
      ...panel,
      innerCutContours: [original[0]!, crowdedSecond, original[2]!],
    };
    const crowded = verifyFabricationIr(
      replacePanelInnerContours(ir, crowdedPanel),
      "candidate-crowded-holes",
    );
    expect(crowded.failures.map((failure) => failure.failureId)).toContain(
      `geometry.inner_clearance#${panel.panelId}.inner-1:${panel.panelId}.inner-2`,
    );

    verifyFirstFailure(
      "candidate-hollow-shell",
      {
        vertices: [
          { xMm: 1.1, yMm: 1.1 },
          { xMm: 115.9, yMm: 1.1 },
          { xMm: 115.9, yMm: 78.9 },
          { xMm: 1.1, yMm: 78.9 },
        ],
      },
      `geometry.net_material#${panel.panelId}`,
    );
  });

  it("rejects invalid joint ranges, axes, fold edges, and connector features", () => {
    const ir = compile();
    const fold = ir.joints[0];
    if (!fold || fold.kind !== "fold") throw new Error("Fold fixture missing.");
    expectStageFailure(
      {
        ...ir,
        joints: [{ ...fold, homeAngleDeg: fold.maxAngleDeg + 1 }],
      },
      "connections",
      `connections.joint_range#${fold.jointId}`,
    );
    expectStageFailure(
      {
        ...ir,
        paths: ir.paths.map((path) =>
          path.pathId === fold.creasePathId
            ? {
                ...path,
                points: path.points.map((point) => ({
                  xMm: point.xMm + 4,
                  yMm: point.yMm,
                })),
              }
            : path,
        ),
      },
      "connections",
      `connections.fold_edge#${fold.jointId}`,
    );
    const connectorProgram = fixtureProgram();
    const connectorResult = compileFabricationProgram(fixtureIntent(), {
      ...connectorProgram,
      assemblyStrategy: "articulated_tab_slot",
      blueprint: {
        ...connectorProgram.blueprint,
        connectors: [
          {
            connectorId: "connector-crease-tab",
            kind: "tab",
            panelId: "panel-base",
            mateConnectorId: "connector-crease-slot",
            contour: {
              vertices: [
                { xMm: 10, yMm: 10 },
                { xMm: 20, yMm: 10 },
                { xMm: 20, yMm: 20 },
                { xMm: 10, yMm: 20 },
              ],
            },
            rootEdge: {
              start: { xMm: 10, yMm: 10 },
              end: { xMm: 20, yMm: 10 },
            },
            insertionDirection: { x: 1, y: 0, z: 0 },
            clearanceMm: 0.4,
          },
          {
            connectorId: "connector-crease-slot",
            kind: "slot",
            panelId: "panel-base",
            mateConnectorId: "connector-crease-tab",
            centerline: {
              start: { xMm: 80, yMm: 10 },
              end: { xMm: 80, yMm: 50 },
            },
            widthMm: 2,
            insertionDirection: { x: 1, y: 0, z: 0 },
            clearanceMm: 0.4,
          },
        ],
      },
    });
    if (!connectorResult.ok) {
      throw new Error(JSON.stringify(connectorResult.error));
    }
    expectStageFailure(
      connectorResult.value,
      "connections",
      "connections.cut_on_crease#connector-crease-slot.cut:crease-wing",
    );

    const flower = flowerIr();
    const prismatic = flower.joints.find((joint) => joint.kind === "prismatic");
    if (!prismatic) throw new Error("Prismatic showcase joint missing.");
    expectStageFailure(
      {
        ...flower,
        joints: [{ ...prismatic, axis: { x: 0, y: 0, z: 0 } }],
      },
      "connections",
      `connections.axis#${prismatic.jointId}`,
    );
    const childConnector = flower.connectors.find(
      (connector) =>
        flower.panels.find((panel) => panel.panelId === connector.panelId)
          ?.bodyId === prismatic.childBodyId,
    );
    const parentPanel = flower.panels.find(
      (panel) => panel.bodyId === prismatic.parentBodyId,
    );
    if (!childConnector || !parentPanel) {
      throw new Error("Prismatic connector/body fixture missing.");
    }
    const disconnectedGuide = verifyFabricationIr(
      {
        ...flower,
        connectors: flower.connectors.map((connector) =>
          connector.connectorId === childConnector.connectorId
            ? { ...connector, panelId: parentPanel.panelId }
            : connector,
        ),
      },
      "candidate-disconnected-guide",
    );
    expect(disconnectedGuide.failedAtStage).toBe("connections");
    expect(
      disconnectedGuide.failures.map((failure) => failure.failureId),
    ).toContain(`connections.joint_connector_bodies#${prismatic.jointId}`);

    const displacedOrigin = verifyFabricationIr(
      {
        ...flower,
        joints: [
          {
            ...prismatic,
            originMm: {
              ...prismatic.originMm,
              xMm: prismatic.originMm.xMm + 5,
            },
          },
        ],
      },
      "candidate-displaced-joint-origin",
    );
    expect(displacedOrigin.failedAtStage).toBe("connections");
    expect(
      displacedOrigin.failures.some((failure) =>
        failure.failureId.startsWith(
          `connections.joint_anchor#${prismatic.jointId}:`,
        ),
      ),
    ).toBe(true);

    const organizer = organizerIr();
    const connector = organizer.connectors.find((item) => item.kind === "slot");
    if (!connector) throw new Error("Slot fixture missing.");
    const connectorPathId = `${connector.connectorId}.cut`;
    const hostileConnector = {
      ...connector,
      clearanceMm: 0.1,
      insertionDirection: { x: 0, y: 0, z: 0 },
    };
    const report = verifyFabricationIr(
      {
        ...organizer,
        connectors: organizer.connectors.map((item) =>
          item.connectorId === connector.connectorId ? hostileConnector : item,
        ),
        paths: organizer.paths.map((path) =>
          path.pathId === connectorPathId
            ? { ...path, points: path.points.slice(0, 2), closed: false }
            : path,
        ),
      },
      "candidate-connector-features",
    );
    expect(report.failedAtStage).toBe("connections");
    expect(report.failures.map((failure) => failure.failureId)).toEqual(
      expect.arrayContaining([
        `connections.connector_path#${connectorPathId}`,
        `connections.clearance#${connector.connectorId}`,
        `connections.insertion_direction#${connector.connectorId}`,
      ]),
    );

    const slot = organizer.connectors.find((item) => item.kind === "slot");
    if (!slot || slot.kind !== "slot") throw new Error("Slot fixture missing.");
    const zeroLengthSlot = {
      ...slot,
      centerline: { ...slot.centerline, end: slot.centerline.start },
    };
    const zeroLengthReport = verifyFabricationIr(
      {
        ...organizer,
        connectors: organizer.connectors.map((item) =>
          item.connectorId === slot.connectorId ? zeroLengthSlot : item,
        ),
      },
      "candidate-zero-length-slot",
    );
    expect(zeroLengthReport.failedAtStage).toBe("connections");
    expect(
      zeroLengthReport.failures.map((failure) => failure.failureId),
    ).toContain(`connections.connector_feature#${slot.connectorId}`);
  });
});

describe("fabrication verifier packing, motion, and semantic stages", () => {
  it("rejects sheet bounds, path bounds, and source-sheet panel overlap", () => {
    const ir = compile();
    const sheet = ir.sheets[0]!;
    const boundsReport = verifyFabricationIr(
      {
        ...ir,
        sheets: [{ ...sheet, widthMm: 180 }],
      },
      "candidate-sheet-bounds",
    );
    expect(boundsReport.failedAtStage).toBe("sheet_packing");
    expect(boundsReport.failures.map((failure) => failure.failureId)).toEqual(
      expect.arrayContaining([
        "packing.sheet_bounds#panel-wing",
        "packing.path_bounds#panel-wing.cut.edge-1",
      ]),
    );

    const wing = ir.panels[1]!;
    const overlappingWing: PanelV1 = {
      ...wing,
      flatTransform: {
        ...wing.flatTransform,
        translationMm: { xMm: 130, yMm: 90 },
      },
    };
    const overlapping = replacePanelAndOuterPath(ir, overlappingWing);
    expectStageFailure(
      overlapping,
      "sheet_packing",
      "packing.panel_overlap#panel-base:panel-wing",
    );
  });

  it("fails closed on non-unit home transforms and measured motion errors", () => {
    const ir = compile();
    const body = ir.bodies[0]!;
    expectStageFailure(
      {
        ...ir,
        bodies: [
          {
            ...body,
            initialTransform: {
              ...body.initialTransform,
              rotation: { x: 0, y: 0, z: 0, w: 0 },
            },
          },
          ...ir.bodies.slice(1),
        ],
      },
      "rigid_transforms",
      "rigid_transforms.home_state",
    );

    const output = ir.outputs[0]!;
    expectStageFailure(
      {
        ...ir,
        outputs: [{ ...output, maximumValue: 80 }],
      },
      "motion",
      "motion.hard_limits",
    );
  });

  it("grounds every supported coupling family and static motion repair path", () => {
    const foldIr = compile();
    const mirrored: FabricationIRV1["couplings"][number] = {
      couplingId: "coupling-mirrored-repair",
      kind: "mirrored_pair",
      inputJointId: "joint-wing",
      leftOutputJointId: "joint-wing",
      rightOutputJointId: "joint-wing",
      ratio: 1,
      phaseOffsetDeg: 0,
    };
    const mirroredReport = verifyFabricationIr(
      { ...foldIr, couplings: [mirrored] },
      "candidate-mirrored-repair-paths",
    );
    expect(mirroredReport.failedAtStage).toBe("motion");
    expect(mirroredReport.failures[0]?.repairableProgramPaths).toContain(
      "/blueprint/couplings/coupling-mirrored-repair/phaseOffsetDeg",
    );

    const flower = flowerIr();
    const mismatchedOutputs = flower.outputs.map((output) => ({
      ...output,
      maximumValue: 40,
    }));
    const couplingCases: readonly {
      readonly coupling: FabricationIRV1["couplings"][number];
      readonly path: string;
    }[] = [
      {
        coupling: {
          couplingId: "coupling-pull-repair",
          kind: "pull_tab",
          driverId: "driver-flower-pull-tab",
          sliderJointId: "joint-flower-lift",
          outputJointIds: ["joint-flower-lift"],
          ratio: 1,
        },
        path: "/blueprint/couplings/coupling-pull-repair/ratio",
      },
      {
        coupling: {
          couplingId: "coupling-cam-repair",
          kind: "cam_slot",
          driverId: "driver-flower-pull-tab",
          slotConnectorId: "connector-flower-guide-slot",
          followerConnectorId: "connector-flower-guide-tab",
          outputJointId: "joint-flower-lift",
          branch: "positive",
          phaseOffsetMm: 0,
        },
        path: "/blueprint/couplings/coupling-cam-repair/phaseOffsetMm",
      },
    ];
    for (const couplingCase of couplingCases) {
      const report = verifyFabricationIr(
        {
          ...flower,
          outputs: mismatchedOutputs,
          couplings: [couplingCase.coupling],
        },
        `candidate-${couplingCase.coupling.kind}-repair-paths`,
      );
      expect(report.failedAtStage).toBe("motion");
      expect(report.failures[0]?.repairableProgramPaths).toContain(
        couplingCase.path,
      );
    }

    const duckShowcase = createFacetedDuckGiftBoxShowcase();
    const duck = compile(duckShowcase.intent, duckShowcase.program);
    const staticReport = verifyFabricationIr(
      {
        ...duck,
        outputs: [
          {
            outputId: "output-static-lid",
            jointId: "joint-duck-lid",
            bodyId: "body-duck-lid",
            label: "Static lid angle",
            minimumValue: 0,
            maximumValue: 100,
            unit: "deg",
            direction: 1,
          },
        ],
      },
      "candidate-static-repair-paths",
    );
    expect(staticReport.failedAtStage).toBe("motion");
    expect(staticReport.failures[0]?.repairableProgramPaths).toContain(
      "/blueprint/outputs/output-static-lid/maximumValue",
    );
  });

  it("evaluates every dimension and deployment-state selector", () => {
    const ir = compile();
    const dimensionConstraints: readonly SemanticConstraintV1[] = [
      "width",
      "height",
      "depth",
      "length",
    ].map((dimension, index) => ({
      constraintId: `constraint-dimension-${String(index)}`,
      kind: "dimension" as const,
      hard: true,
      source: "user" as const,
      geometryRef: { kind: "panel" as const, id: "panel-base" },
      dimension: dimension as "width" | "height" | "depth" | "length",
      minimumMm: 1_000,
      maximumMm: null,
      targetMm: null,
      toleranceMm: null,
    }));
    const clearanceConstraints: readonly SemanticConstraintV1[] = [
      "rest",
      "all_states",
      "open",
      "closed",
    ].map((during, index) => ({
      constraintId: `constraint-clearance-${String(index)}`,
      kind: "clearance" as const,
      hard: true,
      source: "user" as const,
      geometryRefs: [
        { kind: "panel" as const, id: "panel-base" },
        { kind: "panel" as const, id: "panel-wing" },
      ],
      minimumClearanceMm: 1_000,
      during: during as "rest" | "all_states" | "open" | "closed",
    }));
    const report = verifyFabricationIr(
      {
        ...ir,
        semanticConstraints: [...dimensionConstraints, ...clearanceConstraints],
      },
      "candidate-semantic-dimensions",
    );
    expect(report.failedAtStage).toBe("semantics");
    expect(
      report.failures.filter((failure) =>
        failure.failureId.startsWith("semantics.dimension#"),
      ),
    ).toHaveLength(4);
    expect(
      report.failures.filter((failure) =>
        failure.failureId.startsWith("semantics.clearance#"),
      ),
    ).toHaveLength(4);
  });

  it("evaluates symmetry planes, contact identity, motion, form, and flat stack", () => {
    const ir = compile();
    const constraints: readonly SemanticConstraintV1[] = [
      ...(["yz", "xz", "xy"] as const).map((plane, index) => ({
        constraintId: `constraint-symmetry-${String(index)}`,
        kind: "symmetry" as const,
        hard: true,
        source: "user" as const,
        bodyIds: ["body-base", "body-wing"] as const,
        plane,
        linearToleranceMm: 0,
        angularToleranceDeg: 0,
      })),
      {
        constraintId: "constraint-contact-same-panel",
        kind: "contact",
        hard: true,
        source: "user",
        geometryRefs: [
          { kind: "panel", id: "panel-base" },
          { kind: "body", id: "body-base" },
        ],
        minimumAreaMm2: 1,
        during: "closed",
      },
      {
        constraintId: "constraint-motion-range",
        kind: "motion",
        hard: true,
        source: "user",
        outputId: "output-wing",
        minimumValue: -10,
        maximumValue: 180,
        unit: "deg",
      },
      {
        constraintId: "constraint-hard-form",
        kind: "recognizable_form",
        hard: true,
        source: "user",
        label: "Hard form",
        semanticPartIds: ["part-base"],
        requiredLandmarks: ["base"],
        evaluation: "landmark_geometry",
      },
      {
        constraintId: "constraint-soft-form",
        kind: "recognizable_form",
        hard: false,
        source: "user",
        label: "Missing soft form",
        semanticPartIds: ["part-base"],
        requiredLandmarks: ["unencoded landmark"],
        evaluation: "landmark_geometry",
      },
      {
        constraintId: "constraint-fold-flat",
        kind: "fold_flat",
        hard: true,
        source: "user",
        bodyIds: ["body-base", "body-wing"],
        maximumStackThicknessMm: 0.01,
      },
    ];
    const report = verifyFabricationIr(
      { ...ir, semanticConstraints: constraints },
      "candidate-semantic-families",
    );
    expect(report.failedAtStage).toBe("semantics");
    expect(report.failures.map((failure) => failure.failureId)).toEqual(
      expect.arrayContaining([
        "semantics.symmetry#constraint-symmetry-0",
        "semantics.symmetry#constraint-symmetry-1",
        "semantics.symmetry#constraint-symmetry-2",
        "semantics.contact#constraint-contact-same-panel",
        "semantics.motion#constraint-motion-range",
        "semantics.recognizable_form#constraint-hard-form",
        "semantics.recognizable_form#constraint-soft-form",
        "semantics.fold_flat#constraint-fold-flat",
      ]),
    );
  });

  it("rejects asymmetric panel surfaces even when mirrored bounds are identical", () => {
    const symmetry: SemanticConstraintV1 = {
      constraintId: "constraint-same-bounds-not-symmetric",
      kind: "symmetry",
      hard: true,
      source: "user",
      bodyIds: ["body-base", "body-wing"],
      plane: "yz",
      linearToleranceMm: 0.01,
      angularToleranceDeg: 0.01,
    };
    const baseProgram = fixtureProgram();
    const basePanel = baseProgram.blueprint.panels[0]!;
    const wingPanel = baseProgram.blueprint.panels[1]!;
    const parentBody = baseProgram.blueprint.bodies[0]!;
    const childBody = baseProgram.blueprint.bodies[1]!;
    const fold = baseProgram.blueprint.joints[0]!;
    if (fold.kind !== "fold") throw new Error("Fold fixture missing.");
    const intent = {
      ...fixtureIntent(),
      behavior: "static" as const,
      requestedSize: { widthMm: 80, heightMm: 40, depthMm: null },
      semanticConstraints: [symmetry],
    };
    const program = {
      ...baseProgram,
      behavior: "static" as const,
      blueprint: {
        ...baseProgram.blueprint,
        panels: [
          {
            ...basePanel,
            widthMm: 40,
            heightMm: 40,
            flatTransform: {
              translationMm: { xMm: 10, yMm: 10 },
              rotationDeg: 0,
            },
          },
          {
            ...wingPanel,
            widthMm: 40,
            heightMm: 40,
            contour: {
              vertices: [
                { u: 0, v: 0 },
                { u: 1, v: 0 },
                { u: 1, v: 0.7 },
                { u: 0.7, v: 1 },
                { u: 0, v: 1 },
              ],
            },
            flatTransform: {
              translationMm: { xMm: 50, yMm: 10 },
              rotationDeg: 0,
            },
          },
        ],
        bodies: [
          {
            ...parentBody,
            initialTransform: {
              translationMm: { xMm: -50, yMm: 0, zMm: 0 },
              rotation: { x: 0, y: 0, z: 0, w: 1 },
            },
          },
          {
            ...childBody,
            initialTransform: {
              translationMm: { xMm: 0, yMm: 0, zMm: 0 },
              rotation: { x: 0, y: 0, z: 0, w: 1 },
            },
          },
        ],
        joints: [
          {
            ...fold,
            axis: {
              startMm: { xMm: 50, yMm: 10, zMm: 0 },
              endMm: { xMm: 50, yMm: 50, zMm: 0 },
            },
            homeAngleDeg: 0,
            minAngleDeg: 0,
            maxAngleDeg: 0,
          },
        ],
        driver: null,
        outputs: [],
        couplings: [],
      },
      semanticConstraints: [],
    };
    const compiled = compileFabricationProgram(intent, program);
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
    const report = verifyFabricationIr(
      compiled.value,
      "candidate-same-bounds-asymmetry",
    );
    expect(report.failedAtStage).toBe("semantics");
    expect(report.failures.map((failure) => failure.failureId)).toContain(
      "semantics.symmetry#constraint-same-bounds-not-symmetric",
    );
  });

  it("preserves valid semantic ranges across panels, bodies, and semantic parts", () => {
    const ir = compile();
    const constraints: readonly SemanticConstraintV1[] = [
      {
        constraintId: "constraint-dimension-pass",
        kind: "dimension",
        hard: true,
        source: "user",
        geometryRef: { kind: "panel", id: "panel-base" },
        dimension: "width",
        minimumMm: 70,
        maximumMm: 90,
        targetMm: 80,
        toleranceMm: 0.1,
      },
      {
        constraintId: "constraint-clearance-parts-pass",
        kind: "clearance",
        hard: true,
        source: "user",
        geometryRefs: [
          { kind: "semantic_part", id: "part-base" },
          { kind: "semantic_part", id: "part-wing" },
        ],
        minimumClearanceMm: 0,
        during: "rest",
      },
      {
        constraintId: "constraint-symmetry-pass",
        kind: "symmetry",
        hard: true,
        source: "user",
        bodyIds: ["body-base", "body-wing"],
        plane: "yz",
        linearToleranceMm: 10_000,
        angularToleranceDeg: 180,
      },
      {
        constraintId: "constraint-contact-pass",
        kind: "contact",
        hard: true,
        source: "user",
        geometryRefs: [
          { kind: "panel", id: "panel-base" },
          { kind: "body", id: "body-base" },
        ],
        minimumAreaMm2: 0,
        during: "rest",
      },
      {
        constraintId: "constraint-motion-pass",
        kind: "motion",
        hard: true,
        source: "user",
        outputId: "output-wing",
        minimumValue: 0,
        maximumValue: 90,
        unit: "deg",
      },
      {
        constraintId: "constraint-form-pass",
        kind: "recognizable_form",
        hard: false,
        source: "user",
        label: "Known parts",
        semanticPartIds: ["part-base", "part-wing"],
        requiredLandmarks: ["base", "wing"],
        evaluation: "landmark_geometry",
      },
      {
        constraintId: "constraint-fold-flat-pass",
        kind: "fold_flat",
        hard: true,
        source: "user",
        bodyIds: ["body-base", "body-wing"],
        maximumStackThicknessMm: 10_000,
      },
    ];
    const report = verifyFabricationIr(
      { ...ir, semanticConstraints: constraints },
      "candidate-semantic-passes",
    );
    expect(report.valid).toBe(true);
    expect(report.failures).toEqual([]);
  });

  it("fails measurable semantic constraints that reference non-panel geometry", () => {
    const ir = compile();
    const report = verifyFabricationIr(
      {
        ...ir,
        semanticConstraints: [
          {
            constraintId: "constraint-path-dimension",
            kind: "dimension",
            hard: true,
            source: "user",
            geometryRef: { kind: "path", id: "panel-base.cut.edge-1" },
            dimension: "length",
            minimumMm: 1,
            maximumMm: null,
            targetMm: null,
            toleranceMm: null,
          },
        ],
      },
      "candidate-path-dimension",
    );
    expect(report.failedAtStage).toBe("semantics");
    expect(report.failures[0]?.failureId).toBe(
      "semantics.dimension#constraint-path-dimension",
    );
  });

  it("supports nullable requested dimensions and rejects mismatched envelopes", () => {
    const ir = compile();
    const nullable = verifyFabricationIr(
      {
        ...ir,
        requestedSize: { ...ir.requestedSize, depthMm: null },
      },
      "candidate-null-depth",
    );
    expect(nullable.valid).toBe(true);
    expect(
      nullable.metrics.some((metric) => metric.metricId.endsWith("depth")),
    ).toBe(false);

    expectStageFailure(
      {
        ...ir,
        requestedSize: { ...ir.requestedSize, widthMm: 1_999 },
      },
      "semantics",
      "semantics.requested_size#width",
    );
  });
});

describe("fabrication verifier export evidence boundaries", () => {
  it("rejects malformed, duplicate, and invalid-hash evidence deterministically", () => {
    const ir = compile();
    const hash = fabricationIrHash(ir);
    const malformed = verifyFabricationIr(ir, "candidate-malformed-export", {
      exportEquivalence: { format: "wat" } as never,
    });
    expect(malformed.failedAtStage).toBe("export_equivalence");
    expect(malformed.exportEquivalence[0]).toMatchObject({
      format: "svg",
      status: "fail",
    });

    const duplicate = verifyFabricationIr(ir, "candidate-duplicate-export", {
      exportEquivalence: [
        {
          format: "svg",
          status: "pass",
          sourceIrHash: hash,
          artifactHash: "1".repeat(64),
          message: "first",
        },
        {
          format: "svg",
          status: "pass",
          sourceIrHash: hash,
          artifactHash: "2".repeat(64),
          message: "second",
        },
      ],
    });
    expect(duplicate.failedAtStage).toBe("export_equivalence");
    expect(duplicate.exportEquivalence[0]).toMatchObject({ status: "fail" });

    const invalidArtifact = verifyFabricationIr(
      ir,
      "candidate-invalid-artifact",
      {
        exportEquivalence: [
          {
            format: "fold",
            status: "warning",
            sourceIrHash: hash,
            artifactHash: "not-a-hash",
            message: "invalid artifact hash",
          } as never,
        ],
      },
    );
    expect(invalidArtifact.exportEquivalence.at(-1)).toMatchObject({
      format: "fold",
      status: "fail",
      artifactHash: null,
    });
  });
});
