import { NextResponse } from "next/server";

import { generateCandidates } from "@/core/candidates";
import {
  compareCandidates,
  selectRepresentatives,
  verifyCandidate,
} from "@/core/verification";
import { GenerateRequestSchema } from "@/server/api/schemas";
import { apiError, parseJsonBody } from "@/server/api/response";

export const POST = async (request: Request): Promise<NextResponse> => {
  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = GenerateRequestSchema.safeParse(body.value);
  if (!parsed.success)
    return apiError("INVALID_REQUEST", "Generation input is malformed.", 400);

  const evaluated = generateCandidates(
    parsed.data.constraint,
    parsed.data.seed,
  ).map((candidate) => ({
    candidate,
    report: verifyCandidate(candidate, parsed.data.constraint),
  }));
  const representatives = selectRepresentatives(evaluated);

  return NextResponse.json({
    seed: parsed.data.seed,
    internalCandidateCount: evaluated.length,
    candidates: representatives,
    comparison: compareCandidates(evaluated),
    physicalStatus: "awaiting_user",
  });
};
