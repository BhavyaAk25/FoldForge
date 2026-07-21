import { z } from "zod";

import {
  CandidateV2Schema,
  FabricationIntentV1Schema,
  FabricationPlanV1Schema,
  FabricationProgramV1Schema,
  ProgramPatchV1Schema,
} from "@/core/fabrication/schemas";
import {
  FabricationPlanV2Schema,
  SemanticEdgeAttachmentV2Schema,
} from "@/core/fabrication/semantic-plan";
import { FABRICATION_PLAN_EXPANDER_VERSION } from "@/core/fabrication/planning";

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
  })
  .strict();

export const RepairFabricationRequestSchema = z
  .object({
    intent: FabricationIntentV1Schema,
    program: FabricationProgramV1Schema,
    candidateId: z.string().min(1).max(96),
    repairCycle: z.number().int().min(1).max(5),
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
        proposalCount: z.number().int().min(1).max(3).optional(),
        evaluatedProposalCount: z.number().int().min(1).max(3).optional(),
        selectedProposalIndex: z.number().int().min(0).max(2).optional(),
        terminalFailureCodes: z
          .array(z.string().min(1).max(160))
          .max(3)
          .optional(),
      })
      .strict(),
  })
  .strict();

export const FabricationPlanProposalV1Schema = z
  .object({
    diversityClaim: z.string().min(1).max(500),
    plan: FabricationPlanV1Schema,
  })
  .strict();

export const FabricationPlanProposalV2Schema = z
  .object({
    diversityClaim: z.string().min(1).max(500),
    plan: FabricationPlanV2Schema,
  })
  .strict();

export const FabricationPlanProposalBatchV2Schema = z
  .object({
    proposals: z.array(FabricationPlanProposalV2Schema).min(1).max(3),
  })
  .strict();

const semanticKey = z.string().regex(/^[A-Za-z][A-Za-z0-9._:-]{0,39}$/u);
const finiteOrNull = z.number().finite().nullable();

export const FabricationPlanJointEditV2Schema = z
  .object({
    jointKey: semanticKey,
    parentBodyKey: semanticKey.nullable(),
    childBodyKey: semanticKey.nullable(),
    parentAttachment: SemanticEdgeAttachmentV2Schema.nullable(),
    childAttachment: SemanticEdgeAttachmentV2Schema.nullable(),
    foldDirection: z.enum(["mountain", "valley"]).nullable(),
    homeValue: finiteOrNull,
    minimumValue: finiteOrNull,
    maximumValue: finiteOrNull,
  })
  .strict();

export const FabricationPlanConnectorEditV2Schema = z
  .object({
    relationshipKey: semanticKey,
    tabAttachment: SemanticEdgeAttachmentV2Schema.nullable(),
    slotAttachment: SemanticEdgeAttachmentV2Schema.nullable(),
  })
  .strict();

export const FabricationPlanStructuralAlternativeV2Schema = z
  .object({
    diversityClaim: z.string().min(1).max(300),
    topologyKey: semanticKey,
    groundedBodyKey: semanticKey.nullable(),
    jointEdits: z.array(FabricationPlanJointEditV2Schema).max(12),
    connectorEdits: z.array(FabricationPlanConnectorEditV2Schema).max(12),
  })
  .strict();

/**
 * A complete base plan plus compact, model-authored structural deltas fits the
 * same 4k response budget more reliably than three repeated six-panel plans.
 */
export const FabricationPlanProposalBatchV3Schema = z
  .object({
    baseProposal: FabricationPlanProposalV2Schema,
    structuralAlternatives: z
      .array(FabricationPlanStructuralAlternativeV2Schema)
      .max(2),
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
export type FabricationPlanProposalV1 = z.infer<
  typeof FabricationPlanProposalV1Schema
>;
export type FabricationPlanProposalV2 = z.infer<
  typeof FabricationPlanProposalV2Schema
>;
export type FabricationPlanProposalBatchV2 = z.infer<
  typeof FabricationPlanProposalBatchV2Schema
>;
export type FabricationPlanProposalBatchV3 = z.infer<
  typeof FabricationPlanProposalBatchV3Schema
>;
export type FabricationPlanStructuralAlternativeV2 = z.infer<
  typeof FabricationPlanStructuralAlternativeV2Schema
>;
export type FabricationNarrativeV1 = z.infer<
  typeof FabricationNarrativeV1Schema
>;

export { ProgramPatchV1Schema };
