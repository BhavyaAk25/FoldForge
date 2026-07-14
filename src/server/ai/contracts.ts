import { z } from "zod";

import { DesignConstraintSchema } from "@/core/schemas";

const LengthMeasurementSchema = z
  .object({
    value: z.number().finite().positive().nullable(),
    unit: z.enum(["mm", "cm", "in"]).nullable(),
    evidence: z.string().max(200),
  })
  .strict();

const MassMeasurementSchema = z
  .object({
    value: z.number().finite().positive().nullable(),
    unit: z.enum(["g", "kg", "oz", "lb"]).nullable(),
    evidence: z.string().max(200),
  })
  .strict();

export const RawConstraintCompilationSchema = z
  .object({
    objectWidth: LengthMeasurementSchema,
    objectHeight: LengthMeasurementSchema,
    objectDepth: LengthMeasurementSchema,
    objectMass: MassMeasurementSchema,
    orientation: z.enum(["portrait", "landscape"]).nullable(),
    targetViewingAngleDeg: z.number().finite().min(0).max(180).nullable(),
    angleToleranceDeg: z.number().finite().min(0).max(30).nullable(),
    sheetWidth: LengthMeasurementSchema,
    sheetHeight: LengthMeasurementSchema,
    printableMargin: LengthMeasurementSchema,
    materialProfile: z
      .enum(["cover_65lb", "cover_80lb", "cover_110lb"])
      .nullable(),
    maximumActiveCreaseCount: z.number().int().min(0).max(20).nullable(),
    cutsAllowed: z.boolean().nullable(),
    maximumCutCount: z.number().int().min(0).max(20).nullable(),
    glueAllowed: z.boolean().nullable(),
    mustFoldFlat: z.boolean().nullable(),
    priorities: z
      .array(z.enum(["stability", "compactness", "simplicity"]))
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
    clarifyingQuestion: z.string().max(240),
    interpretationSummary: z.string().min(1).max(500),
  })
  .strict();

export type RawConstraintCompilation = z.infer<
  typeof RawConstraintCompilationSchema
>;

export const CompileRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(2_000),
    installationId: z.string().min(8).max(128),
    providedConstraint: DesignConstraintSchema.nullable(),
  })
  .strict();

export type CompileRequest = z.infer<typeof CompileRequestSchema>;

export type CompileOutcome =
  | {
      readonly status: "ready";
      readonly constraint: z.infer<typeof DesignConstraintSchema>;
      readonly clarifyingQuestion: "";
      readonly interpretationSummary: string;
    }
  | {
      readonly status: "needs_clarification" | "unsupported" | "infeasible";
      readonly constraint: null;
      readonly clarifyingQuestion: string;
      readonly interpretationSummary: string;
    };
