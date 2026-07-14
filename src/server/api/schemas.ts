import { z } from "zod";

import {
  CandidateParametersSchema,
  DesignConstraintSchema,
} from "@/core/schemas";
import { buildStandGeometry } from "@/core/geometry";
import type { Candidate } from "@/core/types";

export const CandidateInputSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9-]+$/),
    strategy: z.enum(["stable", "balanced", "compact"]),
    variant: z.number().int().min(0).max(2),
    seed: z.number().int().safe(),
    parameters: CandidateParametersSchema,
  })
  .strict();

export type CandidateInput = z.infer<typeof CandidateInputSchema>;

export const toCandidate = (input: CandidateInput): Candidate => ({
  ...input,
  geometry: buildStandGeometry(input.parameters),
});

export const GenerateRequestSchema = z
  .object({
    constraint: DesignConstraintSchema,
    seed: z.number().int().safe(),
  })
  .strict();

export const RepairRequestSchema = z
  .object({
    candidate: CandidateInputSchema,
    constraint: DesignConstraintSchema,
    installationId: z.string().min(8).max(128),
  })
  .strict();

export const FinalizeRequestSchema = z
  .object({
    candidates: z.array(CandidateInputSchema).min(1).max(9),
    constraint: DesignConstraintSchema,
    installationId: z.string().min(8).max(128),
  })
  .strict();

export const ExportRequestSchema = z
  .object({
    candidate: CandidateInputSchema,
    constraint: DesignConstraintSchema,
  })
  .strict();
