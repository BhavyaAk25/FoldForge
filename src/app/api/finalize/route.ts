import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { compareCandidates, verifyCandidate } from "@/core/verification";
import { hasLiveModelAccess } from "@/server/access";
import { isLiveAiEnabled } from "@/server/ai/client";
import { generateFinalNarrative } from "@/server/ai/finalize";
import { safetyIdentifier } from "@/server/ai/safety";
import { apiError, parseJsonBody } from "@/server/api/response";
import { FinalizeRequestSchema, toCandidate } from "@/server/api/schemas";
import { deterministicInstructions } from "@/server/instructions";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const parsed = FinalizeRequestSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success)
    return apiError("INVALID_REQUEST", "Finalization input is malformed.", 400);

  const evaluated = parsed.data.candidates.map((input) => {
    const candidate = toCandidate(input);
    return {
      candidate,
      report: verifyCandidate(candidate, parsed.data.constraint),
    };
  });
  const comparison = compareCandidates(evaluated);
  const winner = evaluated.find(
    (entry) => entry.candidate.id === comparison.recommendedCandidateId,
  );
  if (!winner) {
    return apiError(
      "NO_VALID_CANDIDATE",
      "No candidate passes every deterministic hard check.",
      422,
      evaluated.flatMap((entry) => entry.report.hardFailures),
    );
  }

  const live = isLiveAiEnabled();
  if (live && !hasLiveModelAccess(request)) {
    return apiError(
      "ACCESS_REQUIRED",
      "Enter the judge access code to use GPT-5.6.",
      401,
    );
  }

  try {
    const narrative = live
      ? await generateFinalNarrative(
          winner.candidate,
          parsed.data.constraint,
          winner.report,
          comparison,
          safetyIdentifier(parsed.data.installationId),
        )
      : deterministicInstructions(
          winner.candidate,
          parsed.data.constraint,
          winner.report,
        );
    return NextResponse.json({
      mode: live ? "gpt-5.6-sol" : "deterministic-instructions",
      comparison,
      winner,
      narrative,
    });
  } catch {
    return apiError(
      "FINALIZATION_ERROR",
      "The final explanation could not be generated safely.",
      502,
    );
  }
};
