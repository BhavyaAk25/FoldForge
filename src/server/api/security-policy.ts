export const API_BODY_LIMIT_BYTES = {
  access: 1 * 1024,
  intent: 32 * 1024,
  programs: 32 * 1024,
  compile: 32 * 1024,
  repair: 64 * 1024,
  finalize: 64 * 1024,
  exports: 256 * 1024,
} as const;

export type LiveOperation =
  "intent" | "programs" | "compile" | "repair" | "finalize";

export type LiveOperationQuotaGroup = "generation" | "repair" | "finalize";

interface LiveOperationPolicy {
  readonly bodyLimitBytes: number;
  readonly maximumOutputTokens: number;
  readonly maximumRequestsPerHour: number;
  readonly quotaGroup: LiveOperationQuotaGroup;
}

export const LIVE_OPERATION_POLICIES: Readonly<
  Record<LiveOperation, LiveOperationPolicy>
> = {
  intent: {
    bodyLimitBytes: API_BODY_LIMIT_BYTES.intent,
    maximumOutputTokens: 3_000,
    maximumRequestsPerHour: 20,
    quotaGroup: "generation",
  },
  programs: {
    bodyLimitBytes: API_BODY_LIMIT_BYTES.programs,
    maximumOutputTokens: 8_000,
    maximumRequestsPerHour: 20,
    quotaGroup: "generation",
  },
  compile: {
    bodyLimitBytes: API_BODY_LIMIT_BYTES.compile,
    maximumOutputTokens: 3_000,
    maximumRequestsPerHour: 20,
    quotaGroup: "generation",
  },
  repair: {
    bodyLimitBytes: API_BODY_LIMIT_BYTES.repair,
    maximumOutputTokens: 2_500,
    maximumRequestsPerHour: 5,
    quotaGroup: "repair",
  },
  finalize: {
    bodyLimitBytes: API_BODY_LIMIT_BYTES.finalize,
    maximumOutputTokens: 2_000,
    maximumRequestsPerHour: 2,
    quotaGroup: "finalize",
  },
};

export const LIVE_SESSION_LIMITS = {
  windowMs: 60 * 60 * 1_000,
  maximumRequests: 10,
  // The public forge uses one intent, one program, at most five repairs, and
  // one final narrative. This ceiling admits that complete workflow while
  // bounding the cost and preventing parallel duplicate generations.
  maximumReservedTokens: 140_000,
  maximumConcurrentPerSession: 1,
  maximumConcurrentGlobal: 8,
} as const;

export const DETERMINISTIC_ROUTE_LIMITS = {
  windowMs: 10 * 60 * 1_000,
  maximumRequestsPerWindow: 30,
  maximumConcurrentGlobal: 4,
  maximumConcurrentPerSubject: 1,
} as const;
