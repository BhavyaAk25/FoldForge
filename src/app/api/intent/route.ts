import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { FabricationIntentV1Schema } from "@/core/fabrication/schemas";
import { forgeDiagnostic } from "@/lib/forge-diagnostics";
import { modelFailureDiagnostic } from "@/server/api/forge-diagnostic";
import { apiError } from "@/server/api/response";
import { runAuthorizedLiveRoute } from "@/server/api/live-authorization";
import { LIVE_OPERATION_POLICIES } from "@/server/api/security-policy";
import {
  DescribeFabricationRequestSchema,
  PROMPT_MAXIMUM_CHARACTERS,
} from "@/server/fabrication-ai/contracts";
import { OpenAIFabricationIntentModel } from "@/server/fabrication-ai/models";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

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

const invalidModelResponse = (): NextResponse =>
  apiError(
    "MODEL_RESPONSE_ERROR",
    "The model did not return a valid fabrication intent.",
    502,
    [],
    forgeDiagnostic({
      stage: "intent",
      kind: "contract",
      code: "MODEL_INTENT_INVALID",
      message: "The model response did not satisfy the intent contract.",
      modelCall: "attempted",
    }),
  );

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const response = await runAuthorizedLiveRoute(
    {
      request,
      operation: "intent",
      reservedInputTokens: PROMPT_MAXIMUM_CHARACTERS,
      reservedOutputTokens: LIVE_OPERATION_POLICIES.intent.maximumOutputTokens,
    },
    async ({ body, safetyIdentifier }) => {
      const parsedRequest = DescribeFabricationRequestSchema.safeParse(body);
      if (!parsedRequest.success) return invalidRequest();

      try {
        const proposedIntent =
          await new OpenAIFabricationIntentModel().compileIntent(
            parsedRequest.data.prompt,
            safetyIdentifier,
          );
        const parsedIntent =
          FabricationIntentV1Schema.safeParse(proposedIntent);
        if (!parsedIntent.success) return invalidModelResponse();
        return NextResponse.json(parsedIntent.data);
      } catch (error) {
        const diagnostic = modelFailureDiagnostic("intent", error);
        return apiError(
          diagnostic.code,
          diagnostic.message,
          502,
          [],
          diagnostic,
        );
      }
    },
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
};
