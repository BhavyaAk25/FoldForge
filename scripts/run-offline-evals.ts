import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateCandidates } from "../src/core/candidates";
import { DEMO_CONSTRAINT } from "../src/core/constraints";
import { exportFold, verifyFoldReference } from "../src/core/export/fold";
import { exportSvg, verifySvgScale } from "../src/core/export/svg";
import type { DesignConstraint } from "../src/core/schemas";
import type { Candidate } from "../src/core/types";
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
let requestsWithValidCandidate = 0;
let mutationCount = 0;

const constraintFor = (index: number): DesignConstraint => {
  const landscape = index % 5 === 0;
  return {
    ...DEMO_CONSTRAINT,
    objectWidthMm: landscape ? 145 + (index % 4) * 8 : 58 + (index % 8) * 6,
    objectHeightMm: landscape ? 68 + (index % 5) * 5 : 125 + (index % 8) * 9,
    objectDepthMm: 5 + (index % 8) * 2,
    objectMassG: 100 + (index % 9) * 42,
    orientation: landscape ? "landscape" : "portrait",
    targetViewingAngleDeg: 50 + (index % 5) * 5,
    sheetWidthMm: index % 4 === 0 ? 279.4 : 215.9,
    sheetHeightMm: landscape || index % 8 >= 3 ? 355.6 : 279.4,
  };
};

for (const [index, seed] of seeds.entries()) {
  const constraint = constraintFor(index);
  try {
    const first = generateCandidates(constraint, seed);
    const second = generateCandidates(constraint, seed);
    if (JSON.stringify(first) !== JSON.stringify(second))
      repeatabilityFailures += 1;
    for (const candidate of first) {
      const report = verifyCandidate(candidate, constraint);
      candidateCount += 1;
      if (report.valid) validCount += 1;
      if (report.valid && report.hardFailures.length > 0) falseValidCount += 1;
    }
    const validCandidate = first.find(
      (candidate) => verifyCandidate(candidate, constraint).valid,
    );
    if (validCandidate) {
      requestsWithValidCandidate += 1;
      const corrupted: Candidate = {
        ...validCandidate,
        geometry: {
          ...validCandidate.geometry,
          folded: {
            ...validCandidate.geometry.folded,
            panels: validCandidate.geometry.folded.panels.map((panel) => ({
              ...panel,
              points: panel.points.map(() => ({ xMm: 0, yMm: 0, zMm: 0 })),
            })),
          },
        },
      };
      mutationCount += 3;
      if (verifyCandidate(corrupted, constraint).valid) falseValidCount += 1;
      const svg = exportSvg(validCandidate, constraint).replace(
        'id="perimeter"',
        'id="perimeter-corrupt"',
      );
      if (verifySvgScale(svg, constraint, validCandidate).valid)
        falseValidCount += 1;
      const foldDocument = JSON.parse(exportFold(validCandidate)) as {
        edges_foldAngle: number[];
      };
      foldDocument.edges_foldAngle = foldDocument.edges_foldAngle.map(
        () => 123,
      );
      if (
        verifyFoldReference(validCandidate, JSON.stringify(foldDocument)).valid
      )
        falseValidCount += 1;
    }
  } catch {
    crashCount += 1;
  }
}

const report = {
  mode: "deterministic-offline",
  seedCount: seeds.length,
  candidateCount,
  validGeometryRate: requestsWithValidCandidate / seeds.length,
  candidatePassRate: validCount / candidateCount,
  supportedRequestWithValidCandidateRate:
    requestsWithValidCandidate / seeds.length,
  supportedRequestNoCrashRate: (seeds.length - crashCount) / seeds.length,
  deterministicRepeatabilityRate:
    (seeds.length - repeatabilityFailures) / seeds.length,
  falseValidCount,
  mutationRejectionRate:
    mutationCount === 0 ? 0 : (mutationCount - falseValidCount) / mutationCount,
};

await mkdir(path.resolve("artifacts/evals"), { recursive: true });
await writeFile(
  path.resolve("artifacts/evals/offline.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(report)}\n`);
