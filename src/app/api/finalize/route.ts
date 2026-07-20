import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { validateFabricationCandidateBinding } from "@/core/fabrication/candidate";
import { apiError } from "@/server/api/response";
import { runAuthorizedLiveRoute } from "@/server/api/live-authorization";
import { LIVE_OPERATION_POLICIES } from "@/server/api/security-policy";
import { FinalizeFabricationRequestSchema } from "@/server/fabrication-ai/contracts";
import { OpenAIFabricationNarrativeModel } from "@/server/fabrication-ai/models";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

const noStore = <T>(response: NextResponse<T>): NextResponse<T> => {
  response.headers.set("Cache-Control", "no-store");
  return response;
};

export const POST = (request: NextRequest): Promise<NextResponse> =>
  runAuthorizedLiveRoute(
    {
      request,
      operation: "finalize",
      reservedInputTokens: 12_000,
      reservedOutputTokens:
        LIVE_OPERATION_POLICIES.finalize.maximumOutputTokens,
    },
    async (context) => {
      const parsed = FinalizeFabricationRequestSchema.safeParse(context.body);
      if (!parsed.success) {
        return noStore(
          apiError(
            "INVALID_REQUEST",
            "A strict selected candidate is required.",
            400,
          ),
        );
      }
      if (parsed.data.candidate.selectionStatus !== "selected") {
        return noStore(
          apiError(
            "CANDIDATE_NOT_SELECTED",
            "Select a verified candidate before finalizing.",
            409,
          ),
        );
      }
      const bound = validateFabricationCandidateBinding(parsed.data.candidate);
      if (!bound.ok) {
        return noStore(
          apiError(
            "CANDIDATE_NOT_VERIFIED",
            "The selected candidate no longer matches its verification evidence.",
            422,
          ),
        );
      }

      try {
        const narrative =
          await new OpenAIFabricationNarrativeModel().generateNarrative(
            bound.value,
            context.safetyIdentifier,
          );
        return noStore(NextResponse.json({ narrative }));
      } catch {
        return noStore(
          apiError(
            "MODEL_RESPONSE_INVALID",
            "The explanation did not match the required contract.",
            502,
          ),
        );
      }
    },
  ).then(noStore);
