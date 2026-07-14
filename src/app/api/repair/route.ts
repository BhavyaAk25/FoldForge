import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasLiveModelAccess } from "@/server/access";
import { isLiveAiEnabled } from "@/server/ai/client";
import { OpenAIRepairDiagnosisModel } from "@/server/ai/repair";
import { safetyIdentifier } from "@/server/ai/safety";
import { apiError, parseJsonBody } from "@/server/api/response";
import { RepairRequestSchema, toCandidate } from "@/server/api/schemas";
import {
  RuleBasedRepairDiagnosisModel,
  runRepairLoop,
} from "@/server/orchestration/repair-loop";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const parsed = RepairRequestSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success)
    return apiError("INVALID_REQUEST", "Repair input is malformed.", 400);

  const live = isLiveAiEnabled();
  if (live && !hasLiveModelAccess(request)) {
    return apiError(
      "ACCESS_REQUIRED",
      "Enter the judge access code to use GPT-5.6.",
      401,
    );
  }

  try {
    const outcome = await runRepairLoop(
      toCandidate(parsed.data.candidate),
      parsed.data.constraint,
      live
        ? new OpenAIRepairDiagnosisModel()
        : new RuleBasedRepairDiagnosisModel(),
      safetyIdentifier(parsed.data.installationId),
    );
    return NextResponse.json({
      mode: live ? "gpt-5.6-sol" : "deterministic-offline-repair",
      outcome,
    });
  } catch {
    return apiError(
      "REPAIR_ERROR",
      "The bounded repair loop could not complete safely.",
      502,
    );
  }
};
