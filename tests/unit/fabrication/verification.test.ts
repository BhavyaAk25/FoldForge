import { describe, expect, it } from "vitest";

import {
  compileFabricationProgram,
  fabricationIrHash,
} from "@/core/fabrication/compiler";
import {
  estimateFabricationVerificationWork,
  verificationStageOrder,
  verifyFabricationIr,
} from "@/core/fabrication/verification";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

const compiledFixture = () => {
  const compiled = compileFabricationProgram(fixtureIntent(), fixtureProgram());
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
  return compiled.value;
};

describe("fabrication verifier", () => {
  it("passes a deterministic articulated program through every hard stage", () => {
    const ir = compiledFixture();
    const report = verifyFabricationIr(ir, "candidate-fixture");
    expect(report.valid).toBe(true);
    expect(report.failedAtStage).toBeNull();
    expect(report.completedStage).toBe("scoring");
    expect(report.irHash).toBe(fabricationIrHash(ir));
    expect(report.motionSummary).toMatchObject({
      baseSampleCount: 201,
      maximumClosureResidualMm: 0,
      maximumAngleErrorDeg: 0,
      maximumTravelErrorMm: 0,
      collisionFree: true,
      branchContinuous: true,
      driverReachable: true,
      deadStateFree: true,
    });
    expect(report.exportEquivalence).toEqual(
      ["svg", "dxf", "glb", "json"].map((format) =>
        expect.objectContaining({ format, status: "pass" }),
      ),
    );
    expect(report.checks.at(-1)?.checkId).toBe("scoring.eligible");
  });

  it("uses the fixed fail-fast stage order", () => {
    expect(verificationStageOrder()).toEqual([
      "schema",
      "topology",
      "panel_geometry",
      "connections",
      "sheet_packing",
      "rigid_transforms",
      "motion",
      "collision",
      "semantics",
      "export_equivalence",
      "scoring",
    ]);
  });

  it("rejects malformed contracts before topology", () => {
    const report = verifyFabricationIr(
      { ...compiledFixture(), version: "wrong" },
      "candidate-malformed",
    );
    expect(report.valid).toBe(false);
    expect(report.failedAtStage).toBe("schema");
    expect(report.failures[0]?.failureId).toBe("schema.contract");
    expect(report.checks).toHaveLength(1);
  });

  it("rejects disconnected graphs before geometry", () => {
    const ir = compiledFixture();
    const baseBody = ir.bodies[0];
    if (!baseBody) throw new Error("Fixture body missing.");
    const report = verifyFabricationIr(
      {
        ...ir,
        bodies: [...ir.bodies, { ...baseBody, bodyId: "body-orphan" }],
      },
      "candidate-topology",
    );
    expect(report.failedAtStage).toBe("topology");
    expect(report.failures.map((failure) => failure.failureId)).toContain(
      "topology.body_graph",
    );
    expect(
      report.checks.some((check) => check.stage === "panel_geometry"),
    ).toBe(false);
  });

  it("rejects self-intersecting panels before connection checks", () => {
    const ir = compiledFixture();
    const base = ir.panels[0];
    if (!base) throw new Error("Fixture panel missing.");
    const report = verifyFabricationIr(
      {
        ...ir,
        panels: [
          {
            ...base,
            contour: {
              vertices: [
                { xMm: 0, yMm: 0 },
                { xMm: 80, yMm: 60 },
                { xMm: 0, yMm: 60 },
                { xMm: 80, yMm: 0 },
              ],
            },
          },
          ...ir.panels.slice(1),
        ],
      },
      "candidate-geometry",
    );
    expect(report.failedAtStage).toBe("panel_geometry");
    expect(report.failures[0]?.failureId).toBe(
      "geometry.simple_panel#panel-base",
    );
  });

  it("rejects a cut path that no longer represents its source panel", () => {
    const ir = compiledFixture();
    const report = verifyFabricationIr(
      {
        ...ir,
        paths: ir.paths.map((path) =>
          path.pathId === "panel-base.cut.edge-1"
            ? {
                ...path,
                points: [
                  { xMm: 999, yMm: 999 },
                  { xMm: 1_000, yMm: 999 },
                  { xMm: 1_000, yMm: 1_000 },
                ],
              }
            : path,
        ),
      },
      "candidate-corrupt-source-path",
    );
    expect(report.failedAtStage).toBe("panel_geometry");
    expect(report.failures[0]?.failureId).toBe(
      "geometry.source_path#panel-base.cut.edge-1",
    );
  });

  it("rejects an extra path with no source geometry", () => {
    const ir = compiledFixture();
    const report = verifyFabricationIr(
      {
        ...ir,
        paths: [
          ...ir.paths,
          {
            pathId: "rogue.cut",
            sheetId: "sheet-a",
            panelId: null,
            kind: "cut",
            points: [
              { xMm: 10, yMm: 10 },
              { xMm: 20, yMm: 10 },
              { xMm: 20, yMm: 20 },
            ],
            closed: true,
            strokeWidthMm: 0.1,
          },
        ],
      },
      "candidate-rogue-path",
    );
    expect(report.failedAtStage).toBe("topology");
    expect(report.failures[0]?.failureId).toBe(
      "topology.unexpected_path#rogue.cut",
    );
  });

  it("fails fast when dynamic collision work exceeds the bounded budget", () => {
    const ir = compiledFixture();
    const sourcePanel = ir.panels[0]!;
    const contour = {
      vertices: Array.from({ length: 64 }, (_, index) => {
        const angle = (index / 64) * Math.PI * 2;
        return {
          xMm: 30 + Math.cos(angle) * 25,
          yMm: 30 + Math.sin(angle) * 25,
        };
      }),
    };
    const expensive = {
      ...ir,
      panels: Array.from({ length: 24 }, (_, index) => ({
        ...sourcePanel,
        panelId: `panel-budget-${String(index + 1)}`,
        contour,
      })),
    };
    expect(estimateFabricationVerificationWork(expensive)).toBeGreaterThan(
      2_000_000,
    );
    const report = verifyFabricationIr(expensive, "candidate-work-budget");
    expect(report.failedAtStage).toBe("topology");
    expect(report.failures.map((failure) => failure.failureId)).toContain(
      "topology.work_budget",
    );
  });

  it("rejects flat sheet overlap before transform sampling", () => {
    const ir = compiledFixture();
    const wing = ir.panels[1];
    if (!wing) throw new Error("Fixture wing missing.");
    const report = verifyFabricationIr(
      {
        ...ir,
        panels: [
          ir.panels[0]!,
          {
            ...wing,
            flatTransform: {
              ...wing.flatTransform,
              translationMm: { xMm: 100, yMm: 90 },
            },
          },
        ],
      },
      "candidate-overlap",
    );
    expect(report.failedAtStage).toBe("panel_geometry");
    expect(report.failures[0]?.failureId).toBe(
      "geometry.source_path#panel-wing.cut.edge-1",
    );
  });

  it("rejects measured semantic and export failures", () => {
    const ir = compiledFixture();
    const semantic = verifyFabricationIr(
      {
        ...ir,
        semanticConstraints: [
          {
            constraintId: "constraint-width",
            kind: "dimension",
            hard: true,
            source: "user",
            geometryRef: { kind: "panel", id: "panel-base" },
            dimension: "width",
            minimumMm: 120,
            maximumMm: null,
            targetMm: null,
            toleranceMm: null,
          },
        ],
      },
      "candidate-semantic",
    );
    expect(semantic.failedAtStage).toBe("semantics");
    expect(semantic.failures[0]?.failureId).toBe(
      "semantics.dimension#constraint-width",
    );

    const sourceIrHash = fabricationIrHash(ir);
    const exported = verifyFabricationIr(ir, "candidate-export", {
      exportEquivalence: [
        {
          format: "svg",
          status: "fail",
          sourceIrHash,
          artifactHash: "0".repeat(64),
          message: "Mutation detected.",
        },
      ],
    });
    expect(exported.failedAtStage).toBe("export_equivalence");
    expect(exported.failures[0]?.failureId).toBe("export.source_equivalence");
  });

  it("returns a topology report instead of throwing for an unknown revolute connector", () => {
    const ir = compiledFixture();
    const fold = ir.joints[0];
    if (!fold || fold.kind !== "fold") throw new Error("Fixture fold missing.");
    const invalid = {
      ...ir,
      joints: [
        {
          jointId: fold.jointId,
          kind: "revolute" as const,
          parentBodyId: fold.parentBodyId,
          childBodyId: fold.childBodyId,
          axis: fold.axis,
          connectorIds: ["missing-connector"],
          homeAngleDeg: fold.homeAngleDeg,
          minAngleDeg: fold.minAngleDeg,
          maxAngleDeg: fold.maxAngleDeg,
        },
      ],
    };
    expect(() =>
      verifyFabricationIr(invalid, "candidate-missing-ref"),
    ).not.toThrow();
    const report = verifyFabricationIr(invalid, "candidate-missing-ref");
    expect(report.failedAtStage).toBe("topology");
    expect(report.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          failureId:
            "topology.reference#joint-wing:connector:missing-connector",
        }),
      ]),
    );
  });

  it("fails fast on ghost cam-slot references", () => {
    const ir = compiledFixture();
    const report = verifyFabricationIr(
      {
        ...ir,
        couplings: [
          {
            couplingId: "coupling-ghost-cam",
            kind: "cam_slot",
            driverId: "driver-ghost",
            slotConnectorId: "slot-ghost",
            followerConnectorId: "follower-ghost",
            outputJointId: "joint-wing",
            branch: "positive",
            phaseOffsetMm: 0,
          },
        ],
      },
      "candidate-ghost-cam",
    );
    expect(report.failedAtStage).toBe("topology");
    expect(report.failures.map((failure) => failure.failureId)).toEqual(
      expect.arrayContaining([
        "topology.reference#coupling-ghost-cam:driver:driver-ghost",
        "topology.reference#coupling-ghost-cam:connector:slot-ghost",
        "topology.reference#coupling-ghost-cam:connector:follower-ghost",
      ]),
    );
  });

  it("rejects a self-mating connector before geometry evaluation", () => {
    const ir = compiledFixture();
    const report = verifyFabricationIr(
      {
        ...ir,
        connectors: [
          {
            connectorId: "connector-self",
            kind: "tab",
            panelId: "panel-base",
            mateConnectorId: "connector-self",
            contour: {
              vertices: [
                { xMm: 0, yMm: 0 },
                { xMm: 10, yMm: 0 },
                { xMm: 5, yMm: 5 },
              ],
            },
            rootEdge: {
              start: { xMm: 0, yMm: 0 },
              end: { xMm: 10, yMm: 0 },
            },
            insertionDirection: { x: 0, y: 0, z: 0 },
            clearanceMm: 0.2,
          },
        ],
      },
      "candidate-self-connector",
    );
    expect(report.failedAtStage).toBe("topology");
    expect(report.failures.map((failure) => failure.failureId)).toContain(
      "topology.reference#connector-self:connector:connector-self",
    );
  });

  it("validates semantic and assembly references before evaluation", () => {
    const ir = compiledFixture();
    const report = verifyFabricationIr(
      {
        ...ir,
        semanticConstraints: [
          {
            constraintId: "constraint-ghost-panel",
            kind: "dimension",
            hard: true,
            source: "user",
            geometryRef: { kind: "panel", id: "panel-ghost" },
            dimension: "width",
            minimumMm: 1,
            maximumMm: null,
            targetMm: null,
            toleranceMm: null,
          },
        ],
        assemblyOperations: [
          {
            operationId: "assembly-ghost",
            order: 2,
            kind: "verify",
            targetRefs: [{ kind: "panel", id: "panel-ghost" }],
            dependsOnOperationIds: ["assembly-missing"],
            instruction: "Verify missing geometry.",
          },
        ],
      },
      "candidate-ghost-semantic",
    );
    expect(report.failedAtStage).toBe("topology");
    expect(report.failures.map((failure) => failure.failureId)).toEqual(
      expect.arrayContaining([
        "topology.reference#constraint-ghost-panel:panel:panel-ghost",
        "topology.reference#assembly-ghost:panel:panel-ghost",
        "topology.assembly_dependency#assembly-ghost:assembly-missing",
      ]),
    );
  });

  it("checks overlapping adjacent panels instead of skipping the pair", () => {
    const ir = compiledFixture();
    const fold = ir.joints[0];
    const driver = ir.driver;
    const output = ir.outputs[0];
    if (!fold || fold.kind !== "fold" || !driver || !output) {
      throw new Error("Fixture motion geometry missing.");
    }
    const report = verifyFabricationIr(
      {
        ...ir,
        joints: [{ ...fold, maxAngleDeg: 180 }],
        driver: { ...driver, maximumValue: 180 },
        outputs: [{ ...output, maximumValue: 180 }],
      },
      "candidate-adjacent-overlap",
    );
    expect(report.failedAtStage).toBe("collision");
    expect(report.failures[0]?.failureId).toBe("collision.minimum_clearance");
    expect(report.motionSummary?.minimumClearanceMm).toBe(0);
  });

  it("measures contact overlap instead of a union bounding box", () => {
    const ir = compiledFixture();
    const report = verifyFabricationIr(
      {
        ...ir,
        semanticConstraints: [
          {
            constraintId: "constraint-contact-area",
            kind: "contact",
            hard: true,
            source: "user",
            geometryRefs: [
              { kind: "panel", id: "panel-base" },
              { kind: "panel", id: "panel-wing" },
            ],
            minimumAreaMm2: 5_000,
            during: "rest",
          },
        ],
      },
      "candidate-contact-bbox",
    );
    expect(report.failedAtStage).toBe("semantics");
    expect(report.failures[0]).toMatchObject({
      failureId: "semantics.contact#constraint-contact-area",
      actual: { value: 0, unit: "mm2" },
    });
  });

  it("synthesizes complete source-bound export evidence for an empty caller array", () => {
    const ir = compiledFixture();
    const report = verifyFabricationIr(ir, "candidate-empty-export", {
      exportEquivalence: [],
    });
    expect(report.valid).toBe(true);
    expect(report.exportEquivalence).toHaveLength(4);
    expect(report.exportEquivalence.map((check) => check.format)).toEqual([
      "svg",
      "dxf",
      "glb",
      "json",
    ]);
    expect(
      report.exportEquivalence.every(
        (check) =>
          check.status === "pass" && check.sourceIrHash === report.irHash,
      ),
    ).toBe(true);
  });

  it("rejects export evidence borrowed from another IR hash", () => {
    const ir = compiledFixture();
    const report = verifyFabricationIr(ir, "candidate-borrowed-export", {
      exportEquivalence: [
        {
          format: "svg",
          status: "pass",
          sourceIrHash: "0".repeat(64),
          artifactHash: "1".repeat(64),
          message: "Borrowed evidence.",
        },
      ],
    });
    expect(report.failedAtStage).toBe("export_equivalence");
    expect(
      report.exportEquivalence.find((check) => check.format === "svg"),
    ).toMatchObject({ status: "fail", sourceIrHash: report.irHash });
  });
});
