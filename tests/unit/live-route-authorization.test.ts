import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { accessCookieName, createAccessToken } from "@/server/access";
import {
  LiveRouteAuthorizer,
  type LiveRouteAuthorizationResult,
} from "@/server/api/live-authorization";
import {
  API_BODY_LIMIT_BYTES,
  LIVE_DEPLOYMENT_LIMITS,
  LIVE_OPERATION_POLICIES,
  LIVE_SESSION_LIMITS,
  type LiveOperation,
} from "@/server/api/security-policy";
import { BestEffortProcessUsageControlStore } from "@/server/usage-control";

const ACCESS_SECRET = "0123456789abcdef0123456789abcdef";

const requestFor = (
  operation: LiveOperation,
  token: string | null,
  body: unknown = { value: "ok" },
  origin = "https://foldforge.example",
  attemptId = crypto.randomUUID(),
): NextRequest => {
  const headers = new Headers({
    "Content-Type": "application/json",
    Origin: origin,
  });
  if (token) {
    headers.set("Cookie", `${accessCookieName(false)}=${token}`);
  }
  headers.set("X-FoldForge-Attempt-Id", attemptId);
  return new NextRequest(`https://foldforge.example/api/${operation}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
};

const authorize = (
  authorizer: LiveRouteAuthorizer,
  token: string | null,
  operation: LiveOperation = "intent",
  reservedInputTokens = 1,
  reservedOutputTokens = 1,
  body: unknown = { value: "ok" },
  origin = "https://foldforge.example",
  attemptId = crypto.randomUUID(),
): Promise<LiveRouteAuthorizationResult> =>
  authorizer.authorize({
    request: requestFor(operation, token, body, origin, attemptId),
    operation,
    reservedInputTokens,
    reservedOutputTokens,
    nowMs: 1_000,
  });

const expectAuthorized = async (
  result: Promise<LiveRouteAuthorizationResult>,
) => {
  const authorization = await result;
  expect(authorization.ok).toBe(true);
  if (!authorization.ok) {
    throw new Error(
      `Expected authorization, received ${authorization.response.status}.`,
    );
  }
  return authorization.context;
};

const expectDenied = async (
  result: Promise<LiveRouteAuthorizationResult>,
  status: number,
  code: string,
) => {
  const authorization = await result;
  expect(authorization.ok).toBe(false);
  if (authorization.ok) {
    authorization.context.lease.release();
    throw new Error("Expected the live route request to be denied.");
  }
  expect(authorization.response.status).toBe(status);
  await expect(authorization.response.clone().json()).resolves.toMatchObject({
    error: { code, details: [] },
  });
  return authorization.response;
};

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("ENABLE_LIVE_OPENAI", "true");
  vi.stubEnv("LIVE_MODEL_KILL_SWITCH", "false");
  vi.stubEnv("OPENAI_API_KEY", "configured-test-key");
  vi.stubEnv("DEMO_ACCESS_CODE", "judge-only-2026");
  vi.stubEnv("ACCESS_COOKIE_SECRET", ACCESS_SECRET);
});

afterEach(() => vi.unstubAllEnvs());

describe("live route security policy", () => {
  it("pins exact body, request, token, output, and concurrency caps", () => {
    expect(API_BODY_LIMIT_BYTES).toEqual({
      access: 1_024,
      intent: 32 * 1_024,
      programs: 32 * 1_024,
      compile: 32 * 1_024,
      repair: 64 * 1_024,
      finalize: 64 * 1_024,
      exports: 256 * 1_024,
    });
    expect(LIVE_OPERATION_POLICIES.programs).toMatchObject({
      maximumOutputTokens: 4_000,
      maximumRequestsPerHour: 20,
    });
    expect(LIVE_OPERATION_POLICIES.repair).toMatchObject({
      maximumOutputTokens: 2_500,
      maximumRequestsPerHour: 5,
    });
    expect(LIVE_OPERATION_POLICIES.finalize).toMatchObject({
      maximumOutputTokens: 2_000,
      maximumRequestsPerHour: 2,
    });
    expect(LIVE_SESSION_LIMITS).toEqual({
      windowMs: 60 * 60 * 1_000,
      maximumRequests: 10,
      maximumReservedTokens: 140_000,
      maximumConcurrentPerSession: 1,
      maximumConcurrentGlobal: 8,
    });
    expect(LIVE_DEPLOYMENT_LIMITS).toEqual({
      windowMs: 60 * 60 * 1_000,
      maximumRequests: 40,
      maximumReservedTokens: 560_000,
    });
  });

  it("derives the safety identifier only from a verified signed session", async () => {
    const token = createAccessToken();
    const context = await expectAuthorized(
      authorize(new LiveRouteAuthorizer(), token, "intent", 20, 30, {
        prompt: "Fold a stand.",
      }),
    );
    expect(context.body).toEqual({ prompt: "Fold a stand." });
    expect(context.safetyIdentifier).toMatch(/^ff_[0-9a-f]{40}$/);
    expect(context.safetyIdentifier).not.toContain(
      context.session.subject.value,
    );
    expect(context.reservedTokens).toBe(50);
    context.lease.release();
  });

  it("returns typed safe origin, session, and body-size failures", async () => {
    const authorizer = new LiveRouteAuthorizer();
    const token = createAccessToken();
    const origin = await expectDenied(
      authorize(
        authorizer,
        token,
        "intent",
        1,
        1,
        { prompt: "ok" },
        "https://attacker.example",
      ),
      403,
      "REQUEST_ORIGIN_DENIED",
    );
    expect(origin.headers.get("cache-control")).toBe("no-store");

    await expectDenied(authorize(authorizer, null), 401, "ACCESS_REQUIRED");
    await expectDenied(
      authorize(authorizer, token, "intent", 1, 1, {
        value: "x".repeat(API_BODY_LIMIT_BYTES.intent),
      }),
      413,
      "PAYLOAD_TOO_LARGE",
    );
  });

  it("enforces each operation's output reservation cap", async () => {
    const authorizer = new LiveRouteAuthorizer();
    const token = createAccessToken();
    for (const [operation, maximum] of [
      ["programs", 4_000],
      ["repair", 2_500],
      ["finalize", 2_000],
    ] as const) {
      await expectDenied(
        authorize(authorizer, token, operation, 1, maximum + 1),
        429,
        "TOKEN_BUDGET_EXCEEDED",
      );
    }
  });

  it("enforces repair and combined hourly request ceilings", async () => {
    const repairAuthorizer = new LiveRouteAuthorizer();
    const repairToken = createAccessToken();
    for (let index = 0; index < 5; index += 1) {
      const context = await expectAuthorized(
        authorize(repairAuthorizer, repairToken, "repair"),
      );
      context.lease.release();
    }
    await expectDenied(
      authorize(repairAuthorizer, repairToken, "repair"),
      429,
      "REQUEST_QUOTA_EXCEEDED",
    );

    const combinedAuthorizer = new LiveRouteAuthorizer();
    const combinedToken = createAccessToken();
    for (let index = 0; index < 10; index += 1) {
      const context = await expectAuthorized(
        authorize(combinedAuthorizer, combinedToken, "intent"),
      );
      context.lease.release();
    }
    await expectDenied(
      authorize(combinedAuthorizer, combinedToken, "intent"),
      429,
      "REQUEST_QUOTA_EXCEEDED",
    );
  });

  it("enforces the combined reserved-token ceiling", async () => {
    const authorizer = new LiveRouteAuthorizer();
    const token = createAccessToken();
    const context = await expectAuthorized(
      authorize(authorizer, token, "programs", 136_000, 4_000),
    );
    context.lease.release();
    await expectDenied(
      authorize(authorizer, token, "programs", 1, 0),
      429,
      "TOKEN_BUDGET_EXCEEDED",
    );
  });

  it("rejects a duplicate paid step within one forge attempt", async () => {
    const authorizer = new LiveRouteAuthorizer();
    const token = createAccessToken();
    const attemptId = crypto.randomUUID();
    const first = await expectAuthorized(
      authorize(
        authorizer,
        token,
        "programs",
        1,
        1,
        { candidateOrdinal: 1 },
        "https://foldforge.example",
        attemptId,
      ),
    );
    first.lease.release();

    const duplicate = await expectDenied(
      authorize(
        authorizer,
        token,
        "programs",
        1,
        1,
        { candidateOrdinal: 1 },
        "https://foldforge.example",
        attemptId,
      ),
      409,
      "DUPLICATE_LIVE_REQUEST",
    );
    await expect(duplicate.clone().json()).resolves.toMatchObject({
      error: {
        diagnostic: {
          stage: "program",
          modelCall: "not_started",
          failureIds: [],
        },
      },
    });
  });

  it("keeps signed access-session quotas independent", async () => {
    const authorizer = new LiveRouteAuthorizer();
    const firstToken = createAccessToken();
    const secondToken = createAccessToken();
    for (let index = 0; index < 5; index += 1) {
      const context = await expectAuthorized(
        authorize(authorizer, firstToken, "repair"),
      );
      context.lease.release();
    }
    await expectDenied(
      authorize(authorizer, firstToken, "repair"),
      429,
      "REQUEST_QUOTA_EXCEEDED",
    );

    const secondContext = await expectAuthorized(
      authorize(authorizer, secondToken, "repair"),
    );
    secondContext.lease.release();
  });

  it("enforces a separate deployment-wide request ceiling", async () => {
    const authorizer = new LiveRouteAuthorizer();
    for (let sessionIndex = 0; sessionIndex < 4; sessionIndex += 1) {
      const token = createAccessToken();
      for (let requestIndex = 0; requestIndex < 10; requestIndex += 1) {
        const context = await expectAuthorized(
          authorize(authorizer, token, "intent"),
        );
        context.lease.release();
      }
    }
    await expectDenied(
      authorize(authorizer, createAccessToken(), "intent"),
      429,
      "REQUEST_QUOTA_EXCEEDED",
    );
  });

  it("preserves a paid-operation denial across injected authorizers", async () => {
    const usageStore = new BestEffortProcessUsageControlStore();
    const firstAuthorizer = new LiveRouteAuthorizer({ usageStore });
    const secondAuthorizer = new LiveRouteAuthorizer({ usageStore });
    const attemptId = crypto.randomUUID();
    const body = { candidateOrdinal: 1 };
    const token = createAccessToken();
    const first = await expectAuthorized(
      authorize(
        firstAuthorizer,
        token,
        "programs",
        1,
        1,
        body,
        "https://foldforge.example",
        attemptId,
      ),
    );
    first.lease.release();

    await expectDenied(
      authorize(
        secondAuthorizer,
        token,
        "programs",
        1,
        1,
        body,
        "https://foldforge.example",
        attemptId,
      ),
      409,
      "DUPLICATE_LIVE_REQUEST",
    );
  });

  it("deduplicates finalization by candidate hash without charging the duplicate", async () => {
    const authorizer = new LiveRouteAuthorizer();
    const token = createAccessToken();
    const attemptId = crypto.randomUUID();
    const first = await expectAuthorized(
      authorize(
        authorizer,
        token,
        "finalize",
        1,
        1,
        { candidate: { candidateId: "candidate-a" } },
        "https://foldforge.example",
        crypto.randomUUID(),
      ),
    );
    first.lease.release();

    await expectDenied(
      authorize(
        authorizer,
        token,
        "finalize",
        1,
        1,
        { candidate: { candidateId: "candidate-a" } },
        "https://foldforge.example",
        attemptId,
      ),
      409,
      "DUPLICATE_LIVE_REQUEST",
    );

    const distinctCandidate = await expectAuthorized(
      authorize(
        authorizer,
        token,
        "finalize",
        1,
        1,
        { candidate: { candidateId: "candidate-b" } },
        "https://foldforge.example",
        attemptId,
      ),
    );
    distinctCandidate.lease.release();
  });

  it("rejects the same repair program across different claimed cycles", async () => {
    const authorizer = new LiveRouteAuthorizer();
    const token = createAccessToken();
    const attemptId = crypto.randomUUID();
    const first = await expectAuthorized(
      authorize(
        authorizer,
        token,
        "repair",
        1,
        1,
        { repairCycle: 1, program: { programId: "same-program" } },
        "https://foldforge.example",
        attemptId,
      ),
    );
    first.lease.release();

    await expectDenied(
      authorize(
        authorizer,
        token,
        "repair",
        1,
        1,
        { repairCycle: 2, program: { programId: "same-program" } },
        "https://foldforge.example",
        attemptId,
      ),
      409,
      "DUPLICATE_LIVE_REQUEST",
    );
  });

  it("does not poison an attempt denied before paid work can start", async () => {
    const authorizer = new LiveRouteAuthorizer();
    const token = createAccessToken();
    const attemptId = crypto.randomUUID();

    await expectDenied(
      authorize(
        authorizer,
        token,
        "programs",
        1,
        LIVE_OPERATION_POLICIES.programs.maximumOutputTokens + 1,
        { candidateOrdinal: 1 },
        "https://foldforge.example",
        attemptId,
      ),
      429,
      "TOKEN_BUDGET_EXCEEDED",
    );
    const afterBudgetDenial = await expectAuthorized(
      authorize(
        authorizer,
        token,
        "programs",
        1,
        1,
        { candidateOrdinal: 1 },
        "https://foldforge.example",
        attemptId,
      ),
    );
    afterBudgetDenial.lease.release();

    const activeAttemptId = crypto.randomUUID();
    const active = await expectAuthorized(
      authorize(
        authorizer,
        token,
        "intent",
        1,
        1,
        { prompt: "first" },
        "https://foldforge.example",
        activeAttemptId,
      ),
    );
    const queuedAttemptId = crypto.randomUUID();
    await expectDenied(
      authorize(
        authorizer,
        token,
        "intent",
        1,
        1,
        { prompt: "second" },
        "https://foldforge.example",
        queuedAttemptId,
      ),
      429,
      "TOO_MANY_ACTIVE_REQUESTS",
    );
    active.lease.release();
    const afterConcurrencyDenial = await expectAuthorized(
      authorize(
        authorizer,
        token,
        "intent",
        1,
        1,
        { prompt: "second" },
        "https://foldforge.example",
        queuedAttemptId,
      ),
    );
    afterConcurrencyDenial.lease.release();
  });

  it("admits one complete single-design repair workflow", async () => {
    const authorizer = new LiveRouteAuthorizer();
    const token = createAccessToken();
    const reservation = (
      operation: LiveOperation,
      inputTokens: number,
      outputTokens: number,
    ): readonly [LiveOperation, number, number] => [
      operation,
      inputTokens,
      outputTokens,
    ];
    const reservations: readonly (readonly [LiveOperation, number, number])[] =
      [
        reservation("intent", 4_000, 3_000),
        reservation("programs", 8_192, 4_000),
        ...Array.from({ length: 5 }, () =>
          reservation("repair", 16_384, 2_500),
        ),
        reservation("finalize", 12_000, 2_000),
      ];

    const attemptId = crypto.randomUUID();
    let repairCycle = 0;
    for (const [operation, inputTokens, outputTokens] of reservations) {
      if (operation === "repair") repairCycle += 1;
      const context = await expectAuthorized(
        authorize(
          authorizer,
          token,
          operation,
          inputTokens,
          outputTokens,
          operation === "repair"
            ? { repairCycle, program: { programId: `program-${repairCycle}` } }
            : operation === "finalize"
              ? { candidate: { candidateId: "candidate-final" } }
              : { value: "ok" },
          "https://foldforge.example",
          attemptId,
        ),
      );
      context.lease.release();
    }
  });

  it("bounds active work to one per session and eight globally", async () => {
    const authorizer = new LiveRouteAuthorizer();
    const token = createAccessToken();
    const first = await expectAuthorized(authorize(authorizer, token));
    await expectDenied(
      authorize(authorizer, token),
      429,
      "TOO_MANY_ACTIVE_REQUESTS",
    );
    first.lease.release();

    const globalAuthorizer = new LiveRouteAuthorizer();
    const contexts = [];
    for (let index = 0; index < 8; index += 1) {
      contexts.push(
        await expectAuthorized(
          authorize(globalAuthorizer, createAccessToken()),
        ),
      );
    }
    await expectDenied(
      authorize(globalAuthorizer, createAccessToken()),
      429,
      "TOO_MANY_ACTIVE_REQUESTS",
    );
    for (const context of contexts) context.lease.release();
  });

  it("releases concurrency in finally when the authorized handler throws", async () => {
    const authorizer = new LiveRouteAuthorizer();
    const token = createAccessToken();
    await expect(
      authorizer.run(
        {
          request: requestFor("intent", token),
          operation: "intent",
          reservedInputTokens: 1,
          reservedOutputTokens: 1,
          nowMs: 1_000,
        },
        async () => {
          throw new Error("model call failed");
        },
      ),
    ).rejects.toThrow("model call failed");

    const first = await expectAuthorized(authorize(authorizer, token));
    first.lease.release();
  });

  it("fails closed without disclosing why live service is unavailable", async () => {
    const token = createAccessToken();
    vi.stubEnv("ENABLE_LIVE_OPENAI", "false");
    const response = await expectDenied(
      authorize(new LiveRouteAuthorizer(), token),
      503,
      "LIVE_MODEL_UNAVAILABLE",
    );
    const text = await response.clone().text();
    expect(text).not.toContain("configured-test-key");
    expect(text).not.toContain("ACCESS_COOKIE_SECRET");
  });

  it("supports a successful handler while releasing its lease", async () => {
    const authorizer = new LiveRouteAuthorizer();
    const token = createAccessToken();
    const response = await authorizer.run(
      {
        request: requestFor("intent", token),
        operation: "intent",
        reservedInputTokens: 1,
        reservedOutputTokens: 1,
        nowMs: 1_000,
      },
      async () => NextResponse.json({ ok: true }),
    );
    expect(response.status).toBe(200);
  });
});
