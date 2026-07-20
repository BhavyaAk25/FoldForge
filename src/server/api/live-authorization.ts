import type { NextRequest, NextResponse } from "next/server";

import { canonicalSerialize } from "@/core/canonical";
import { sha256Hex } from "@/core/sha256";
import {
  forgeDiagnostic,
  type ForgeDiagnosticStage,
} from "@/lib/forge-diagnostics";
import {
  readAccessSessionFromRequest,
  type AccessSession,
} from "@/server/access";
import { safetyIdentifierFromSubject } from "@/server/ai/safety";
import { isLiveModelEnabled } from "@/server/live-model";
import { guardMutationRequest } from "@/server/request-guard";
import {
  BestEffortProcessUsageControlStore,
  type ConcurrencyLease,
  type LiveUsageControlStore,
  processUsageControlStore,
  type RecentOperationReservation,
} from "@/server/usage-control";

import { apiError, parseRouteJsonBody } from "./response";
import {
  LIVE_ATTEMPT_LIMITS,
  LIVE_DEPLOYMENT_LIMITS,
  LIVE_OPERATION_POLICIES,
  LIVE_SESSION_LIMITS,
  type LiveOperation,
} from "./security-policy";
import {
  safeSecurityError,
  type SafeSecurityErrorCode,
  type SafeSecurityErrorResponse,
} from "./security-response";

export interface LiveRouteAuthorizationInput {
  readonly request: NextRequest;
  readonly operation: LiveOperation;
  readonly reservedInputTokens: number;
  readonly reservedOutputTokens: number;
  readonly allowedOrigins?: readonly string[];
  readonly nowMs?: number;
}

export interface LiveRouteAuthorizationContext {
  readonly body: unknown;
  readonly operation: LiveOperation;
  readonly reservedInputTokens: number;
  readonly reservedOutputTokens: number;
  readonly reservedTokens: number;
  readonly safetyIdentifier: string;
  readonly attemptId: string;
  readonly session: AccessSession;
  readonly lease: ConcurrencyLease;
}

export type LiveRouteAuthorizationResult =
  | {
      readonly ok: true;
      readonly context: LiveRouteAuthorizationContext;
    }
  | {
      readonly ok: false;
      readonly response: NextResponse | SafeSecurityErrorResponse;
    };

export type AuthorizedLiveRouteHandler = (
  context: LiveRouteAuthorizationContext,
) => Promise<NextResponse>;

const validTokenReservation = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;

export const LIVE_ATTEMPT_HEADER = "X-FoldForge-Attempt-Id";

const DEPLOYMENT_USAGE_SUBJECT = {
  value: "foldforge-live-deployment-v1",
} as const;

const ATTEMPT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const paidOperationStage = (operation: LiveOperation): ForgeDiagnosticStage => {
  switch (operation) {
    case "intent":
      return "intent";
    case "programs":
      return "program";
    case "repair":
      return "repair";
    case "finalize":
      return "finalize";
  }
};

const SECURITY_MESSAGES: Readonly<Record<SafeSecurityErrorCode, string>> = {
  ACCESS_REQUIRED: "A valid access session is required.",
  LIVE_MODEL_UNAVAILABLE: "Live model access is unavailable.",
  PAYLOAD_TOO_LARGE: "The request body exceeds this route's limit.",
  REQUEST_ORIGIN_DENIED: "The request origin is not allowed.",
  REQUEST_QUOTA_EXCEEDED:
    "The live request budget is exhausted. Try again later.",
  TOKEN_BUDGET_EXCEEDED: "The live token budget is exhausted. Try again later.",
  TOO_MANY_ACTIVE_REQUESTS:
    "Too many live requests are active. Try again shortly.",
};

const securityFailure = (
  operation: LiveOperation,
  code: SafeSecurityErrorCode,
  retryAfterSeconds?: number,
): SafeSecurityErrorResponse => {
  const stage = paidOperationStage(operation);
  return safeSecurityError(
    code,
    retryAfterSeconds,
    forgeDiagnostic({
      stage,
      kind:
        code === "ACCESS_REQUIRED" || code === "LIVE_MODEL_UNAVAILABLE"
          ? "access"
          : code === "REQUEST_QUOTA_EXCEEDED" ||
              code === "TOKEN_BUDGET_EXCEEDED" ||
              code === "TOO_MANY_ACTIVE_REQUESTS"
            ? "quota"
            : "request",
      code,
      message: SECURITY_MESSAGES[code],
      modelCall: "not_started",
    }),
  );
};

const operationAttemptKey = (
  operation: LiveOperation,
  body: unknown,
): string => {
  if (
    operation === "repair" &&
    typeof body === "object" &&
    body !== null &&
    "program" in body
  ) {
    return `repair:${sha256Hex(canonicalSerialize(body.program))}`;
  }
  if (
    operation === "finalize" &&
    typeof body === "object" &&
    body !== null &&
    "candidate" in body
  ) {
    return `finalize:${sha256Hex(canonicalSerialize(body.candidate))}`;
  }
  return operation;
};

export interface LiveRouteAuthorizerOptions {
  readonly usageStore?: LiveUsageControlStore;
}

export class LiveRouteAuthorizer {
  private readonly usageStore: LiveUsageControlStore;

  constructor(options: LiveRouteAuthorizerOptions = {}) {
    this.usageStore =
      options.usageStore ?? new BestEffortProcessUsageControlStore();
  }

  async authorize(
    input: LiveRouteAuthorizationInput,
  ): Promise<LiveRouteAuthorizationResult> {
    const policy = LIVE_OPERATION_POLICIES[input.operation];
    const mutation = input.allowedOrigins
      ? guardMutationRequest(input.request, {
          allowedOrigins: input.allowedOrigins,
        })
      : guardMutationRequest(input.request);
    if (!mutation.ok) {
      return {
        ok: false,
        response: securityFailure(input.operation, "REQUEST_ORIGIN_DENIED"),
      };
    }

    const parsedBody = await parseRouteJsonBody(
      input.request,
      policy.bodyLimitBytes,
    );
    if (!parsedBody.ok) {
      return {
        ok: false,
        response:
          parsedBody.response.status === 413
            ? securityFailure(input.operation, "PAYLOAD_TOO_LARGE")
            : parsedBody.response,
      };
    }

    const session = readAccessSessionFromRequest(input.request);
    if (!session) {
      return {
        ok: false,
        response: securityFailure(input.operation, "ACCESS_REQUIRED"),
      };
    }
    if (!isLiveModelEnabled()) {
      return {
        ok: false,
        response: securityFailure(input.operation, "LIVE_MODEL_UNAVAILABLE"),
      };
    }

    const stage = paidOperationStage(input.operation);
    const rawAttemptId = input.request.headers.get(LIVE_ATTEMPT_HEADER);
    const attemptId = rawAttemptId;
    if (!attemptId || !ATTEMPT_ID_PATTERN.test(attemptId)) {
      const diagnostic = forgeDiagnostic({
        stage,
        kind: "request",
        code: "INVALID_FORGE_ATTEMPT",
        message:
          "This live request is missing its valid forge attempt identifier.",
        modelCall: "not_started",
      });
      return {
        ok: false,
        response: apiError(
          diagnostic.code,
          diagnostic.message,
          400,
          [],
          diagnostic,
        ),
      };
    }

    const reservedTokens =
      input.reservedInputTokens + input.reservedOutputTokens;
    if (
      !validTokenReservation(input.reservedInputTokens) ||
      !validTokenReservation(input.reservedOutputTokens) ||
      !Number.isSafeInteger(reservedTokens) ||
      input.reservedOutputTokens > policy.maximumOutputTokens ||
      reservedTokens > LIVE_SESSION_LIMITS.maximumReservedTokens
    ) {
      return {
        ok: false,
        response: securityFailure(input.operation, "TOKEN_BUDGET_EXCEEDED"),
      };
    }

    const nowMs = input.nowMs ?? Date.now();
    const recentDecision = await this.usageStore.consumeRecentOperation({
      bucket: "paid-attempt",
      policy: LIVE_ATTEMPT_LIMITS,
      subject: session.subject,
      // Final narratives are candidate-bound, so changing an attempt UUID
      // cannot buy the same narrative twice. Other paid stages stay bound to
      // their user-visible forge attempt.
      attemptId:
        input.operation === "finalize" ? "finalize-candidates" : attemptId,
      operationKey: operationAttemptKey(input.operation, parsedBody.value),
      nowMs,
    });
    if (!recentDecision.allowed) {
      const diagnostic = forgeDiagnostic({
        stage,
        kind: "quota",
        code: "DUPLICATE_LIVE_REQUEST",
        message: "This paid input was already started and was not run again.",
        modelCall: "not_started",
      });
      const response = apiError(
        diagnostic.code,
        diagnostic.message,
        409,
        [],
        diagnostic,
      );
      response.headers.set(
        "Retry-After",
        String(Math.ceil(recentDecision.retryAfterMs / 1_000)),
      );
      return { ok: false, response };
    }
    const paidReservation: RecentOperationReservation =
      recentDecision.reservation;

    const operationDecision = await this.usageStore.consumeQuota({
      bucket: `operation:${policy.quotaGroup}`,
      policy: {
        windowMs: LIVE_SESSION_LIMITS.windowMs,
        maximumRequests: policy.maximumRequestsPerHour,
        maximumTokens: 1,
      },
      subject: session.subject,
      tokenCost: 0,
      nowMs,
    });
    if (!operationDecision.allowed) {
      await paidReservation.rollback();
      return {
        ok: false,
        response: securityFailure(
          input.operation,
          "REQUEST_QUOTA_EXCEEDED",
          operationDecision.retryAfterMs / 1_000,
        ),
      };
    }

    const combinedDecision = await this.usageStore.consumeQuota({
      bucket: "combined",
      policy: {
        windowMs: LIVE_SESSION_LIMITS.windowMs,
        maximumRequests: LIVE_SESSION_LIMITS.maximumRequests,
        maximumTokens: LIVE_SESSION_LIMITS.maximumReservedTokens,
      },
      subject: session.subject,
      tokenCost: reservedTokens,
      nowMs,
    });
    if (!combinedDecision.allowed) {
      await paidReservation.rollback();
      return {
        ok: false,
        response: securityFailure(
          input.operation,
          combinedDecision.reason === "token_quota"
            ? "TOKEN_BUDGET_EXCEEDED"
            : "REQUEST_QUOTA_EXCEEDED",
          combinedDecision.retryAfterMs / 1_000,
        ),
      };
    }

    const deploymentDecision = await this.usageStore.consumeQuota({
      bucket: "deployment",
      policy: {
        windowMs: LIVE_DEPLOYMENT_LIMITS.windowMs,
        maximumRequests: LIVE_DEPLOYMENT_LIMITS.maximumRequests,
        maximumTokens: LIVE_DEPLOYMENT_LIMITS.maximumReservedTokens,
      },
      subject: DEPLOYMENT_USAGE_SUBJECT,
      tokenCost: reservedTokens,
      nowMs,
    });
    if (!deploymentDecision.allowed) {
      await paidReservation.rollback();
      return {
        ok: false,
        response: securityFailure(
          input.operation,
          deploymentDecision.reason === "token_quota"
            ? "TOKEN_BUDGET_EXCEEDED"
            : "REQUEST_QUOTA_EXCEEDED",
          deploymentDecision.retryAfterMs / 1_000,
        ),
      };
    }

    const concurrencyDecision = await this.usageStore.tryAcquireConcurrency({
      bucket: "live-model",
      policy: {
        maximumGlobal: LIVE_SESSION_LIMITS.maximumConcurrentGlobal,
        maximumPerSession: LIVE_SESSION_LIMITS.maximumConcurrentPerSession,
      },
      // Concurrency follows the random session subject; spending quotas and
      // paid-operation deduplication follow the stable quota subject.
      subject: session.subject,
    });
    if (!concurrencyDecision.allowed) {
      await paidReservation.rollback();
      return {
        ok: false,
        response: securityFailure(
          input.operation,
          "TOO_MANY_ACTIVE_REQUESTS",
          1,
        ),
      };
    }
    return {
      ok: true,
      context: {
        body: parsedBody.value,
        operation: input.operation,
        reservedInputTokens: input.reservedInputTokens,
        reservedOutputTokens: input.reservedOutputTokens,
        reservedTokens,
        safetyIdentifier: safetyIdentifierFromSubject(session.subject),
        attemptId,
        session,
        lease: concurrencyDecision.lease,
      },
    };
  }

  async run(
    input: LiveRouteAuthorizationInput,
    handler: AuthorizedLiveRouteHandler,
  ): Promise<NextResponse> {
    const authorization = await this.authorize(input);
    if (!authorization.ok) return authorization.response;
    try {
      return await handler(authorization.context);
    } finally {
      await authorization.context.lease.release();
    }
  }
}

export const liveRouteAuthorizer = new LiveRouteAuthorizer({
  usageStore: processUsageControlStore,
});

export const runAuthorizedLiveRoute = (
  input: LiveRouteAuthorizationInput,
  handler: AuthorizedLiveRouteHandler,
): Promise<NextResponse> => liveRouteAuthorizer.run(input, handler);
