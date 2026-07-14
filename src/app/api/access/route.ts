import { NextResponse } from "next/server";
import { z } from "zod";

import {
  accessCodeMatches,
  accessCookie,
  accessRequired,
  createAccessToken,
} from "@/server/access";
import { apiError, parseJsonBody } from "@/server/api/response";

const AccessRequestSchema = z.object({ code: z.string().max(200) }).strict();

export const POST = async (request: Request): Promise<NextResponse> => {
  const parsed = AccessRequestSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success)
    return apiError("INVALID_REQUEST", "Enter a valid access code.", 400);
  if (!accessRequired())
    return NextResponse.json({ granted: true, required: false });
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
