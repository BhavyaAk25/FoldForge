import { z } from "zod";

import {
  CandidateV2Schema,
  FabricationIntentV1Schema,
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
    // True when an AI provider is configured. Without one, prompts for boxes,
    // pop-up cards, and stand-up figures still work through parametric templates.
    liveAiEnabled: z.boolean(),
    aiModel: z.string().nullable(),
    buildSha: z.string().nullable(),
  })
  .strict();

export const IntentApiResponseSchema = FabricationIntentV1Schema;

export const ProgramsApiResponseSchema = z
  .object({
    // The intent the program was verified against.
    intent: FabricationIntentV1Schema,
    proposal: ProgramProposalV1Schema,
    programStructureFingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict();

export const FoldExportSchema = z
  .object({ available: z.boolean(), reason: z.string().nullable() })
  .strict();

/** /api/compile: the finished candidate, or why the program failed. */
export const CompileApiResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("passed"),
      candidate: CandidateV2Schema,
      foldExport: FoldExportSchema,
      diagnostic: z.null(),
    })
    .strict(),
  z
    .object({
      status: z.enum(["invalid", "compile_error"]),
      candidateId: z.string(),
      diagnostic: ForgeDiagnosticV1Schema,
    })
    .strict(),
]);

/** /api/examples/[id]: a prepared, verified example. */
export const SavedExampleApiResponseSchema = z
  .object({
    prompt: z.string(),
    limitation: z.string().nullable(),
    candidate: CandidateV2Schema,
    foldExport: FoldExportSchema,
  })
  .strict();

export const FinalizeApiResponseSchema = z
  .object({ narrative: FabricationNarrativeV1Schema })
  .strict();

export const StudioCheckpointSchema = z
  .object({
    version: z.literal(5),
    savedAt: z.string().datetime(),
    prompt: z.string().max(4_000),
    resultBinding: ForgeResultBindingSchema.nullable(),
    intent: FabricationIntentV1Schema.nullable(),
    candidates: z.array(CandidateV2Schema).max(3),
    selectedId: z.string(),
    foldExports: z.record(z.string(), FoldExportSchema),
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
export type FoldExport = z.infer<typeof FoldExportSchema>;
