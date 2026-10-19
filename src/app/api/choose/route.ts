import { NextResponse } from "next/server";

import { modelFailureDiagnostic } from "@/server/api/forge-diagnostic";
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
    if (route.engine === "error") {
      const diagnostic = modelFailureDiagnostic("intent", route.error);
      return apiError(
        "AI_BUSY",
        "The free AI is busy right now. Try again in a minute, or name what you want directly: an animal (cat, duck, fox), a car, a house, a box, a card, or an origami crane.",
        502,
        [],
        diagnostic,
      );
    }
    return NextResponse.json(route);
  });
