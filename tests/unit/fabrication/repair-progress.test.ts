import { describe, expect, it } from "vitest";

import {
  evaluateRepairProgress,
  repairProgressMessage,
} from "@/core/fabrication/repair-progress";
import type {
  ProgramPatchV1,
  VerificationFailureV2,
  VerificationReportV2,
} from "@/core/fabrication/types";

const failure = (input?: {
  readonly failureId?: string;
  readonly stage?: VerificationFailureV2["stage"];
  readonly actual?: number | string;
  readonly expected?: number | string;
  readonly unit?: VerificationFailureV2["actual"]["unit"];
}): VerificationFailureV2 => ({
  failureId: input?.failureId ?? "collision.minimum_clearance#panel-a:panel-b",
  category: input?.stage === "connections" ? "manufacturability" : "collision",
  stage: input?.stage ?? "collision",
  severity: "hard",
  message: "Measured hard failure.",
  actual: { value: input?.actual ?? 0.1, unit: input?.unit ?? "mm" },
  expected: { value: input?.expected ?? 0.5, unit: input?.unit ?? "mm" },
  geometryRefs: [],
  repairableProgramPaths: ["/blueprint/panels/panel-a/widthMm"],
});

const report = (
  failures: readonly VerificationFailureV2[],
): VerificationReportV2 => ({
  version: "2",
  reportId: "report-repair-progress",
  candidateId: "candidate-repair-progress",
  programId: "program-repair-progress",
  irId: "ir:00000000000000000000000000000000",
  irHash: "0".repeat(64),
  valid: failures.length === 0,
  completedStage: failures[0]?.stage ?? "scoring",
  failedAtStage: failures[0]?.stage ?? null,
  checks: [],
  failures,
  metrics: [],
  motionSummary: null,
  exportEquivalence: [],
});

const patchFor = (...failureIds: readonly string[]): ProgramPatchV1 => ({
  version: "1",
  patchId: "patch-repair-progress",
  programId: "program-repair-progress",
  baseProgramHash: "0".repeat(64),
  repairCycle: 1,
  diagnosis: "Change one measured parameter.",
  operations: [
    {
      operationId: "operation-repair-progress",
      operation: "set_number",
      path: "/blueprint/panels/panel-a/widthMm",
      value: 20,
      expectedCurrentValue: 19,
      unit: "mm",
      failureIds,
      reason: "Increase clearance.",
      expectedEffect: "The measured deficit should shrink.",
    },
  ],
  authoredBy: "ai",
  changesIntent: false,
});

describe("repair progress", () => {
  it("accepts a targeted failure that disappears", () => {
    const beforeFailure = failure();
    const result = evaluateRepairProgress(
      report([beforeFailure]),
      report([]),
      patchFor(beforeFailure.failureId),
    );

    expect(result).toEqual({
      ok: true,
      measurements: [
        {
          failureId: beforeFailure.failureId,
          before: 0.1,
          after: null,
          expected: 0.5,
          unit: "mm",
          improved: true,
        },
      ],
    });
  });

  it("accepts a strictly smaller measured deficit using the stable failure key", () => {
    const beforeFailure = failure({
      failureId: "connections.connector_mate_reach#left",
      stage: "connections",
      actual: 8,
      expected: 5,
    });
    const afterFailure = failure({
      failureId: "connections.connector_mate_reach#right",
      stage: "connections",
      actual: 6,
      expected: 5,
    });

    expect(
      evaluateRepairProgress(
        report([beforeFailure]),
        report([afterFailure]),
        patchFor(beforeFailure.failureId),
      ).ok,
    ).toBe(true);
  });

  it.each([
    {
      label: "no targeted failure",
      before: failure(),
      after: failure({ actual: 0.3 }),
      patchFailureId: "collision.other#pair",
    },
    {
      label: "unchanged metric",
      before: failure(),
      after: failure(),
      patchFailureId: "collision.minimum_clearance#panel-a:panel-b",
    },
    {
      label: "larger deficit",
      before: failure(),
      after: failure({ actual: 0 }),
      patchFailureId: "collision.minimum_clearance#panel-a:panel-b",
    },
    {
      label: "non-numeric metric",
      before: failure({ actual: "intersecting", expected: "clear" }),
      after: failure({ actual: "intersecting", expected: "clear" }),
      patchFailureId: "collision.minimum_clearance#panel-a:panel-b",
    },
    {
      label: "changed units",
      before: failure(),
      after: failure({ actual: 0.3, unit: "deg" }),
      patchFailureId: "collision.minimum_clearance#panel-a:panel-b",
    },
  ])(
    "rejects $label as no geometric effect",
    ({ before, after, patchFailureId }) => {
      const result = evaluateRepairProgress(
        report([before]),
        report([after]),
        patchFor(patchFailureId),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("repair.no_geometric_effect");
    },
  );

  it("rejects an improved target when an equally early hard failure appears", () => {
    const beforeFailure = failure({
      failureId: "connections.connector_mate_reach#left",
      stage: "connections",
      actual: 8,
      expected: 5,
    });
    const improvedFailure = failure({
      failureId: beforeFailure.failureId,
      stage: "connections",
      actual: 6,
      expected: 5,
    });
    const introducedFailure = failure({
      failureId: "connections.slot_clearance#new",
      stage: "connections",
      actual: 0.1,
      expected: 0.5,
    });

    expect(
      evaluateRepairProgress(
        report([beforeFailure]),
        report([improvedFailure, introducedFailure]),
        patchFor(beforeFailure.failureId),
      ).ok,
    ).toBe(false);
  });

  it("allows a later-stage failure while reporting measured and unmeasured detail", () => {
    const beforeFailure = failure({
      failureId: "connections.connector_mate_reach#left",
      stage: "connections",
      actual: 8,
      expected: 5,
    });
    const afterFailure = failure({
      failureId: beforeFailure.failureId,
      stage: "connections",
      actual: 6,
      expected: 5,
    });
    const laterFailure = failure({
      failureId: "collision.minimum_clearance#later",
      stage: "collision",
    });
    const result = evaluateRepairProgress(
      report([beforeFailure]),
      report([afterFailure, laterFailure]),
      patchFor(beforeFailure.failureId),
    );

    expect(result.ok).toBe(true);
    expect(repairProgressMessage(result)).toContain("8 mm -> 6 mm");
    expect(
      repairProgressMessage(
        evaluateRepairProgress(
          report([beforeFailure]),
          report([afterFailure]),
          patchFor("collision.other#pair"),
        ),
      ),
    ).toBe("The repair did not target a measurable hard verifier failure.");

    const unmeasuredFailure: VerificationFailureV2 = {
      ...beforeFailure,
      actual: { value: "intersecting", unit: null },
      expected: { value: "clear", unit: null },
    };
    const resolvedUnmeasured = evaluateRepairProgress(
      report([unmeasuredFailure]),
      report([]),
      patchFor(unmeasuredFailure.failureId),
    );
    expect(repairProgressMessage(resolvedUnmeasured)).toContain(
      "unmeasured -> resolved",
    );
  });
});
