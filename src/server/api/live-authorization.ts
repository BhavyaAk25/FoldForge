import type { NextRequest, NextResponse } from "next/server";

import {
  readAccessSessionFromRequest,
  type AccessSession,
} from "@/server/access";
import { safetyIdentifierFromSubject } from "@/server/ai/safety";
import { isLiveModelEnabled } from "@/server/live-model";
import { guardMutationRequest } from "@/server/request-guard";
import {
  BestEffortConcurrencyGate,
  BestEffortSessionQuota,
  type ConcurrencyLease,
} from "@/server/usage-control";

import { parseRouteJsonBody } from "./response";
import {
  LIVE_OPERATION_POLICIES,
  LIVE_SESSION_LIMITS,
  type LiveOperation,
  type LiveOperationQuotaGroup,
} from "./security-policy";
import {
  safeSecurityError,
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

const operationQuota = (maximumRequests: number): BestEffortSessionQuota =>
  new BestEffortSessionQuota({
    windowMs: LIVE_SESSION_LIMITS.windowMs,
    maximumRequests,
    maximumTokens: 1,
  });

const validTokenReservation = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;

export class LiveRouteAuthorizer {
  private readonly concurrency = new BestEffortConcurrencyGate({
    maximumGlobal: LIVE_SESSION_LIMITS.maximumConcurrentGlobal,
    maximumPerSession: LIVE_SESSION_LIMITS.maximumConcurrentPerSession,
  });

  private readonly combinedQuota = new BestEffortSessionQuota({
    windowMs: LIVE_SESSION_LIMITS.windowMs,
    maximumRequests: LIVE_SESSION_LIMITS.maximumRequests,
    maximumTokens: LIVE_SESSION_LIMITS.maximumReservedTokens,
  });

  private readonly operationQuotas: Readonly<
    Record<LiveOperationQuotaGroup, BestEffortSessionQuota>
  > = {
    generation: operationQuota(
      LIVE_OPERATION_POLICIES.compile.maximumRequestsPerHour,
    ),
    repair: operationQuota(
      LIVE_OPERATION_POLICIES.repair.maximumRequestsPerHour,
    ),
    finalize: operationQuota(
      LIVE_OPERATION_POLICIES.finalize.maximumRequestsPerHour,
    ),
  };

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
        response: safeSecurityError("REQUEST_ORIGIN_DENIED"),
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
            ? safeSecurityError("PAYLOAD_TOO_LARGE")
            : parsedBody.response,
      };
    }

    const session = readAccessSessionFromRequest(input.request);
    if (!session) {
      return {
        ok: false,
        response: safeSecurityError("ACCESS_REQUIRED"),
      };
    }
    if (!isLiveModelEnabled()) {
      return {
        ok: false,
        response: safeSecurityError("LIVE_MODEL_UNAVAILABLE"),
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
        response: safeSecurityError("TOKEN_BUDGET_EXCEEDED"),
      };
    }

    const nowMs = input.nowMs ?? Date.now();
    const operationDecision = this.operationQuotas[policy.quotaGroup].consume(
      session.subject,
      0,
      nowMs,
    );
    if (!operationDecision.allowed) {
      return {
        ok: false,
        response: safeSecurityError(
          "REQUEST_QUOTA_EXCEEDED",
          operationDecision.retryAfterMs / 1_000,
        ),
      };
    }

    const combinedDecision = this.combinedQuota.consume(
      session.subject,
      reservedTokens,
      nowMs,
    );
    if (!combinedDecision.allowed) {
      return {
        ok: false,
        response: safeSecurityError(
          combinedDecision.reason === "token_quota"
            ? "TOKEN_BUDGET_EXCEEDED"
            : "REQUEST_QUOTA_EXCEEDED",
          combinedDecision.retryAfterMs / 1_000,
        ),
      };
    }

    const concurrencyDecision = this.concurrency.tryAcquire(session.subject);
    if (!concurrencyDecision.allowed) {
      return {
        ok: false,
        response: safeSecurityError("TOO_MANY_ACTIVE_REQUESTS", 1),
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
      authorization.context.lease.release();
    }
  }
}

export const liveRouteAuthorizer = new LiveRouteAuthorizer();

export const runAuthorizedLiveRoute = (
  input: LiveRouteAuthorizationInput,
  handler: AuthorizedLiveRouteHandler,
): Promise<NextResponse> => liveRouteAuthorizer.run(input, handler);
