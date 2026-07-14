import { z } from "zod";

import { PARAMETER_RANGES, PRODUCT_LIMITS } from "./constants";

const boundedNumber = (minimum: number, maximum: number) =>
  z.number().finite().min(minimum).max(maximum);

export const DesignConstraintSchema = z
  .object({
    objectWidthMm: z.number().finite().positive().max(220),
    objectHeightMm: z.number().finite().positive().max(320),
    objectDepthMm: z.number().finite().positive().max(30),
    objectMassG: z
      .number()
      .finite()
      .positive()
      .max(PRODUCT_LIMITS.maximumObjectMassG),
    orientation: z.enum(["portrait", "landscape"]),
    targetViewingAngleDeg: boundedNumber(50, 75),
    angleToleranceDeg: boundedNumber(1, 10),
    sheetWidthMm: z.number().finite().min(180).max(330),
    sheetHeightMm: z.number().finite().min(250).max(500),
    printableMarginMm: boundedNumber(3, 15),
    materialProfile: z.enum(["cover_65lb", "cover_80lb", "cover_110lb"]),
    maximumActiveCreaseCount: z.number().int().min(5).max(12),
    cutsAllowed: z.boolean(),
    maximumCutCount: z.number().int().min(0).max(8),
    glueAllowed: z.boolean(),
    mustFoldFlat: z.boolean(),
    priorities: z
      .array(z.enum(["stability", "compactness", "simplicity"]))
      .min(1)
      .max(3),
    explicitRequirements: z.array(z.string().min(1).max(240)).max(20),
    inferredDefaults: z.array(z.string().min(1).max(240)).max(20),
    unresolvedQuestions: z.array(z.string().min(1).max(240)).max(5),
    contradictoryRequirements: z.array(z.string().min(1).max(240)).max(5),
    supportedScopeStatus: z.enum([
      "supported",
      "unsupported",
      "needs_clarification",
    ]),
    feasibilityStatus: z.enum(["feasible", "infeasible", "unknown"]),
  })
  .strict();

export type DesignConstraint = z.infer<typeof DesignConstraintSchema>;

export const CandidateParametersSchema = z
  .object({
    baseDepthMm: boundedNumber(
      PARAMETER_RANGES.baseDepthMm.min,
      PARAMETER_RANGES.baseDepthMm.max,
    ),
    standWidthMm: boundedNumber(
      PARAMETER_RANGES.standWidthMm.min,
      PARAMETER_RANGES.standWidthMm.max,
    ),
    backrestRiseMm: boundedNumber(
      PARAMETER_RANGES.backrestRiseMm.min,
      PARAMETER_RANGES.backrestRiseMm.max,
    ),
    backrestAngleDeg: boundedNumber(
      PARAMETER_RANGES.backrestAngleDeg.min,
      PARAMETER_RANGES.backrestAngleDeg.max,
    ),
    frontToeDepthMm: boundedNumber(
      PARAMETER_RANGES.frontToeDepthMm.min,
      PARAMETER_RANGES.frontToeDepthMm.max,
    ),
    lipHeightMm: boundedNumber(
      PARAMETER_RANGES.lipHeightMm.min,
      PARAMETER_RANGES.lipHeightMm.max,
    ),
    tabDepthMm: boundedNumber(
      PARAMETER_RANGES.tabDepthMm.min,
      PARAMETER_RANGES.tabDepthMm.max,
    ),
    tabWidthMm: boundedNumber(
      PARAMETER_RANGES.tabWidthMm.min,
      PARAMETER_RANGES.tabWidthMm.max,
    ),
    slotClearanceMm: boundedNumber(
      PARAMETER_RANGES.slotClearanceMm.min,
      PARAMETER_RANGES.slotClearanceMm.max,
    ),
    panelClearanceMm: boundedNumber(
      PARAMETER_RANGES.panelClearanceMm.min,
      PARAMETER_RANGES.panelClearanceMm.max,
    ),
    lockingStyle: z.literal("dual_tabs"),
  })
  .strict();

export type CandidateParameters = z.infer<typeof CandidateParametersSchema>;

export const PatchOperationSchema = z
  .object({
    operation: z.enum(["set", "increase", "decrease", "clamp"]),
    parameter: z.enum([
      "baseDepthMm",
      "standWidthMm",
      "backrestRiseMm",
      "backrestAngleDeg",
      "frontToeDepthMm",
      "lipHeightMm",
      "tabDepthMm",
      "tabWidthMm",
      "slotClearanceMm",
      "panelClearanceMm",
    ]),
    value: z.number().finite(),
    unit: z.enum(["mm", "deg"]),
    verificationId: z.string().min(1).max(80),
    reason: z.string().min(1).max(300),
    expectedEffect: z.string().min(1).max(300),
    affectedConstraint: z.string().min(1).max(120),
  })
  .strict();

export const ParameterPatchSchema = z
  .object({
    operations: z
      .array(PatchOperationSchema)
      .min(1)
      .max(PRODUCT_LIMITS.maximumPatchOperations),
  })
  .strict();

export type PatchOperation = z.infer<typeof PatchOperationSchema>;
export type ParameterPatch = z.infer<typeof ParameterPatchSchema>;

export const CompiledConstraintEnvelopeSchema = z
  .object({
    constraint: DesignConstraintSchema,
    clarifyingQuestion: z.string().max(240),
    interpretationSummary: z.string().min(1).max(500),
  })
  .strict();

export type CompiledConstraintEnvelope = z.infer<
  typeof CompiledConstraintEnvelopeSchema
>;
