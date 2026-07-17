import { describe, expect, it } from "vitest";

import { evaluateLiveIntentConstraints } from "@/server/evals/live-constraint-evidence";
import { fixtureIntent } from "../../fixtures/fabrication";

describe("live intent constraint evidence", () => {
  it("measures explicit fields without treating the source prompt as recall", () => {
    const base = fixtureIntent();
    const intent = {
      ...base,
      sourcePrompt: "actuated-tray paired-wings 70 mm mirrored",
      requestedSize: { widthMm: 210, heightMm: 110, depthMm: 95 },
      stockOptions: base.stockOptions.map((sheet) => ({
        ...sheet,
        material: { ...sheet.material, thicknessMm: 0.4 },
      })),
      fabricationBudget: {
        ...base.fabricationBudget,
        maximumSheets: 2,
        cutsAllowed: true,
        glueAllowed: false,
      },
      behavior: "open_close" as const,
      semanticConstraints: [
        {
          constraintId: "motion-tray",
          kind: "motion" as const,
          hard: true,
          source: "user" as const,
          outputId: "output-tray",
          minimumValue: 0,
          maximumValue: 70,
          unit: "mm" as const,
        },
        {
          constraintId: "symmetry-wings",
          kind: "symmetry" as const,
          hard: true,
          source: "user" as const,
          bodyIds: ["body-left", "body-right"],
          plane: "yz" as const,
          linearToleranceMm: 0.5,
          angularToleranceDeg: 1,
        },
      ],
    };

    const evidence = evaluateLiveIntentConstraints(intent, {
      widthMm: 210,
      heightMm: 110,
      depthMm: 95,
      materialThicknessMm: 0.4,
      requiredMaterialTerms: ["card"],
      sheetSizeMm: null,
      maximumSheets: 2,
      behavior: "open_close",
      cutsAllowed: true,
      glueAllowed: false,
      motion: { unit: "mm", maximumValue: 70, tolerance: 1 },
      requiredSemanticKinds: ["symmetry"],
      requiredDimensionTargetsMm: [],
      requiredDescriptionTerms: ["actuated-tray", "paired-wings"],
    });

    expect(evidence.checks.slice(-2)).toEqual([
      expect.objectContaining({
        field: "description.includes.actuated-tray",
        passed: false,
      }),
      expect.objectContaining({
        field: "description.includes.paired-wings",
        passed: false,
      }),
    ]);
    expect(evidence.passed).toBe(false);
  });

  it("passes when every explicit constraint is present", () => {
    const base = fixtureIntent();
    const intent = {
      ...base,
      title: "Mirrored wing desk organizer",
      objectLabel: "front tray organizer",
      behavior: "open_close" as const,
      requestedSize: { widthMm: 210, heightMm: 110, depthMm: 95 },
      stockOptions: base.stockOptions.map((sheet) => ({
        ...sheet,
        material: { ...sheet.material, thicknessMm: 0.4 },
      })),
      fabricationBudget: {
        ...base.fabricationBudget,
        maximumSheets: 2,
        cutsAllowed: true,
        glueAllowed: false,
      },
      semanticConstraints: [
        {
          constraintId: "motion-tray",
          kind: "motion" as const,
          hard: true,
          source: "user" as const,
          outputId: "output-tray",
          minimumValue: 0,
          maximumValue: 70,
          unit: "mm" as const,
        },
        {
          constraintId: "symmetry-wings",
          kind: "symmetry" as const,
          hard: true,
          source: "user" as const,
          bodyIds: ["body-left", "body-right"],
          plane: "yz" as const,
          linearToleranceMm: 0.5,
          angularToleranceDeg: 1,
        },
      ],
    };

    expect(
      evaluateLiveIntentConstraints(intent, {
        widthMm: 210,
        heightMm: 110,
        depthMm: 95,
        materialThicknessMm: 0.4,
        requiredMaterialTerms: ["card"],
        sheetSizeMm: null,
        maximumSheets: 2,
        behavior: "open_close",
        cutsAllowed: true,
        glueAllowed: false,
        motion: { unit: "mm", maximumValue: 70, tolerance: 1 },
        requiredSemanticKinds: ["symmetry"],
        requiredDimensionTargetsMm: [],
        requiredDescriptionTerms: ["tray", "wing"],
      }),
    ).toMatchObject({ passed: true, recallRate: 1 });
  });

  it("treats portrait and landscape descriptions of the same sheet as equivalent", () => {
    const base = fixtureIntent();
    const intent = {
      ...base,
      stockOptions: base.stockOptions.map((sheet) => ({
        ...sheet,
        widthMm: 420,
        heightMm: 297,
        material: { ...sheet.material, thicknessMm: 0.4 },
      })),
    };

    const evidence = evaluateLiveIntentConstraints(intent, {
      widthMm: base.requestedSize.widthMm,
      heightMm: base.requestedSize.heightMm,
      depthMm: base.requestedSize.depthMm ?? 1,
      materialThicknessMm: 0.4,
      requiredMaterialTerms: ["card"],
      sheetSizeMm: { widthMm: 297, heightMm: 420 },
      maximumSheets: base.fabricationBudget.maximumSheets,
      behavior: base.behavior,
      cutsAllowed: base.fabricationBudget.cutsAllowed,
      glueAllowed: base.fabricationBudget.glueAllowed,
      motion: null,
      requiredSemanticKinds: [],
      requiredDimensionTargetsMm: [],
      requiredDescriptionTerms: [],
    });

    expect(
      evidence.checks.filter((item) => item.field.startsWith("stock.sheet")),
    ).toEqual([
      expect.objectContaining({ passed: true }),
      expect.objectContaining({ passed: true }),
    ]);
  });

  it("rejects size, thickness, and material split across stock options", () => {
    const base = fixtureIntent();
    const sourceSheet = base.stockOptions[0];
    if (!sourceSheet) throw new Error("Fixture stock is unavailable.");
    const intent = {
      ...base,
      stockOptions: [
        {
          ...sourceSheet,
          widthMm: 297,
          heightMm: 420,
          material: {
            ...sourceSheet.material,
            label: "0.8 mm plastic",
            thicknessMm: 0.8,
          },
        },
        {
          ...sourceSheet,
          sheetId: "sheet-b",
          widthMm: 210,
          heightMm: 210,
          material: {
            ...sourceSheet.material,
            label: "0.4 mm cardstock",
            thicknessMm: 0.4,
          },
        },
      ],
    };

    const evidence = evaluateLiveIntentConstraints(intent, {
      widthMm: base.requestedSize.widthMm,
      heightMm: base.requestedSize.heightMm,
      depthMm: base.requestedSize.depthMm ?? 1,
      materialThicknessMm: 0.4,
      requiredMaterialTerms: ["cardstock"],
      sheetSizeMm: { widthMm: 297, heightMm: 420 },
      maximumSheets: base.fabricationBudget.maximumSheets,
      behavior: base.behavior,
      cutsAllowed: base.fabricationBudget.cutsAllowed,
      glueAllowed: base.fabricationBudget.glueAllowed,
      motion: null,
      requiredSemanticKinds: [],
      requiredDimensionTargetsMm: [],
      requiredDescriptionTerms: [],
    });

    expect(evidence.passed).toBe(false);
    expect(
      evidence.checks.filter(
        (item) =>
          item.field.startsWith("stock.sheet") ||
          item.field.startsWith("stock.material"),
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ passed: false })]),
    );
  });

  it("accepts fold-flat recall only as a hard user semantic constraint", () => {
    const base = fixtureIntent();
    const sourceSheet = base.stockOptions[0];
    if (!sourceSheet) throw new Error("Fixture stock is unavailable.");
    const foldFlatConstraint = {
      constraintId: "fold-flat-display",
      kind: "fold_flat" as const,
      hard: true,
      source: "user" as const,
      bodyIds: ["body-display"],
      maximumStackThicknessMm:
        sourceSheet.material.thicknessMm * base.fabricationBudget.maximumPanels,
    };
    const expected = {
      widthMm: base.requestedSize.widthMm,
      heightMm: base.requestedSize.heightMm,
      depthMm: base.requestedSize.depthMm ?? 1,
      materialThicknessMm: sourceSheet.material.thicknessMm,
      requiredMaterialTerms: [],
      sheetSizeMm: null,
      maximumSheets: base.fabricationBudget.maximumSheets,
      behavior: base.behavior,
      cutsAllowed: base.fabricationBudget.cutsAllowed,
      glueAllowed: base.fabricationBudget.glueAllowed,
      motion: null,
      requiredSemanticKinds: ["fold_flat" as const],
      requiredDimensionTargetsMm: [],
      requiredDescriptionTerms: [],
    };

    const variants = [
      { semanticConstraints: [], passed: false },
      {
        semanticConstraints: [{ ...foldFlatConstraint, hard: false }],
        passed: false,
      },
      {
        semanticConstraints: [
          { ...foldFlatConstraint, source: "inferred" as const },
        ],
        passed: false,
      },
      { semanticConstraints: [foldFlatConstraint], passed: true },
    ] as const;

    for (const variant of variants) {
      expect(
        evaluateLiveIntentConstraints(
          { ...base, semanticConstraints: variant.semanticConstraints },
          expected,
        ).passed,
      ).toBe(variant.passed);
    }
  });
});
