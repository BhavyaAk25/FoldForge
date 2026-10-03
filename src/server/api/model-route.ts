import type { NextResponse } from "next/server";

import { enforceRateLimit } from "@/server/rate-limit";
import { guardMutationRequest } from "@/server/request-guard";

import { apiError, parseRouteJsonBody } from "./response";
import { API_BODY_LIMIT_BYTES, MODEL_ROUTE_LIMITS } from "./security-policy";

export type ModelOperation = "intent" | "programs" | "repair" | "finalize";

const noStore = (response: NextResponse): NextResponse => {
  response.headers.set("Cache-Control", "no-store");
  return response;
};

/**
 * Shared guard for routes that may call the AI provider: same-origin only,
 * a per-client request budget (free provider tiers are rate limited, so this
 * mostly protects the shared key), and a route-specific body cap.
 */
export const runModelRoute = async (
  request: Request,
  operation: ModelOperation,
  handler: (body: unknown) => Promise<NextResponse>,
): Promise<NextResponse> => {
  if (!guardMutationRequest(request).ok) {
    return noStore(
      apiError(
        "REQUEST_ORIGIN_DENIED",
        "The request origin is not allowed.",
        403,
      ),
    );
  }
  const limited = enforceRateLimit(
    request,
    `model:${operation}`,
    MODEL_ROUTE_LIMITS.maximumRequestsPerWindow,
    MODEL_ROUTE_LIMITS.windowMs,
  );
  if (limited) return noStore(limited);
  const body = await parseRouteJsonBody(
    request,
    API_BODY_LIMIT_BYTES[operation],
  );
  if (!body.ok) return noStore(body.response);
  return noStore(await handler(body.value));
};
