import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildFabricationCandidate,
  finalizeFabricationCandidate,
} from "../src/core/fabrication/candidate";
import { createOfflineFabricationShowcases } from "../src/core/fabrication/examples";
import { programStructureFingerprint } from "../src/server/fabrication-ai/orchestration";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
};

const caseCount = Math.max(1, Math.trunc(Number(argument("--cases") ?? 15)));
const showcases = createOfflineFabricationShowcases();
const results = [];

for (let index = 0; index < caseCount; index += 1) {
  const showcase = showcases[index % showcases.length];
  if (!showcase) throw new Error("Offline showcase corpus is unavailable.");
  const candidateId = `candidate-e2e-${index + 1}`;
  const startedAt = performance.now();
  try {
    const built = buildFabricationCandidate({
      candidateId,
      intent: showcase.intent,
      program: showcase.program,
      rank: 1,
      selectionStatus: "selected",
      provenance: {
        compilerVersion: "foldforge-fabrication-v1",
        generatedAtIso: "2026-07-14T12:00:00.000Z",
        deterministicSeed: 20_260_714 + index,
        modelId: null,
        modelResponseId: null,
        modelPlanHash: null,
        planExpanderVersion: null,
        parentCandidateId: null,
        appliedPatchIds: [],
        repairCycle: 0,
      },
    });
    if (!built.ok) {
      results.push({
        caseId: `offline-e2e-${index + 1}`,
        showcaseId: showcase.showcaseId,
        status: "failed",
        failureKind: built.error.kind,
        durationMs: Number((performance.now() - startedAt).toFixed(3)),
      });
      continue;
    }
    const finalized = finalizeFabricationCandidate({
      candidate: built.value,
      requestedFormats: ["svg", "dxf", "glb", "json", "fold"],
    });
    const passed =
      finalized.ok &&
      finalized.value.candidate.verification.valid &&
      finalized.value.candidate.score.eligible &&
      finalized.value.candidate.exportMetadata.sourceEquivalent &&
      finalized.value.artifacts.every(
        (artifact) =>
          artifact.metadata.sourceCandidateId === candidateId &&
          artifact.metadata.sourceIrHash ===
            finalized.value.candidate.verification.irHash,
      );
    results.push({
      caseId: `offline-e2e-${index + 1}`,
      showcaseId: showcase.showcaseId,
      status: passed ? "passed" : "failed",
      topologyFingerprint: programStructureFingerprint(showcase.program),
      artifactFormats: finalized.ok
        ? finalized.value.artifacts.map((artifact) => artifact.format)
        : [],
      foldStatus: finalized.ok
        ? finalized.value.foldOmission
          ? "omitted-with-reason"
          : "generated"
        : "failed",
      durationMs: Number((performance.now() - startedAt).toFixed(3)),
    });
  } catch (error) {
    results.push({
      caseId: `offline-e2e-${index + 1}`,
      showcaseId: showcase.showcaseId,
      status: "crashed",
      error: error instanceof Error ? error.message : "unknown error",
      durationMs: Number((performance.now() - startedAt).toFixed(3)),
    });
  }
}

const passedCount = results.filter(
  (result) => result.status === "passed",
).length;
const report = {
  reportVersion: 1,
  mode: "fabrication-end-to-end-offline-controls",
  evidenceBoundary:
    "These are deterministic showcase controls, not live arbitrary-prompt results.",
  liveStatus: "blocked-user-enable-required",
  caseCount: results.length,
  passedCount,
  successRate: passedCount / results.length,
  crashCount: results.filter((result) => result.status === "crashed").length,
  distinctTopologyCount: new Set(
    results.flatMap((result) =>
      "topologyFingerprint" in result ? [result.topologyFingerprint] : [],
    ),
  ).size,
  results,
};
const passed =
  report.successRate === 1 &&
  report.crashCount === 0 &&
  report.distinctTopologyCount >= 3;

await mkdir(path.resolve("artifacts/evals"), { recursive: true });
await writeFile(
  path.resolve("artifacts/evals/e2e.json"),
  `${JSON.stringify({ ...report, passed }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify({ ...report, passed })}\n`);
if (!passed) process.exitCode = 1;
