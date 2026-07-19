import type {
  FabricationBehavior,
  FabricationIntentV1,
  FabricationUnit,
} from "@/core/fabrication/types";

export interface ExpectedLiveIntentConstraints {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly depthMm: number;
  readonly materialThicknessMm: number;
  readonly requiredMaterialTerms: readonly string[];
  readonly sheetSizeMm: {
    readonly widthMm: number;
    readonly heightMm: number;
  } | null;
  readonly printableMarginMm?: number;
  readonly maximumSheets: number;
  readonly behavior: FabricationBehavior;
  readonly cutsAllowed: boolean;
  readonly glueAllowed: boolean;
  readonly motion: {
    readonly unit: Extract<FabricationUnit, "mm" | "deg">;
    readonly maximumValue: number;
    readonly tolerance: number;
  } | null;
  readonly requiredSemanticKinds: readonly (
    "symmetry" | "recognizable_form" | "fold_flat"
  )[];
  readonly requiredDimensionTargetsMm: readonly number[];
  readonly requiredDescriptionTerms: readonly string[];
}

export interface LiveIntentConstraintCheck {
  readonly field: string;
  readonly expected: string | number | boolean;
  readonly observed: string | number | boolean | null;
  readonly passed: boolean;
}

export interface LiveIntentConstraintEvidence {
  readonly checks: readonly LiveIntentConstraintCheck[];
  readonly passedCount: number;
  readonly checkCount: number;
  readonly recallRate: number;
  readonly passed: boolean;
}

const closeTo = (value: number | null, expected: number, tolerance: number) =>
  value !== null && Math.abs(value - expected) <= tolerance;

const normalizedMaterialLabel = (value: string): string =>
  value.toLocaleLowerCase("en-US").replaceAll(/[^a-z0-9]+/gu, "");

const check = (
  field: string,
  expected: string | number | boolean,
  observed: string | number | boolean | null,
  passed: boolean,
): LiveIntentConstraintCheck => ({ field, expected, observed, passed });

export const evaluateLiveIntentConstraints = (
  intent: FabricationIntentV1,
  expected: ExpectedLiveIntentConstraints,
): LiveIntentConstraintEvidence => {
  const expectedMaterialTerms = expected.requiredMaterialTerms.map(
    normalizedMaterialLabel,
  );
  const matchingStock = intent.stockOptions.find((sheet) => {
    const label = normalizedMaterialLabel(sheet.material.label);
    const materialMatches =
      closeTo(
        sheet.material.thicknessMm,
        expected.materialThicknessMm,
        0.001,
      ) && expectedMaterialTerms.every((term) => label.includes(term));
    const marginMatches =
      expected.printableMarginMm === undefined ||
      closeTo(sheet.printableMarginMm, expected.printableMarginMm, 0.001);
    if (!expected.sheetSizeMm) return materialMatches && marginMatches;
    const expectedSides = [
      expected.sheetSizeMm.widthMm,
      expected.sheetSizeMm.heightMm,
    ].toSorted((left, right) => left - right);
    const observedSides = [sheet.widthMm, sheet.heightMm].toSorted(
      (left, right) => left - right,
    );
    return (
      materialMatches &&
      marginMatches &&
      closeTo(observedSides[0] ?? null, expectedSides[0] ?? 0, 0.01) &&
      closeTo(observedSides[1] ?? null, expectedSides[1] ?? 0, 0.01)
    );
  });
  const motionConstraint = expected.motion
    ? intent.semanticConstraints.find(
        (constraint) =>
          constraint.kind === "motion" &&
          constraint.hard &&
          constraint.source === "user" &&
          constraint.unit === expected.motion?.unit &&
          closeTo(
            constraint.maximumValue,
            expected.motion.maximumValue,
            expected.motion.tolerance,
          ),
      )
    : null;
  const descriptiveIntent = [
    intent.title,
    intent.objectLabel,
    intent.functionalGoal,
    intent.visualDescription,
  ]
    .join(" ")
    .toLocaleLowerCase("en-US");

  const checks: LiveIntentConstraintCheck[] = [
    check(
      "scopeStatus",
      "supported",
      intent.scopeStatus,
      intent.scopeStatus === "supported",
    ),
    check(
      "requestedSize.widthMm",
      expected.widthMm,
      intent.requestedSize.widthMm,
      closeTo(intent.requestedSize.widthMm, expected.widthMm, 0.01),
    ),
    check(
      "requestedSize.heightMm",
      expected.heightMm,
      intent.requestedSize.heightMm,
      closeTo(intent.requestedSize.heightMm, expected.heightMm, 0.01),
    ),
    check(
      "requestedSize.depthMm",
      expected.depthMm,
      intent.requestedSize.depthMm,
      closeTo(intent.requestedSize.depthMm, expected.depthMm, 0.01),
    ),
    check(
      "stock.material.thicknessMm",
      expected.materialThicknessMm,
      matchingStock?.material.thicknessMm ?? null,
      matchingStock !== undefined,
    ),
    check(
      "fabricationBudget.maximumSheets",
      expected.maximumSheets,
      intent.fabricationBudget.maximumSheets,
      intent.fabricationBudget.maximumSheets === expected.maximumSheets,
    ),
    check(
      "behavior",
      expected.behavior,
      intent.behavior,
      intent.behavior === expected.behavior,
    ),
    check(
      "fabricationBudget.cutsAllowed",
      expected.cutsAllowed,
      intent.fabricationBudget.cutsAllowed,
      intent.fabricationBudget.cutsAllowed === expected.cutsAllowed,
    ),
    check(
      "fabricationBudget.glueAllowed",
      expected.glueAllowed,
      intent.fabricationBudget.glueAllowed,
      intent.fabricationBudget.glueAllowed === expected.glueAllowed,
    ),
  ];

  if (expected.sheetSizeMm) {
    const expectedSides = [
      expected.sheetSizeMm.widthMm,
      expected.sheetSizeMm.heightMm,
    ].toSorted((left, right) => left - right);
    const observedSides = matchingStock
      ? [matchingStock.widthMm, matchingStock.heightMm].toSorted(
          (left, right) => left - right,
        )
      : [];
    checks.push(
      check(
        "stock.sheet.shortSideMm",
        expectedSides[0] ?? 0,
        observedSides[0] ?? null,
        matchingStock !== undefined,
      ),
      check(
        "stock.sheet.longSideMm",
        expectedSides[1] ?? 0,
        observedSides[1] ?? null,
        matchingStock !== undefined,
      ),
    );
  }

  if (expected.printableMarginMm !== undefined) {
    checks.push(
      check(
        "stock.sheet.printableMarginMm",
        expected.printableMarginMm,
        matchingStock?.printableMarginMm ?? null,
        matchingStock !== undefined,
      ),
    );
  }

  for (const term of expectedMaterialTerms) {
    checks.push(
      check(
        `stock.material.label.includes.${term}`,
        true,
        matchingStock
          ? normalizedMaterialLabel(matchingStock.material.label).includes(term)
          : false,
        matchingStock !== undefined,
      ),
    );
  }

  if (expected.motion) {
    checks.push(
      check(
        `semanticConstraints.motion.maximumValue.${expected.motion.unit}`,
        expected.motion.maximumValue,
        motionConstraint?.kind === "motion"
          ? motionConstraint.maximumValue
          : null,
        motionConstraint !== undefined,
      ),
    );
  }

  for (const kind of expected.requiredSemanticKinds) {
    const observed = intent.semanticConstraints.some(
      (constraint) =>
        constraint.kind === kind &&
        constraint.hard &&
        constraint.source === "user",
    );
    checks.push(check(`semanticConstraints.${kind}`, true, observed, observed));
  }

  for (const targetMm of expected.requiredDimensionTargetsMm) {
    const observed = intent.semanticConstraints.some(
      (constraint) =>
        constraint.kind === "dimension" &&
        constraint.hard &&
        constraint.source === "user" &&
        closeTo(constraint.targetMm, targetMm, 0.01),
    );
    checks.push(
      check(
        `semanticConstraints.dimension.${targetMm}mm`,
        targetMm,
        observed ? targetMm : null,
        observed,
      ),
    );
  }

  for (const term of expected.requiredDescriptionTerms) {
    const normalized = term.toLocaleLowerCase("en-US");
    const observed = descriptiveIntent.includes(normalized);
    checks.push(
      check(`description.includes.${normalized}`, true, observed, observed),
    );
  }

  const passedCount = checks.filter((item) => item.passed).length;
  return {
    checks,
    passedCount,
    checkCount: checks.length,
    recallRate: passedCount / checks.length,
    passed: passedCount === checks.length,
  };
};
