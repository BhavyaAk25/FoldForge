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

import { ForgeDiagnosticV1Schema } from "./forge-diagnostics";
import {
  ForgeResultBindingSchema,
  forgePromptHash,
} from "./forge-result-binding";

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
      diagnostic: z.null(),
    })
    .strict(),
  z
    .object({
      status: z.literal("invalid"),
      ...CompiledCandidateFields,
      diagnostic: ForgeDiagnosticV1Schema,
    })
    .strict(),
  z
    .object({
      status: z.literal("compile_error"),
      candidateId: z.string(),
      ir: z.null(),
      report: z.null(),
      score: z.null(),
      diagnostic: ForgeDiagnosticV1Schema,
    })
    .strict(),
]);

const RepairResponseFields = {
  candidateId: z.string(),
  patch: ProgramPatchV1Schema.nullable(),
  program: FabricationProgramV1Schema,
  ir: FabricationIRV1Schema.nullable(),
  report: VerificationReportV2Schema.nullable(),
  score: CandidateScoreV2Schema.nullable(),
};

export const RepairApiResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("passed"),
      ...RepairResponseFields,
      diagnostic: z.null(),
    })
    .strict(),
  z
    .object({
      status: z.literal("still_invalid"),
      ...RepairResponseFields,
      diagnostic: ForgeDiagnosticV1Schema,
    })
    .strict(),
  z
    .object({
      status: z.literal("infeasible"),
      ...RepairResponseFields,
      diagnostic: ForgeDiagnosticV1Schema,
    })
    .strict(),
]);

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
    version: z.literal(4),
    savedAt: z.string().datetime(),
    prompt: z.string().max(4_000),
    resultBinding: ForgeResultBindingSchema.nullable(),
    intent: FabricationIntentV1Schema.nullable(),
    candidates: z.array(CandidateV2Schema).max(3),
    selectedId: z.string(),
    repairEvidence: z.record(z.string(), z.array(RepairEvidenceSchema)),
    narrative: FabricationNarrativeV1Schema.nullable(),
  })
  .strict()
  .superRefine((checkpoint, context) => {
    const hasResult = checkpoint.candidates.length > 0;
    if (hasResult !== (checkpoint.resultBinding !== null)) {
      context.addIssue({
        code: "custom",
        path: ["resultBinding"],
        message: "A saved design requires its forge-result binding.",
      });
    }
    if (
      checkpoint.resultBinding &&
      checkpoint.resultBinding.promptHash !== forgePromptHash(checkpoint.prompt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["resultBinding", "promptHash"],
        message: "The saved design does not belong to this prompt.",
      });
    }
  });

export type HealthApiResponse = z.infer<typeof HealthApiResponseSchema>;
export type ProgramsApiResponse = z.infer<typeof ProgramsApiResponseSchema>;
export type FinalizeApiResponse = z.infer<typeof FinalizeApiResponseSchema>;
export type RepairEvidence = z.infer<typeof RepairEvidenceSchema>;
