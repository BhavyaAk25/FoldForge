import { NextResponse } from "next/server";
import { z } from "zod";

import {
  accessCodeMatches,
  accessCookie,
  accessRequired,
  createAccessToken,
  liveAccessConfigurationValid,
} from "@/server/access";
import { API_BODY_LIMIT_BYTES } from "@/server/api/security-policy";
import { apiError, parseRouteJsonBody } from "@/server/api/response";
import { safeSecurityError } from "@/server/api/security-response";
import { enforceRateLimit } from "@/server/rate-limit";
import { guardMutationRequest } from "@/server/request-guard";

const AccessRequestSchema = z.object({ code: z.string().max(200) }).strict();

export const POST = async (request: Request): Promise<NextResponse> => {
  const mutation = guardMutationRequest(request);
  if (!mutation.ok) return safeSecurityError("REQUEST_ORIGIN_DENIED");

  const limited = enforceRateLimit(request, "access", 5, 10 * 60 * 1_000);
  if (limited) return limited;
  const body = await parseRouteJsonBody(request, API_BODY_LIMIT_BYTES.access);
  if (!body.ok) return body.response;
  const parsed = AccessRequestSchema.safeParse(body.value);
  if (!parsed.success)
    return apiError("INVALID_REQUEST", "Enter a valid access code.", 400);
  if (!accessRequired())
    return NextResponse.json({ granted: true, required: false });
  if (!liveAccessConfigurationValid()) {
    return apiError(
      "ACCESS_NOT_CONFIGURED",
      "The live generator access gate is not configured on this deployment.",
      503,
    );
  }
  if (!accessCodeMatches(parsed.data.code)) {
    return apiError("ACCESS_DENIED", "That access code is not valid.", 401);
  }

  try {
    const response = NextResponse.json({ granted: true, required: true });
    response.cookies.set(accessCookie(createAccessToken()));
    return response;
  } catch {
    return apiError(
      "ACCESS_NOT_CONFIGURED",
      "The live generator access gate is not configured on this deployment.",
      503,
    );
  }
};
