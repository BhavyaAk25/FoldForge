import { NextResponse } from "next/server";

import type { ForgeDiagnosticV1 } from "@/lib/forge-diagnostics";

export type SafeSecurityErrorCode =
  | "ACCESS_REQUIRED"
  | "LIVE_MODEL_UNAVAILABLE"
  | "PAYLOAD_TOO_LARGE"
  | "REQUEST_ORIGIN_DENIED"
  | "REQUEST_QUOTA_EXCEEDED"
  | "TOKEN_BUDGET_EXCEEDED"
  | "TOO_MANY_ACTIVE_REQUESTS";

export interface SafeSecurityErrorBody {
  readonly error: {
    readonly code: SafeSecurityErrorCode;
    readonly message: string;
    readonly details: readonly string[];
    readonly diagnostic?: ForgeDiagnosticV1;
  };
}

export type SafeSecurityErrorResponse = NextResponse<SafeSecurityErrorBody>;

interface SafeErrorDefinition {
  readonly message: string;
  readonly status: 401 | 403 | 413 | 429 | 503;
}

const DEFINITIONS: Readonly<
  Record<SafeSecurityErrorCode, SafeErrorDefinition>
> = {
  ACCESS_REQUIRED: {
    message: "A valid access session is required.",
    status: 401,
  },
  LIVE_MODEL_UNAVAILABLE: {
    message: "Live model access is unavailable.",
    status: 503,
  },
  PAYLOAD_TOO_LARGE: {
    message: "The request body exceeds this route's limit.",
    status: 413,
  },
  REQUEST_ORIGIN_DENIED: {
    message: "The request origin is not allowed.",
    status: 403,
  },
  REQUEST_QUOTA_EXCEEDED: {
    message: "The live request budget is exhausted. Try again later.",
    status: 429,
  },
  TOKEN_BUDGET_EXCEEDED: {
    message: "The live token budget is exhausted. Try again later.",
    status: 429,
  },
  TOO_MANY_ACTIVE_REQUESTS: {
    message: "Too many live requests are active. Try again shortly.",
    status: 429,
  },
};

const boundedRetryAfterSeconds = (value: number): number =>
  Math.min(60 * 60, Math.max(1, Math.ceil(value)));

export const safeSecurityError = (
  code: SafeSecurityErrorCode,
  retryAfterSeconds?: number,
  diagnostic?: ForgeDiagnosticV1,
): SafeSecurityErrorResponse => {
  const definition = DEFINITIONS[code];
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  if (retryAfterSeconds !== undefined) {
    headers.set(
      "Retry-After",
      String(boundedRetryAfterSeconds(retryAfterSeconds)),
    );
  }
  return NextResponse.json<SafeSecurityErrorBody>(
    {
      error: {
        code,
        message: definition.message,
        details: [],
        ...(diagnostic ? { diagnostic } : {}),
      },
    },
    { status: definition.status, headers },
  );
};
