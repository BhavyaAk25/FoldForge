import { describe, expect, it } from "vitest";

import { summarizeLiveReadinessGate } from "@/server/evals/live-readiness-gate";

describe("live readiness release gate", () => {
  it("keeps a successful one-case smoke run distinct from release evidence", () => {
    expect(
      summarizeLiveReadinessGate({
        selectedCaseCount: 1,
        results: [{ status: "passed" }],
      }),
    ).toMatchObject({
      selectedRunPassed: true,
      releaseGatePassed: false,
      passed: false,
    });
  });

  it("passes the sealed gate only when at least four of five cases pass", () => {
    expect(
      summarizeLiveReadinessGate({
        selectedCaseCount: 5,
        results: [
          { status: "passed" },
          { status: "passed" },
          { status: "passed" },
          { status: "passed" },
          { status: "failed" },
        ],
      }),
    ).toMatchObject({
      passedCount: 4,
      selectedRunPassed: true,
      releaseGatePassed: true,
      passed: true,
    });
  });

  it("fails both gates when budget exhaustion leaves a case unrun", () => {
    expect(
      summarizeLiveReadinessGate({
        selectedCaseCount: 5,
        results: [
          { status: "passed" },
          { status: "passed" },
          { status: "passed" },
          { status: "passed" },
          { status: "not_run_budget_exhausted" },
        ],
      }),
    ).toMatchObject({
      completedCaseCount: 4,
      selectedRunPassed: false,
      releaseGatePassed: false,
      passed: false,
    });
  });

  it("rejects an incomplete result list", () => {
    expect(() =>
      summarizeLiveReadinessGate({
        selectedCaseCount: 2,
        results: [{ status: "passed" }],
      }),
    ).toThrow("must match");
  });
});
