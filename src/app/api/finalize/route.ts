import { NextResponse } from "next/server";

import { validateFabricationCandidateBinding } from "@/core/fabrication/candidate";
import { runModelRoute } from "@/server/api/model-route";
import { apiError } from "@/server/api/response";
import { FinalizeFabricationRequestSchema } from "@/server/fabrication-ai/contracts";
import { LlmFabricationNarrativeModel } from "@/server/fabrication-ai/models";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = (request: Request): Promise<NextResponse> =>
  runModelRoute(request, "finalize", async (body) => {
    const parsed = FinalizeFabricationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "INVALID_REQUEST",
        "A strict selected candidate is required.",
        400,
      );
    }
    if (parsed.data.candidate.selectionStatus !== "selected") {
      return apiError(
        "CANDIDATE_NOT_SELECTED",
        "Select a verified candidate before finalizing.",
        409,
      );
    }
    const bound = validateFabricationCandidateBinding(parsed.data.candidate);
    if (!bound.ok) {
      return apiError(
        "CANDIDATE_NOT_VERIFIED",
        "The selected candidate no longer matches its verification evidence.",
        422,
      );
    }

    try {
      const narrative =
        await new LlmFabricationNarrativeModel().generateNarrative(bound.value);
      return NextResponse.json({ narrative });
    } catch {
      return apiError(
        "MODEL_RESPONSE_INVALID",
        "The AI explanation is unavailable right now.",
        502,
      );
    }
  });
