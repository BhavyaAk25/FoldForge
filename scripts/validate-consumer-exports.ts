import { version as gltfValidatorVersion } from "gltf-validator";

import {
  buildFabricationCandidate,
  finalizeFabricationCandidate,
} from "../src/core/fabrication/candidate";
import { createOfflineFabricationShowcases } from "../src/core/fabrication/examples";
import { validateFinalizedConsumerArtifacts } from "./lib/consumer-validation";

interface ConsumerValidationResult {
  readonly showcaseId: string;
  readonly glb: { readonly errors: number; readonly warnings: number };
  readonly dxf: {
    readonly entityCount: number;
    readonly layers: readonly string[];
  };
  readonly fold: {
    readonly edgeCount: number;
    readonly faceCount: number;
  } | null;
  readonly foldOmissionCode: string | null;
}

const showcases = createOfflineFabricationShowcases();
const results: ConsumerValidationResult[] = [];
let generatedFoldCount = 0;
for (const [index, showcase] of showcases.entries()) {
  const candidateId = `consumer-validation-${showcase.showcaseId}`;
  const candidate = buildFabricationCandidate({
    candidateId,
    intent: showcase.intent,
    program: showcase.program,
    rank: 1,
    selectionStatus: "selected",
    provenance: {
      compilerVersion: "foldforge-consumer-validation-v1",
      generatedAtIso: "2026-07-15T00:00:00.000Z",
      deterministicSeed: 20_260_714 + index,
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
  const validation = await validateFinalizedConsumerArtifacts({
    sourceCandidateId: finalized.value.candidate.candidateId,
    sourceIrHash: finalized.value.candidate.verification.irHash,
    artifacts: finalized.value.artifacts,
    foldOmission: finalized.value.foldOmission,
  });
  const glb = {
    errors: validation.glb.errors,
    warnings: validation.glb.warnings,
  };
  const dxf = {
    entityCount: validation.dxf.entityCount,
    layers: validation.dxf.layers,
  };
  const fold = validation.fold;
  if (fold) generatedFoldCount += 1;
  results.push({
    showcaseId: showcase.showcaseId,
    glb,
    dxf,
    fold,
    foldOmissionCode: validation.foldOmissionCode,
  });
}

const foldShowcase = results.find((result) => result.fold !== null);
if (
  generatedFoldCount !== 1 ||
  foldShowcase?.showcaseId !== "faceted-duck-gift-box"
) {
  throw new Error(
    "Exactly the fold-only duck showcase must produce the lossless FOLD profile.",
  );
}

process.stdout.write(
  `${JSON.stringify({
    gltfValidatorVersion: gltfValidatorVersion(),
    dxfParserVersion: "1.1.2",
    foldLibraryVersion: "0.12.0",
    showcaseCount: results.length,
    generatedFoldCount,
    results,
  })}\n`,
);
