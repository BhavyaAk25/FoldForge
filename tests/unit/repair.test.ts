import { describe, expect, it } from "vitest";

import { generateCandidates } from "@/core/candidates";
import { DEMO_CONSTRAINT } from "@/core/constraints";
import { applyParameterPatch, repairInputHash } from "@/core/repair";
import type { ParameterPatch } from "@/core/schemas";
import { verifyCandidate } from "@/core/verification";
import type { RepairDiagnosisModel } from "@/server/ai/repair";
import {
  RuleBasedRepairDiagnosisModel,
  runRepairLoop,
} from "@/server/orchestration/repair-loop";

const candidates = generateCandidates(DEMO_CONSTRAINT, 20260714);
const passingCandidate = candidates.find(
  (candidate) => verifyCandidate(candidate, DEMO_CONSTRAINT).valid,
);
const failingCandidate = candidates.find(
  (candidate) => candidate.strategy === "compact" && candidate.variant === 2,
);

if (!passingCandidate || !failingCandidate) {
  throw new Error("Expected passing and failing repair fixtures.");
}

const failingReport = verifyCandidate(failingCandidate, DEMO_CONSTRAINT);

const patchFor = (
  patch: Partial<ParameterPatch["operations"][number]> = {},
): ParameterPatch => ({
  operations: [
    {
      operation: "set",
      parameter: "baseDepthMm",
      value: 90,
      unit: "mm",
      verificationId: "geometry.rear_run",
      reason: "Increase the base behind the ridge.",
      expectedEffect: "Rear run becomes positive.",
      affectedConstraint: "minimum rear run",
      ...patch,
    },
  ],
});

describe("bounded parameter patches", () => {
  it("applies a report-grounded in-range patch", () => {
    const result = applyParameterPatch(
      failingCandidate.parameters,
      patchFor(),
      failingReport,
    );
    expect(result).toMatchObject({ ok: true, value: { baseDepthMm: 90 } });
  });

  it("rejects malformed patches before application", () => {
    const malformed = { operations: [] } as ParameterPatch;
    expect(
      applyParameterPatch(
        failingCandidate.parameters,
        malformed,
        failingReport,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_patch" },
    });
  });

  it("rejects report IDs that are not active failures", () => {
    expect(
      applyParameterPatch(
        failingCandidate.parameters,
        patchFor({ verificationId: "angle.target" }),
        failingReport,
      ),
    ).toMatchObject({ ok: false, error: { code: "ungrounded_failure" } });
  });

  it("rejects unrelated repair levers", () => {
    expect(
      applyParameterPatch(
        failingCandidate.parameters,
        patchFor({ parameter: "lipHeightMm" }),
        failingReport,
      ),
    ).toMatchObject({ ok: false, error: { code: "unrelated_parameter" } });
  });

  it("rejects duplicate parameters in one patch cycle", () => {
    const duplicate: ParameterPatch = {
      operations: [
        patchFor().operations[0]!,
        patchFor({ value: 95 }).operations[0]!,
      ],
    };
    expect(
      applyParameterPatch(
        failingCandidate.parameters,
        duplicate,
        failingReport,
      ),
    ).toMatchObject({ ok: false, error: { code: "duplicate_parameter" } });
  });

  it("rejects wrong units, non-positive deltas, and out-of-range results", () => {
    expect(
      applyParameterPatch(
        failingCandidate.parameters,
        patchFor({ parameter: "backrestAngleDeg", unit: "mm" }),
        failingReport,
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_patch" } });
    expect(
      applyParameterPatch(
        failingCandidate.parameters,
        patchFor({ operation: "increase", value: -1 }),
        failingReport,
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_delta" } });
    expect(
      applyParameterPatch(
        failingCandidate.parameters,
        patchFor({ value: 500 }),
        failingReport,
      ),
    ).toMatchObject({ ok: false, error: { code: "out_of_range" } });
  });

  it("produces a canonical report-and-parameter input hash", () => {
    expect(repairInputHash(failingCandidate.parameters, failingReport)).toMatch(
      /^[0-9a-f]{8}$/,
    );
    expect(repairInputHash(failingCandidate.parameters, failingReport)).toBe(
      repairInputHash(failingCandidate.parameters, failingReport),
    );
  });
});

describe("closed repair loop", () => {
  const fixedNow = () => "2026-07-14T12:00:00.000Z";

  it("repairs the seeded rear-run failure and rechecks every hard constraint", async () => {
    const outcome = await runRepairLoop(
      failingCandidate,
      DEMO_CONSTRAINT,
      new RuleBasedRepairDiagnosisModel(),
      "ff_test",
      { now: fixedNow },
    );
    expect(outcome.status).toBe("passed");
    expect(outcome.cycles.length).toBeLessThanOrEqual(3);
    expect(
      outcome.report.checks.every((check) => check.status === "pass"),
    ).toBe(true);
    expect(
      outcome.trace.some((event) => event.kind === "diagnose_failure"),
    ).toBe(true);
    expect(outcome.trace.every((event) => event.source === "CODE")).toBe(true);
  });

  it("exits immediately for an already passing candidate", async () => {
    const outcome = await runRepairLoop(
      passingCandidate,
      DEMO_CONSTRAINT,
      new RuleBasedRepairDiagnosisModel(),
      "ff_test",
      { now: fixedNow },
    );
    expect(outcome.status).toBe("passed");
    expect(outcome.cycles).toHaveLength(0);
  });

  it("returns infeasible when the failure has no numeric repair lever", async () => {
    const constraint = {
      ...DEMO_CONSTRAINT,
      cutsAllowed: false,
      maximumCutCount: 0,
    };
    const outcome = await runRepairLoop(
      passingCandidate,
      constraint,
      new RuleBasedRepairDiagnosisModel(),
      "ff_test",
      { now: fixedNow },
    );
    expect(outcome).toMatchObject({
      status: "infeasible",
      cycles: [],
      reason: expect.stringContaining("No bounded numeric repair"),
    });
  });

  it("rejects an invalid model patch without applying geometry", async () => {
    const model: RepairDiagnosisModel = {
      diagnose: async () => patchFor({ value: 500 }),
    };
    const outcome = await runRepairLoop(
      failingCandidate,
      DEMO_CONSTRAINT,
      model,
      "ff_test",
      {
        now: fixedNow,
      },
    );
    expect(outcome).toMatchObject({
      status: "infeasible",
      cycles: [],
      reason: expect.stringContaining("Rejected patch"),
    });
    expect(outcome.trace.some((event) => event.source === "AI")).toBe(true);
  });

  it("blocks duplicate canonical diagnosis inputs", async () => {
    const model: RepairDiagnosisModel = {
      diagnose: async () =>
        patchFor({ value: failingCandidate.parameters.baseDepthMm }),
    };
    const outcome = await runRepairLoop(
      failingCandidate,
      DEMO_CONSTRAINT,
      model,
      "ff_test",
      {
        now: fixedNow,
      },
    );
    expect(outcome).toMatchObject({
      status: "infeasible",
      cycles: [{ cycle: 1 }],
      reason: "Duplicate canonical diagnosis input was blocked.",
    });
  });

  it("reports explicit exhaustion at the configured cycle cap", async () => {
    let calls = 0;
    const model: RepairDiagnosisModel = {
      diagnose: async (input) => {
        calls += 1;
        return patchFor({ value: input.parameters.baseDepthMm + 0.1 });
      },
    };
    const outcome = await runRepairLoop(
      failingCandidate,
      DEMO_CONSTRAINT,
      model,
      "ff_test",
      {
        maximumCycles: 2,
        now: fixedNow,
      },
    );
    expect(calls).toBe(2);
    expect(outcome).toMatchObject({
      status: "infeasible",
      cycles: [{ cycle: 1 }, { cycle: 2 }],
      reason: "Repair exhausted the 2-cycle limit.",
    });
  });
});
