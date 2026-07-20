import { z } from "zod";

export const ForgeDiagnosticStageSchema = z.enum([
  "intent",
  "program",
  "compile",
  "repair",
  "finalize",
]);

export const ForgeDiagnosticKindSchema = z.enum([
  "request",
  "access",
  "quota",
  "provider",
  "contract",
  "compilation",
  "verification",
  "repair",
  "transport",
  "unknown",
]);

export const ForgeModelCallStatusSchema = z.enum([
  "not_applicable",
  "not_started",
  "attempted",
  "possibly_started",
]);

export const ForgeDiagnosticV1Schema = z
  .object({
    version: z.literal("1"),
    stage: ForgeDiagnosticStageSchema,
    kind: ForgeDiagnosticKindSchema,
    code: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/u),
    message: z.string().min(1).max(500),
    retryable: z.boolean(),
    modelCall: ForgeModelCallStatusSchema,
    failureIds: z.array(z.string().min(1).max(160)).max(24),
    failedAtStage: z.string().min(1).max(80).nullable(),
    repairCycle: z.number().int().min(1).max(5).nullable(),
  })
  .strict();

export type ForgeDiagnosticStage = z.infer<typeof ForgeDiagnosticStageSchema>;
export type ForgeDiagnosticKind = z.infer<typeof ForgeDiagnosticKindSchema>;
export type ForgeModelCallStatus = z.infer<typeof ForgeModelCallStatusSchema>;
export type ForgeDiagnosticV1 = z.infer<typeof ForgeDiagnosticV1Schema>;

export const forgeDiagnostic = (input: {
  readonly stage: ForgeDiagnosticStage;
  readonly kind: ForgeDiagnosticKind;
  readonly code: string;
  readonly message: string;
  readonly retryable?: boolean;
  readonly modelCall?: ForgeModelCallStatus;
  readonly failureIds?: readonly string[];
  readonly failedAtStage?: string | null;
  readonly repairCycle?: number | null;
}): ForgeDiagnosticV1 =>
  ForgeDiagnosticV1Schema.parse({
    version: "1",
    stage: input.stage,
    kind: input.kind,
    code: input.code,
    message: input.message,
    retryable: input.retryable ?? false,
    modelCall: input.modelCall ?? "not_applicable",
    failureIds: input.failureIds ?? [],
    failedAtStage: input.failedAtStage ?? null,
    repairCycle: input.repairCycle ?? null,
  });
