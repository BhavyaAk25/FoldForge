import { describe, expect, it } from "vitest";

import {
  buildFabricationCandidate,
  finalizeFabricationCandidate,
} from "@/core/fabrication/candidate";
import {
  createFacetedDuckGiftBoxShowcase,
  createPullTabPopUpFlowerShowcase,
} from "@/core/fabrication/examples";
import type { FabricationExportArtifact } from "@/core/fabrication/export";
import { sha256HexBytes } from "@/core/sha256";
import {
  validateFinalizedConsumerArtifacts,
  type ConsumerValidationInput,
} from "../../scripts/lib/consumer-validation";

const finalizedShowcase = (
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
      compilerVersion: "consumer-validation-test-v1",
      generatedAtIso: "2026-07-17T12:00:00.000Z",
      deterministicSeed: 20_260_717,
      modelId: null,
      modelResponseId: null,
      modelPlanHash: null,
      planExpanderVersion: null,
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

const validationInput = (
  finalized: ReturnType<typeof finalizedShowcase>,
): ConsumerValidationInput => ({
  sourceCandidateId: finalized.candidate.candidateId,
  sourceIrHash: finalized.candidate.verification.irHash,
  artifacts: finalized.artifacts,
  foldOmission: finalized.foldOmission,
});

const replaceArtifact = (
  artifacts: readonly FabricationExportArtifact[],
  replacement: FabricationExportArtifact,
): readonly FabricationExportArtifact[] =>
  artifacts.map((artifact) =>
    artifact.format === replacement.format ? replacement : artifact,
  );

const replaceText = (
  artifact: FabricationExportArtifact,
  search: string,
  replacement: string,
): FabricationExportArtifact => {
  if (artifact.text === undefined || !artifact.text.includes(search)) {
    throw new Error(`Expected ${artifact.format} test text was not found.`);
  }
  const text = artifact.text.replace(search, replacement);
  const bytes = new TextEncoder().encode(text);
  return {
    ...artifact,
    text,
    bytes,
    metadata: {
      ...artifact.metadata,
      byteLength: bytes.byteLength,
      sha256: sha256HexBytes(bytes),
    },
  };
};

const replaceJsonSourceHash = (
  artifact: FabricationExportArtifact,
): FabricationExportArtifact => {
  if (artifact.text === undefined) throw new Error("Expected JSON test text.");
  const document: unknown = JSON.parse(artifact.text);
  if (
    typeof document !== "object" ||
    document === null ||
    Array.isArray(document)
  ) {
    throw new Error("Expected a JSON object.");
  }
  const changed = { ...document, sourceIrHash: "0".repeat(64) };
  const text = `${JSON.stringify(changed)}\n`;
  const bytes = new TextEncoder().encode(text);
  return {
    ...artifact,
    text,
    bytes,
    metadata: {
      ...artifact.metadata,
      byteLength: bytes.byteLength,
      sha256: sha256HexBytes(bytes),
    },
  };
};

describe("finalized consumer artifact validation", () => {
  it("binds every fold-only artifact and consumer result to the selected IR", async () => {
    const finalized = finalizedShowcase(
      createFacetedDuckGiftBoxShowcase(),
      "consumer-validator-duck",
    );
    const result = await validateFinalizedConsumerArtifacts(
      validationInput(finalized),
    );

    expect(result).toMatchObject({
      sourceCandidateId: finalized.candidate.candidateId,
      sourceIrHash: finalized.candidate.verification.irHash,
      artifactCount: 5,
      svg: { calibrationLengthMm: 50, layerCount: 4 },
      dxf: { calibrationLengthMm: 50 },
      glb: { errors: 0, warnings: 0 },
      fold: { edgeCount: 15, faceCount: 3 },
      foldOmissionCode: null,
    });
    expect(result.svg.sourcePathCount).toBe(result.json.sourcePathCount);
    expect(result.dxf.sourcePathCount).toBe(result.json.sourcePathCount);
    expect(result.glb.sourcePathCount).toBe(result.json.sourcePathCount);
    expect(result.artifactMetadata).toHaveLength(5);
    expect(
      result.artifactMetadata.every(
        (metadata) =>
          metadata.sourceCandidateId === result.sourceCandidateId &&
          metadata.sourceIrHash === result.sourceIrHash &&
          metadata.verified,
      ),
    ).toBe(true);
  }, 15_000);

  it("accepts a source-bound FOLD omission and no FOLD artifact", async () => {
    const finalized = finalizedShowcase(
      createPullTabPopUpFlowerShowcase(),
      "consumer-validator-flower",
    );
    const result = await validateFinalizedConsumerArtifacts(
      validationInput(finalized),
    );

    expect(result.artifactCount).toBe(4);
    expect(result.fold).toBeNull();
    expect(result.foldOmissionCode).toBe("non_fold_joint");
    expect(result.glb).toMatchObject({
      errors: 0,
      warnings: 0,
      animationCount: 1,
      motionSampleCount: 11,
    });
  }, 15_000);

  it("rejects binding, scale, unit, JSON, GLB, and omission corruption", async () => {
    const finalized = finalizedShowcase(
      createFacetedDuckGiftBoxShowcase(),
      "consumer-validator-corruption",
    );
    const base = validationInput(finalized);
    const byFormat = new Map(
      finalized.artifacts.map((artifact) => [artifact.format, artifact]),
    );
    const svg = byFormat.get("svg");
    const dxf = byFormat.get("dxf");
    const glb = byFormat.get("glb");
    const json = byFormat.get("json");
    if (!svg || !dxf || !glb || !json) {
      throw new Error("Consumer test artifact set is incomplete.");
    }

    await expect(
      validateFinalizedConsumerArtifacts({
        ...base,
        artifacts: [
          {
            ...svg,
            metadata: {
              ...svg.metadata,
              sourceCandidateId: "another-candidate",
            },
          },
          ...finalized.artifacts.filter(
            (artifact) => artifact.format !== "svg",
          ),
        ],
      }),
    ).rejects.toMatchObject({ code: "artifact_binding" });

    const badSvg = replaceText(svg, 'x2="55"', 'x2="54"');
    await expect(
      validateFinalizedConsumerArtifacts({
        ...base,
        artifacts: replaceArtifact(finalized.artifacts, badSvg),
      }),
    ).rejects.toMatchObject({ code: "svg_invalid" });

    const geometricallyAlteredSvg = replaceText(
      svg,
      'd="M 112 30 L 128.5 8"',
      'd="M 113 30 L 128.5 8"',
    );
    await expect(
      validateFinalizedConsumerArtifacts({
        ...base,
        artifacts: replaceArtifact(
          finalized.artifacts,
          geometricallyAlteredSvg,
        ),
      }),
    ).rejects.toMatchObject({ code: "svg_invalid" });

    const badDxf = replaceText(dxf, "$INSUNITS\n70\n4", "$INSUNITS\n70\n1");
    await expect(
      validateFinalizedConsumerArtifacts({
        ...base,
        artifacts: replaceArtifact(finalized.artifacts, badDxf),
      }),
    ).rejects.toMatchObject({ code: "dxf_invalid" });

    const badJson = replaceJsonSourceHash(json);
    await expect(
      validateFinalizedConsumerArtifacts({
        ...base,
        artifacts: replaceArtifact(finalized.artifacts, badJson),
      }),
    ).rejects.toMatchObject({ code: "json_invalid" });

    const glbBytes = Uint8Array.from(glb.bytes);
    glbBytes[0] = 0;
    const badGlb: FabricationExportArtifact = {
      ...glb,
      bytes: glbBytes,
      metadata: {
        ...glb.metadata,
        sha256: sha256HexBytes(glbBytes),
      },
    };
    await expect(
      validateFinalizedConsumerArtifacts({
        ...base,
        artifacts: replaceArtifact(finalized.artifacts, badGlb),
      }),
    ).rejects.toMatchObject({ code: "glb_invalid" });

    await expect(
      validateFinalizedConsumerArtifacts({
        ...base,
        foldOmission: {
          code: "multiple_sheets",
          message: "Contradictory test omission.",
          sourceCandidateId: base.sourceCandidateId,
          sourceIrHash: base.sourceIrHash,
          geometryIds: [],
        },
      }),
    ).rejects.toMatchObject({ code: "artifact_set" });
  }, 15_000);
});
