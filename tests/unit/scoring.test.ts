import { describe, expect, it } from "vitest";

import { calculateScore } from "@/core/scoring";

const baseInput = {
  eligible: true,
  frontStabilityMarginMm: 20,
  rearStabilityMarginMm: 18,
  sideStabilityMarginMm: 30,
  paperEfficiencyRatio: 0.35,
  targetAngleErrorDeg: 1,
  angleToleranceDeg: 5,
  panelClearanceMm: 1,
} as const;

describe("deterministic scoring", () => {
  it("makes failed candidates ineligible", () => {
    expect(
      calculateScore({ ...baseInput, eligible: false, priority: "stability" }),
    ).toEqual({
      eligible: false,
      stability: 0,
      simplicity: 0,
      paperEfficiency: 0,
      targetAngle: 0,
      foldability: 0,
      total: 0,
    });
  });

  it.each(["stability", "compactness", "simplicity"] as const)(
    "produces bounded scores with %s priority",
    (priority) => {
      const score = calculateScore({ ...baseInput, priority });
      expect(score.eligible).toBe(true);
      expect(score.total).toBeGreaterThan(0);
      expect(score.total).toBeLessThanOrEqual(100);
    },
  );

  it("clamps poor reserves and excessive errors", () => {
    const score = calculateScore({
      ...baseInput,
      frontStabilityMarginMm: -100,
      targetAngleErrorDeg: 100,
      paperEfficiencyRatio: 2,
      panelClearanceMm: 0,
      priority: "stability",
    });
    expect(score.stability).toBe(0);
    expect(score.targetAngle).toBe(0);
    expect(score.paperEfficiency).toBe(0);
    expect(score.foldability).toBe(0);
  });
});
