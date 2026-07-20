import type { z } from "zod";

import type { CandidateV2, ExportFormat } from "@/core/fabrication/types";
import {
  forgeDiagnostic,
  ForgeDiagnosticV1Schema,
  type ForgeDiagnosticStage,
  type ForgeDiagnosticV1,
} from "@/lib/forge-diagnostics";

interface ApiErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly details?: readonly string[];
    readonly diagnostic?: unknown;
  };
}

export class FoldForgeApiError extends Error {
  readonly code: string;
  readonly details: readonly string[];
  readonly diagnostic: ForgeDiagnosticV1 | null;

  constructor(
    code: string,
    message: string,
    details: readonly string[] = [],
    diagnostic: ForgeDiagnosticV1 | null = null,
  ) {
    super(message);
    this.name = "FoldForgeApiError";
    this.code = code;
    this.details = details;
    this.diagnostic = diagnostic;
  }
}

export class FoldForgeDiagnosticError extends Error {
  readonly diagnostic: ForgeDiagnosticV1;

  constructor(diagnostic: ForgeDiagnosticV1) {
    super(diagnostic.message);
    this.name = "FoldForgeDiagnosticError";
    this.diagnostic = diagnostic;
  }
}

const errorBody = (value: unknown): ApiErrorBody =>
  typeof value === "object" && value !== null ? (value as ApiErrorBody) : {};

const responseError = async (
  response: Response,
): Promise<FoldForgeApiError> => {
  const raw: unknown = await response.json().catch(() => null);
  const parsed = errorBody(raw).error;
  const parsedDiagnostic = ForgeDiagnosticV1Schema.safeParse(
    parsed?.diagnostic,
  );
  return new FoldForgeApiError(
    parsed?.code ?? "REQUEST_FAILED",
    parsed?.message ?? `Request failed with status ${response.status}.`,
    parsed?.details ?? [],
    parsedDiagnostic.success ? parsedDiagnostic.data : null,
  );
};

export interface ForgeRequestOptions {
  readonly stage?: ForgeDiagnosticStage;
  readonly attemptId?: string;
}

const connectionFailure = (
  stage: ForgeDiagnosticStage,
): FoldForgeDiagnosticError =>
  new FoldForgeDiagnosticError(
    forgeDiagnostic({
      stage,
      kind: "transport",
      code: "CONNECTION_INTERRUPTED",
      message:
        stage === "compile"
          ? "The deterministic design check was interrupted before it returned."
          : "The connection ended before this live model step returned. It was not retried automatically.",
      retryable: stage === "compile",
      modelCall: stage === "compile" ? "not_applicable" : "possibly_started",
    }),
  );

export const getJson = async <Schema extends z.ZodType>(
  url: string,
  schema: Schema,
): Promise<z.infer<Schema>> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw await responseError(response);
  const raw: unknown = await response.json();
  return schema.parse(raw);
};

export const postJson = async <Schema extends z.ZodType>(
  url: string,
  body: unknown,
  schema: Schema,
  options: ForgeRequestOptions = {},
): Promise<z.infer<Schema>> => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (options.attemptId) {
    headers.set("X-FoldForge-Attempt-Id", options.attemptId);
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (options.stage) throw connectionFailure(options.stage);
    throw error;
  }
  if (!response.ok) throw await responseError(response);
  try {
    const raw: unknown = await response.json();
    return schema.parse(raw);
  } catch (error) {
    if (!options.stage) throw error;
    throw new FoldForgeDiagnosticError(
      forgeDiagnostic({
        stage: options.stage,
        kind: "contract",
        code: "INVALID_API_RESPONSE",
        message: `The ${options.stage} response did not satisfy its strict contract.`,
        modelCall: options.stage === "compile" ? "not_applicable" : "attempted",
      }),
    );
  }
};

export const downloadCandidateExport = async (
  format: ExportFormat,
  candidate: CandidateV2,
): Promise<string> => {
  const response = await fetch(`/api/export/${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidate }),
  });
  if (!response.ok) throw await responseError(response);

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const matchedFilename = /filename="([^"]+)"/u.exec(disposition)?.[1];
  const filename =
    matchedFilename ?? `foldforge-${candidate.candidateId}.${format}`;
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
  return filename;
};
