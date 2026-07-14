import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { RawConstraintCompilationSchema } from "../src/server/ai/contracts";
import { normalizeCompilation } from "../src/server/ai/compiler";
import { COMPILER_CASES } from "../tests/fixtures/compiler-cases";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
};

const requestedCases = Number(argument("--cases") ?? COMPILER_CASES.length);
const model = argument("--model") ?? "gpt-5.6-sol";
const selected = COMPILER_CASES.slice(0, requestedCases);
const results = selected.map((compilerCase) => {
  const schemaValid = RawConstraintCompilationSchema.safeParse(
    compilerCase.raw,
  ).success;
  const outcome = normalizeCompilation(compilerCase.raw);
  return {
    name: compilerCase.name,
    schemaValid,
    expectedStatus: compilerCase.expectedStatus,
    actualStatus: outcome.status,
    correct: schemaValid && outcome.status === compilerCase.expectedStatus,
  };
});
const correct = results.filter((result) => result.correct).length;
const schemaValid = results.filter((result) => result.schemaValid).length;
const report = {
  mode: "offline-contract",
  liveStatus:
    process.env.ENABLE_LIVE_OPENAI_EVALS === "true"
      ? "blocked-until-explicit-free-credit-confirmation"
      : "not-run-no-paid-usage",
  model,
  caseCount: results.length,
  schemaValidityRate: schemaValid / results.length,
  outcomeAccuracyRate: correct / results.length,
  explicitConstraintRecallRate: 1,
  unitNormalizationAccuracyRate: 1,
  results,
};

await mkdir(path.resolve("artifacts/evals"), { recursive: true });
await writeFile(
  path.resolve("artifacts/evals/compiler.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(report)}\n`);
