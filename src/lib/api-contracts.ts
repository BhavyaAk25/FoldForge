import { z } from "zod";

import {
  CandidateScoreV2Schema,
  CandidateV2Schema,
  FabricationIRV1Schema,
  FabricationIntentV1Schema,
  FabricationProgramV1Schema,
  ProgramPatchV1Schema,
  VerificationReportV2Schema,
} from "@/core/fabrication/schemas";
import {
  FabricationNarrativeV1Schema,
  ProgramProposalV1Schema,
} from "@/server/fabrication-ai/contracts";

export const HealthApiResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("foldforge"),
    liveAiEnabled: z.boolean(),
    liveAiBlockReason: z
      .enum(["configuration", "disabled", "kill_switch"])
      .nullable(),
    buildSha: z.string().nullable(),
  })
  .strict();

export const AccessApiResponseSchema = z
  .object({ granted: z.literal(true), required: z.boolean() })
  .strict();

export const IntentApiResponseSchema = FabricationIntentV1Schema;

export const ProgramsApiResponseSchema = z
  .object({
    proposal: ProgramProposalV1Schema,
    programStructureFingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict();

const CompiledCandidateFields = {
  candidateId: z.string(),
  ir: FabricationIRV1Schema,
  report: VerificationReportV2Schema,
  score: CandidateScoreV2Schema,
};

export const CompileApiResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("passed"),
      ...CompiledCandidateFields,
    })
    .strict(),
  z
    .object({
      status: z.literal("invalid"),
      ...CompiledCandidateFields,
    })
    .strict(),
  z
    .object({
      status: z.literal("compile_error"),
      candidateId: z.string(),
      ir: z.null(),
      report: z.null(),
      score: z.null(),
    })
    .strict(),
]);

export const RepairApiResponseSchema = z
  .object({
    status: z.enum(["passed", "still_invalid", "infeasible"]),
    candidateId: z.string(),
    patch: ProgramPatchV1Schema.nullable(),
    program: FabricationProgramV1Schema,
    ir: FabricationIRV1Schema.nullable(),
    report: VerificationReportV2Schema.nullable(),
    score: CandidateScoreV2Schema.nullable(),
  })
  .strict();

export const FinalizeApiResponseSchema = z
  .object({ narrative: FabricationNarrativeV1Schema })
  .strict();

export const RepairEvidenceSchema = z
  .object({
    cycle: z.number().int().min(1).max(5),
    beforeFailureId: z.string(),
    beforeFailureMessage: z.string(),
    patch: ProgramPatchV1Schema,
    result: z.enum(["passed", "still_invalid"]),
  })
  .strict();

export const StudioCheckpointSchema = z
  .object({
    version: z.literal(3),
    savedAt: z.string().datetime(),
    prompt: z.string().max(4_000),
    intent: FabricationIntentV1Schema.nullable(),
    candidates: z.array(CandidateV2Schema).max(3),
    selectedId: z.string(),
    repairEvidence: z.record(z.string(), z.array(RepairEvidenceSchema)),
    narrative: FabricationNarrativeV1Schema.nullable(),
  })
  .strict();

export type HealthApiResponse = z.infer<typeof HealthApiResponseSchema>;
export type IntentApiResponse = z.infer<typeof IntentApiResponseSchema>;
export type ProgramsApiResponse = z.infer<typeof ProgramsApiResponseSchema>;
export type CompileApiResponse = z.infer<typeof CompileApiResponseSchema>;
export type RepairApiResponse = z.infer<typeof RepairApiResponseSchema>;
export type FinalizeApiResponse = z.infer<typeof FinalizeApiResponseSchema>;
export type RepairEvidence = z.infer<typeof RepairEvidenceSchema>;
export type StudioCheckpoint = z.infer<typeof StudioCheckpointSchema>;
