import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ParameterPatch } from "../src/core/schemas";
import type {
  RepairDiagnosisInput,
  RepairDiagnosisModel,
} from "../src/server/ai/repair";
import {
  RuleBasedRepairDiagnosisModel,
  runRepairLoop,
} from "../src/server/orchestration/repair-loop";
import { REPAIR_FIXTURES } from "../tests/fixtures/repair-fixtures";

class PassFailOnlyModel implements RepairDiagnosisModel {
  async diagnose(
    input: RepairDiagnosisInput,
    _safetyId: string,
  ): Promise<ParameterPatch> {
    return {
      operations: [
        {
          operation: "increase",
          parameter: "baseDepthMm",
          value: Math.min(10, 130 - input.parameters.baseDepthMm),
          unit: "mm",
          verificationId: "unknown.failure",
          reason: "Generic adjustment without verifier evidence.",
          expectedEffect: "Attempt to improve a binary failed result.",
          affectedConstraint: "unknown",
        },
      ],
    };
  }
}

class NoFeedbackModel implements RepairDiagnosisModel {
  async diagnose(
    _input: RepairDiagnosisInput,
    _safetyId: string,
  ): Promise<null> {
    return null;
  }
}

const evaluate = async (
  label: string,
  model: RepairDiagnosisModel,
): Promise<{ readonly label: string; readonly successRate: number }> => {
  const repairable = REPAIR_FIXTURES.filter(
    (fixture) => fixture.expectedStatus === "passed",
  );
  let successes = 0;
  for (const fixture of repairable) {
    const outcome = await runRepairLoop(
      fixture.candidate,
      fixture.constraint,
      model,
      `ff_ablation_${label}`,
      { maximumCycles: 3, now: () => "2026-07-14T12:00:00.000Z" },
    );
    if (outcome.status === "passed") successes += 1;
  }
  return { label, successRate: successes / repairable.length };
};

const variants = await Promise.all([
  evaluate("full_verifier_feedback", new RuleBasedRepairDiagnosisModel()),
  evaluate("pass_fail_only", new PassFailOnlyModel()),
  evaluate("no_feedback", new NoFeedbackModel()),
]);
const full = variants[0]?.successRate ?? 0;
const strongestBaseline = Math.max(
  variants[1]?.successRate ?? 0,
  variants[2]?.successRate ?? 0,
);
const report = {
  mode: "offline-repair-ablation",
  fixtureCount: REPAIR_FIXTURES.length,
  variants,
  absoluteImprovement: full - strongestBaseline,
  materiallyOutperforms: full - strongestBaseline >= 0.2,
};

await mkdir(path.resolve("artifacts/evals"), { recursive: true });
await writeFile(
  path.resolve("artifacts/evals/ablation.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(report)}\n`);
