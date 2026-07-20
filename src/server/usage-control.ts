const DEFAULT_MAXIMUM_SESSIONS = 2_000;

export interface UsageControlSubject {
  readonly value: string;
}

export interface RecentOperationPolicy {
  readonly windowMs: number;
  readonly maximumEntries?: number;
}

interface RecentOperationEntry {
  readonly operationKeys: Set<string>;
  readonly resetsAtMs: number;
}

export type RecentOperationDecision =
  | {
      readonly allowed: true;
      readonly reservation: RecentOperationReservation;
    }
  | {
      readonly allowed: false;
      readonly reason: "capacity" | "duplicate";
      readonly retryAfterMs: number;
    };

export interface RecentOperationReservation {
  rollback(): void | Promise<void>;
}

/**
 * A best-effort server-instance guard against replaying a paid operation in the
 * same user-visible forge attempt. Durable account limits remain the outer cap.
 */
export class BestEffortRecentOperationGuard {
  private readonly entries = new Map<string, RecentOperationEntry>();
  private readonly maximumEntries: number;
  private readonly windowMs: number;

  constructor(policy: RecentOperationPolicy) {
    this.windowMs = positiveInteger(policy.windowMs, "Operation window");
    this.maximumEntries = positiveInteger(
      policy.maximumEntries ?? DEFAULT_MAXIMUM_SESSIONS,
      "Maximum operation entries",
    );
  }

  consume(
    subject: UsageControlSubject,
    attemptId: string,
    operationKey: string,
    nowMs = Date.now(),
  ): RecentOperationDecision {
    const now = nonNegativeInteger(nowMs, "Operation time");
    this.pruneExpired(now);
    const entryKey = `${subject.value}:${attemptId}`;
    const current = this.entries.get(entryKey);
    if (current?.operationKeys.has(operationKey)) {
      return {
        allowed: false,
        reason: "duplicate",
        retryAfterMs: Math.max(1, current.resetsAtMs - now),
      };
    }
    if (!current && this.entries.size >= this.maximumEntries) {
      return {
        allowed: false,
        reason: "capacity",
        retryAfterMs: this.windowMs,
      };
    }
    const entry = current ?? {
      operationKeys: new Set<string>(),
      resetsAtMs: now + this.windowMs,
    };
    entry.operationKeys.add(operationKey);
    this.entries.set(entryKey, entry);
    let active = true;
    return {
      allowed: true,
      reservation: {
        rollback: () => {
          if (!active) return;
          active = false;
          const reservedEntry = this.entries.get(entryKey);
          reservedEntry?.operationKeys.delete(operationKey);
          if (reservedEntry?.operationKeys.size === 0) {
            this.entries.delete(entryKey);
          }
        },
      },
    };
  }

  private pruneExpired(nowMs: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.resetsAtMs <= nowMs) this.entries.delete(key);
    }
  }
}

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
    subject: UsageControlSubject,
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
  release(): void | Promise<void>;
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

  tryAcquire(subject: UsageControlSubject): ConcurrencyDecision {
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

export interface QuotaStoreInput {
  readonly bucket: string;
  readonly policy: SessionQuotaPolicy;
  readonly subject: UsageControlSubject;
  readonly tokenCost: number;
  readonly nowMs: number;
}

export interface RecentOperationStoreInput {
  readonly bucket: string;
  readonly policy: RecentOperationPolicy;
  readonly subject: UsageControlSubject;
  readonly attemptId: string;
  readonly operationKey: string;
  readonly nowMs: number;
}

export interface ConcurrencyStoreInput {
  readonly bucket: string;
  readonly policy: ConcurrencyPolicy;
  readonly subject: UsageControlSubject;
}

/**
 * Atomic usage-control boundary for the live routes. A deployment can inject a
 * durable implementation without changing authorization logic. Implementations
 * must make each method atomic for its bucket and subject.
 */
export interface LiveUsageControlStore {
  consumeQuota(input: QuotaStoreInput): Promise<SessionQuotaDecision>;
  consumeRecentOperation(
    input: RecentOperationStoreInput,
  ): Promise<RecentOperationDecision>;
  tryAcquireConcurrency(
    input: ConcurrencyStoreInput,
  ): Promise<ConcurrencyDecision>;
}

const policyKey = (values: readonly number[]): string => values.join(":");

/**
 * Best-effort process-local implementation. It limits one warm server process,
 * not an entire horizontally scaled deployment and therefore is not a hard
 * account-level or dollar spending cap.
 */
export class BestEffortProcessUsageControlStore implements LiveUsageControlStore {
  private readonly concurrencyBuckets = new Map<
    string,
    BestEffortConcurrencyGate
  >();
  private readonly quotaBuckets = new Map<string, BestEffortSessionQuota>();
  private readonly recentOperationBuckets = new Map<
    string,
    BestEffortRecentOperationGuard
  >();

  async consumeQuota(input: QuotaStoreInput): Promise<SessionQuotaDecision> {
    const key = `${input.bucket}:${policyKey([
      input.policy.windowMs,
      input.policy.maximumRequests,
      input.policy.maximumTokens,
      input.policy.maximumSessions ?? DEFAULT_MAXIMUM_SESSIONS,
    ])}`;
    let quota = this.quotaBuckets.get(key);
    if (!quota) {
      quota = new BestEffortSessionQuota(input.policy);
      this.quotaBuckets.set(key, quota);
    }
    return quota.consume(input.subject, input.tokenCost, input.nowMs);
  }

  async consumeRecentOperation(
    input: RecentOperationStoreInput,
  ): Promise<RecentOperationDecision> {
    const key = `${input.bucket}:${policyKey([
      input.policy.windowMs,
      input.policy.maximumEntries ?? DEFAULT_MAXIMUM_SESSIONS,
    ])}`;
    let guard = this.recentOperationBuckets.get(key);
    if (!guard) {
      guard = new BestEffortRecentOperationGuard(input.policy);
      this.recentOperationBuckets.set(key, guard);
    }
    return guard.consume(
      input.subject,
      input.attemptId,
      input.operationKey,
      input.nowMs,
    );
  }

  async tryAcquireConcurrency(
    input: ConcurrencyStoreInput,
  ): Promise<ConcurrencyDecision> {
    const key = `${input.bucket}:${policyKey([
      input.policy.maximumGlobal,
      input.policy.maximumPerSession,
    ])}`;
    let gate = this.concurrencyBuckets.get(key);
    if (!gate) {
      gate = new BestEffortConcurrencyGate(input.policy);
      this.concurrencyBuckets.set(key, gate);
    }
    return gate.tryAcquire(input.subject);
  }
}

/** Shared only by the production route singleton; tests can inject a backend. */
export const processUsageControlStore =
  new BestEffortProcessUsageControlStore();
