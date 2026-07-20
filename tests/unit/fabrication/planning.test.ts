import { describe, expect, it } from "vitest";

import { canonicalSerialize } from "@/core/canonical";
import { compileFabricationProgram } from "@/core/fabrication/compiler";
import { createOfflineFabricationShowcases } from "@/core/fabrication/examples";
import {
  expandFabricationPlan,
  fabricationPlanFromProgram,
} from "@/core/fabrication/planning";
import { FabricationPlanV1Schema } from "@/core/fabrication/schemas";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

describe("compact fabrication planning", () => {
  it("expands one compact plan into a canonical deterministic program", () => {
    const intent = fixtureIntent();
    const plan = fabricationPlanFromProgram(fixtureProgram());
    const first = expandFabricationPlan(intent, plan, 1);
    const repeated = expandFabricationPlan(intent, plan, 1);

    expect(first).toEqual(repeated);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value).toMatchObject({
      intentId: intent.intentId,
      behavior: intent.behavior,
      sheets: intent.stockOptions,
      modules: [],
      connections: [],
      semanticConstraints: intent.semanticConstraints,
    });
    expect(first.value.blueprint.panels[0]?.semanticPartIds).toEqual([
      "part-base",
    ]);
    expect(first.value.blueprint.bodies[1]?.semanticPartIds).toEqual([
      "part-wing",
    ]);
    expect(first.value.blueprint.assemblyOperations.at(-1)).toMatchObject({
      kind: "verify",
    });
    expect(compileFabricationProgram(intent, first.value).ok).toBe(true);
  });

  it("binds generated identifiers to candidate ordinal and plan content", () => {
    const intent = fixtureIntent();
    const plan = fabricationPlanFromProgram(fixtureProgram());
    const first = expandFabricationPlan(intent, plan, 1);
    const second = expandFabricationPlan(intent, plan, 2);
    const changed = expandFabricationPlan(
      intent,
      { ...plan, candidateLabel: "Alternative expression" },
      1,
    );
    const changedIntent = expandFabricationPlan(
      {
        ...intent,
        stockOptions: intent.stockOptions.map((sheet) => ({
          ...sheet,
          widthMm: sheet.widthMm + 1,
        })),
      },
      plan,
      1,
    );

    expect(first.ok && second.ok && changed.ok && changedIntent.ok).toBe(true);
    if (!first.ok || !second.ok || !changed.ok || !changedIntent.ok) return;
    expect(second.value.programId).not.toBe(first.value.programId);
    expect(changed.value.programId).not.toBe(first.value.programId);
    expect(changedIntent.value.intentId).toBe(first.value.intentId);
    expect(changedIntent.value.programId).not.toBe(first.value.programId);
  });

  it("preserves showcase kinematics and produces byte-stable verified geometry", () => {
    for (const showcase of createOfflineFabricationShowcases()) {
      const plan = fabricationPlanFromProgram(showcase.program);
      const expanded = expandFabricationPlan(showcase.intent, plan, 1);
      expect(expanded.ok, showcase.showcaseId).toBe(true);
      if (!expanded.ok) continue;
      expect(expanded.value.blueprint.bodies, showcase.showcaseId).toEqual(
        showcase.program.blueprint.bodies,
      );
      expect(expanded.value.blueprint.joints, showcase.showcaseId).toEqual(
        showcase.program.blueprint.joints,
      );
      const compiled = compileFabricationProgram(
        showcase.intent,
        expanded.value,
      );
      expect(compiled.ok, showcase.showcaseId).toBe(true);
      if (!compiled.ok) continue;
      expect(
        verifyFabricationIr(compiled.value, `candidate-${showcase.showcaseId}`)
          .valid,
        showcase.showcaseId,
      ).toBe(true);
      const repeated = expandFabricationPlan(showcase.intent, plan, 1);
      expect(repeated.ok, showcase.showcaseId).toBe(true);
      if (repeated.ok) {
        expect(canonicalSerialize(repeated.value)).toBe(
          canonicalSerialize(expanded.value),
        );
      }
    }
  });

  it("selects only referenced stock and rejects an unresolved sheet", () => {
    const intent = fixtureIntent();
    const alternative = {
      ...intent.stockOptions[0]!,
      sheetId: "sheet-b",
      material: {
        ...intent.stockOptions[0]!.material,
        materialId: "card-alternative",
      },
    };
    const intentWithAlternative = {
      ...intent,
      stockOptions: [...intent.stockOptions, alternative],
    };
    const plan = fabricationPlanFromProgram(fixtureProgram());
    const selected = expandFabricationPlan(intentWithAlternative, plan, 1);
    expect(selected.ok).toBe(true);
    if (selected.ok) {
      expect(selected.value.sheets.map((sheet) => sheet.sheetId)).toEqual([
        "sheet-a",
      ]);
    }
    expect(
      expandFabricationPlan(
        intentWithAlternative,
        {
          ...plan,
          panels: plan.panels.map((panel) => ({
            ...panel,
            sheetId: "sheet-missing",
          })),
        },
        1,
      ),
    ).toMatchObject({
      ok: false,
      error: {
        kind: "invalid_reference",
        referenceKind: "stock_option",
      },
    });
    expect(
      expandFabricationPlan(
        intentWithAlternative,
        {
          ...plan,
          panels: plan.panels.map((panel, index) => ({
            ...panel,
            sheetId: index === 0 ? "sheet-a" : "sheet-b",
          })),
        },
        1,
      ),
    ).toMatchObject({
      ok: false,
      error: {
        kind: "limit_exceeded",
        limit: "intent.maximumSheets",
      },
    });
  });

  it("derives an articulated hinge assembly operation", () => {
    const plan = fabricationPlanFromProgram(fixtureProgram());
    const fold = plan.joints[0]!;
    expect(fold.kind).toBe("fold");
    if (fold.kind !== "fold") {
      throw new Error("The fixture must begin with a fold joint.");
    }
    const expanded = expandFabricationPlan(
      fixtureIntent(),
      {
        ...plan,
        joints: [
          {
            jointId: fold.jointId,
            kind: "revolute",
            parentBodyId: fold.parentBodyId,
            childBodyId: fold.childBodyId,
            axis: fold.axis,
            connectorIds: ["connector-hinge"],
            homeAngleDeg: fold.homeAngleDeg,
            minAngleDeg: fold.minAngleDeg,
            maxAngleDeg: fold.maxAngleDeg,
          },
        ],
      },
      1,
    );
    expect(expanded.ok).toBe(true);
    if (expanded.ok) {
      expect(expanded.value.blueprint.driver).toMatchObject({
        control: "rotate",
        unit: "deg",
      });
      expect(expanded.value.blueprint.assemblyOperations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "join_hinge" }),
        ]),
      );
    }
  });

  it("derives a fold driver's redundant control and unit from its joint", () => {
    const plan = fabricationPlanFromProgram(fixtureProgram());
    const expanded = expandFabricationPlan(
      fixtureIntent(),
      {
        ...plan,
        driver: plan.driver
          ? { ...plan.driver, control: "rotate", unit: "mm" }
          : null,
      },
      1,
    );

    expect(expanded.ok).toBe(true);
    if (expanded.ok) {
      expect(expanded.value.blueprint.driver).toMatchObject({
        control: "fold",
        unit: "deg",
      });
    }
  });

  it("rejects malformed plans and unsupported intents before expansion", () => {
    const plan = fabricationPlanFromProgram(fixtureProgram());
    expect(FabricationPlanV1Schema.safeParse(plan).success).toBe(true);
    expect(
      FabricationPlanV1Schema.safeParse({ ...plan, version: "2" }).success,
    ).toBe(false);
    expect(
      FabricationPlanV1Schema.safeParse({ ...plan, unexpected: true }).success,
    ).toBe(false);
    expect(
      expandFabricationPlan(fixtureIntent(), { ...plan, panels: [] }, 1),
    ).toMatchObject({
      ok: false,
      error: { contract: "FabricationPlanV1" },
    });
    expect(
      expandFabricationPlan(
        {
          ...fixtureIntent(),
          scopeStatus: "unsupported",
          unsupportedReason: "Needs electronics.",
        },
        plan,
        1,
      ),
    ).toMatchObject({
      ok: false,
      error: { kind: "unsupported_fabrication" },
    });
    expect(expandFabricationPlan(fixtureIntent(), plan, 0)).toMatchObject({
      ok: false,
      error: { contract: "FabricationPlanV1" },
    });
  });
});
