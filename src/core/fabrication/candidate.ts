import { canonicalSerialize } from "@/core/canonical";
import { err, ok, type Result } from "@/core/result";
import { sha256Hex, sha256HexBytes } from "@/core/sha256";

import {
  compileFabricationProgram,
  fabricationIrHash,
  type CompilationError,
} from "./compiler";
import {
  CALIBRATION_LENGTH_MM,
  exportFabricationDxf,
  exportFabricationFold,
  exportFabricationGlb,
  exportFabricationJson,
  exportFabricationSvg,
  glbArtifactMatchesSource,
  type FabricationExportArtifact,
  type FabricationExportError,
  type FoldOmissionReason,
  type VerifiedFabricationExportSource,
} from "./export";
import {
  parseFabricationContract,
  type FabricationContractValidationError,
} from "./result";
import {
  CandidateV2Schema,
  FabricationIntentV1Schema,
  FabricationProgramV1Schema,
} from "./schemas";
import { scoreFabricationCandidate } from "./scoring";
import type {
  CandidateProvenanceV2,
  CandidateScoreV2,
  CandidateV2,
  ExportEquivalenceCheckV2,
  ExportFormat,
  FabricationIntentV1,
  FabricationProgramV1,
  VerificationReportV2,
} from "./types";
import { verifyFabricationIr } from "./verification";

export interface CandidateProvenanceInput {
  readonly compilerVersion: string;
  readonly generatedAtIso: string;
  readonly deterministicSeed: number;
  readonly modelId: string | null;
  readonly modelResponseId: string | null;
  readonly parentCandidateId: string | null;
  readonly appliedPatchIds: readonly string[];
  readonly repairCycle: number;
}

export interface BuildFabricationCandidateInput {
  readonly candidateId: string;
  readonly intent: unknown;
  readonly program: unknown;
  readonly rank?: number | null;
  readonly selectionStatus?: Exclude<CandidateV2["selectionStatus"], "invalid">;
  readonly provenance: CandidateProvenanceInput;
}

export interface CandidateVerificationError {
  readonly kind: "verification_failed";
  readonly report: VerificationReportV2;
}

export interface CandidateBindingError {
  readonly kind: "candidate_binding";
  readonly reason:
    | "compiled_ir_mismatch"
    | "verification_ir_hash_mismatch"
    | "verification_report_mismatch"
    | "score_mismatch"
    | "provenance_mismatch";
  readonly message: string;
  readonly candidateId: string;
}

export interface CandidateNotSelectedError {
  readonly kind: "candidate_not_selected";
  readonly candidateId: string;
  readonly selectionStatus: CandidateV2["selectionStatus"];
}

export interface InvalidCandidateSelectionError {
  readonly kind: "invalid_candidate_selection";
  readonly candidateId: string;
}

export interface InvalidExportRequestError {
  readonly kind: "invalid_export_request";
  readonly message: string;
  readonly requestedFormats: readonly string[];
}

export interface CandidateExportError {
  readonly kind: "export_failed";
  readonly format: ExportFormat;
  readonly error: FabricationExportError;
}

export interface CandidateExportEquivalenceError {
  readonly kind: "export_equivalence_failed";
  readonly format: ExportFormat;
  readonly message: string;
}

export type CandidateBuildError =
  | CompilationError
  | FabricationContractValidationError
  | CandidateVerificationError;

export type CandidateFinalizationError =
  | CandidateBuildError
  | CandidateBindingError
  | CandidateNotSelectedError
  | InvalidCandidateSelectionError
  | InvalidExportRequestError
  | CandidateExportError
  | CandidateExportEquivalenceError;

export interface FinalizeFabricationCandidateInput {
  readonly candidate: CandidateV2;
  readonly requestedFormats: readonly ExportFormat[];
}

export interface FinalizedFabricationCandidate {
  readonly candidate: CandidateV2;
  readonly artifacts: readonly FabricationExportArtifact[];
  readonly foldOmission: FoldOmissionReason | null;
}

interface CandidateHashes {
  readonly inputHash: string;
  readonly intentHash: string;
  readonly programHash: string;
  readonly irHash: string;
}

const candidateContractError = (
  issues: readonly {
    readonly code: string;
    readonly path: readonly PropertyKey[];
    readonly message: string;
  }[],
): FabricationContractValidationError => ({
  kind: "contract_validation",
  contract: "CandidateV2",
  issues: issues.map((issue) => ({
    code: issue.code,
    path: issue.path.map(String),
    message: issue.message,
  })),
});

const parseCandidate = (
  input: unknown,
): Result<CandidateV2, FabricationContractValidationError> => {
  const parsed = CandidateV2Schema.safeParse(input);
  return parsed.success
    ? ok(parsed.data)
    : err(candidateContractError(parsed.error.issues));
};

const hashesFor = (
  intent: FabricationIntentV1,
  program: FabricationProgramV1,
  irHash: string,
): CandidateHashes => ({
  inputHash: sha256Hex(canonicalSerialize({ intent, program })),
  intentHash: sha256Hex(canonicalSerialize(intent)),
  programHash: sha256Hex(canonicalSerialize(program)),
  irHash,
});

const normalizedProvenanceInput = (
  input: CandidateProvenanceInput,
): CandidateProvenanceInput => ({
  compilerVersion: input.compilerVersion.trim(),
  generatedAtIso: input.generatedAtIso,
  deterministicSeed: input.deterministicSeed,
  modelId: input.modelId?.trim() ?? null,
  modelResponseId: input.modelResponseId?.trim() ?? null,
  parentCandidateId: input.parentCandidateId,
  appliedPatchIds: input.appliedPatchIds,
  repairCycle: input.repairCycle,
});

const buildProvenance = (
  candidateId: string,
  hashes: CandidateHashes,
  input: CandidateProvenanceInput,
): CandidateProvenanceV2 => {
  const normalized = normalizedProvenanceInput(input);
  const values = {
    compilerVersion: normalized.compilerVersion,
    inputHash: hashes.inputHash,
    intentHash: hashes.intentHash,
    programHash: hashes.programHash,
    irHash: hashes.irHash,
    modelId: normalized.modelId,
    modelResponseId: normalized.modelResponseId,
    generatedAtIso: normalized.generatedAtIso,
    deterministicSeed: normalized.deterministicSeed,
    parentCandidateId: normalized.parentCandidateId,
    appliedPatchIds: normalized.appliedPatchIds,
    repairCycle: normalized.repairCycle,
  };
  const provenanceHash = sha256Hex(
    canonicalSerialize({ candidateId, ...values }),
  );
  return {
    provenanceId: `provenance:${provenanceHash.slice(0, 32)}`,
    ...values,
  };
};

const provenanceInputFrom = (
  provenance: CandidateProvenanceV2,
): CandidateProvenanceInput => ({
  compilerVersion: provenance.compilerVersion,
  generatedAtIso: provenance.generatedAtIso,
  deterministicSeed: provenance.deterministicSeed,
  modelId: provenance.modelId,
  modelResponseId: provenance.modelResponseId,
  parentCandidateId: provenance.parentCandidateId,
  appliedPatchIds: provenance.appliedPatchIds,
  repairCycle: provenance.repairCycle,
});

export const buildFabricationCandidate = (
  input: BuildFabricationCandidateInput,
): Result<CandidateV2, CandidateBuildError> => {
  const parsedIntent = parseFabricationContract(
    "FabricationIntentV1",
    FabricationIntentV1Schema,
    input.intent,
  );
  if (!parsedIntent.ok) return parsedIntent;
  const parsedProgram = parseFabricationContract(
    "FabricationProgramV1",
    FabricationProgramV1Schema,
    input.program,
  );
  if (!parsedProgram.ok) return parsedProgram;
  const intent = parsedIntent.value;
  const program = parsedProgram.value;

  const compiled = compileFabricationProgram(intent, program);
  if (!compiled.ok) return compiled;
  const ir = compiled.value;
  const verification = verifyFabricationIr(ir, input.candidateId);
  if (!verification.valid) {
    return err({ kind: "verification_failed", report: verification });
  }
  const score = scoreFabricationCandidate(ir, verification, intent);
  if (!score.eligible || score.totalScore === null) {
    return err({ kind: "verification_failed", report: verification });
  }
  const hashes = hashesFor(intent, program, fabricationIrHash(ir));
  const provenance = buildProvenance(
    input.candidateId,
    hashes,
    input.provenance,
  );
  const selectionStatus = input.selectionStatus ?? "eligible";
  const candidate: CandidateV2 = {
    version: "2",
    candidateId: input.candidateId,
    label: program.candidateLabel,
    rank: input.rank ?? null,
    selectionStatus,
    intent,
    program,
    ir,
    verification,
    score,
    provenance,
    exportMetadata: {
      status: "not_generated",
      requestedFormats: [],
      artifacts: [],
      calibrationLengthMm: CALIBRATION_LENGTH_MM,
      selectedCandidateId:
        selectionStatus === "selected" ? input.candidateId : null,
      sourceEquivalent: false,
      foldOmissionReason: null,
    },
  };
  return parseCandidate(candidate);
};

const bindingError = (
  candidateId: string,
  reason: CandidateBindingError["reason"],
  message: string,
): Result<never, CandidateBindingError> =>
  err({ kind: "candidate_binding", reason, message, candidateId });

export const validateFabricationCandidateBinding = (
  candidateInput: CandidateV2,
): Result<
  CandidateV2,
  CompilationError | FabricationContractValidationError | CandidateBindingError
> => {
  const parsed = parseCandidate(candidateInput);
  if (!parsed.ok) return parsed;
  const candidate = parsed.value;
  const compiled = compileFabricationProgram(
    candidate.intent,
    candidate.program,
  );
  if (!compiled.ok) return compiled;
  const candidateIrHash = fabricationIrHash(candidate.ir);
  if (candidate.verification.irHash !== candidateIrHash) {
    return bindingError(
      candidate.candidateId,
      "verification_ir_hash_mismatch",
      "The verification stamp does not hash the candidate IR.",
    );
  }
  if (canonicalSerialize(compiled.value) !== canonicalSerialize(candidate.ir)) {
    return bindingError(
      candidate.candidateId,
      "compiled_ir_mismatch",
      "The candidate IR is not the exact deterministic compilation of its intent and program.",
    );
  }

  const hashes = hashesFor(
    candidate.intent,
    candidate.program,
    candidateIrHash,
  );
  const expectedProvenance = buildProvenance(
    candidate.candidateId,
    hashes,
    provenanceInputFrom(candidate.provenance),
  );
  if (
    canonicalSerialize(expectedProvenance) !==
    canonicalSerialize(candidate.provenance)
  ) {
    return bindingError(
      candidate.candidateId,
      "provenance_mismatch",
      "Candidate provenance hashes do not bind the exact intent, program, and IR.",
    );
  }

  const expectedReport = verifyFabricationIr(
    candidate.ir,
    candidate.candidateId,
    {
      exportEquivalence: candidate.verification.exportEquivalence,
    },
  );
  if (
    canonicalSerialize(expectedReport) !==
    canonicalSerialize(candidate.verification)
  ) {
    return bindingError(
      candidate.candidateId,
      "verification_report_mismatch",
      "The verification report cannot be reproduced from the candidate IR.",
    );
  }
  const expectedScore = scoreFabricationCandidate(
    candidate.ir,
    expectedReport,
    candidate.intent,
  );
  if (
    canonicalSerialize(expectedScore) !== canonicalSerialize(candidate.score)
  ) {
    return bindingError(
      candidate.candidateId,
      "score_mismatch",
      "The candidate score cannot be reproduced from its verified IR.",
    );
  }
  return ok(candidate);
};

const EXPORT_FORMATS: readonly ExportFormat[] = [
  "svg",
  "dxf",
  "glb",
  "json",
  "fold",
];
const EXPORT_FORMAT_SET: ReadonlySet<string> = new Set(EXPORT_FORMATS);

const validateRequestedFormats = (
  requestedFormats: readonly ExportFormat[],
): Result<readonly ExportFormat[], InvalidExportRequestError> => {
  const runtimeFormats: readonly string[] = requestedFormats;
  const valid = runtimeFormats.every((format) => EXPORT_FORMAT_SET.has(format));
  const unique = new Set(runtimeFormats).size === runtimeFormats.length;
  if (!valid || !unique || runtimeFormats.length > EXPORT_FORMATS.length) {
    return err({
      kind: "invalid_export_request",
      message:
        "Requested export formats must be unique members of the supported format set.",
      requestedFormats: runtimeFormats,
    });
  }
  return ok(requestedFormats);
};

const verifiedExportSource = (
  candidate: CandidateV2,
): VerifiedFabricationExportSource => ({
  ir: candidate.ir,
  sourceCandidateId: candidate.candidateId,
  selectionStatus: "selected",
  verification: candidate.verification,
  provenance: candidate.provenance,
});

const artifactIsSourceEquivalent = (
  artifact: FabricationExportArtifact,
  candidate: CandidateV2,
): boolean =>
  artifact.metadata.format === artifact.format &&
  artifact.metadata.sourceCandidateId === candidate.candidateId &&
  artifact.metadata.sourceIrHash === candidate.verification.irHash &&
  artifact.metadata.verified &&
  artifact.metadata.byteLength === artifact.bytes.byteLength &&
  artifact.metadata.sha256 === sha256HexBytes(artifact.bytes) &&
  (artifact.format !== "glb" ||
    glbArtifactMatchesSource(
      artifact.bytes,
      candidate.ir,
      candidate.candidateId,
      candidate.provenance,
    ));

const equivalenceCheck = (
  artifact: FabricationExportArtifact,
  candidate: CandidateV2,
): ExportEquivalenceCheckV2 => {
  const equivalent = artifactIsSourceEquivalent(artifact, candidate);
  return {
    format: artifact.format,
    status: equivalent ? "pass" : "fail",
    sourceIrHash: candidate.verification.irHash,
    artifactHash: artifact.metadata.sha256,
    message: equivalent
      ? `${artifact.format.toUpperCase()} bytes match the selected candidate and source IR.`
      : `${artifact.format.toUpperCase()} artifact metadata does not match the selected source IR.`,
  };
};

const jsonEquivalenceCheck = (
  candidate: CandidateV2,
): ExportEquivalenceCheckV2 => ({
  format: "json",
  status: "pass",
  sourceIrHash: candidate.verification.irHash,
  artifactHash: candidate.verification.irHash,
  message:
    "Canonical fabrication JSON binds the selected intent, program, IR, report, score, and provenance.",
});

const exportError = (
  format: ExportFormat,
  error: FabricationExportError,
): Result<never, CandidateExportError> =>
  err({ kind: "export_failed", format, error });

export const finalizeFabricationCandidate = (
  input: FinalizeFabricationCandidateInput,
): Result<FinalizedFabricationCandidate, CandidateFinalizationError> => {
  const parsed = parseCandidate(input.candidate);
  if (!parsed.ok) return parsed;
  if (!parsed.value.verification.valid || !parsed.value.score.eligible) {
    return err({
      kind: "invalid_candidate_selection",
      candidateId: parsed.value.candidateId,
    });
  }
  if (parsed.value.selectionStatus !== "selected") {
    return err({
      kind: "candidate_not_selected",
      candidateId: parsed.value.candidateId,
      selectionStatus: parsed.value.selectionStatus,
    });
  }
  const formats = validateRequestedFormats(input.requestedFormats);
  if (!formats.ok) return formats;
  const bound = validateFabricationCandidateBinding(parsed.value);
  if (!bound.ok) return bound;
  const candidate = bound.value;
  const source = verifiedExportSource(candidate);
  const artifactByFormat = new Map<ExportFormat, FabricationExportArtifact>();
  let foldOmission: FoldOmissionReason | null = null;

  for (const format of formats.value) {
    if (format === "json") continue;
    if (format === "fold") {
      const foldResult = exportFabricationFold(source);
      if (foldResult.status === "failed") {
        return exportError(format, foldResult.error);
      }
      if (foldResult.status === "omitted") {
        foldOmission = foldResult.reason;
      } else {
        artifactByFormat.set(format, foldResult.artifact);
      }
      continue;
    }

    const artifactResult = (() => {
      switch (format) {
        case "svg":
          return exportFabricationSvg(source);
        case "dxf":
          return exportFabricationDxf(source);
        case "glb":
          return exportFabricationGlb(source);
      }
    })();
    if (!artifactResult.ok) return exportError(format, artifactResult.error);
    artifactByFormat.set(format, artifactResult.value);
  }

  const exportEquivalence = formats.value.flatMap(
    (format): readonly ExportEquivalenceCheckV2[] => {
      if (format === "json") return [jsonEquivalenceCheck(candidate)];
      const artifact = artifactByFormat.get(format);
      return artifact ? [equivalenceCheck(artifact, candidate)] : [];
    },
  );
  const failedEquivalence = exportEquivalence.find(
    (check) => check.status !== "pass",
  );
  if (failedEquivalence) {
    return err({
      kind: "export_equivalence_failed",
      format: failedEquivalence.format,
      message: failedEquivalence.message,
    });
  }

  const verification = verifyFabricationIr(
    candidate.ir,
    candidate.candidateId,
    {
      exportEquivalence,
    },
  );
  if (!verification.valid) {
    return err({ kind: "verification_failed", report: verification });
  }
  const score: CandidateScoreV2 = scoreFabricationCandidate(
    candidate.ir,
    verification,
    candidate.intent,
  );
  const verifiedCandidate: CandidateV2 = {
    ...candidate,
    verification,
    score,
  };

  if (formats.value.includes("json")) {
    const jsonResult = exportFabricationJson({
      ir: verifiedCandidate.ir,
      sourceCandidateId: verifiedCandidate.candidateId,
      selectionStatus: "selected",
      intent: verifiedCandidate.intent,
      program: verifiedCandidate.program,
      verification: verifiedCandidate.verification,
      score: verifiedCandidate.score,
      provenance: verifiedCandidate.provenance,
    });
    if (!jsonResult.ok) return exportError("json", jsonResult.error);
    artifactByFormat.set("json", jsonResult.value);
  }

  const artifacts = formats.value.flatMap((format) => {
    const artifact = artifactByFormat.get(format);
    return artifact ? [artifact] : [];
  });
  const nonOmittedFormats = formats.value.filter(
    (format) => format !== "fold" || foldOmission === null,
  );
  const allArtifactsEquivalent =
    artifacts.length === nonOmittedFormats.length &&
    artifacts.every((artifact) =>
      artifactIsSourceEquivalent(artifact, verifiedCandidate),
    );
  if (!allArtifactsEquivalent) {
    const failingFormat =
      nonOmittedFormats.find((format) => {
        const artifact = artifactByFormat.get(format);
        return (
          !artifact || !artifactIsSourceEquivalent(artifact, verifiedCandidate)
        );
      }) ?? "json";
    return err({
      kind: "export_equivalence_failed",
      format: failingFormat,
      message:
        "One or more generated artifacts do not bind the exact selected candidate and verified IR.",
    });
  }

  const finalized: CandidateV2 = {
    ...verifiedCandidate,
    exportMetadata: {
      status: "verified",
      requestedFormats: formats.value,
      artifacts: artifacts.map((artifact) => artifact.metadata),
      calibrationLengthMm: CALIBRATION_LENGTH_MM,
      selectedCandidateId: verifiedCandidate.candidateId,
      sourceEquivalent: true,
      foldOmissionReason: foldOmission?.message ?? null,
    },
  };
  const parsedFinalized = parseCandidate(finalized);
  if (!parsedFinalized.ok) return parsedFinalized;
  return ok({
    candidate: parsedFinalized.value,
    artifacts,
    foldOmission,
  });
};
