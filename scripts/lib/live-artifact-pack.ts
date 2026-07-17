import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CandidateV2 } from "../../src/core/fabrication/types";
import { sha256HexBytes } from "../../src/core/sha256";
import type { FabricationExportArtifact } from "../../src/core/fabrication/export";
import type { ConsumerValidationResult } from "./consumer-validation";
import type { BuildEvidence } from "./build-evidence";

export interface ArtifactPackEvidence {
  readonly directory: string;
  readonly files: readonly {
    readonly format: string;
    readonly fileName: string;
    readonly byteLength: number;
    readonly sha256: string;
  }[];
  readonly instructionsFile: string;
  readonly manifestFile: string;
}

export const writeLiveArtifactPack = async (input: {
  readonly artifactRoot: string;
  readonly reportDirectory: string;
  readonly buildEvidence: BuildEvidence;
  readonly caseId: string;
  readonly candidate: CandidateV2;
  readonly artifacts: readonly FabricationExportArtifact[];
  readonly consumerValidation: ConsumerValidationResult;
  readonly narrative: {
    readonly summary: string;
    readonly mechanism: string;
    readonly assemblySteps: readonly string[];
    readonly limitations: readonly string[];
  };
}): Promise<ArtifactPackEvidence> => {
  if (
    input.reportDirectory.trim().length === 0 ||
    path.isAbsolute(input.reportDirectory) ||
    input.reportDirectory.split(/[\\/]/u).includes("..")
  ) {
    throw new Error(
      "Live artifact evidence requires a safe relative directory.",
    );
  }
  if (input.consumerValidation.json.assemblyOperationCount < 1) {
    throw new Error(
      "A live fabrication pack requires at least one source-bound assembly operation.",
    );
  }
  const directory = path.join(input.artifactRoot, input.caseId);
  await mkdir(directory, { recursive: true });
  const files = [];
  for (const artifact of input.artifacts) {
    const filePath = path.join(directory, artifact.metadata.fileName);
    await writeFile(filePath, artifact.bytes);
    const persistedBytes = new Uint8Array(await readFile(filePath));
    if (
      persistedBytes.byteLength !== artifact.metadata.byteLength ||
      sha256HexBytes(persistedBytes) !== artifact.metadata.sha256
    ) {
      throw new Error(
        `${artifact.format.toUpperCase()} changed while writing the live evidence pack.`,
      );
    }
    files.push({
      format: artifact.format,
      fileName: artifact.metadata.fileName,
      byteLength: artifact.metadata.byteLength,
      sha256: artifact.metadata.sha256,
    });
  }

  const instructionsFile = "ASSEMBLY_AND_LIMITATIONS.md";
  const deterministicAssembly =
    input.candidate.program.blueprint.assemblyOperations
      .toSorted((left, right) => left.order - right.order)
      .map((operation) => `${operation.order}. ${operation.instruction}`)
      .join("\n");
  await writeFile(
    path.join(directory, instructionsFile),
    `# ${input.candidate.intent.title}\n\n${input.narrative.summary}\n\n## Mechanism\n\n${input.narrative.mechanism}\n\n## Deterministic assembly program\n\n${deterministicAssembly}\n\n## AI assembly explanation\n\n${input.narrative.assemblySteps.map((step, index) => `${index + 1}. ${step}`).join("\n")}\n\n## Limitations\n\n${input.narrative.limitations.map((limitation) => `- ${limitation}`).join("\n")}\n`,
    "utf8",
  );

  const manifestFile = "evidence-manifest.json";
  await writeFile(
    path.join(directory, manifestFile),
    `${JSON.stringify(
      {
        version: 1,
        caseId: input.caseId,
        candidateId: input.candidate.candidateId,
        sourceIrHash: input.candidate.verification.irHash,
        buildEvidence: input.buildEvidence,
        files,
        consumerValidation: input.consumerValidation,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return {
    directory: input.reportDirectory,
    files,
    instructionsFile,
    manifestFile,
  };
};
