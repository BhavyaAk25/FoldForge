import { describe, expect, it } from "vitest";

import { compileFabricationProgram } from "@/core/fabrication/compiler";
import { createPullTabPopUpFlowerShowcase } from "@/core/fabrication/examples";
import type {
  FabricationIRV1,
  SemanticConstraintV1,
  SlotConnectorV1,
  TabConnectorV1,
} from "@/core/fabrication/types";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

const compiledFixture = (): FabricationIRV1 => {
  const result = compileFabricationProgram(fixtureIntent(), fixtureProgram());
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

const failureIds = (ir: FabricationIRV1, candidateId = "candidate-topology") =>
  verifyFabricationIr(ir, candidateId).failures.map(
    (failure) => failure.failureId,
  );

const expectFailure = (
  ir: FabricationIRV1,
  expectedFailureId: string,
): void => {
  const report = verifyFabricationIr(ir, "candidate-topology-boundary");
  expect(report.failedAtStage).toBe("topology");
  expect(report.failures.map((failure) => failure.failureId)).toContain(
    expectedFailureId,
  );
};

const connectorPair = (): readonly [TabConnectorV1, SlotConnectorV1] => {
  const tab: TabConnectorV1 = {
    connectorId: "connector-tab",
    kind: "tab",
    panelId: "panel-base",
    mateConnectorId: "connector-slot",
    contour: {
      vertices: [
        { xMm: 10, yMm: 10 },
        { xMm: 20, yMm: 10 },
        { xMm: 20, yMm: 15 },
        { xMm: 10, yMm: 15 },
      ],
    },
    rootEdge: {
      start: { xMm: 10, yMm: 10 },
      end: { xMm: 10, yMm: 15 },
    },
    insertionDirection: { x: 1, y: 0, z: 0 },
    clearanceMm: 0.4,
  };
  const slot: SlotConnectorV1 = {
    connectorId: "connector-slot",
    kind: "slot",
    panelId: "panel-base",
    mateConnectorId: "connector-tab",
    centerline: {
      start: { xMm: 30, yMm: 10 },
      end: { xMm: 40, yMm: 10 },
    },
    widthMm: 2,
    insertionDirection: { x: 1, y: 0, z: 0 },
    clearanceMm: 0.4,
  };
  return [tab, slot];
};

const duplicateVariants = (ir: FabricationIRV1): readonly FabricationIRV1[] => {
  const sheet = ir.sheets[0]!;
  const path = ir.paths[0]!;
  const panel = ir.panels[0]!;
  const body = ir.bodies[0]!;
  const joint = ir.joints[0]!;
  const output = ir.outputs[0]!;
  const semanticPart = ir.semanticParts[0]!;
  const semanticConstraint: SemanticConstraintV1 = {
    constraintId: "constraint-duplicate",
    kind: "dimension",
    hard: false,
    source: "program",
    geometryRef: { kind: "panel", id: panel.panelId },
    dimension: "width",
    minimumMm: null,
    maximumMm: null,
    targetMm: 80,
    toleranceMm: 1,
  };
  const assembly = ir.assemblyOperations[0]!;
  const [tab] = connectorPair();
  const coupling = ir.couplings[0]!;
  return [
    { ...ir, sheets: [sheet, sheet] },
    { ...ir, paths: [path, path, ...ir.paths.slice(1)] },
    { ...ir, panels: [panel, panel, ...ir.panels.slice(1)] },
    { ...ir, bodies: [body, body, ...ir.bodies.slice(1)] },
    { ...ir, joints: [joint, joint] },
    { ...ir, connectors: [tab, tab] },
    { ...ir, outputs: [output, output] },
    { ...ir, semanticParts: [semanticPart, semanticPart] },
    {
      ...ir,
      semanticConstraints: [semanticConstraint, semanticConstraint],
    },
    { ...ir, couplings: [coupling, coupling] },
    { ...ir, assemblyOperations: [assembly, assembly] },
  ];
};

describe("fabrication verifier topology boundaries", () => {
  it("normalizes invalid candidate IDs without throwing for valid or malformed IR", () => {
    const validIr = compiledFixture();
    const invalidString = verifyFabricationIr(validIr, "");
    expect(invalidString).toMatchObject({
      candidateId: expect.stringMatching(/^candidate:invalid:/u),
      failedAtStage: "schema",
    });
    expect(invalidString.failures[0]?.failureId).toBe("schema.candidate_id");

    const invalidType = verifyFabricationIr(
      { ...validIr, version: "bad" },
      42 as unknown as string,
    );
    expect(invalidType).toMatchObject({
      candidateId: expect.stringMatching(/^candidate:invalid:/u),
      failedAtStage: "schema",
    });
    expect(invalidType.failures[0]?.actual.value).toBe("number");
  });

  it("rejects duplicate identifiers in every contract collection", () => {
    const ir = compiledFixture();
    for (const duplicateIr of duplicateVariants(ir)) {
      const ids = failureIds(duplicateIr);
      expect(ids.some((id) => id.startsWith("topology.duplicate_"))).toBe(true);
    }
  });

  it("rejects path, panel, body, and semantic-part reference corruption", () => {
    const ir = compiledFixture();
    const path = ir.paths[0]!;
    const panel = ir.panels[0]!;
    const body = ir.bodies[0]!;
    const pathCases: readonly [FabricationIRV1, string][] = [
      [
        {
          ...ir,
          paths: [{ ...path, sheetId: "sheet-missing" }, ...ir.paths.slice(1)],
        },
        `topology.reference#${path.pathId}:sheet:sheet-missing`,
      ],
      [
        {
          ...ir,
          paths: [{ ...path, panelId: "panel-missing" }, ...ir.paths.slice(1)],
        },
        `topology.reference#${path.pathId}:panel:panel-missing`,
      ],
      [
        {
          ...ir,
          panels: [
            { ...panel, sheetId: "sheet-missing" },
            ...ir.panels.slice(1),
          ],
        },
        `topology.reference#${panel.panelId}:sheet:sheet-missing`,
      ],
      [
        {
          ...ir,
          panels: [{ ...panel, bodyId: "body-missing" }, ...ir.panels.slice(1)],
        },
        `topology.reference#${panel.panelId}:body:body-missing`,
      ],
      [
        {
          ...ir,
          panels: [
            { ...panel, semanticPartIds: ["part-missing"] },
            ...ir.panels.slice(1),
          ],
        },
        `topology.reference#${panel.panelId}:semantic_part:part-missing`,
      ],
      [
        {
          ...ir,
          bodies: [
            { ...body, panelIds: ["panel-missing"] },
            ...ir.bodies.slice(1),
          ],
        },
        `topology.reference#${body.bodyId}:panel:panel-missing`,
      ],
      [
        {
          ...ir,
          bodies: [
            { ...body, semanticPartIds: ["part-missing"] },
            ...ir.bodies.slice(1),
          ],
        },
        `topology.reference#${body.bodyId}:semantic_part:part-missing`,
      ],
    ];
    for (const [invalidIr, id] of pathCases) expectFailure(invalidIr, id);
  });

  it("enforces grounded roots and driver-to-joint compatibility", () => {
    const ir = compiledFixture();
    const driver = ir.driver!;
    const root = ir.bodies[0]!;
    const child = ir.bodies[1]!;
    const cases: readonly [FabricationIRV1, string][] = [
      [
        {
          ...ir,
          bodies: ir.bodies.map((body) => ({ ...body, grounded: false })),
        },
        "topology.grounded_root",
      ],
      [
        {
          ...ir,
          bodies: [
            { ...root, grounded: true },
            { ...child, grounded: true },
          ],
        },
        "topology.grounded_root",
      ],
      [
        { ...ir, behavior: "static", driver },
        `topology.reference#${driver.driverId}:driver:none`,
      ],
      [{ ...ir, driver: null }, "topology.missing_driver"],
      [
        { ...ir, driver: { ...driver, jointId: "joint-missing" } },
        `topology.reference#${driver.driverId}:joint:joint-missing`,
      ],
      [
        { ...ir, driver: { ...driver, control: "rotate" } },
        `topology.driver_compatibility#${driver.driverId}`,
      ],
    ];
    for (const [invalidIr, id] of cases) expectFailure(invalidIr, id);
  });

  it("enforces joint, output, and connector references and units", () => {
    const ir = compiledFixture();
    const fold = ir.joints[0];
    if (!fold || fold.kind !== "fold") throw new Error("Fold fixture missing.");
    const output = ir.outputs[0]!;
    const [tab, slot] = connectorPair();
    const otherBodyId = fold.parentBodyId;
    const cases: readonly [FabricationIRV1, string][] = [
      [
        {
          ...ir,
          joints: [{ ...fold, creasePathId: "crease-missing" }],
        },
        `${"topology.reference"}#${fold.jointId}:path:crease-missing`,
      ],
      [
        {
          ...ir,
          outputs: [{ ...output, jointId: "joint-missing" }],
        },
        `topology.reference#${output.outputId}:joint:joint-missing`,
      ],
      [
        { ...ir, outputs: [{ ...output, unit: "mm" }] },
        `topology.output_compatibility#${output.outputId}`,
      ],
      [
        { ...ir, outputs: [{ ...output, bodyId: "body-missing" }] },
        `topology.reference#${output.outputId}:body:body-missing`,
      ],
      [
        { ...ir, outputs: [{ ...output, bodyId: otherBodyId }] },
        `topology.output_body#${output.outputId}`,
      ],
      [
        { ...ir, connectors: [{ ...tab, panelId: "panel-missing" }, slot] },
        `topology.reference#${tab.connectorId}:panel:panel-missing`,
      ],
      [
        {
          ...ir,
          connectors: [tab, { ...slot, mateConnectorId: "connector-other" }],
        },
        `topology.reference#${tab.connectorId}:connector:${tab.mateConnectorId}`,
      ],
    ];
    for (const [invalidIr, id] of cases) expectFailure(invalidIr, id);
  });

  it("checks every coupling family and semantic reference family", () => {
    const ir = compiledFixture();
    const fold = ir.joints[0];
    if (!fold || fold.kind !== "fold") throw new Error("Fold fixture missing.");
    const output = ir.outputs[0]!;
    const [tab, slot] = connectorPair();
    const directUnitMismatch: FabricationIRV1 = {
      ...ir,
      couplings: [
        {
          couplingId: "coupling-unit-mismatch",
          kind: "direct_ratio",
          inputJointId: fold.jointId,
          outputJointIds: [fold.jointId],
          ratio: 1,
          offset: 0,
          offsetUnit: "mm",
        },
      ],
    };
    expectFailure(
      directUnitMismatch,
      "topology.coupling_unit#coupling-unit-mismatch",
    );

    const mirroredMissing: FabricationIRV1 = {
      ...ir,
      couplings: [
        {
          couplingId: "coupling-mirrored-missing",
          kind: "mirrored_pair",
          inputJointId: fold.jointId,
          leftOutputJointId: "joint-left-missing",
          rightOutputJointId: "joint-right-missing",
          ratio: 1,
          phaseOffsetDeg: 0,
        },
      ],
    };
    expect(failureIds(mirroredMissing)).toEqual(
      expect.arrayContaining([
        "topology.reference#coupling-mirrored-missing:joint:joint-left-missing",
        "topology.reference#coupling-mirrored-missing:joint:joint-right-missing",
      ]),
    );

    const pullTabMissing: FabricationIRV1 = {
      ...ir,
      couplings: [
        {
          couplingId: "coupling-pull-missing",
          kind: "pull_tab",
          driverId: "driver-missing",
          sliderJointId: "joint-slider-missing",
          outputJointIds: ["joint-output-missing"],
          ratio: 1,
        },
      ],
    };
    expect(failureIds(pullTabMissing)).toEqual(
      expect.arrayContaining([
        "topology.reference#coupling-pull-missing:driver:driver-missing",
        "topology.reference#coupling-pull-missing:joint:joint-slider-missing",
        "topology.reference#coupling-pull-missing:joint:joint-output-missing",
      ]),
    );

    const wrongCamKinds: FabricationIRV1 = {
      ...ir,
      connectors: [tab, slot],
      couplings: [
        {
          couplingId: "coupling-wrong-cam-kinds",
          kind: "cam_slot",
          driverId: ir.driver!.driverId,
          slotConnectorId: tab.connectorId,
          followerConnectorId: slot.connectorId,
          outputJointId: fold.jointId,
          branch: "positive",
          phaseOffsetMm: 0,
        },
      ],
    };
    expectFailure(
      wrongCamKinds,
      "topology.cam_connector_kinds#coupling-wrong-cam-kinds",
    );

    const disconnectedCam: FabricationIRV1 = {
      ...ir,
      connectors: [tab, slot],
      couplings: [
        {
          couplingId: "coupling-disconnected-cam",
          kind: "cam_slot",
          driverId: ir.driver!.driverId,
          slotConnectorId: slot.connectorId,
          followerConnectorId: tab.connectorId,
          outputJointId: fold.jointId,
          branch: "positive",
          phaseOffsetMm: 0,
        },
      ],
    };
    expectFailure(
      disconnectedCam,
      "topology.cam_connector_bodies#coupling-disconnected-cam",
    );

    const wrongAndMissingCam: FabricationIRV1 = {
      ...ir,
      connectors: [tab, slot],
      couplings: [
        {
          couplingId: "coupling-wrong-and-missing-cam",
          kind: "cam_slot",
          driverId: ir.driver!.driverId,
          slotConnectorId: tab.connectorId,
          followerConnectorId: "connector-follower-missing",
          outputJointId: fold.jointId,
          branch: "negative",
          phaseOffsetMm: 0,
        },
      ],
    };
    expectFailure(
      wrongAndMissingCam,
      "topology.cam_connector_kinds#coupling-wrong-and-missing-cam",
    );

    const semanticPart = ir.semanticParts[0]!;
    const semanticCycle: FabricationIRV1 = {
      ...ir,
      semanticParts: [
        {
          ...semanticPart,
          semanticPartId: "part-cycle-a",
          geometryRefs: [{ kind: "semantic_part", id: "part-cycle-b" }],
        },
        {
          ...semanticPart,
          semanticPartId: "part-cycle-b",
          geometryRefs: [{ kind: "semantic_part", id: "part-cycle-a" }],
        },
      ],
      panels: ir.panels.map((panel) => ({ ...panel, semanticPartIds: [] })),
      bodies: ir.bodies.map((body) => ({ ...body, semanticPartIds: [] })),
    };
    expectFailure(semanticCycle, "topology.semantic_part_cycle#part-cycle-a");

    const semanticUnknown: FabricationIRV1 = {
      ...ir,
      semanticParts: [
        {
          ...semanticPart,
          geometryRefs: [{ kind: "path", id: "path-missing" }],
        },
        ...ir.semanticParts.slice(1),
      ],
    };
    expectFailure(
      semanticUnknown,
      `topology.reference#${semanticPart.semanticPartId}:path:path-missing`,
    );

    const semanticConstraints: readonly SemanticConstraintV1[] = [
      {
        constraintId: "constraint-same-ref",
        kind: "clearance",
        hard: true,
        source: "user",
        geometryRefs: [
          { kind: "panel", id: "panel-base" },
          { kind: "panel", id: "panel-base" },
        ],
        minimumClearanceMm: 1,
        during: "all_states",
      },
      {
        constraintId: "constraint-same-body",
        kind: "symmetry",
        hard: true,
        source: "user",
        bodyIds: ["body-base", "body-base"],
        plane: "yz",
        linearToleranceMm: 1,
        angularToleranceDeg: 1,
      },
      {
        constraintId: "constraint-output-missing",
        kind: "motion",
        hard: true,
        source: "user",
        outputId: "output-missing",
        minimumValue: 0,
        maximumValue: 1,
        unit: "deg",
      },
      {
        constraintId: "constraint-output-unit",
        kind: "motion",
        hard: true,
        source: "user",
        outputId: output.outputId,
        minimumValue: 0,
        maximumValue: 1,
        unit: "mm",
      },
      {
        constraintId: "constraint-form-part",
        kind: "recognizable_form",
        hard: false,
        source: "user",
        label: "Missing landmark",
        semanticPartIds: ["part-missing"],
        requiredLandmarks: ["missing"],
        evaluation: "landmark_geometry",
      },
    ];
    const constraintFailures = failureIds({
      ...ir,
      semanticConstraints,
    });
    expect(constraintFailures).toEqual(
      expect.arrayContaining([
        "topology.constraint_distinct_refs#constraint-same-ref",
        "topology.constraint_distinct_bodies#constraint-same-body",
        "topology.reference#constraint-output-missing:output:output-missing",
        "topology.constraint_unit#constraint-output-unit",
        "topology.reference#constraint-form-part:semantic_part:part-missing",
      ]),
    );
  });

  it("checks prismatic coupling units, mirrored restrictions, and both cam roles", () => {
    const flower = (() => {
      const showcase = createPullTabPopUpFlowerShowcase();
      const compiled = compileFabricationProgram(
        showcase.intent,
        showcase.program,
      );
      if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
      return compiled.value;
    })();
    const prismatic = flower.joints.find((joint) => joint.kind === "prismatic");
    if (!prismatic) throw new Error("Prismatic showcase joint missing.");
    const direct: FabricationIRV1 = {
      ...flower,
      couplings: [
        {
          couplingId: "coupling-prismatic-direct",
          kind: "direct_ratio",
          inputJointId: prismatic.jointId,
          outputJointIds: [prismatic.jointId],
          ratio: 1,
          offset: 0,
          offsetUnit: "mm",
        },
      ],
    };
    expect(failureIds(direct).some((id) => id.includes("coupling_unit"))).toBe(
      false,
    );

    const validPullTab: FabricationIRV1 = {
      ...flower,
      couplings: [
        {
          couplingId: "coupling-valid-pull-tab",
          kind: "pull_tab",
          driverId: flower.driver!.driverId,
          sliderJointId: prismatic.jointId,
          outputJointIds: [prismatic.jointId],
          ratio: 1,
        },
      ],
    };
    expect(
      failureIds(validPullTab).some((id) =>
        id.includes("coupling-valid-pull-tab:driver"),
      ),
    ).toBe(false);

    expectFailure(
      {
        ...flower,
        couplings: [
          {
            couplingId: "coupling-prismatic-mirrored",
            kind: "mirrored_pair",
            inputJointId: prismatic.jointId,
            leftOutputJointId: prismatic.jointId,
            rightOutputJointId: prismatic.jointId,
            ratio: 1,
            phaseOffsetDeg: 0,
          },
        ],
      },
      "topology.coupling_unit#coupling-prismatic-mirrored",
    );

    const ir = compiledFixture();
    const fold = ir.joints[0];
    if (!fold || fold.kind !== "fold") throw new Error("Fold fixture missing.");
    const [tab, slot] = connectorPair();
    expectFailure(
      {
        ...ir,
        connectors: [tab, slot],
        couplings: [
          {
            couplingId: "coupling-wrong-follower",
            kind: "cam_slot",
            driverId: ir.driver!.driverId,
            slotConnectorId: slot.connectorId,
            followerConnectorId: slot.connectorId,
            outputJointId: fold.jointId,
            branch: "negative",
            phaseOffsetMm: 0,
          },
        ],
      },
      "topology.cam_connector_kinds#coupling-wrong-follower",
    );

    expectFailure(
      {
        ...ir,
        semanticConstraints: [
          {
            constraintId: "constraint-missing-symmetry-body",
            kind: "symmetry",
            hard: true,
            source: "user",
            bodyIds: ["body-base", "body-missing"],
            plane: "yz",
            linearToleranceMm: 1,
            angularToleranceDeg: 1,
          },
        ],
      },
      "topology.reference#constraint-missing-symmetry-body:body:body-missing",
    );
  });

  it("rejects same-step and forward assembly dependencies", () => {
    const ir = compiledFixture();
    const first = ir.assemblyOperations[0]!;
    const sameStep = {
      ...first,
      operationId: "assembly-same-step",
      order: 2,
      dependsOnOperationIds: ["assembly-same-step"],
    };
    expectFailure(
      { ...ir, assemblyOperations: [sameStep] },
      "topology.assembly_dependency#assembly-same-step:assembly-same-step",
    );

    const before = { ...first, operationId: "assembly-before", order: 2 };
    const after = {
      ...first,
      operationId: "assembly-after",
      order: 1,
      dependsOnOperationIds: [before.operationId],
    };
    expectFailure(
      { ...ir, assemblyOperations: [before, after] },
      "topology.assembly_order#assembly-after:assembly-before",
    );
  });
});
