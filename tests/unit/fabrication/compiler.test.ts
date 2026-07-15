import { describe, expect, it } from "vitest";

import {
  compileFabricationProgram,
  fabricationIrHash,
  fabricationProgramHash,
} from "@/core/fabrication/compiler";
import { canonicalSerialize } from "@/core/canonical";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

describe("fabrication program compiler", () => {
  it("compiles normalized contours into deterministic millimetre IR", () => {
    const first = compileFabricationProgram(fixtureIntent(), fixtureProgram());
    const second = compileFabricationProgram(fixtureIntent(), fixtureProgram());
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(canonicalSerialize(first.value)).toBe(
      canonicalSerialize(second.value),
    );
    expect(first.value.irId).toBe(second.value.irId);
    expect(fabricationIrHash(first.value)).toMatch(/^[0-9a-f]{64}$/);
    expect(fabricationProgramHash(fixtureProgram())).toMatch(/^[0-9a-f]{64}$/);

    const wing = first.value.panels.find(
      (panel) => panel.panelId === "panel-wing",
    );
    expect(wing?.contour.vertices).toEqual([
      { xMm: 0, yMm: 0 },
      { xMm: 30, yMm: 0 },
      { xMm: 30, yMm: 60 },
      { xMm: 0, yMm: 60 },
    ]);
    expect(wing?.thicknessMm).toBe(0.3);
    expect(
      first.value.paths
        .filter((path) => path.pathId.startsWith("panel-wing.cut.edge-"))
        .map((path) => path.points),
    ).toEqual([
      [
        { xMm: 160, yMm: 90 },
        { xMm: 190, yMm: 90 },
      ],
      [
        { xMm: 190, yMm: 90 },
        { xMm: 190, yMm: 150 },
      ],
      [
        { xMm: 190, yMm: 150 },
        { xMm: 160, yMm: 150 },
      ],
    ]);
    expect(
      first.value.paths.find((path) => path.pathId === "crease-wing"),
    ).toMatchObject({ kind: "score", closed: false, sheetId: "sheet-a" });
  });

  it("rotates fabrication paths while preserving local panel geometry", () => {
    const program = fixtureProgram();
    const base = program.blueprint.panels[0];
    if (!base) throw new Error("Fixture requires a base panel.");
    const result = compileFabricationProgram(fixtureIntent(), {
      ...program,
      blueprint: {
        ...program.blueprint,
        panels: [
          {
            ...base,
            flatTransform: {
              translationMm: { xMm: 100, yMm: 50 },
              rotationDeg: 90,
            },
          },
          ...program.blueprint.panels.slice(1),
        ],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.panels[0]?.contour.vertices[1]).toEqual({
      xMm: 80,
      yMm: 0,
    });
    const path = result.value.paths.find(
      (candidate) => candidate.pathId === "panel-base.cut.edge-1",
    );
    expect(path?.points[1]?.xMm).toBeCloseTo(100);
    expect(path?.points[1]?.yMm).toBeCloseTo(130);
  });

  it("rejects blocked intent, identity mismatch, and unknown sheets", () => {
    const blocked = compileFabricationProgram(
      {
        ...fixtureIntent(),
        scopeStatus: "unsupported",
        unsupportedReason: "Requires a motor.",
      },
      fixtureProgram(),
    );
    expect(blocked).toEqual({
      ok: false,
      error: {
        kind: "unsupported_fabrication",
        reason: "Requires a motor.",
      },
    });

    const wrongIntent = compileFabricationProgram(fixtureIntent(), {
      ...fixtureProgram(),
      intentId: "intent-other",
    });
    expect(wrongIntent.ok).toBe(false);
    if (!wrongIntent.ok)
      expect(wrongIntent.error.kind).toBe("invalid_reference");

    const program = fixtureProgram();
    const firstPanel = program.blueprint.panels[0];
    if (!firstPanel) throw new Error("Fixture requires a panel.");
    const unknownSheet = compileFabricationProgram(fixtureIntent(), {
      ...program,
      blueprint: {
        ...program.blueprint,
        panels: [{ ...firstPanel, sheetId: "missing" }],
        bodies: [
          {
            ...program.blueprint.bodies[0],
            panelIds: [firstPanel.panelId],
          },
        ],
        joints: [],
        driver: null,
        outputs: [],
        couplings: [],
      },
    });
    expect(unknownSheet.ok).toBe(false);
    if (!unknownSheet.ok) {
      expect(unknownSheet.error).toMatchObject({
        kind: "invalid_reference",
        referenceKind: "sheet",
        referenceId: "missing",
      });
    }
  });

  it("rejects strict-schema drift", () => {
    const malformed = compileFabricationProgram(fixtureIntent(), {
      ...fixtureProgram(),
      unexpected: true,
    });
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) {
      expect(malformed.error).toMatchObject({
        kind: "contract_validation",
        contract: "FabricationProgramV1",
      });
    }
  });

  it("enforces normalized intent budgets instead of dropping them", () => {
    const intent = fixtureIntent();
    const result = compileFabricationProgram(
      {
        ...intent,
        fabricationBudget: {
          ...intent.fabricationBudget,
          maximumPanels: 1,
        },
      },
      fixtureProgram(),
    );
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "limit_exceeded",
        limit: "intent.maximumPanels",
        actual: 2,
        maximum: 1,
      },
    });
  });

  it("binds requested size into the verified design envelope", () => {
    const intent = fixtureIntent();
    const compiled = compileFabricationProgram(
      {
        ...intent,
        requestedSize: {
          widthMm: 1_999,
          heightMm: 1_999,
          depthMm: 1_999,
        },
      },
      fixtureProgram(),
    );
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.value.requestedSize).toEqual({
      widthMm: 1_999,
      heightMm: 1_999,
      depthMm: 1_999,
    });
    const report = verifyFabricationIr(
      compiled.value,
      "candidate-requested-size",
    );
    expect(report.failedAtStage).toBe("semantics");
    expect(report.failures.map((failure) => failure.failureId)).toEqual(
      expect.arrayContaining([
        "semantics.requested_size#width",
        "semantics.requested_size#height",
        "semantics.requested_size#depth",
      ]),
    );
  });

  it("carries omitted intent constraints into verification", () => {
    const intent = fixtureIntent();
    const constraint = {
      constraintId: "intent-impossible-width",
      kind: "dimension",
      hard: true,
      source: "user",
      geometryRef: { kind: "panel", id: "panel-base" },
      dimension: "width",
      minimumMm: 500,
      maximumMm: null,
      targetMm: null,
      toleranceMm: null,
    } as const;
    const compiled = compileFabricationProgram(
      { ...intent, semanticConstraints: [constraint] },
      fixtureProgram(),
    );
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.value.semanticConstraints).toContainEqual(constraint);
    const report = verifyFabricationIr(compiled.value, "candidate-intent-hard");
    expect(report.failedAtStage).toBe("semantics");
    expect(report.failures[0]?.failureId).toBe(
      "semantics.dimension#intent-impossible-width",
    );
  });

  it("rejects duplicate intent constraints instead of collapsing one", () => {
    const intent = fixtureIntent();
    const baseConstraint = {
      constraintId: "intent-duplicate-width",
      kind: "dimension",
      hard: true,
      source: "user",
      geometryRef: { kind: "panel", id: "panel-base" },
      dimension: "width",
      maximumMm: null,
      targetMm: null,
      toleranceMm: null,
    } as const;
    const result = compileFabricationProgram(
      {
        ...intent,
        semanticConstraints: [
          { ...baseConstraint, minimumMm: 500 },
          { ...baseConstraint, minimumMm: 1 },
        ],
      },
      fixtureProgram(),
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "contract_validation",
        contract: "FabricationIntentV1",
      },
    });
  });

  it("rejects unknown module connection references during compilation", () => {
    const program = fixtureProgram();
    const result = compileFabricationProgram(fixtureIntent(), {
      ...program,
      connections: [
        {
          connectionId: "connection-ghost",
          fromModuleId: "module-ghost",
          fromPortId: "port-out",
          toModuleId: "module-other",
          toPortId: "port-in",
        },
      ],
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "invalid_reference",
        referenceKind: "module",
        referenceId: "module-ghost",
      },
    });
  });
});
