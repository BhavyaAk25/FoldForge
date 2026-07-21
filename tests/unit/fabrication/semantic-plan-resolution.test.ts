import { describe, expect, it } from "vitest";

import { compileFabricationProgram } from "@/core/fabrication/compiler";
import {
  expandResolvedSemanticFabricationPlan,
  expandSemanticFabricationPlan,
} from "@/core/fabrication/semantic-plan-expansion";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import {
  productionCardBoxIntent,
  productionConnectorReachPlan,
  productionIntermediateCollisionPlan,
} from "../../fixtures/production-geometric-failures";
import { fixtureLiveAcceptancePlan } from "../../fixtures/semantic-plan";

const reportFor = (plan: ReturnType<typeof productionConnectorReachPlan>) => {
  const intent = productionCardBoxIntent();
  const expanded = expandSemanticFabricationPlan(intent, plan, 1);
  expect(expanded.ok).toBe(true);
  if (!expanded.ok) throw new Error(JSON.stringify(expanded.error));
  const compiled = compileFabricationProgram(intent, expanded.value);
  expect(compiled.ok).toBe(true);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
  return verifyFabricationIr(compiled.value, `unresolved-${plan.topologyKey}`);
};

const expectResolved = (
  plan: ReturnType<typeof productionConnectorReachPlan>,
) => {
  const intent = productionCardBoxIntent();
  // Eight evaluations is the per-proposal share for a three-plan moving
  // batch. The causal variant must be prioritized inside that real route cap.
  const resolved = expandResolvedSemanticFabricationPlan(intent, plan, 1, 8);
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) throw new Error(JSON.stringify(resolved.error));
  const compiled = compileFabricationProgram(intent, resolved.value);
  expect(compiled.ok).toBe(true);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
  expect(
    verifyFabricationIr(compiled.value, `resolved-${plan.topologyKey}`),
  ).toMatchObject({ valid: true, failures: [] });
  return resolved;
};

describe("bounded semantic geometric resolution", () => {
  it("recovers detached tabs and boundary-crossing slots before compilation", () => {
    const source = fixtureLiveAcceptancePlan();
    const staticIntent = {
      ...productionCardBoxIntent(),
      behavior: "static",
    } as const;
    const invalidPlans = [
      {
        ...source,
        connectorRelationships: source.connectorRelationships.map(
          (relationship) => ({ ...relationship, tabDepthMm: 0.1 }),
        ),
      },
      {
        ...source,
        connectorRelationships: source.connectorRelationships.map(
          (relationship) => ({ ...relationship, slotInsetMm: 0.1 }),
        ),
      },
      {
        ...source,
        connectorRelationships: source.connectorRelationships.map(
          (relationship) => ({ ...relationship, tabDepthMm: 100 }),
        ),
      },
      {
        ...source,
        connectorRelationships: source.connectorRelationships.map(
          (relationship) => ({ ...relationship, slotInsetMm: 100 }),
        ),
      },
    ];

    for (const plan of invalidPlans) {
      const unresolved = expandSemanticFabricationPlan(staticIntent, plan, 1);
      expect(unresolved).toMatchObject({
        ok: false,
        error: {
          kind: "semantic_plan_mapping",
          code: "unsupported_mapping",
        },
      });
      if (unresolved.ok) throw new Error("Expected connector mapping failure.");
      expect(
        "path" in unresolved.error ? unresolved.error.path.slice(0, 2) : [],
      ).toEqual(["connectorRelationships", "lid-lock"]);
      const resolved = expandResolvedSemanticFabricationPlan(
        staticIntent,
        plan,
        1,
        8,
      );
      expect(resolved).toMatchObject({
        ok: true,
        resolutionDiagnostics: {
          categoryEvaluationCounts: { connector: 1 },
          evaluationSequence: ["connector"],
        },
      });
      if (!resolved.ok) throw new Error(JSON.stringify(resolved.error));
      const compiled = compileFabricationProgram(staticIntent, resolved.value);
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
      expect(
        verifyFabricationIr(compiled.value, "recovered-connector"),
      ).toMatchObject({
        valid: true,
        failures: [],
      });
    }
  });

  it("keeps recovered connector geometry subject to every later hard check", () => {
    const source = fixtureLiveAcceptancePlan();
    const invalidConnector = {
      ...source,
      connectorRelationships: source.connectorRelationships.map(
        (relationship) => ({ ...relationship, tabDepthMm: 0.1 }),
      ),
    };
    expect(
      expandResolvedSemanticFabricationPlan(
        {
          ...productionCardBoxIntent(),
          behavior: "static",
          requestedSize: { widthMm: 200, heightMm: 95, depthMm: 25 },
        },
        invalidConnector,
        1,
        8,
      ),
    ).toMatchObject({
      ok: false,
      error: {
        kind: "hard_verification_failure",
        code: "semantics.requested_size#width",
      },
    });
  });

  it("does not reinterpret invalid schemas, references, or plan limits", () => {
    expect(
      expandResolvedSemanticFabricationPlan(
        productionCardBoxIntent(),
        {},
        1,
        8,
      ),
    ).toMatchObject({
      ok: false,
      error: { kind: "semantic_plan_mapping", code: "contract_invalid" },
    });

    const source = fixtureLiveAcceptancePlan();
    expect(
      expandResolvedSemanticFabricationPlan(
        {
          ...productionCardBoxIntent(),
          fabricationBudget: {
            ...productionCardBoxIntent().fabricationBudget,
            maximumPanels: 1,
          },
        },
        source,
        1,
        8,
      ),
    ).toMatchObject({
      ok: false,
      error: { kind: "limit_exceeded", limit: "intent.maximumPanels" },
    });

    const missingConnectorPanel = {
      ...source,
      connectorRelationships: source.connectorRelationships.map(
        (relationship) => ({
          ...relationship,
          tabAttachment: {
            ...relationship.tabAttachment,
            panelKey: "missing-panel",
          },
        }),
      ),
    };
    expect(
      expandResolvedSemanticFabricationPlan(
        { ...productionCardBoxIntent(), behavior: "static" },
        missingConnectorPanel,
        1,
        8,
      ),
    ).toMatchObject({
      ok: false,
      error: { kind: "semantic_plan_mapping", code: "invalid_reference" },
    });
  });

  it("returns a typed bounded failure for impossible connector geometry", () => {
    const source = fixtureLiveAcceptancePlan();
    const impossible = {
      ...source,
      connectorRelationships: source.connectorRelationships.map(
        (relationship) => ({ ...relationship, spanMm: 500 }),
      ),
    };
    expect(
      expandResolvedSemanticFabricationPlan(
        { ...productionCardBoxIntent(), behavior: "static" },
        impossible,
        1,
        8,
      ),
    ).toMatchObject({
      ok: false,
      error: {
        kind: "connector_geometry_resolution_exhausted",
        code: "unsupported_mapping",
        path: ["connectorRelationships", "lid-lock", "spanMm"],
      },
    });
  });

  it("uses the complete joint path for a connector reach failure", () => {
    expect(reportFor(productionConnectorReachPlan()).failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          failureId: expect.stringMatching(
            /^connections\.connector_mate_reach/u,
          ),
        }),
      ]),
    );
    expectResolved(productionConnectorReachPlan());
  }, 20_000);

  it("clamps caller-supplied resolver budgets to the safe bounds", () => {
    const connectorPlan = productionConnectorReachPlan();
    const relationship = connectorPlan.connectorRelationships[0]!;
    const multiConnectorPlan = {
      ...connectorPlan,
      connectorRelationships: [
        ...connectorPlan.connectorRelationships,
        { ...relationship, key: "secondary-lock" },
      ],
    };
    expect(
      expandResolvedSemanticFabricationPlan(
        productionCardBoxIntent(),
        multiConnectorPlan,
        1,
        1,
      ),
    ).toMatchObject({
      ok: false,
      error: { resolverEvaluationCount: 2 },
    });
    expect(
      expandResolvedSemanticFabricationPlan(
        productionCardBoxIntent(),
        productionConnectorReachPlan(),
        1,
        10_000,
      ).ok,
    ).toBe(true);
  }, 20_000);

  it("resolves an intermediate motion collision within eight causal evaluations", () => {
    const report = reportFor(productionIntermediateCollisionPlan());
    expect(report.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          failureId: "collision.minimum_clearance",
          message: expect.stringContaining("driver value"),
        }),
      ]),
    );
    const resolved = expectResolved(productionIntermediateCollisionPlan());
    expect(resolved).toMatchObject({
      ok: true,
      resolutionDiagnostics: {
        resolverEvaluationCount: expect.any(Number),
        categoryEvaluationCounts: {
          reroot: expect.any(Number),
          adjacency: expect.any(Number),
        },
        evaluationSequence: expect.arrayContaining(["reroot", "adjacency"]),
      },
    });
    expect(
      resolved.resolutionDiagnostics.resolverEvaluationCount,
    ).toBeLessThanOrEqual(8);
    expect(
      resolved.resolutionDiagnostics.categoryEvaluationCounts.reroot,
    ).toBeGreaterThan(0);
    expect(
      resolved.resolutionDiagnostics.categoryEvaluationCounts.adjacency,
    ).toBeGreaterThan(0);
  }, 20_000);
});
