import { SCORE_WEIGHTS } from "./constants";
import { clamp, round } from "./math";
import type { ScoreBreakdown } from "./types";

export interface ScoreInputs {
  readonly eligible: boolean;
  readonly frontStabilityMarginMm: number;
  readonly rearStabilityMarginMm: number;
  readonly sideStabilityMarginMm: number;
  readonly paperEfficiencyRatio: number;
  readonly targetAngleErrorDeg: number;
  readonly angleToleranceDeg: number;
  readonly slotClearanceMm: number;
  readonly priority: "stability" | "compactness" | "simplicity";
}

export const calculateScore = (input: ScoreInputs): ScoreBreakdown => {
  if (!input.eligible) {
    return {
      eligible: false,
      stability: 0,
      simplicity: 0,
      paperEfficiency: 0,
      targetAngle: 0,
      foldability: 0,
      total: 0,
    };
  }

  const minimumReserveMm = Math.min(
    input.frontStabilityMarginMm,
    input.rearStabilityMarginMm,
    input.sideStabilityMarginMm,
  );
  const rawScores = {
    stability: clamp(minimumReserveMm / 25, 0, 1),
    simplicity: 1,
    paperEfficiency: clamp(1 - input.paperEfficiencyRatio, 0, 1),
    targetAngle: clamp(
      1 - input.targetAngleErrorDeg / input.angleToleranceDeg,
      0,
      1,
    ),
    // Slot clearance is an actual fabrication feature. Panel clearance remains
    // reserved for future thickness-aware collision geometry and cannot affect
    // ranking until it changes the generated form.
    foldability: clamp((input.slotClearanceMm - 0.4) / 0.8, 0, 1),
  };
  const priorityKey =
    input.priority === "compactness" ? "paperEfficiency" : input.priority;
  const weights = {
    ...SCORE_WEIGHTS,
    [priorityKey]: SCORE_WEIGHTS[priorityKey] + 10,
  };
  const weightTotal = Object.values(weights).reduce(
    (sum, weight) => sum + weight,
    0,
  );
  const stability =
    (rawScores.stability * weights.stability * 100) / weightTotal;
  const simplicity =
    (rawScores.simplicity * weights.simplicity * 100) / weightTotal;
  const paperEfficiency =
    (rawScores.paperEfficiency * weights.paperEfficiency * 100) / weightTotal;
  const targetAngle =
    (rawScores.targetAngle * weights.targetAngle * 100) / weightTotal;
  const foldability =
    (rawScores.foldability * weights.foldability * 100) / weightTotal;

  return {
    eligible: true,
    stability: round(stability, 2),
    simplicity: round(simplicity, 2),
    paperEfficiency: round(paperEfficiency, 2),
    targetAngle: round(targetAngle, 2),
    foldability: round(foldability, 2),
    total: round(
      stability + simplicity + paperEfficiency + targetAngle + foldability,
      2,
    ),
  };
};
