import { NextResponse } from "next/server";

import { runModelRoute } from "@/server/api/model-route";
import { apiError } from "@/server/api/response";
import { DescribeFabricationRequestSchema } from "@/server/fabrication-ai/contracts";
import { routePrompt } from "@/server/fabrication-ai/router";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Which engine builds this prompt: origami, a 3D figure, or the mechanism engine. */
export const POST = (request: Request): Promise<NextResponse> =>
  runModelRoute(request, "origami", async (body) => {
    const parsed = DescribeFabricationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "INVALID_REQUEST",
        "Describe what you want to make.",
        400,
      );
    }
    const route = await routePrompt(parsed.data.prompt);
    return NextResponse.json(route);
  });
