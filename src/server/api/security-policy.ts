export const API_BODY_LIMIT_BYTES = {
  intent: 32 * 1024,
  programs: 32 * 1024,
  compile: 32 * 1024,
  repair: 64 * 1024,
  finalize: 64 * 1024,
  exports: 256 * 1024,
} as const;

/** Per-client budget for routes that may call the AI provider. */
export const MODEL_ROUTE_LIMITS = {
  windowMs: 10 * 60 * 1_000,
  maximumRequestsPerWindow: 30,
} as const;

/** Best-effort protection for CPU-bound deterministic compile/export routes. */
export const DETERMINISTIC_ROUTE_LIMITS = {
  windowMs: 10 * 60 * 1_000,
  maximumRequestsPerWindow: 30,
  maximumConcurrentGlobal: 4,
  maximumConcurrentPerSubject: 1,
} as const;
