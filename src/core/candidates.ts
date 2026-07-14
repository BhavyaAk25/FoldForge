import { stableHash } from "./canonical";
import { deviceFaceDimensions } from "./constraints";
import { buildStandGeometry } from "./geometry";
import { clamp, degreesToRadians, round } from "./math";
import type { CandidateParameters, DesignConstraint } from "./schemas";
import type { Candidate, CandidateStrategy } from "./types";

const variationFor = (
  seed: number,
  strategy: CandidateStrategy,
  variant: number,
): number =>
  parseInt(stableHash({ seed, strategy, variant }), 16) / 0xffffffff - 0.5;

const createParameters = (
  constraint: DesignConstraint,
  strategy: CandidateStrategy,
  variant: number,
  seed: number,
): CandidateParameters => {
  const face = deviceFaceDimensions(constraint);
  const targetAngleDeg = constraint.targetViewingAngleDeg;
  const angleRad = degreesToRadians(targetAngleDeg);
  const jitter = variationFor(seed, strategy, variant);
  const balancedRiseMm = clamp(face.lengthMm * 0.38, 45, 62);
  const balancedDepthMm = clamp(face.lengthMm * 0.5, 66, 82);
  const balancedWidthMm = clamp(face.widthMm + 12, 64, 125);
  const frontToeDepthMm = clamp(
    Math.max(8, constraint.objectDepthMm * Math.sin(angleRad) + 0.5),
    7,
    16,
  );
  const lipHeightMm = clamp(
    Math.max(8, constraint.objectDepthMm * Math.cos(angleRad) + 3),
    8,
    15,
  );

  const strategyAdjustments = {
    stable: { depthMm: 12, widthMm: 14, riseMm: 4, angleDeg: -1 },
    balanced: { depthMm: 0, widthMm: 0, riseMm: 0, angleDeg: 0 },
    compact: { depthMm: -9, widthMm: -5, riseMm: -7, angleDeg: 3 },
  }[strategy];

  const variantShift = variant - 1;
  let baseDepthMm =
    balancedDepthMm +
    strategyAdjustments.depthMm +
    variantShift * 3 +
    jitter * 2;
  let backrestRiseMm =
    balancedRiseMm + strategyAdjustments.riseMm - variantShift * 2 + jitter;
  let backrestAngleDeg =
    targetAngleDeg + strategyAdjustments.angleDeg + variantShift + jitter * 0.8;

  // The third compact sample is intentionally aggressive. It remains within all
  // parameter bounds but creates a real rear-run failure for the verifier to expose.
  if (strategy === "compact" && variant === 2) {
    baseDepthMm = 45;
    backrestRiseMm = clamp(balancedRiseMm + 9, 35, 90);
    backrestAngleDeg = 50;
  }

  const standWidthMm = clamp(
    balancedWidthMm + strategyAdjustments.widthMm + variantShift * 2 + jitter,
    60,
    160,
  );

  return {
    baseDepthMm: round(clamp(baseDepthMm, 45, 130), 3),
    standWidthMm: round(standWidthMm, 3),
    backrestRiseMm: round(clamp(backrestRiseMm, 35, 90), 3),
    backrestAngleDeg: round(clamp(backrestAngleDeg, 50, 75), 3),
    frontToeDepthMm: round(frontToeDepthMm, 3),
    lipHeightMm: round(lipHeightMm + (strategy === "stable" ? 1 : 0), 3),
    tabDepthMm: strategy === "stable" ? 11 : strategy === "balanced" ? 10 : 9,
    tabWidthMm: round(clamp(standWidthMm * 0.24, 16, 28), 3),
    slotClearanceMm: strategy === "compact" ? 0.6 : 0.8,
    panelClearanceMm: strategy === "compact" ? 0.6 : 0.9,
    lockingStyle: "dual_tabs",
  };
};

export const generateCandidates = (
  constraint: DesignConstraint,
  seed: number,
): readonly Candidate[] => {
  const strategies: readonly CandidateStrategy[] = [
    "stable",
    "balanced",
    "compact",
  ];

  return strategies.flatMap((strategy) =>
    [0, 1, 2].map((variant) => {
      const parameters = createParameters(constraint, strategy, variant, seed);
      const id = `${strategy}-${variant}-${stableHash({ seed, parameters })}`;
      return {
        id,
        strategy,
        variant,
        seed,
        parameters,
        geometry: buildStandGeometry(parameters),
      } satisfies Candidate;
    }),
  );
};
