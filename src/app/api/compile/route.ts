import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasLiveModelAccess } from "@/server/access";
import {
  compileConstraints,
  compileProvidedConstraint,
  OpenAIConstraintCompilationModel,
} from "@/server/ai/compiler";
import { isLiveAiEnabled } from "@/server/ai/client";
import { CompileRequestSchema } from "@/server/ai/contracts";
import { safetyIdentifier } from "@/server/ai/safety";
import { apiError, parseJsonBody } from "@/server/api/response";
import { enforceRateLimit } from "@/server/rate-limit";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = CompileRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError(
      "INVALID_REQUEST",
      "The constraint request is malformed.",
      400,
      parsed.error.issues.map((issue) => issue.path.join(".")),
    );
  }

  const live = isLiveAiEnabled();
  const limited = live
    ? enforceRateLimit(request, "compile", 20, 60 * 60 * 1_000)
    : null;
  if (limited) return limited;
  if (live && !hasLiveModelAccess(request)) {
    return apiError(
      "ACCESS_REQUIRED",
      "Enter the judge access code to use GPT-5.6.",
      401,
    );
  }

  if (!live) {
    if (!parsed.data.providedConstraint) {
      return apiError(
        "LIVE_AI_DISABLED",
        "Live GPT-5.6 compilation is disabled until free API credits are confirmed.",
        503,
      );
    }
    return NextResponse.json({
      mode: "deterministic-controls",
      outcome: compileProvidedConstraint(
        parsed.data.providedConstraint,
        "Structured controls were normalized by deterministic code. GPT-5.6 is disabled.",
      ),
    });
  }

  try {
    const outcome = await compileConstraints(
      parsed.data.prompt,
      safetyIdentifier(parsed.data.installationId),
      new OpenAIConstraintCompilationModel(),
    );
    return NextResponse.json({ mode: "gpt-5.6-sol", outcome });
  } catch {
    return apiError(
      "MODEL_RESPONSE_ERROR",
      "GPT-5.6 did not return a valid strict constraint compilation.",
      502,
    );
  }
};
