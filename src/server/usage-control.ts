import type { AccessSessionSubject } from "@/server/access";

const DEFAULT_MAXIMUM_SESSIONS = 2_000;

export interface SessionQuotaPolicy {
  readonly windowMs: number;
  readonly maximumRequests: number;
  readonly maximumTokens: number;
  readonly maximumSessions?: number;
}

interface QuotaWindow {
  requests: number;
  tokens: number;
  readonly resetsAtMs: number;
}

export type SessionQuotaDenialReason =
  "capacity" | "request_quota" | "token_quota";

export type SessionQuotaDecision =
  | {
      readonly allowed: true;
      readonly remainingRequests: number;
      readonly remainingTokens: number;
      readonly resetsAtMs: number;
    }
  | {
      readonly allowed: false;
      readonly reason: SessionQuotaDenialReason;
      readonly retryAfterMs: number;
      readonly resetsAtMs: number;
    };

const positiveInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer.`);
  }
  return value;
};

const nonNegativeInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
  return value;
};

export class BestEffortSessionQuota {
  private readonly maximumRequests: number;
  private readonly maximumSessions: number;
  private readonly maximumTokens: number;
  private readonly windowMs: number;
  private readonly windows = new Map<string, QuotaWindow>();

  constructor(policy: SessionQuotaPolicy) {
    this.windowMs = positiveInteger(policy.windowMs, "Quota window");
    this.maximumRequests = positiveInteger(
      policy.maximumRequests,
      "Maximum requests",
    );
    this.maximumTokens = positiveInteger(
      policy.maximumTokens,
      "Maximum tokens",
    );
    this.maximumSessions = positiveInteger(
      policy.maximumSessions ?? DEFAULT_MAXIMUM_SESSIONS,
      "Maximum sessions",
    );
  }

  consume(
    subject: AccessSessionSubject,
    tokenCost: number,
    nowMs = Date.now(),
  ): SessionQuotaDecision {
    const chargedTokens = nonNegativeInteger(tokenCost, "Token cost");
    const now = nonNegativeInteger(nowMs, "Quota time");
    this.pruneExpired(now);

    const current = this.windows.get(subject.value);
    if (!current && this.windows.size >= this.maximumSessions) {
      const resetsAtMs = this.earliestReset(now);
      return {
        allowed: false,
        reason: "capacity",
        retryAfterMs: Math.max(1, resetsAtMs - now),
        resetsAtMs,
      };
    }

    const window = current ?? {
      requests: 0,
      tokens: 0,
      resetsAtMs: now + this.windowMs,
    };
    if (window.requests + 1 > this.maximumRequests) {
      return {
        allowed: false,
        reason: "request_quota",
        retryAfterMs: Math.max(1, window.resetsAtMs - now),
        resetsAtMs: window.resetsAtMs,
      };
    }
    if (window.tokens + chargedTokens > this.maximumTokens) {
      return {
        allowed: false,
        reason: "token_quota",
        retryAfterMs: Math.max(1, window.resetsAtMs - now),
        resetsAtMs: window.resetsAtMs,
      };
    }

    window.requests += 1;
    window.tokens += chargedTokens;
    this.windows.set(subject.value, window);
    return {
      allowed: true,
      remainingRequests: this.maximumRequests - window.requests,
      remainingTokens: this.maximumTokens - window.tokens,
      resetsAtMs: window.resetsAtMs,
    };
  }

  private pruneExpired(nowMs: number): void {
    for (const [subject, window] of this.windows) {
      if (window.resetsAtMs <= nowMs) this.windows.delete(subject);
    }
  }

  private earliestReset(nowMs: number): number {
    let earliest = nowMs + this.windowMs;
    for (const window of this.windows.values()) {
      earliest = Math.min(earliest, window.resetsAtMs);
    }
    return earliest;
  }
}

export interface ConcurrencyPolicy {
  readonly maximumGlobal: number;
  readonly maximumPerSession: number;
}

export interface ConcurrencyLease {
  release(): void;
}

export type ConcurrencyDecision =
  | { readonly allowed: true; readonly lease: ConcurrencyLease }
  | {
      readonly allowed: false;
      readonly reason: "global_concurrency" | "session_concurrency";
    };

export class BestEffortConcurrencyGate {
  private activeGlobal = 0;
  private readonly activeSessions = new Map<string, number>();
  private readonly maximumGlobal: number;
  private readonly maximumPerSession: number;

  constructor(policy: ConcurrencyPolicy) {
    this.maximumGlobal = positiveInteger(
      policy.maximumGlobal,
      "Maximum global concurrency",
    );
    this.maximumPerSession = positiveInteger(
      policy.maximumPerSession,
      "Maximum session concurrency",
    );
    if (this.maximumPerSession > this.maximumGlobal) {
      throw new RangeError(
        "Maximum session concurrency cannot exceed the global limit.",
      );
    }
  }

  tryAcquire(subject: AccessSessionSubject): ConcurrencyDecision {
    if (this.activeGlobal >= this.maximumGlobal) {
      return { allowed: false, reason: "global_concurrency" };
    }
    const activeForSession = this.activeSessions.get(subject.value) ?? 0;
    if (activeForSession >= this.maximumPerSession) {
      return { allowed: false, reason: "session_concurrency" };
    }

    this.activeGlobal += 1;
    this.activeSessions.set(subject.value, activeForSession + 1);
    let released = false;
    return {
      allowed: true,
      lease: {
        release: () => {
          if (released) return;
          released = true;
          this.activeGlobal = Math.max(0, this.activeGlobal - 1);
          const active = this.activeSessions.get(subject.value) ?? 0;
          if (active <= 1) this.activeSessions.delete(subject.value);
          else this.activeSessions.set(subject.value, active - 1);
        },
      },
    };
  }
}
