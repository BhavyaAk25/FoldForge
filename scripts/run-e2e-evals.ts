import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateCandidates } from "../src/core/candidates";
import { DEMO_CONSTRAINT } from "../src/core/constraints";
import { exportFold, verifyFoldReference } from "../src/core/export/fold";
import { exportSvg, verifySvgScale } from "../src/core/export/svg";
import type { DesignConstraint } from "../src/core/schemas";
import {
  compareCandidates,
  selectRepresentatives,
  verifyCandidate,
} from "../src/core/verification";
import {
  RuleBasedRepairDiagnosisModel,
  runRepairLoop,
} from "../src/server/orchestration/repair-loop";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
};

const caseCount = Number(argument("--cases") ?? 15);
const results = [];

for (let index = 0; index < caseCount; index += 1) {
  const constraint: DesignConstraint = {
    ...DEMO_CONSTRAINT,
    objectWidthMm: 62 + (index % 6) * 4,
    objectHeightMm: 138 + (index % 5) * 5,
    objectDepthMm: 6.5 + (index % 4) * 0.7,
    objectMassG: 140 + (index % 5) * 28,
    targetViewingAngleDeg: 58 + (index % 4) * 3,
  };
  try {
    const candidates = generateCandidates(constraint, 20260714);
    const evaluated = candidates.map((candidate) => ({
      candidate,
      report: verifyCandidate(candidate, constraint),
    }));
    const representatives = selectRepresentatives(evaluated);
    const failure = representatives.find((entry) => !entry.report.valid);
    const repair = failure
      ? await runRepairLoop(
          failure.candidate,
          constraint,
          new RuleBasedRepairDiagnosisModel(),
          "ff_e2e_eval",
          { now: () => "2026-07-14T12:00:00.000Z" },
        )
      : null;
    const finalEvaluated = [
      ...evaluated,
      ...(repair?.status === "passed"
        ? [{ candidate: repair.candidate, report: repair.report }]
        : []),
    ];
    const comparison = compareCandidates(finalEvaluated);
    const winner = finalEvaluated.find(
      (entry) => entry.candidate.id === comparison.recommendedCandidateId,
    );
    const svg = winner ? exportSvg(winner.candidate, constraint) : "";
    const fold = winner ? exportFold(winner.candidate) : "";
    const passed =
      candidates.length === 9 &&
      representatives.length === 3 &&
      failure !== undefined &&
      repair?.status === "passed" &&
      repair.cycles.length <= 3 &&
      winner?.report.valid === true &&
      (winner ? verifySvgScale(svg, constraint).valid : false) &&
      (winner ? verifyFoldReference(winner.candidate, fold).valid : false);
    results.push({
      case: index + 1,
      status: passed ? "passed" : "failed",
      measuredFailure: failure?.report.hardFailures[0] ?? null,
      repairStatus: repair?.status ?? "not_run",
      repairCycles: repair?.cycles.length ?? 0,
      winner: winner?.candidate.id ?? null,
    });
  } catch (error) {
    results.push({
      case: index + 1,
      status: "crashed",
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
}

const passedCount = results.filter(
  (result) => result.status === "passed",
).length;
const report = {
  mode: "deterministic-end-to-end",
  caseCount: results.length,
  successOrCorrectRefusalRate: passedCount / results.length,
  crashCount: results.filter((result) => result.status === "crashed").length,
  results,
};

await mkdir(path.resolve("artifacts/evals"), { recursive: true });
await writeFile(
  path.resolve("artifacts/evals/e2e.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(report)}\n`);
