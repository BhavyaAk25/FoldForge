import { describe, expect, it } from "vitest";

import { generateCandidates } from "@/core/candidates";
import { DEMO_CONSTRAINT } from "@/core/constraints";
import {
  deploymentState,
  deriveDimensions,
  findDeploymentIntersection,
  maximumPanelLengthErrorMm,
} from "@/core/geometry";
import { verifyCandidate } from "@/core/verification";

describe("continuous-strip geometry", () => {
  const candidates = generateCandidates(DEMO_CONSTRAINT, 20260714);

  it("generates nine deterministic, genuinely distinct candidates", () => {
    const repeated = generateCandidates(DEMO_CONSTRAINT, 20260714);
    expect(candidates).toEqual(repeated);
    expect(candidates).toHaveLength(9);
    expect(
      new Set(
        candidates.map((candidate) => JSON.stringify(candidate.parameters)),
      ).size,
    ).toBe(9);
    expect(new Set(candidates.map((candidate) => candidate.strategy))).toEqual(
      new Set(["stable", "balanced", "compact"]),
    );
  });

  it("preserves panel lengths throughout the folded construction", () => {
    const candidate = candidates[0];
    expect(candidate).toBeDefined();
    if (!candidate) return;

    expect(maximumPanelLengthErrorMm(candidate.geometry)).toBeLessThan(1e-9);
    expect(findDeploymentIntersection(candidate.geometry)).toEqual({
      intersects: false,
      progress: null,
    });

    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const state = deploymentState(candidate.geometry, progress);
      expect(
        Object.values(state)
          .flatMap((value) =>
            typeof value === "object" ? Object.values(value) : [value],
          )
          .every(Number.isFinite),
      ).toBe(true);
    }
  });

  it("uses the approved derived dimensions", () => {
    const candidate = candidates[4];
    expect(candidate).toBeDefined();
    if (!candidate) return;
    const derived = deriveDimensions(candidate.parameters);
    const angleRad = (candidate.parameters.backrestAngleDeg * Math.PI) / 180;
    expect(derived.backrestLengthMm).toBeCloseTo(
      candidate.parameters.backrestRiseMm / Math.sin(angleRad),
      9,
    );
    expect(derived.rearRunMm).toBeCloseTo(
      candidate.parameters.baseDepthMm -
        candidate.parameters.frontToeDepthMm -
        candidate.parameters.backrestRiseMm / Math.tan(angleRad),
      9,
    );
  });

  it("contains passing designs and a real aggressive compact failure", () => {
    const reports = candidates.map((candidate) =>
      verifyCandidate(candidate, DEMO_CONSTRAINT),
    );
    expect(reports.some((report) => report.valid)).toBe(true);
    const compactFailure = candidates.find(
      (candidate) =>
        candidate.strategy === "compact" && candidate.variant === 2,
    );
    expect(compactFailure).toBeDefined();
    if (!compactFailure) return;
    expect(
      verifyCandidate(compactFailure, DEMO_CONSTRAINT).hardFailures,
    ).toEqual(["geometry.rear_run"]);
  });
});
