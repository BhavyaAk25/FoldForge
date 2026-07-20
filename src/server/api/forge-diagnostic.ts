import type { CompilationError } from "@/core/fabrication/compiler";
import type { VerificationReportV2 } from "@/core/fabrication/types";
import {
  forgeDiagnostic,
  type ForgeDiagnosticStage,
  type ForgeDiagnosticV1,
} from "@/lib/forge-diagnostics";
import {
  FabricationModelContractError,
  type FabricationModelContractErrorCode,
} from "@/server/fabrication-ai/model-contract-error";

type ProviderFailureClass =
  | "authentication"
  | "model_access"
  | "quota"
  | "rate_limit"
  | "timeout"
  | "unavailable"
  | "unknown";

const recordValue = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const safeProviderCode = (error: unknown): string | null => {
  const value = recordValue(error);
  return typeof value?.code === "string" ? value.code : null;
};

const safeProviderStatus = (error: unknown): number | null => {
  const value = recordValue(error);
  return typeof value?.status === "number" && Number.isSafeInteger(value.status)
    ? value.status
    : null;
};

const providerFailureClass = (error: unknown): ProviderFailureClass => {
  const code = safeProviderCode(error);
  const status = safeProviderStatus(error);
  const name = recordValue(error)?.name;
  if (status === 401 || code === "invalid_api_key") return "authentication";
  if (status === 403 || code === "model_not_found") return "model_access";
  if (code === "insufficient_quota") return "quota";
  if (status === 429 || code === "rate_limit_exceeded") return "rate_limit";
  if (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    name === "AbortError" ||
    name === "APIConnectionTimeoutError" ||
    name === "APIUserAbortError"
  ) {
    return "timeout";
  }
  if (name === "APIConnectionError") return "unavailable";
  if (status !== null && status >= 500) return "unavailable";
  return "unknown";
};

const FABRICATION_LIMIT_LABELS: Readonly<
  Record<string, { readonly singular: string; readonly plural: string }>
> = {
  "intent.maximumSheets": { singular: "sheet", plural: "sheets" },
  "intent.maximumPanels": { singular: "panel", plural: "panels" },
  "intent.maximumJointAndConnectorCount": {
    singular: "combined joint or connector",
    plural: "combined joints and connectors",
  },
};

const fabricationLimitMessage = (
  limit: string,
  actual: number,
  maximum: number,
): string => {
  const labels = FABRICATION_LIMIT_LABELS[limit];
  const label = labels
    ? actual === 1
      ? labels.singular
      : labels.plural
    : actual === 1
      ? "resource"
      : "resources";
  return `The generated program uses ${actual} ${label}; the permitted maximum is ${maximum}. Limit: ${limit}.`;
};

const MODEL_FAILURES: Readonly<
  Record<
    FabricationModelContractErrorCode,
    { readonly code: string; readonly message: string }
  >
> = {
  model_incomplete: {
    code: "MODEL_INCOMPLETE",
    message: "The model stopped before completing the fabrication plan.",
  },
  missing_plan_call: {
    code: "MODEL_PLAN_MISSING",
    message: "The model completed without submitting a fabrication plan.",
  },
  duplicate_plan_call: {
    code: "MODEL_PLAN_DUPLICATED",
    message: "The model submitted more than one fabrication plan.",
  },
  invalid_plan: {
    code: "MODEL_PLAN_INVALID",
    message: "The model plan did not satisfy the fabrication contract.",
  },
};

const PROVIDER_FAILURES: Readonly<
  Record<
    ProviderFailureClass,
    {
      readonly code: string;
      readonly message: string;
      readonly retryable: boolean;
    }
  >
> = {
  authentication: {
    code: "PROVIDER_AUTHENTICATION_FAILED",
    message: "The live model could not authenticate with its configured key.",
    retryable: false,
  },
  model_access: {
    code: "PROVIDER_MODEL_UNAVAILABLE",
    message: "The configured project cannot access the live fabrication model.",
    retryable: false,
  },
  quota: {
    code: "PROVIDER_CREDITS_EXHAUSTED",
    message: "The live model project has no available credit budget.",
    retryable: false,
  },
  rate_limit: {
    code: "PROVIDER_RATE_LIMITED",
    message: "The live model rate limit was reached.",
    retryable: true,
  },
  timeout: {
    code: "PROVIDER_TIMEOUT",
    message:
      "The live model request did not finish before its bounded timeout.",
    retryable: true,
  },
  unavailable: {
    code: "PROVIDER_UNAVAILABLE",
    message: "The live model service returned a temporary failure.",
    retryable: true,
  },
  unknown: {
    code: "MODEL_RESPONSE_ERROR",
    message: "The live model did not return a usable fabrication response.",
    retryable: false,
  },
};

export const modelFailureDiagnostic = (
  stage: Extract<ForgeDiagnosticStage, "intent" | "program" | "repair">,
  error: unknown,
): ForgeDiagnosticV1 => {
  if (error instanceof FabricationModelContractError) {
    const failure = MODEL_FAILURES[error.code];
    const detail = recordValue(recordValue(error)?.safeDetail);
    const limit = recordValue(detail?.limit);
    if (
      error.code === "invalid_plan" &&
      detail?.code === "limit_exceeded" &&
      typeof limit?.name === "string" &&
      typeof limit.actual === "number" &&
      typeof limit.maximum === "number"
    ) {
      return forgeDiagnostic({
        stage,
        kind: "compilation",
        code: "PROGRAM_LIMIT_EXCEEDED",
        message: fabricationLimitMessage(
          limit.name,
          limit.actual,
          limit.maximum,
        ),
        modelCall: "attempted",
        failureIds: [
          "compile.limit_exceeded",
          `compile.limit_exceeded#${limit.name}`,
        ],
      });
    }
    if (
      error.code === "invalid_plan" &&
      detail?.code === "collision.minimum_clearance" &&
      typeof detail.message === "string"
    ) {
      return forgeDiagnostic({
        stage,
        kind: "verification",
        code: "STRUCTURAL_COLLISION",
        message: detail.message,
        modelCall: "attempted",
        failureIds: ["collision.minimum_clearance"],
        failedAtStage: "collision",
      });
    }
    return forgeDiagnostic({
      stage,
      kind: "contract",
      code: failure.code,
      message: failure.message,
      modelCall: "attempted",
    });
  }
  const failure = PROVIDER_FAILURES[providerFailureClass(error)];
  return forgeDiagnostic({
    stage,
    kind: "provider",
    code: failure.code,
    message: failure.message,
    retryable: failure.retryable,
    modelCall: "attempted",
  });
};

export const verificationFailureDiagnostic = (input: {
  readonly stage: Extract<ForgeDiagnosticStage, "compile" | "repair">;
  readonly report: VerificationReportV2;
  readonly repairCycle?: number | null;
  readonly code?: "DESIGN_INVALID" | "REPAIR_INFEASIBLE" | "REPAIR_INCOMPLETE";
  readonly modelCall?: "not_applicable" | "not_started" | "attempted";
}): ForgeDiagnosticV1 => {
  const hardFailures = input.report.failures.filter(
    (failure) => failure.severity === "hard",
  );
  const primary = hardFailures[0] ?? input.report.failures[0];
  const code = input.code ?? "DESIGN_INVALID";
  const fallbackMessage =
    input.stage === "repair"
      ? "The design is still invalid after the bounded repair step."
      : "The generated design did not pass deterministic verification.";
  return forgeDiagnostic({
    stage: input.stage,
    kind: input.stage === "repair" ? "repair" : "verification",
    code,
    message: primary?.message ?? fallbackMessage,
    modelCall: input.modelCall ?? "not_applicable",
    failureIds: hardFailures.slice(0, 24).map((failure) => failure.failureId),
    failedAtStage: input.report.failedAtStage,
    repairCycle: input.repairCycle ?? null,
  });
};

export const compilationFailureDiagnostic = (
  failure: CompilationError,
): ForgeDiagnosticV1 => {
  if (failure.kind === "limit_exceeded") {
    return forgeDiagnostic({
      stage: "compile",
      kind: "compilation",
      code: "PROGRAM_LIMIT_EXCEEDED",
      message: fabricationLimitMessage(
        failure.limit,
        failure.actual,
        failure.maximum,
      ),
      failureIds: [
        "compile.limit_exceeded",
        `compile.limit_exceeded#${failure.limit}`,
      ],
    });
  }
  return forgeDiagnostic({
    stage: "compile",
    kind: "compilation",
    code: "PROGRAM_COMPILE_ERROR",
    message: "The generated program could not be compiled safely.",
    failureIds: [`compile.${failure.kind}`],
  });
};
