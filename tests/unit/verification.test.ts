import { describe, expect, it } from "vitest";

import { generateCandidates } from "@/core/candidates";
import { DEMO_CONSTRAINT } from "@/core/constraints";
import { buildStandGeometry } from "@/core/geometry";
import type { CandidateParameters, DesignConstraint } from "@/core/schemas";
import type { Candidate, CandidateWithReport } from "@/core/types";
import {
  compareCandidates,
  selectRepresentatives,
  verifyCandidate,
} from "@/core/verification";

const baseCandidate = generateCandidates(DEMO_CONSTRAINT, 20260714).find(
  (candidate) => candidate.strategy === "balanced" && candidate.variant === 1,
);

if (!baseCandidate) throw new Error("Expected balanced fixture candidate.");

const candidateWith = (
  parameters: CandidateParameters,
  id: string,
): Candidate => ({
  ...baseCandidate,
  id,
  parameters,
  geometry: buildStandGeometry(parameters),
});

describe("ordered deterministic verification", () => {
  it("passes a supported candidate and exposes every required report field", () => {
    const report = verifyCandidate(baseCandidate, DEMO_CONSTRAINT);
    expect(report.valid).toBe(true);
    expect(report.hardFailures).toEqual([]);
    expect(report.checks.every((check) => check.status === "pass")).toBe(true);
    expect(report.scoreBreakdown.eligible).toBe(true);
    expect(report.physicalStatus).toBe("awaiting_user");
    expect(report.warnings.join(" ")).toContain("Physical validation pending");
    expect(report.frontStabilityMarginMm).toBeGreaterThan(0);
    expect(report.rearStabilityMarginMm).toBeGreaterThan(0);
  });

  it("stops after strict schema failure", () => {
    const invalidParameters = {
      ...baseCandidate.parameters,
      baseDepthMm: 20,
    } as CandidateParameters;
    const report = verifyCandidate(
      candidateWith(invalidParameters, "schema-failure"),
      DEMO_CONSTRAINT,
    );
    expect(report.hardFailures).toEqual(["schema.valid"]);
    expect(report.checks[1]?.status).toBe("not_run");
    expect(report.scoreBreakdown.eligible).toBe(false);
  });

  it("stops unsupported and unresolved requests before geometry", () => {
    const constraint: DesignConstraint = {
      ...DEMO_CONSTRAINT,
      unresolvedQuestions: ["What is the device mass?"],
      supportedScopeStatus: "needs_clarification",
      feasibilityStatus: "unknown",
    };
    const report = verifyCandidate(baseCandidate, constraint);
    expect(report.hardFailures).toEqual(["scope.supported"]);
    expect(
      report.checks.find((check) => check.id === "geometry.rear_run")?.status,
    ).toBe("not_run");
  });

  it("measures rear-run failure before downstream checks", () => {
    const compactFailure = generateCandidates(DEMO_CONSTRAINT, 20260714).find(
      (candidate) =>
        candidate.strategy === "compact" && candidate.variant === 2,
    );
    expect(compactFailure).toBeDefined();
    if (!compactFailure) return;
    const report = verifyCandidate(compactFailure, DEMO_CONSTRAINT);
    expect(report.hardFailures).toEqual(["geometry.rear_run"]);
    expect(
      report.checks.find((check) => check.id === "geometry.finite")?.status,
    ).toBe("not_run");
  });

  it("rejects sheet overflow", () => {
    const parameters: CandidateParameters = {
      ...baseCandidate.parameters,
      baseDepthMm: 130,
      standWidthMm: 160,
      backrestRiseMm: 90,
      backrestAngleDeg: 75,
      frontToeDepthMm: 7,
      lipHeightMm: 18,
    };
    const constraint: DesignConstraint = {
      ...DEMO_CONSTRAINT,
      sheetWidthMm: 180,
      sheetHeightMm: 250,
      printableMarginMm: 15,
    };
    const report = verifyCandidate(
      candidateWith(parameters, "overflow"),
      constraint,
    );
    expect(report.hardFailures).toEqual(["sheet.bounds"]);
  });

  it("rejects overlapping slots as a minimum-feature violation", () => {
    const parameters: CandidateParameters = {
      ...baseCandidate.parameters,
      standWidthMm: 60,
      tabWidthMm: 28,
    };
    const report = verifyCandidate(
      candidateWith(parameters, "feature-failure"),
      DEMO_CONSTRAINT,
    );
    expect(report.hardFailures).toEqual(["feature.minimum"]);
  });

  it("enforces the two-cut locking requirement", () => {
    const constraint: DesignConstraint = {
      ...DEMO_CONSTRAINT,
      cutsAllowed: false,
      maximumCutCount: 0,
    };
    const report = verifyCandidate(baseCandidate, constraint);
    expect(report.hardFailures).toEqual(["topology.cuts"]);
  });

  it("rejects target-angle error after rigid transforms pass", () => {
    const parameters: CandidateParameters = {
      ...baseCandidate.parameters,
      baseDepthMm: 90,
      backrestRiseMm: 50,
      backrestAngleDeg: 50,
      frontToeDepthMm: 10,
      lipHeightMm: 18,
    };
    const report = verifyCandidate(
      candidateWith(parameters, "angle-failure"),
      DEMO_CONSTRAINT,
    );
    expect(report.hardFailures).toEqual(["angle.target"]);
    expect(report.targetAngleErrorDeg).toBe(15);
  });

  it("rejects folded coordinates that do not match the parameter-owned source", () => {
    const corrupted: Candidate = {
      ...baseCandidate,
      id: "corrupt-folded-geometry",
      geometry: {
        ...baseCandidate.geometry,
        folded: {
          ...baseCandidate.geometry.folded,
          panels: baseCandidate.geometry.folded.panels.map((panel) => ({
            ...panel,
            points: panel.points.map(() => ({ xMm: 0, yMm: 0, zMm: 0 })),
          })),
        },
      },
    };
    const report = verifyCandidate(corrupted, DEMO_CONSTRAINT);
    expect(report.hardFailures).toEqual(["fold.transforms"]);
    expect(report.valid).toBe(false);
  });

  it("requires toe capture for the measured backrest angle", () => {
    const constraint: DesignConstraint = {
      ...DEMO_CONSTRAINT,
      objectDepthMm: 18,
      targetViewingAngleDeg: 75,
    };
    const candidate = candidateWith(
      {
        ...baseCandidate.parameters,
        baseDepthMm: 80,
        backrestAngleDeg: 75,
        frontToeDepthMm: 16,
        lipHeightMm: 12,
      },
      "toe-failure",
    );
    const report = verifyCandidate(candidate, constraint);
    expect(report.hardFailures).toEqual(["retention.toe"]);
  });

  it("rejects inadequate nominal contact before stability", () => {
    const constraint: DesignConstraint = {
      ...DEMO_CONSTRAINT,
      objectHeightMm: 320,
      sheetHeightMm: 500,
    };
    const parameters: CandidateParameters = {
      ...baseCandidate.parameters,
      baseDepthMm: 80,
      backrestRiseMm: 35,
      backrestAngleDeg: 65,
      frontToeDepthMm: 8,
    };
    const report = verifyCandidate(
      candidateWith(parameters, "contact-failure"),
      constraint,
    );
    expect(report.hardFailures).toEqual(["contact.nominal"]);
    expect(report.contactAreaResult).toBe("fail");
  });

  it("rejects a negative rear stability reserve", () => {
    const constraint: DesignConstraint = {
      ...DEMO_CONSTRAINT,
      objectWidthMm: 60,
      objectHeightMm: 320,
      objectDepthMm: 20,
      objectMassG: 500,
      sheetHeightMm: 500,
      targetViewingAngleDeg: 50,
    };
    const parameters: CandidateParameters = {
      ...baseCandidate.parameters,
      baseDepthMm: 110,
      backrestRiseMm: 90,
      backrestAngleDeg: 50,
      frontToeDepthMm: 22,
      lipHeightMm: 18,
    };
    const report = verifyCandidate(
      candidateWith(parameters, "stability-failure"),
      constraint,
    );
    expect(report.hardFailures).toEqual(["stability.support_polygon"]);
    expect(report.rearStabilityMarginMm).toBeLessThan(0.5);
  });

  it("does not confuse glue permission with glue use", () => {
    const constraint: DesignConstraint = {
      ...DEMO_CONSTRAINT,
      glueAllowed: true,
    };
    const report = verifyCandidate(baseCandidate, constraint);
    expect(report.valid).toBe(true);
    expect(report.foldFlatCompatibilityResult).toBe("pass");
  });
});

describe("selection and comparison", () => {
  const evaluated: readonly CandidateWithReport[] = generateCandidates(
    DEMO_CONSTRAINT,
    20260714,
  ).map((candidate) => ({
    candidate,
    report: verifyCandidate(candidate, DEMO_CONSTRAINT),
  }));

  it("selects one representative per strategy and keeps a measurable compact failure", () => {
    const representatives = selectRepresentatives(evaluated);
    expect(representatives).toHaveLength(3);
    expect(representatives.map((entry) => entry.candidate.strategy)).toEqual([
      "stable",
      "balanced",
      "compact",
    ]);
    expect(representatives[2]?.report.valid).toBe(false);
  });

  it("recommends only the highest-scoring valid candidate", () => {
    const comparison = compareCandidates(evaluated);
    const recommended = evaluated.find(
      (entry) => entry.candidate.id === comparison.recommendedCandidateId,
    );
    expect(recommended?.report.valid).toBe(true);
    expect(comparison.recommendationRationale).toContain(
      "highest deterministic score",
    );
  });

  it("refuses to recommend when no candidate is valid", () => {
    const invalid = evaluated.map((entry) => ({
      candidate: entry.candidate,
      report: verifyCandidate(entry.candidate, {
        ...DEMO_CONSTRAINT,
        cutsAllowed: false,
        maximumCutCount: 0,
      }),
    }));
    expect(compareCandidates(invalid).recommendedCandidateId).toBeNull();
  });
});
