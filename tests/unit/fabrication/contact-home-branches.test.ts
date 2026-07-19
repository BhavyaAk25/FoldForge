import { describe, expect, it } from "vitest";

import { compileFabricationProgram } from "@/core/fabrication/compiler";
import { createPullTabPopUpFlowerShowcase } from "@/core/fabrication/examples";
import { evaluateMotionState } from "@/core/fabrication/kinematics";
import { normalizeFoldOnlyPlan } from "@/core/fabrication/plan-normalization";
import { fabricationPlanFromProgram } from "@/core/fabrication/planning";
import type {
  FabricationIRV1,
  SemanticConstraintV1,
} from "@/core/fabrication/types";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

const compileFixture = (): FabricationIRV1 => {
  const compiled = compileFabricationProgram(fixtureIntent(), fixtureProgram());
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
  return compiled.value;
};

describe("contact, reach, and folded-home boundaries", () => {
  it("rejects a non-finite fold home instead of retaining a flat transform", () => {
    const source = fabricationPlanFromProgram(fixtureProgram());
    const fold = source.joints[0];
    if (!fold || fold.kind !== "fold") {
      throw new Error("Fold fixture missing.");
    }

    const result = normalizeFoldOnlyPlan(
      {
        ...source,
        joints: [{ ...fold, homeAngleDeg: Number.POSITIVE_INFINITY }],
      },
      fixtureIntent().stockOptions,
    );

    expect(result).toEqual({
      ok: false,
      path: ["bodies", "body-wing", "initialTransform"],
      message:
        "A finite home transform could not be derived for fold body body-wing.",
    });
  });

  it("rejects a cyclic fold graph before deriving body home transforms", () => {
    const source = fabricationPlanFromProgram(fixtureProgram());
    const fold = source.joints[0];
    if (!fold || fold.kind !== "fold") {
      throw new Error("Fold fixture missing.");
    }

    const result = normalizeFoldOnlyPlan(
      {
        ...source,
        joints: [
          fold,
          {
            ...fold,
            jointId: "joint-cycle",
            parentBodyId: fold.childBodyId,
            childBodyId: fold.parentBodyId,
            creasePathId: "crease-cycle",
          },
        ],
      },
      fixtureIntent().stockOptions,
    );

    expect(result).toMatchObject({
      ok: false,
      path: ["joints"],
      message: expect.stringContaining("not one acyclic tree"),
    });
  });

  it("fails closed when finite home transforms overflow during composition", () => {
    const ir = compileFixture();
    const result = evaluateMotionState({
      ...ir,
      bodies: ir.bodies.map((body) => ({
        ...body,
        initialTransform: {
          ...body.initialTransform,
          translationMm: {
            xMm: 1e308,
            yMm: body.bodyId === "body-base" ? 0 : 1e308,
            zMm: 0,
          },
        },
      })),
    });

    expect(result).toEqual({
      ok: false,
      error: { id: "motion.transform", bodyId: "body-wing" },
    });
  });

  it("measures open and closed contact declarations at their exact states", () => {
    const ir = compileFixture();
    const contacts: readonly SemanticConstraintV1[] = ["open", "closed"].map(
      (during) => ({
        constraintId: `constraint-contact-${during}`,
        kind: "contact" as const,
        hard: true,
        source: "program" as const,
        geometryRefs: [
          { kind: "panel" as const, id: "panel-base" },
          { kind: "panel" as const, id: "panel-wing" },
        ],
        minimumAreaMm2: 0,
        during: during as "open" | "closed",
      }),
    );

    const report = verifyFabricationIr(
      { ...ir, semanticConstraints: contacts },
      "candidate-contact-endpoints",
    );

    expect(report.valid).toBe(true);
    expect(report.failures).toEqual([]);
    expect(
      report.checks.find((check) => check.checkId === "collision.deployment"),
    ).toMatchObject({ status: "pass" });
    expect(report.completedStage).toBe("scoring");
  });

  it("measures a sub-epsilon tab root as zero insertion reach", () => {
    const showcase = createPullTabPopUpFlowerShowcase();
    const compiled = compileFabricationProgram(
      showcase.intent,
      showcase.program,
    );
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
    const ir = compiled.value;
    const tab = ir.connectors.find((connector) => connector.kind === "tab");
    if (!tab || tab.kind !== "tab") {
      throw new Error("Flower guide tab missing.");
    }
    const degenerateRootEnd = {
      xMm: tab.rootEdge.start.xMm + 1e-13,
      yMm: tab.rootEdge.start.yMm,
    };
    const report = verifyFabricationIr(
      {
        ...ir,
        connectors: ir.connectors.map((connector) =>
          connector.connectorId === tab.connectorId && connector.kind === "tab"
            ? {
                ...connector,
                rootEdge: {
                  start: tab.rootEdge.start,
                  end: degenerateRootEnd,
                },
              }
            : connector,
        ),
      },
      "candidate-zero-depth-tab",
    );

    expect(report.failedAtStage).toBe("connections");
    expect(
      report.metrics.find((metric) => metric.metricId.startsWith("reach:")),
    ).toMatchObject({ unit: "mm" });
    expect(report.failures.map((failure) => failure.failureId)).toEqual(
      expect.arrayContaining([
        "connections.connector_feature#connector-flower-guide-tab",
        "connections.tab_attachment#connector-flower-guide-tab",
      ]),
    );
  });
});
