import { z } from "zod";

import {
  CandidateV2Schema,
  FabricationIntentV1Schema,
  FabricationProgramV1Schema,
} from "@/core/fabrication/schemas";
import {
  FABRICATION_PLAN_EXPANDER_VERSION,
  FABRICATION_SYNTHESIZER_VERSION,
} from "@/core/fabrication/versions";

export const PROMPT_MAXIMUM_CHARACTERS = 4_000;

export const DescribeFabricationRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(PROMPT_MAXIMUM_CHARACTERS),
  })
  .strict();

export const ForgeFabricationRequestSchema = z
  .object({
    intent: FabricationIntentV1Schema,
    candidateOrdinal: z.number().int().min(1).max(3),
    usedTopologyIds: z.array(z.string().min(1).max(80)).max(2),
  })
  .strict();

export const CompileFabricationRequestSchema = z
  .object({
    intent: FabricationIntentV1Schema,
    program: FabricationProgramV1Schema,
    candidateId: z.string().min(1).max(96),
    // Model provenance from /api/programs, recorded on the candidate.
    generation: z
      .object({
        modelId: z.string().min(1).max(120),
        modelResponseId: z.string().min(1).max(200),
        planHash: z.string().regex(/^[a-f0-9]{64}$/u),
        expanderVersion: z.string().min(1).max(20),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const FinalizeFabricationRequestSchema = z
  .object({
    candidate: CandidateV2Schema,
  })
  .strict();

export const ProgramProposalV1Schema = z
  .object({
    diversityClaim: z.string().min(1).max(500),
    program: FabricationProgramV1Schema,
    provenance: z
      .object({
        modelId: z.string().min(1).max(120),
        modelResponseId: z.string().min(1).max(200),
        planHash: z.string().regex(/^[a-f0-9]{64}$/u),
        expanderVersion: z.literal(FABRICATION_PLAN_EXPANDER_VERSION),
        synthesizerVersion: z
          .literal(FABRICATION_SYNTHESIZER_VERSION)
          .optional(),
        synthesisEvaluationCount: z.number().int().min(1).max(24).optional(),
        synthesisNogoodCount: z.number().int().min(0).max(24).optional(),
        proposalCount: z.number().int().min(1).max(3).optional(),
        evaluatedProposalCount: z.number().int().min(1).max(3).optional(),
        selectedProposalIndex: z.number().int().min(0).max(2).optional(),
        terminalFailureCodes: z
          .array(z.string().min(1).max(160))
          .max(12)
          .optional(),
        // How the returned geometry was produced: "synthesis" means the model's
        // own design spec was compiled and verified as-is; "template" means the
        // model spec could not be built and a proven parametric template, fit to
        // the requested dimensions, was used instead.
        generationSource: z.enum(["synthesis", "template"]).optional(),
      })
      .strict(),
  })
  .strict();

export const FabricationNarrativeV1Schema = z
  .object({
    summary: z.string().min(1).max(600),
    mechanism: z.string().min(1).max(600),
    assemblySteps: z.array(z.string().min(1).max(300)).min(2).max(16),
    limitations: z.array(z.string().min(1).max(300)).min(1).max(8),
    sourceLabels: z
      .array(
        z
          .object({
            claim: z.string().min(1).max(240),
            source: z.enum(["AI interpretation", "Calculated", "User input"]),
          })
          .strict(),
      )
      .min(1)
      .max(16),
  })
  .strict();

export type ProgramProposalV1 = z.infer<typeof ProgramProposalV1Schema>;
export type FabricationNarrativeV1 = z.infer<
  typeof FabricationNarrativeV1Schema
>;
