import { NextResponse } from "next/server";

import { apiError } from "@/server/api/response";
import { origamiPayload } from "@/server/origami";

/** A library model or generated design: crease pattern, steps, animation, and checks. */
export const GET = async (
  _request: Request,
  // Explicit rather than the generated RouteContext, so type-checking does
  // not depend on a prior `next build`.
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> => {
  const { id } = await context.params;
  const payload = origamiPayload(id);
  if (!payload) {
    return apiError(
      "ORIGAMI_NOT_FOUND",
      "There is no origami model with that id.",
      404,
    );
  }
  const response = NextResponse.json(payload);
  // An id fixes the model (a design id is its own parameters), so a model
  // never changes under a URL within a deployment.
  response.headers.set("Cache-Control", "public, max-age=3600");
  return response;
};
