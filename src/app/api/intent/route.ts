import { NextResponse } from "next/server";

import { intentFromPromptKeywords } from "@/core/fabrication/prompt-intent";
import { forgeDiagnostic } from "@/lib/forge-diagnostics";
import { modelFailureDiagnostic } from "@/server/api/forge-diagnostic";
import { runModelRoute } from "@/server/api/model-route";
import { apiError } from "@/server/api/response";
import { DescribeFabricationRequestSchema } from "@/server/fabrication-ai/contracts";
import { isLlmConfigured } from "@/server/fabrication-ai/llm";
import { LlmFabricationIntentModel } from "@/server/fabrication-ai/models";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const invalidRequest = (): NextResponse =>
  apiError(
    "INVALID_REQUEST",
    "The fabrication intent request is malformed.",
    400,
    [],
    forgeDiagnostic({
      stage: "intent",
      kind: "request",
      code: "INVALID_INTENT_REQUEST",
      message: "The fabrication intent request is malformed.",
      modelCall: "not_started",
    }),
  );

const templateOnlyUnsupported = (): NextResponse =>
  apiError(
    "PROMPT_NEEDS_AI",
    "Without an AI provider FoldForge recognizes boxes, pop-up cards, and bird figures. Set AI_API_KEY for other objects.",
    422,
    [],
    forgeDiagnostic({
      stage: "intent",
      kind: "request",
      code: "PROMPT_NEEDS_AI",
      message:
        "Without an AI provider FoldForge recognizes boxes, pop-up cards, and bird figures. Set AI_API_KEY for other objects.",
      modelCall: "not_started",
    }),
  );

export const POST = (request: Request): Promise<NextResponse> =>
  runModelRoute(request, "intent", async (body) => {
    const parsedRequest = DescribeFabricationRequestSchema.safeParse(body);
    if (!parsedRequest.success) return invalidRequest();
    const { prompt } = parsedRequest.data;

    if (!isLlmConfigured()) {
      const keywordIntent = intentFromPromptKeywords(prompt);
      return keywordIntent
        ? NextResponse.json(keywordIntent)
        : templateOnlyUnsupported();
    }

    try {
      return NextResponse.json(
        await new LlmFabricationIntentModel().compileIntent(prompt),
      );
    } catch (error) {
      // A free-tier provider is often rate limited; a recognized object class
      // still gets a template-ready intent instead of a dead end.
      const keywordIntent = intentFromPromptKeywords(prompt);
      if (keywordIntent) return NextResponse.json(keywordIntent);
      const diagnostic = modelFailureDiagnostic("intent", error);
      return apiError(diagnostic.code, diagnostic.message, 502, [], diagnostic);
    }
  });
