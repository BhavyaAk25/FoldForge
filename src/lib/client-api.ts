import type { z } from "zod";

import type { CandidateV2, ExportFormat } from "@/core/fabrication/types";

interface ApiErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly details?: readonly string[];
  };
}

export class FoldForgeApiError extends Error {
  readonly code: string;
  readonly details: readonly string[];

  constructor(code: string, message: string, details: readonly string[] = []) {
    super(message);
    this.name = "FoldForgeApiError";
    this.code = code;
    this.details = details;
  }
}

const errorBody = (value: unknown): ApiErrorBody =>
  typeof value === "object" && value !== null ? (value as ApiErrorBody) : {};

const responseError = async (
  response: Response,
): Promise<FoldForgeApiError> => {
  const raw: unknown = await response.json().catch(() => null);
  const parsed = errorBody(raw).error;
  return new FoldForgeApiError(
    parsed?.code ?? "REQUEST_FAILED",
    parsed?.message ?? `Request failed with status ${response.status}.`,
    parsed?.details ?? [],
  );
};

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
): Promise<z.infer<Schema>> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await responseError(response);
  const raw: unknown = await response.json();
  return schema.parse(raw);
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
