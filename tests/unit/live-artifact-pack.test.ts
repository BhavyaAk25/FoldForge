import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildFabricationCandidate,
  finalizeFabricationCandidate,
} from "@/core/fabrication/candidate";
import {
  createFacetedDuckGiftBoxShowcase,
  createPullTabPopUpFlowerShowcase,
} from "@/core/fabrication/examples";
import { sha256HexBytes } from "@/core/sha256";
import { validateFinalizedConsumerArtifacts } from "../../scripts/lib/consumer-validation";
import { writeLiveArtifactPack } from "../../scripts/lib/live-artifact-pack";

describe("live artifact pack persistence", () => {
  const temporaryDirectories: string[] = [];
  const buildEvidence = {
    gitSha: "a".repeat(40),
    workingTreeClean: true,
  } as const;

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
    temporaryDirectories.length = 0;
  });

  const finalize = (
    showcase:
      | ReturnType<typeof createFacetedDuckGiftBoxShowcase>
      | ReturnType<typeof createPullTabPopUpFlowerShowcase>,
    candidateId: string,
  ) => {
    const candidate = buildFabricationCandidate({
      candidateId,
      intent: showcase.intent,
      program: showcase.program,
      rank: 1,
      selectionStatus: "selected",
      provenance: {
        compilerVersion: "live-pack-test-v1",
        generatedAtIso: "2026-07-17T12:00:00.000Z",
        deterministicSeed: 20_260_717,
        modelId: null,
        modelResponseId: null,
        parentCandidateId: null,
        appliedPatchIds: [],
        repairCycle: 0,
      },
    });
    if (!candidate.ok) throw new Error(JSON.stringify(candidate.error));
    const finalized = finalizeFabricationCandidate({
      candidate: candidate.value,
      requestedFormats: ["svg", "dxf", "glb", "json", "fold"],
    });
    if (!finalized.ok) throw new Error(JSON.stringify(finalized.error));
    return finalized.value;
  };

  it("re-reads exact bytes and isolates FOLD availability by run", async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), "foldforge-live-pack-"),
    );
    temporaryDirectories.push(temporaryDirectory);
    const duck = finalize(createFacetedDuckGiftBoxShowcase(), "live-pack-duck");
    const duckValidation = await validateFinalizedConsumerArtifacts({
      sourceCandidateId: duck.candidate.candidateId,
      sourceIrHash: duck.candidate.verification.irHash,
      artifacts: duck.artifacts,
      foldOmission: duck.foldOmission,
    });
    const narrative = {
      summary: "Verified fabrication pack.",
      mechanism: "A source-bound scored assembly.",
      assemblySteps: ["Cut the outline.", "Fold the scored edges."],
      limitations: ["Geometry verification does not prove material strength."],
    };
    const duckRoot = path.join(temporaryDirectory, "run-duck");
    const duckPack = await writeLiveArtifactPack({
      artifactRoot: duckRoot,
      reportDirectory: "artifacts/evals/test/run-duck/same-case",
      buildEvidence,
      caseId: "same-case",
      candidate: duck.candidate,
      artifacts: duck.artifacts,
      consumerValidation: duckValidation,
      narrative,
    });

    for (const file of duckPack.files) {
      const bytes = new Uint8Array(
        await readFile(path.join(duckRoot, "same-case", file.fileName)),
      );
      expect(bytes.byteLength).toBe(file.byteLength);
      expect(sha256HexBytes(bytes)).toBe(file.sha256);
    }
    expect(duckPack.files.some((file) => file.format === "fold")).toBe(true);
    expect(path.isAbsolute(duckPack.directory)).toBe(false);

    const flower = finalize(
      createPullTabPopUpFlowerShowcase(),
      "live-pack-flower",
    );
    const flowerValidation = await validateFinalizedConsumerArtifacts({
      sourceCandidateId: flower.candidate.candidateId,
      sourceIrHash: flower.candidate.verification.irHash,
      artifacts: flower.artifacts,
      foldOmission: flower.foldOmission,
    });
    const flowerPack = await writeLiveArtifactPack({
      artifactRoot: path.join(temporaryDirectory, "run-flower"),
      reportDirectory: "artifacts/evals/test/run-flower/same-case",
      buildEvidence,
      caseId: "same-case",
      candidate: flower.candidate,
      artifacts: flower.artifacts,
      consumerValidation: flowerValidation,
      narrative,
    });
    expect(flowerPack.directory).not.toBe(duckPack.directory);
    expect(flowerPack.files.some((file) => file.format === "fold")).toBe(false);

    await expect(
      writeLiveArtifactPack({
        artifactRoot: path.join(temporaryDirectory, "unsafe"),
        reportDirectory: path.join(temporaryDirectory, "unsafe", "same-case"),
        buildEvidence,
        caseId: "same-case",
        candidate: flower.candidate,
        artifacts: flower.artifacts,
        consumerValidation: flowerValidation,
        narrative,
      }),
    ).rejects.toThrow(/safe relative directory/u);
  }, 15_000);
});
