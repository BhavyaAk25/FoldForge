import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateCandidates } from "../src/core/candidates";
import { DEMO_CONSTRAINT } from "../src/core/constraints";
import { verifyCandidate } from "../src/core/verification";

const seeds = [
  20260714,
  ...Array.from({ length: 99 }, (_, index) => index + 1),
];
let candidateCount = 0;
let validCount = 0;
let crashCount = 0;
let falseValidCount = 0;
let repeatabilityFailures = 0;

for (const seed of seeds) {
  try {
    const first = generateCandidates(DEMO_CONSTRAINT, seed);
    const second = generateCandidates(DEMO_CONSTRAINT, seed);
    if (JSON.stringify(first) !== JSON.stringify(second))
      repeatabilityFailures += 1;
    for (const candidate of first) {
      const report = verifyCandidate(candidate, DEMO_CONSTRAINT);
      candidateCount += 1;
      if (report.valid) validCount += 1;
      if (report.valid && report.hardFailures.length > 0) falseValidCount += 1;
    }
  } catch {
    crashCount += 1;
  }
}

const report = {
  mode: "deterministic-offline",
  seedCount: seeds.length,
  candidateCount,
  validGeometryRate: validCount / candidateCount,
  supportedRequestNoCrashRate: (seeds.length - crashCount) / seeds.length,
  deterministicRepeatabilityRate:
    (seeds.length - repeatabilityFailures) / seeds.length,
  falseValidCount,
};

await mkdir(path.resolve("artifacts/evals"), { recursive: true });
await writeFile(
  path.resolve("artifacts/evals/offline.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(report)}\n`);
