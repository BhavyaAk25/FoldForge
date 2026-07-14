import type { z } from "zod";

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
  const raw: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorBody(raw).error;
    throw new FoldForgeApiError(
      parsed?.code ?? "REQUEST_FAILED",
      parsed?.message ?? `Request failed with status ${response.status}.`,
      parsed?.details ?? [],
    );
  }
  return schema.parse(raw);
};

export const downloadExport = async (
  format: "svg" | "fold",
  body: unknown,
  fallbackFilename: string,
): Promise<void> => {
  const response = await fetch(`/api/export/${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const raw: unknown = await response.json().catch(() => null);
    const parsed = errorBody(raw).error;
    throw new FoldForgeApiError(
      parsed?.code ?? "EXPORT_FAILED",
      parsed?.message ?? "The export could not be generated.",
      parsed?.details ?? [],
    );
  }

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const matchedFilename = /filename="([^"]+)"/.exec(disposition)?.[1];
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = matchedFilename ?? fallbackFilename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
