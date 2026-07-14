import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateCandidates } from "../src/core/candidates";
import { exportFold, verifyFoldReference } from "../src/core/export/fold";
import { exportSvg, verifySvgScale } from "../src/core/export/svg";
import {
  compareCandidates,
  selectRepresentatives,
  verifyCandidate,
} from "../src/core/verification";
import {
  RuleBasedRepairDiagnosisModel,
  runRepairLoop,
} from "../src/server/orchestration/repair-loop";
import { REPAIR_FIXTURES } from "../tests/fixtures/repair-fixtures";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
};

const caseCount = Number(argument("--cases") ?? 15);
const results = [];
const repairableFixtures = REPAIR_FIXTURES.filter(
  (fixture) => fixture.expectedStatus === "passed",
);

for (let index = 0; index < caseCount; index += 1) {
  const fixture = repairableFixtures[index % repairableFixtures.length];
  if (!fixture) throw new Error("Repair evaluation fixtures are unavailable.");
  const constraint = fixture.constraint;
  try {
    const candidates = generateCandidates(constraint, 20260714 + index);
    const evaluated = candidates.map((candidate) => ({
      candidate,
      report: verifyCandidate(candidate, constraint),
    }));
    const representatives = selectRepresentatives(evaluated);
    const failure = {
      candidate: fixture.candidate,
      report: verifyCandidate(fixture.candidate, constraint),
    };
    const repair = await runRepairLoop(
      failure.candidate,
      constraint,
      new RuleBasedRepairDiagnosisModel(),
      "ff_e2e_eval",
      { now: () => "2026-07-14T12:00:00.000Z" },
    );
    const finalEvaluated = [
      ...evaluated,
      ...(repair.status === "passed"
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
      repair.status === "passed" &&
      repair.cycles.length <= 3 &&
      winner?.report.valid === true &&
      (winner
        ? verifySvgScale(svg, constraint, winner.candidate).valid
        : false) &&
      (winner ? verifyFoldReference(winner.candidate, fold).valid : false);
    results.push({
      case: index + 1,
      status: passed ? "passed" : "failed",
      measuredFailure: failure.report.hardFailures[0] ?? null,
      repairStatus: repair.status,
      repairCycles: repair.cycles.length,
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
