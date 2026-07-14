import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { stableHash } from "../src/core/canonical";
import { generateCandidates } from "../src/core/candidates";
import { DEMO_CONSTRAINT } from "../src/core/constraints";
import { exportFold } from "../src/core/export/fold";
import { exportSvg } from "../src/core/export/svg";
import {
  selectRepresentatives,
  verifyCandidate,
} from "../src/core/verification";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
};

const fixture = argument("--fixture") ?? "phone-letter-110lb";
const seed = Number(argument("--seed") ?? 20260714);
const outputDirectory = path.resolve(
  argument("--output") ?? "artifacts/kill-test",
);

if (fixture !== "phone-letter-110lb") {
  throw new Error(`Unknown fixture: ${fixture}`);
}

if (!Number.isSafeInteger(seed)) {
  throw new Error("Seed must be a safe integer.");
}

const allCandidates = generateCandidates(DEMO_CONSTRAINT, seed).map(
  (candidate) => ({
    candidate,
    report: verifyCandidate(candidate, DEMO_CONSTRAINT),
  }),
);
const representatives = selectRepresentatives(allCandidates);
const passing = representatives.find((entry) => entry.report.valid);
const failing = representatives.find((entry) => !entry.report.valid);

if (!passing || !failing) {
  throw new Error(
    "Kill-test fixture requires both a passing and a failing representative.",
  );
}

await mkdir(outputDirectory, { recursive: true });

const artifacts = await Promise.all(
  representatives.map(async ({ candidate, report }) => {
    const svg = exportSvg(candidate, DEMO_CONSTRAINT);
    const fold = exportFold(candidate);
    const stem = candidate.id.replaceAll(/[^a-z0-9-]/gi, "-");
    const svgFile = `${stem}.svg`;
    const foldFile = `${stem}.fold`;
    await Promise.all([
      writeFile(path.join(outputDirectory, svgFile), svg, "utf8"),
      writeFile(path.join(outputDirectory, foldFile), fold, "utf8"),
    ]);

    return {
      id: candidate.id,
      strategy: candidate.strategy,
      variant: candidate.variant,
      parameters: candidate.parameters,
      report,
      svgFile,
      foldFile,
      svgHash: stableHash(svg),
      foldHash: stableHash(fold),
    };
  }),
);

const manifest = {
  version: 1,
  fixture,
  seed,
  constraint: DEMO_CONSTRAINT,
  constraintHash: stableHash(DEMO_CONSTRAINT),
  generatedAt: "deterministic-fixture",
  candidates: artifacts,
  passingCandidateId: passing.candidate.id,
  failingCandidateId: failing.candidate.id,
  physicalStatus: "awaiting_user",
};

const instructions = `# FoldForge physical kill test\n\nStatus: awaiting user.\n\n1. Open the passing SVG and print at 100% / actual size on 110 lb cover cardstock.\n2. Measure the 50 mm calibration line; accept only 49.5–50.5 mm.\n3. Cut solid lines and the two red slots. Score dashed lines.\n4. Fold the lip up, bring the backrest and rear brace into position, and insert both tabs into the base slots.\n5. Unlock and return to flat ten times.\n6. Hold the documented phone for 60 seconds centered, then 60 seconds with a 5 mm offset.\n7. Record collapse, release, tear, slip over 3 mm, buckling, or tipping as failure.\n\nThis artifact is not physically validated until the user records the result.\n`;

await Promise.all([
  writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    path.join(outputDirectory, "FOLDING_INSTRUCTIONS.md"),
    instructions,
    "utf8",
  ),
]);

process.stdout.write(
  `${JSON.stringify({
    outputDirectory,
    passingCandidateId: manifest.passingCandidateId,
    failingCandidateId: manifest.failingCandidateId,
    physicalStatus: manifest.physicalStatus,
  })}\n`,
);
