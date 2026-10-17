import { NextResponse } from "next/server";

import { isOrigamiModelId } from "@/core/origami/catalog";
import { apiError } from "@/server/api/response";
import { origamiPayload } from "@/server/origami";

/** A library origami model: crease pattern, steps, animation, and checks. */
export const GET = async (
  _request: Request,
  // Explicit rather than the generated RouteContext, so type-checking does
  // not depend on a prior `next build`.
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> => {
  const { id } = await context.params;
  if (!isOrigamiModelId(id)) {
    return apiError(
      "ORIGAMI_NOT_FOUND",
      "There is no origami model with that id.",
      404,
    );
  }
  const response = NextResponse.json(origamiPayload(id));
  // The library is fixed per deployment, so a model never changes under a URL.
  response.headers.set("Cache-Control", "public, max-age=3600");
  return response;
};
