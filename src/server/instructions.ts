import type { Candidate, VerificationReport } from "@/core/types";
import type { DesignConstraint } from "@/core/schemas";

export interface FinalNarrative {
  readonly summary: string;
  readonly tradeoffs: readonly string[];
  readonly foldingSteps: readonly string[];
  readonly limitations: readonly string[];
}

export const deterministicInstructions = (
  candidate: Candidate,
  constraint: DesignConstraint,
  report: VerificationReport,
): FinalNarrative => ({
  summary: `${candidate.strategy} stand ${candidate.id} passed all deterministic geometric and kinematic checks with a ${report.scoreBreakdown.total.toFixed(1)} score.`,
  tradeoffs: [
    `${candidate.parameters.baseDepthMm.toFixed(1)} mm base depth balances footprint and stability reserve.`,
    `${candidate.parameters.backrestAngleDeg.toFixed(1)}° backrest targets the requested ${constraint.targetViewingAngleDeg.toFixed(1)}° view.`,
    "Dual tabs add two slot cuts but let the stand return to a planar sheet without glue.",
  ],
  foldingSteps: [
    "Print at 100% / actual size and confirm the calibration line measures 50 mm.",
    "Cut the solid perimeter and both red slot lines; do not cut dashed score lines.",
    "Score all five dashed crease components before folding.",
    "Fold the front lip up along the base-lip crease.",
    "Raise the rear brace and backrest until the backrest reaches the labelled angle.",
    "Guide both tabs into their matching base slots without forcing the paper.",
    "To return flat, remove both tabs first, lower the lip, and unfold the strip.",
  ],
  limitations: [
    "Geometric and kinematic verification only; material strength and friction are not simulated.",
    "Physical validation remains pending until the printed stand completes the documented test.",
  ],
});
