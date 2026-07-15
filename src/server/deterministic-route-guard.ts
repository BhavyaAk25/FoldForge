import { NextResponse } from "next/server";

import { DETERMINISTIC_ROUTE_LIMITS } from "./api/security-policy";
import { enforceRateLimit, requestSubjectHash } from "./rate-limit";

const activeBySubject = new Map<string, number>();
let activeGlobal = 0;

const noStore = (response: NextResponse): NextResponse => {
  response.headers.set("Cache-Control", "no-store");
  return response;
};

const concurrencyResponse = (): NextResponse =>
  noStore(
    NextResponse.json(
      {
        error: {
          code: "TOO_MANY_ACTIVE_REQUESTS",
          message:
            "Too many verification requests are active. Try again shortly.",
          details: [],
        },
      },
      { status: 429, headers: { "Retry-After": "1" } },
    ),
  );

/** Best-effort process-local protection for CPU-bound deterministic routes. */
export const runBoundedDeterministicRequest = async (
  request: Request,
  scope: string,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> => {
  const limited = enforceRateLimit(
    request,
    `deterministic:${scope}`,
    DETERMINISTIC_ROUTE_LIMITS.maximumRequestsPerWindow,
    DETERMINISTIC_ROUTE_LIMITS.windowMs,
  );
  if (limited) return noStore(limited);

  const subject = requestSubjectHash(request);
  const activeForSubject = activeBySubject.get(subject) ?? 0;
  if (
    activeGlobal >= DETERMINISTIC_ROUTE_LIMITS.maximumConcurrentGlobal ||
    activeForSubject >= DETERMINISTIC_ROUTE_LIMITS.maximumConcurrentPerSubject
  ) {
    return concurrencyResponse();
  }

  activeGlobal += 1;
  activeBySubject.set(subject, activeForSubject + 1);
  try {
    return await handler();
  } finally {
    activeGlobal = Math.max(0, activeGlobal - 1);
    const active = activeBySubject.get(subject) ?? 0;
    if (active <= 1) activeBySubject.delete(subject);
    else activeBySubject.set(subject, active - 1);
  }
};
