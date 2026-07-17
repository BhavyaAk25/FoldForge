import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAccessToken,
  readAccessSession,
  type AccessSessionSubject,
} from "@/server/access";
import { auditSubjectId, type AuditEvent } from "@/server/audit";
import { readBuildSha } from "@/server/build-info";
import {
  assertLiveEvaluationModelEnabled,
  assertLiveModelEnabled,
  liveEvaluationModelState,
  liveModelState,
} from "@/server/live-model";
import {
  BestEffortConcurrencyGate,
  BestEffortSessionQuota,
} from "@/server/usage-control";

const SECRET = "0123456789abcdef0123456789abcdef";

const sessionSubject = (): AccessSessionSubject => {
  vi.stubEnv("ACCESS_COOKIE_SECRET", SECRET);
  const session = readAccessSession(createAccessToken());
  if (!session) throw new Error("Expected a valid test access session.");
  return session.subject;
};

afterEach(() => vi.unstubAllEnvs());

describe("best-effort per-session quotas", () => {
  it("atomically accounts for request and reserved-token budgets", () => {
    const subject = sessionSubject();
    const quota = new BestEffortSessionQuota({
      windowMs: 1_000,
      maximumRequests: 2,
      maximumTokens: 10,
    });
    expect(quota.consume(subject, 4, 100)).toMatchObject({
      allowed: true,
      remainingRequests: 1,
      remainingTokens: 6,
    });
    expect(quota.consume(subject, 6, 200)).toMatchObject({
      allowed: true,
      remainingRequests: 0,
      remainingTokens: 0,
    });
    expect(quota.consume(subject, 0, 300)).toMatchObject({
      allowed: false,
      reason: "request_quota",
    });
  });

  it("denies token overages, fails closed at capacity, and resets", () => {
    const first = sessionSubject();
    const second = sessionSubject();
    const quota = new BestEffortSessionQuota({
      windowMs: 100,
      maximumRequests: 10,
      maximumTokens: 5,
      maximumSessions: 1,
    });
    expect(quota.consume(first, 6, 0)).toMatchObject({
      allowed: false,
      reason: "token_quota",
    });
    expect(quota.consume(first, 5, 0)).toMatchObject({ allowed: true });
    expect(quota.consume(second, 1, 1)).toMatchObject({
      allowed: false,
      reason: "capacity",
    });
    expect(quota.consume(second, 1, 100)).toMatchObject({ allowed: true });
  });
});

describe("best-effort concurrency", () => {
  it("bounds both per-session and global work with idempotent release", () => {
    const first = sessionSubject();
    const second = sessionSubject();
    const third = sessionSubject();
    const gate = new BestEffortConcurrencyGate({
      maximumGlobal: 2,
      maximumPerSession: 1,
    });
    const firstLease = gate.tryAcquire(first);
    expect(firstLease.allowed).toBe(true);
    expect(gate.tryAcquire(first)).toEqual({
      allowed: false,
      reason: "session_concurrency",
    });
    const secondLease = gate.tryAcquire(second);
    expect(secondLease.allowed).toBe(true);
    expect(gate.tryAcquire(third)).toEqual({
      allowed: false,
      reason: "global_concurrency",
    });
    if (!firstLease.allowed || !secondLease.allowed) return;
    firstLease.lease.release();
    firstLease.lease.release();
    expect(gate.tryAcquire(third).allowed).toBe(true);
    secondLease.lease.release();
  });
});

describe("metadata-only security helpers", () => {
  it("creates a stable audit subject without exposing the access subject", () => {
    const subject = sessionSubject();
    const identifier = auditSubjectId(subject);
    expect(identifier).toMatch(/^ffa_[0-9a-f]{24}$/);
    expect(identifier).not.toContain(subject.value);
    expect(identifier).toBe(auditSubjectId(subject));

    const event: AuditEvent = {
      version: 1,
      occurredAtMs: 1,
      requestId: "request-1",
      route: "/api/compile",
      subjectId: identifier,
      kind: "model",
      outcome: "succeeded",
      model: "gpt-5.6-sol",
      durationMs: 20,
      inputTokens: 10,
      outputTokens: 5,
    };
    expect(JSON.stringify(event)).not.toContain(subject.value);
  });

  it("fails closed for disabled, killed, missing, or incomplete live config", () => {
    const configured = {
      ENABLE_LIVE_OPENAI: "true",
      OPENAI_API_KEY: "configured",
      DEMO_ACCESS_CODE: "judge-only-2026",
      ACCESS_COOKIE_SECRET: SECRET,
    };
    expect(liveModelState({})).toEqual({
      enabled: false,
      reason: "disabled",
    });
    expect(
      liveModelState({ ...configured, LIVE_MODEL_KILL_SWITCH: "true" }),
    ).toEqual({ enabled: false, reason: "kill_switch" });
    expect(
      liveModelState({ ...configured, LIVE_MODEL_KILL_SWITCH: "invalid" }),
    ).toEqual({ enabled: false, reason: "kill_switch" });
    expect(
      liveModelState({ ...configured, OPENAI_API_KEY: undefined }),
    ).toEqual({ enabled: false, reason: "missing_api_key" });
    expect(
      liveModelState({ ...configured, DEMO_ACCESS_CODE: "short" }),
    ).toEqual({ enabled: false, reason: "access_configuration" });
    expect(liveModelState(configured)).toEqual({ enabled: true });
    expect(() => assertLiveModelEnabled(configured)).not.toThrow();
    expect(() =>
      assertLiveModelEnabled({
        ...configured,
        LIVE_MODEL_KILL_SWITCH: "true",
      }),
    ).toThrow("kill_switch");
  });

  it("separates paid evaluation from public access configuration", () => {
    const evaluation = {
      ENABLE_LIVE_OPENAI: "true",
      ENABLE_LIVE_OPENAI_EVALS: "true",
      LIVE_MODEL_KILL_SWITCH: "false",
      OPENAI_API_KEY: "configured",
    };

    expect(liveModelState(evaluation)).toEqual({
      enabled: false,
      reason: "access_configuration",
    });
    expect(liveEvaluationModelState(evaluation)).toEqual({ enabled: true });
    expect(() => assertLiveEvaluationModelEnabled(evaluation)).not.toThrow();
    expect(
      liveEvaluationModelState({
        ...evaluation,
        ENABLE_LIVE_OPENAI_EVALS: "false",
      }),
    ).toEqual({ enabled: false, reason: "evaluation_disabled" });
  });

  it("reads only validated build SHA values in deployment priority order", () => {
    expect(
      readBuildSha({
        VERCEL_GIT_COMMIT_SHA: "ABCDEF1234567",
        GITHUB_SHA: "1111111111111",
      }),
    ).toBe("abcdef1234567");
    expect(readBuildSha({ GITHUB_SHA: "abcdef1234567" })).toBe("abcdef1234567");
    expect(readBuildSha({ VERCEL_GIT_COMMIT_SHA: "not-a-sha-or-secret" })).toBe(
      null,
    );
  });
});
