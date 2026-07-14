import { z } from "zod";

import {
  CandidateParametersSchema,
  DesignConstraintSchema,
  ParameterPatchSchema,
} from "@/core/schemas";

const Point2Schema = z.object({ xMm: z.number(), yMm: z.number() }).strict();
const Point3Schema = z
  .object({ xMm: z.number(), yMm: z.number(), zMm: z.number() })
  .strict();
const Polygon2Schema = z
  .object({ id: z.string(), points: z.array(Point2Schema) })
  .strict();
const Polygon3Schema = z
  .object({ id: z.string(), points: z.array(Point3Schema) })
  .strict();
const Segment2Schema = z
  .object({ id: z.string(), start: Point2Schema, end: Point2Schema })
  .strict();

export const CandidateSchema = z
  .object({
    id: z.string(),
    strategy: z.enum(["stable", "balanced", "compact"]),
    variant: z.number().int(),
    seed: z.number().int(),
    parameters: CandidateParametersSchema,
    geometry: z
      .object({
        parameters: CandidateParametersSchema,
        derived: z
          .object({
            backrestLengthMm: z.number(),
            rearBraceLengthMm: z.number(),
            rearRunMm: z.number(),
            flatLengthMm: z.number(),
            ridgeXMm: z.number(),
          })
          .strict(),
        flat: z
          .object({
            outline: Polygon2Schema,
            panels: z.array(Polygon2Schema),
            creases: z.array(Segment2Schema),
            slots: z.array(Segment2Schema),
            widthMm: z.number(),
            lengthMm: z.number(),
          })
          .strict(),
        folded: z
          .object({
            sideProfile: z
              .object({
                frontFoot: Point2Schema,
                lipTop: Point2Schema,
                backrestToe: Point2Schema,
                ridge: Point2Schema,
                rearFoot: Point2Schema,
              })
              .strict(),
            panels: z.array(Polygon3Schema),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

const CheckStatusSchema = z.enum(["pass", "fail", "warning", "not_run"]);
const ScoreBreakdownSchema = z
  .object({
    eligible: z.boolean(),
    stability: z.number(),
    simplicity: z.number(),
    paperEfficiency: z.number(),
    targetAngle: z.number(),
    foldability: z.number(),
    total: z.number(),
  })
  .strict();
const VerificationCheckSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    status: CheckStatusSchema,
    actual: z.union([z.number(), z.string(), z.boolean()]),
    expected: z.string(),
    message: z.string(),
    geometryRefs: z.array(z.string()),
  })
  .strict();

export const VerificationReportSchema = z
  .object({
    candidateId: z.string(),
    valid: z.boolean(),
    checks: z.array(VerificationCheckSchema),
    schemaValidity: CheckStatusSchema,
    finiteGeometry: CheckStatusSchema,
    sheetBoundResult: CheckStatusSchema,
    printableMarginResult: CheckStatusSchema,
    creaseCountResult: CheckStatusSchema,
    cutCountResult: CheckStatusSchema,
    minimumFeatureResult: CheckStatusSchema,
    targetAngleErrorDeg: z.number(),
    contactAreaMm2: z.number(),
    contactAreaResult: CheckStatusSchema,
    supportPolygonResult: CheckStatusSchema,
    frontStabilityMarginMm: z.number(),
    rearStabilityMarginMm: z.number(),
    sideStabilityMarginMm: z.number(),
    approximateCenterOfMassProjectionMm: Point2Schema,
    intersectionResult: CheckStatusSchema,
    foldFlatCompatibilityResult: CheckStatusSchema,
    svgScaleResult: CheckStatusSchema,
    foldReferenceResult: CheckStatusSchema,
    warnings: z.array(z.string()),
    hardFailures: z.array(z.string()),
    scoreBreakdown: ScoreBreakdownSchema,
    physicalStatus: z.literal("awaiting_user"),
  })
  .strict();

export const CandidateWithReportSchema = z
  .object({ candidate: CandidateSchema, report: VerificationReportSchema })
  .strict();

const CandidateComparisonSchema = z
  .object({
    candidateIds: z.array(z.string()),
    passedConstraints: z.record(z.string(), z.array(z.string())),
    failedConstraints: z.record(z.string(), z.array(z.string())),
    scoreByCandidate: z.record(z.string(), ScoreBreakdownSchema),
    tradeoffs: z.array(z.string()),
    recommendedCandidateId: z.string().nullable(),
    recommendationRationale: z.string(),
  })
  .strict();

export const CompileApiResponseSchema = z
  .object({
    mode: z.enum(["gpt-5.6-sol", "deterministic-controls"]),
    outcome: z.discriminatedUnion("status", [
      z
        .object({
          status: z.literal("ready"),
          constraint: DesignConstraintSchema,
          clarifyingQuestion: z.literal(""),
          interpretationSummary: z.string(),
        })
        .strict(),
      z
        .object({
          status: z.enum(["needs_clarification", "unsupported", "infeasible"]),
          constraint: z.null(),
          clarifyingQuestion: z.string(),
          interpretationSummary: z.string(),
        })
        .strict(),
    ]),
  })
  .strict();

export const GenerateApiResponseSchema = z
  .object({
    seed: z.number().int(),
    internalCandidateCount: z.number().int(),
    candidates: z.array(CandidateWithReportSchema).max(3),
    comparison: CandidateComparisonSchema,
    physicalStatus: z.literal("awaiting_user"),
  })
  .strict();

const TraceEventSchema = z
  .object({
    id: z.string(),
    timestamp: z.string(),
    source: z.enum(["AI", "CODE", "USER"]),
    kind: z.string(),
    summary: z.string(),
    inputHash: z.string(),
    candidateId: z.string().nullable(),
  })
  .strict();
const RepairCycleSchema = z
  .object({
    cycle: z.number().int(),
    inputHash: z.string(),
    beforeCandidateId: z.string(),
    patch: ParameterPatchSchema,
    afterCandidate: CandidateSchema,
    report: VerificationReportSchema,
  })
  .strict();
const RepairOutcomeSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("passed"),
      candidate: CandidateSchema,
      report: VerificationReportSchema,
      cycles: z.array(RepairCycleSchema),
      trace: z.array(TraceEventSchema),
    })
    .strict(),
  z
    .object({
      status: z.literal("infeasible"),
      candidate: CandidateSchema,
      report: VerificationReportSchema,
      cycles: z.array(RepairCycleSchema),
      trace: z.array(TraceEventSchema),
      reason: z.string(),
    })
    .strict(),
]);

export const RepairApiResponseSchema = z
  .object({
    mode: z.enum(["gpt-5.6-sol", "deterministic-offline-repair"]),
    outcome: RepairOutcomeSchema,
  })
  .strict();

const FinalNarrativeSchema = z
  .object({
    summary: z.string(),
    tradeoffs: z.array(z.string()),
    foldingSteps: z.array(z.string()),
    limitations: z.array(z.string()),
  })
  .strict();

export const FinalizeApiResponseSchema = z
  .object({
    mode: z.enum(["gpt-5.6-sol", "deterministic-instructions"]),
    comparison: CandidateComparisonSchema,
    winner: CandidateWithReportSchema,
    narrative: FinalNarrativeSchema,
  })
  .strict();

export type CandidateData = z.infer<typeof CandidateSchema>;
export type CandidateWithReportData = z.infer<typeof CandidateWithReportSchema>;
export type CompileApiResponse = z.infer<typeof CompileApiResponseSchema>;
export type GenerateApiResponse = z.infer<typeof GenerateApiResponseSchema>;
export type RepairApiResponse = z.infer<typeof RepairApiResponseSchema>;
export type FinalizeApiResponse = z.infer<typeof FinalizeApiResponseSchema>;
