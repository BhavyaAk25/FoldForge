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
};

describe("bounded semantic geometric resolution", () => {
  it("rejects detached tabs and boundary-crossing slots during derivation", () => {
    const source = fixtureLiveAcceptancePlan();
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
    ];

    for (const plan of invalidPlans) {
      expect(
        expandSemanticFabricationPlan(productionCardBoxIntent(), plan, 1),
      ).toMatchObject({
        ok: false,
        error: {
          kind: "semantic_plan_mapping",
          code: "unsupported_mapping",
          path: ["connectorRelationships", "lid-lock"],
        },
      });
    }
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
    expect(
      expandResolvedSemanticFabricationPlan(
        productionCardBoxIntent(),
        productionConnectorReachPlan(),
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

  it("keeps an intermediate motion collision hard-invalid before resolution", () => {
    const report = reportFor(productionIntermediateCollisionPlan());
    expect(report.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          failureId: "collision.minimum_clearance",
          message: expect.stringContaining("driver value"),
        }),
      ]),
    );
    expect(
      expandResolvedSemanticFabricationPlan(
        productionCardBoxIntent(),
        productionIntermediateCollisionPlan(),
        1,
      ),
    ).toMatchObject({
      ok: false,
      error: {
        kind: "geometric_resolution_exhausted",
        code: "collision.minimum_clearance",
        resolverEvaluationCount: 24,
      },
    });
  }, 20_000);
});
