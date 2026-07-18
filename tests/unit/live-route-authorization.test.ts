import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { accessCookieName, createAccessToken } from "@/server/access";
import {
  LiveRouteAuthorizer,
  type LiveRouteAuthorizationResult,
} from "@/server/api/live-authorization";
import {
  API_BODY_LIMIT_BYTES,
  LIVE_OPERATION_POLICIES,
  LIVE_SESSION_LIMITS,
  type LiveOperation,
} from "@/server/api/security-policy";

const ACCESS_SECRET = "0123456789abcdef0123456789abcdef";

const requestFor = (
  operation: LiveOperation,
  token: string | null,
  body: unknown = { value: "ok" },
  origin = "https://foldforge.example",
): NextRequest => {
  const headers = new Headers({
    "Content-Type": "application/json",
    Origin: origin,
  });
  if (token) {
    headers.set("Cookie", `${accessCookieName(false)}=${token}`);
  }
  return new NextRequest(`https://foldforge.example/api/${operation}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
};

const authorize = (
  authorizer: LiveRouteAuthorizer,
  token: string | null,
  operation: LiveOperation = "compile",
  reservedInputTokens = 1,
  reservedOutputTokens = 1,
  body: unknown = { value: "ok" },
  origin = "https://foldforge.example",
): Promise<LiveRouteAuthorizationResult> =>
  authorizer.authorize({
    request: requestFor(operation, token, body, origin),
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
    expect(LIVE_OPERATION_POLICIES.compile).toMatchObject({
      maximumOutputTokens: 3_000,
      maximumRequestsPerHour: 20,
    });
    expect(LIVE_OPERATION_POLICIES.programs).toMatchObject({
      maximumOutputTokens: 8_000,
      maximumRequestsPerHour: 20,
    });
    expect(LIVE_OPERATION_POLICIES.repair).toMatchObject({
      maximumOutputTokens: 2_500,
      maximumRequestsPerHour: 15,
    });
    expect(LIVE_OPERATION_POLICIES.finalize).toMatchObject({
      maximumOutputTokens: 2_000,
      maximumRequestsPerHour: 20,
    });
    expect(LIVE_SESSION_LIMITS).toEqual({
      windowMs: 60 * 60 * 1_000,
      maximumRequests: 30,
      maximumReservedTokens: 360_000,
      maximumConcurrentPerSession: 2,
      maximumConcurrentGlobal: 8,
    });
  });

  it("derives the safety identifier only from a verified signed session", async () => {
    const token = createAccessToken();
    const context = await expectAuthorized(
      authorize(new LiveRouteAuthorizer(), token, "compile", 20, 30, {
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
        "compile",
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
      authorize(authorizer, token, "compile", 1, 1, {
        value: "x".repeat(API_BODY_LIMIT_BYTES.compile),
      }),
      413,
      "PAYLOAD_TOO_LARGE",
    );
  });

  it("enforces each operation's output reservation cap", async () => {
    const authorizer = new LiveRouteAuthorizer();
    const token = createAccessToken();
    for (const [operation, maximum] of [
      ["programs", 8_000],
      ["compile", 3_000],
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
    for (let index = 0; index < 15; index += 1) {
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
    for (let index = 0; index < 20; index += 1) {
      const context = await expectAuthorized(
        authorize(combinedAuthorizer, combinedToken, "compile"),
      );
      context.lease.release();
    }
    for (let index = 0; index < 10; index += 1) {
      const context = await expectAuthorized(
        authorize(combinedAuthorizer, combinedToken, "finalize"),
      );
      context.lease.release();
    }
    await expectDenied(
      authorize(combinedAuthorizer, combinedToken, "finalize"),
      429,
      "REQUEST_QUOTA_EXCEEDED",
    );
  });

  it("enforces the combined reserved-token ceiling", async () => {
    const authorizer = new LiveRouteAuthorizer();
    const token = createAccessToken();
    const context = await expectAuthorized(
      authorize(authorizer, token, "compile", 357_000, 3_000),
    );
    context.lease.release();
    await expectDenied(
      authorize(authorizer, token, "compile", 1, 0),
      429,
      "TOKEN_BUDGET_EXCEEDED",
    );
  });

  it("admits one complete three-candidate repair workflow", async () => {
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
        ...Array.from({ length: 3 }, () =>
          reservation("programs", 8_192, 8_000),
        ),
        ...Array.from({ length: 15 }, () =>
          reservation("repair", 16_384, 2_500),
        ),
        reservation("finalize", 12_000, 2_000),
      ];

    for (const [operation, inputTokens, outputTokens] of reservations) {
      const context = await expectAuthorized(
        authorize(authorizer, token, operation, inputTokens, outputTokens),
      );
      context.lease.release();
    }
  });

  it("bounds active work to two per session and eight globally", async () => {
    const authorizer = new LiveRouteAuthorizer();
    const token = createAccessToken();
    const first = await expectAuthorized(authorize(authorizer, token));
    const second = await expectAuthorized(authorize(authorizer, token));
    await expectDenied(
      authorize(authorizer, token),
      429,
      "TOO_MANY_ACTIVE_REQUESTS",
    );
    first.lease.release();
    second.lease.release();

    const contexts = [];
    for (let index = 0; index < 8; index += 1) {
      contexts.push(
        await expectAuthorized(authorize(authorizer, createAccessToken())),
      );
    }
    await expectDenied(
      authorize(authorizer, createAccessToken()),
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
          request: requestFor("compile", token),
          operation: "compile",
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
    const second = await expectAuthorized(authorize(authorizer, token));
    first.lease.release();
    second.lease.release();
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
        request: requestFor("compile", token),
        operation: "compile",
        reservedInputTokens: 1,
        reservedOutputTokens: 1,
        nowMs: 1_000,
      },
      async () => NextResponse.json({ ok: true }),
    );
    expect(response.status).toBe(200);
  });
});
