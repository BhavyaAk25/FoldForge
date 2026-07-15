import { canonicalSerialize } from "@/core/canonical";
import { sha256Hex } from "@/core/sha256";

import type {
  CandidateProvenanceV2,
  CandidateScoreV2,
  FabricationIntentV1,
  FabricationProgramV1,
  VerificationReportV2,
} from "../types";
import {
  createTextArtifact,
  fabricationExportError,
  fabricationExportOk,
  prepareExportSource,
  type FabricationExportArtifact,
  type FabricationExportResult,
  type VerifiedFabricationExportSource,
} from "./artifact";

export interface FabricationJsonExportSource extends Omit<
  VerifiedFabricationExportSource,
  "provenance" | "verification"
> {
  readonly intent: FabricationIntentV1;
  readonly program: FabricationProgramV1;
  readonly verification: VerificationReportV2;
  readonly score: CandidateScoreV2;
  readonly provenance: CandidateProvenanceV2;
}

export const exportFabricationJson = (
  source: FabricationJsonExportSource,
): FabricationExportResult<FabricationExportArtifact> => {
  const preparedResult = prepareExportSource(source);
  if (!preparedResult.ok) return preparedResult;
  const prepared = preparedResult.value;

  const intentHash = sha256Hex(canonicalSerialize(source.intent));
  const programHash = sha256Hex(canonicalSerialize(source.program));
  const verificationHash = sha256Hex(canonicalSerialize(source.verification));
  const scoreHash = sha256Hex(canonicalSerialize(source.score));
  const provenanceHash = sha256Hex(canonicalSerialize(source.provenance));
  if (
    source.program.intentId !== source.intent.intentId ||
    source.program.programId !== prepared.ir.programId ||
    source.provenance.intentHash !== intentHash ||
    source.provenance.programHash !== programHash ||
    source.provenance.irHash !== prepared.sourceIrHash ||
    !source.score.eligible ||
    source.score.totalScore === null
  ) {
    return fabricationExportError(
      "invalid_source",
      prepared.sourceCandidateId,
      "The selected intent, program, score, provenance, and IR do not form one verified candidate.",
      [source.intent.intentId, source.program.programId, prepared.ir.irId],
    );
  }

  const payload = {
    intent: source.intent,
    program: source.program,
    ir: prepared.ir,
    verification: source.verification,
    score: source.score,
    provenance: source.provenance,
  };
  const payloadSha256 = sha256Hex(canonicalSerialize(payload));
  const document = {
    format: "foldforge.fabrication",
    version: "1",
    hashAlgorithm: "sha256",
    sourceCandidateId: prepared.sourceCandidateId,
    sourceIrHash: prepared.sourceIrHash,
    artifactSha256: "external-metadata",
    payloadSha256,
    hashes: {
      intent: intentHash,
      program: programHash,
      ir: prepared.sourceIrHash,
      verification: verificationHash,
      score: scoreHash,
      provenance: provenanceHash,
    },
    payload,
  };
  const text = `${canonicalSerialize(document)}\n`;
  return fabricationExportOk(
    createTextArtifact(
      "json",
      "fabrication.json",
      "application/json",
      text,
      prepared,
    ),
  );
};
