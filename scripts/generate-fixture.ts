import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildFabricationCandidate,
  finalizeFabricationCandidate,
} from "../src/core/fabrication/candidate";
import { compileFabricationProgram } from "../src/core/fabrication/compiler";
import { createOfflineFabricationShowcases } from "../src/core/fabrication/examples";
import { verifyFabricationIr } from "../src/core/fabrication/verification";
import { sha256HexBytes } from "../src/core/sha256";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
};

const fixture = argument("--fixture") ?? "fabrication-showcase-pack";
const seed = Number(argument("--seed") ?? 20_260_714);
const outputDirectory = path.resolve(
  argument("--output") ?? "artifacts/fabrication-showcase-pack",
);

if (fixture !== "fabrication-showcase-pack") {
  throw new Error(`Unknown fabrication fixture: ${fixture}`);
}
if (!Number.isSafeInteger(seed))
  throw new Error("Seed must be a safe integer.");

await mkdir(outputDirectory, { recursive: true });
const showcases = createOfflineFabricationShowcases();
const entries = [];
for (const [index, showcase] of showcases.entries()) {
  const candidateId = `fixture-${showcase.showcaseId}`;
  const built = buildFabricationCandidate({
    candidateId,
    intent: showcase.intent,
    program: showcase.program,
    rank: 1,
    selectionStatus: "selected",
    provenance: {
      compilerVersion: "foldforge-fabrication-v1",
      generatedAtIso: "2026-07-14T12:00:00.000Z",
      deterministicSeed: seed + index,
      modelId: null,
      modelResponseId: null,
      modelPlanHash: null,
      planExpanderVersion: null,
      parentCandidateId: null,
      appliedPatchIds: [],
      repairCycle: 0,
    },
  });
  if (!built.ok) throw new Error(JSON.stringify(built.error));
  const finalized = finalizeFabricationCandidate({
    candidate: built.value,
    requestedFormats: ["svg", "dxf", "glb", "json", "fold"],
  });
  if (!finalized.ok) throw new Error(JSON.stringify(finalized.error));
  const artifactEntries = [];
  for (const artifact of finalized.value.artifacts) {
    const fileName = `${showcase.showcaseId}.${artifact.format === "json" ? "fabrication.json" : artifact.format}`;
    await writeFile(path.join(outputDirectory, fileName), artifact.bytes);
    artifactEntries.push({
      format: artifact.format,
      fileName,
      sha256: artifact.metadata.sha256,
      byteLength: artifact.metadata.byteLength,
      sourceIrHash: artifact.metadata.sourceIrHash,
    });
  }
  entries.push({
    showcaseId: showcase.showcaseId,
    candidateId,
    sourcePrompt: showcase.prompt,
    topologyId: showcase.program.topologyId,
    irHash: finalized.value.candidate.verification.irHash,
    valid: finalized.value.candidate.verification.valid,
    sourceEquivalent: finalized.value.candidate.exportMetadata.sourceEquivalent,
    artifacts: artifactEntries,
    foldOmission: finalized.value.foldOmission,
  });
}

const invalidSource = showcases[0]!;
const invalidCompiled = compileFabricationProgram(
  invalidSource.intent,
  invalidSource.program,
);
if (!invalidCompiled.ok) throw new Error(JSON.stringify(invalidCompiled.error));
const invalidIr = {
  ...invalidCompiled.value,
  irId: "!deliberately-invalid-fixture",
};
const invalidReport = verifyFabricationIr(
  invalidIr,
  "fixture-deliberately-invalid",
);
const invalidReportBytes = new TextEncoder().encode(
  `${JSON.stringify(invalidReport, null, 2)}\n`,
);
const invalidReportFile = "deliberately-invalid-report.json";
await writeFile(
  path.join(outputDirectory, invalidReportFile),
  invalidReportBytes,
);

const manifest = {
  version: 2,
  fixture,
  seed,
  generatedAt: "deterministic-fixture",
  validationScope: "geometric-and-kinematic-software",
  showcases: entries,
  deliberatelyInvalid: {
    candidateId: "fixture-deliberately-invalid",
    expectedFailedAtStage: "schema",
    actualFailedAtStage: invalidReport.failedAtStage,
    valid: invalidReport.valid,
    reportFile: invalidReportFile,
    reportSha256: sha256HexBytes(invalidReportBytes),
  },
};
await writeFile(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

const notes = showcases
  .map(
    (showcase) =>
      `## ${showcase.intent.title}\n\n${showcase.program.blueprint.assemblyOperations
        .toSorted((left, right) => left.order - right.order)
        .map((operation) => `${operation.order}. ${operation.instruction}`)
        .join(
          "\n",
        )}\n\nSoftware boundary: ${showcase.limitation ?? "No additional limitation recorded."}`,
  )
  .join("\n\n");
await writeFile(
  path.join(outputDirectory, "ASSEMBLY_NOTES.md"),
  `# FoldForge deterministic showcase pack\n\nThese notes are generated from the same verified programs as the exports. They describe software-checked geometry and motion only.\n\n${notes}\n`,
  "utf8",
);

process.stdout.write(
  `${JSON.stringify({
    outputDirectory,
    showcaseCount: entries.length,
    artifactCount: entries.reduce(
      (total, entry) => total + entry.artifacts.length,
      0,
    ),
    invalidRejectedAt: invalidReport.failedAtStage,
  })}\n`,
);
