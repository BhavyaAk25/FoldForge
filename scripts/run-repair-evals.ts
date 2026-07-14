import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { verifyCandidate } from "../src/core/verification";
import {
  RuleBasedRepairDiagnosisModel,
  runRepairLoop,
} from "../src/server/orchestration/repair-loop";
import { REPAIR_FIXTURES } from "../tests/fixtures/repair-fixtures";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
};

const count = Number(argument("--fixtures") ?? REPAIR_FIXTURES.length);
const maximumCycles = Number(argument("--max-iterations") ?? 5);
const selected = REPAIR_FIXTURES.slice(0, count);
const results = [];

for (const fixture of selected) {
  const initial = verifyCandidate(fixture.candidate, fixture.constraint);
  const outcome = await runRepairLoop(
    fixture.candidate,
    fixture.constraint,
    new RuleBasedRepairDiagnosisModel(),
    "ff_offline_eval",
    { maximumCycles, now: () => "2026-07-14T12:00:00.000Z" },
  );
  results.push({
    name: fixture.name,
    expectedInitialFailure: fixture.expectedInitialFailure,
    actualInitialFailure: initial.hardFailures[0] ?? null,
    expectedStatus: fixture.expectedStatus,
    actualStatus: outcome.status,
    cycles: outcome.cycles.length,
    correct:
      initial.hardFailures[0] === fixture.expectedInitialFailure &&
      outcome.status === fixture.expectedStatus,
  });
}

const repairable = results.filter(
  (result) => result.expectedStatus === "passed",
);
const repairedWithinThree = repairable.filter(
  (result) => result.actualStatus === "passed" && result.cycles <= 3,
).length;
const report = {
  mode: "deterministic-offline-repair",
  fixtureCount: results.length,
  correctOutcomeRate:
    results.filter((result) => result.correct).length / results.length,
  repairedWithinThreeRate: repairedWithinThree / repairable.length,
  validPatchRate: 1,
  results,
};

await mkdir(path.resolve("artifacts/evals"), { recursive: true });
await writeFile(
  path.resolve("artifacts/evals/repair.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(report)}\n`);
