import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  buildFabricationCandidate,
  finalizeFabricationCandidate,
} from "../src/core/fabrication/candidate";
import { createOfflineFabricationShowcases } from "../src/core/fabrication/examples";
import { VerificationReportV2Schema } from "../src/core/fabrication/schemas";
import { sha256HexBytes } from "../src/core/sha256";

const ArtifactSchema = z
  .object({
    format: z.enum(["svg", "dxf", "glb", "json", "fold"]),
    fileName: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
    byteLength: z.number().int().positive(),
    sourceIrHash: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict();

const ManifestSchema = z
  .object({
    version: z.literal(2),
    fixture: z.literal("fabrication-showcase-pack"),
    seed: z.number().int(),
    validationScope: z.literal("geometric-and-kinematic-software"),
    showcases: z.array(
      z
        .object({
          showcaseId: z.enum([
            "faceted-duck-gift-box",
            "modular-cable-organizer",
            "pull-tab-pop-up-flower",
          ]),
          candidateId: z.string().min(1),
          topologyId: z.string().min(1),
          irHash: z.string().regex(/^[0-9a-f]{64}$/u),
          valid: z.literal(true),
          sourceEquivalent: z.literal(true),
          artifacts: z.array(ArtifactSchema).min(4).max(5),
        })
        .passthrough(),
    ),
    deliberatelyInvalid: z
      .object({
        candidateId: z.literal("fixture-deliberately-invalid"),
        expectedFailedAtStage: z.literal("schema"),
        actualFailedAtStage: z.literal("schema"),
        valid: z.literal(false),
        reportFile: z.string().min(1),
        reportSha256: z.string().regex(/^[0-9a-f]{64}$/u),
      })
      .strict(),
  })
  .passthrough();

const manifestPath = process.argv
  .slice(2)
  .find((value) => value !== "--" && !value.startsWith("-"));
if (!manifestPath) throw new Error("Usage: verify:artifact <manifest.json>");

const absoluteManifestPath = path.resolve(manifestPath);
const directory = path.dirname(absoluteManifestPath);
const manifest = ManifestSchema.parse(
  JSON.parse(await readFile(absoluteManifestPath, "utf8")),
);
const showcases = createOfflineFabricationShowcases();
let artifactCount = 0;

for (const entry of manifest.showcases) {
  const showcase = showcases.find(
    (candidate) => candidate.showcaseId === entry.showcaseId,
  );
  if (!showcase) throw new Error(`Unknown showcase ${entry.showcaseId}.`);
  const index = showcases.indexOf(showcase);
  const built = buildFabricationCandidate({
    candidateId: entry.candidateId,
    intent: showcase.intent,
    program: showcase.program,
    rank: 1,
    selectionStatus: "selected",
    provenance: {
      compilerVersion: "foldforge-fabrication-v1",
      generatedAtIso: "2026-07-14T12:00:00.000Z",
      deterministicSeed: manifest.seed + index,
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
  if (finalized.value.candidate.verification.irHash !== entry.irHash) {
    throw new Error(`${entry.showcaseId} source IR hash changed.`);
  }
  const regeneratedByFormat = new Map(
    finalized.value.artifacts.map((artifact) => [artifact.format, artifact]),
  );
  for (const artifactEntry of entry.artifacts) {
    const stored = new Uint8Array(
      await readFile(path.join(directory, artifactEntry.fileName)),
    );
    const regenerated = regeneratedByFormat.get(artifactEntry.format);
    if (
      !regenerated ||
      stored.byteLength !== artifactEntry.byteLength ||
      sha256HexBytes(stored) !== artifactEntry.sha256 ||
      regenerated.metadata.sha256 !== artifactEntry.sha256 ||
      regenerated.metadata.sourceIrHash !== artifactEntry.sourceIrHash
    ) {
      throw new Error(
        `${entry.showcaseId} ${artifactEntry.format} is not source-equivalent.`,
      );
    }
    artifactCount += 1;
  }
}

const invalidBytes = new Uint8Array(
  await readFile(path.join(directory, manifest.deliberatelyInvalid.reportFile)),
);
if (
  sha256HexBytes(invalidBytes) !== manifest.deliberatelyInvalid.reportSha256
) {
  throw new Error("The deliberately invalid report hash changed.");
}
const invalidReport = VerificationReportV2Schema.parse(
  JSON.parse(new TextDecoder().decode(invalidBytes)),
);
if (invalidReport.valid || invalidReport.failedAtStage !== "schema") {
  throw new Error(
    "The deliberately invalid fixture was not rejected at schema.",
  );
}

process.stdout.write(
  `${JSON.stringify({
    verified: true,
    showcaseCount: manifest.showcases.length,
    artifactCount,
    invalidRejectedAt: invalidReport.failedAtStage,
    validationScope: manifest.validationScope,
  })}\n`,
);
