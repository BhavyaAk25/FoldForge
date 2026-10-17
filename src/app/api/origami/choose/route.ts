import { NextResponse } from "next/server";

import { modelFailureDiagnostic } from "@/server/api/forge-diagnostic";
import { runModelRoute } from "@/server/api/model-route";
import { apiError } from "@/server/api/response";
import { DescribeFabricationRequestSchema } from "@/server/fabrication-ai/contracts";
import { isLlmConfigured } from "@/server/fabrication-ai/llm";
import { chooseOrigamiModel } from "@/server/fabrication-ai/origami-choice";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** The AI picks the closest library model for an origami prompt that names none. */
export const POST = (request: Request): Promise<NextResponse> =>
  runModelRoute(request, "origami", async (body) => {
    const parsed = DescribeFabricationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "INVALID_REQUEST",
        "The origami request is malformed.",
        400,
      );
    }
    if (!isLlmConfigured()) {
      return NextResponse.json({
        modelId: null,
        paperSizeMm: null,
        reason: null,
      });
    }
    try {
      const choice = await chooseOrigamiModel(parsed.data.prompt);
      return NextResponse.json({
        modelId: choice.modelId === "none" ? null : choice.modelId,
        paperSizeMm: Math.round(choice.paperSizeMm),
        reason: choice.reason,
      });
    } catch (error) {
      const diagnostic = modelFailureDiagnostic("intent", error);
      return apiError(diagnostic.code, diagnostic.message, 502, [], diagnostic);
    }
  });
