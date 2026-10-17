import { NextResponse } from "next/server";

import { compileFabricationProgram } from "@/core/fabrication/compiler";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import {
  compilationFailureDiagnostic,
  verificationFailureDiagnostic,
} from "@/server/api/forge-diagnostic";
import { apiError, parseRouteJsonBody } from "@/server/api/response";
import { API_BODY_LIMIT_BYTES } from "@/server/api/security-policy";
import { safeSecurityError } from "@/server/api/security-response";
import { buildCandidate } from "@/server/candidates";
import { runBoundedDeterministicRequest } from "@/server/deterministic-route-guard";
import { CompileFabricationRequestSchema } from "@/server/fabrication-ai/contracts";
import { guardMutationRequest } from "@/server/request-guard";

export const dynamic = "force-dynamic";

const noStore = (response: NextResponse): NextResponse => {
  response.headers.set("Cache-Control", "no-store");
  return response;
};

/**
 * Compiles, verifies, scores, and hashes a program into the finished
 * candidate the UI renders and exports. The browser never repeats this work.
 */
export const POST = async (request: Request): Promise<NextResponse> => {
  const mutation = guardMutationRequest(request);
  if (!mutation.ok) {
    return noStore(safeSecurityError("REQUEST_ORIGIN_DENIED"));
  }
  return runBoundedDeterministicRequest(request, "compile", async () => {
    const body = await parseRouteJsonBody(
      request,
      API_BODY_LIMIT_BYTES.compile,
    );
    if (!body.ok) {
      return noStore(
        body.response.status === 413
          ? safeSecurityError("PAYLOAD_TOO_LARGE")
          : body.response,
      );
    }
    const parsed = CompileFabricationRequestSchema.safeParse(body.value);
    if (!parsed.success) {
      return noStore(
        apiError(
          "INVALID_REQUEST",
          "The fabrication compile request is malformed.",
          400,
        ),
      );
    }

    const { candidateId, intent, program, generation } = parsed.data;
    const built = buildCandidate({
      candidateId,
      intent,
      program,
      generation,
      generatedAtIso: new Date().toISOString(),
    });
    if (built.ok) {
      return noStore(
        NextResponse.json({
          status: "passed",
          candidate: built.value.candidate,
          foldExport: built.value.foldExport,
          diagnostic: null,
        }),
      );
    }

    // Explain the failure with the same compiler and verifier diagnostics.
    const compiled = compileFabricationProgram(intent, program);
    const diagnostic = compiled.ok
      ? verificationFailureDiagnostic({
          stage: "compile",
          report: verifyFabricationIr(compiled.value, candidateId),
        })
      : compilationFailureDiagnostic(compiled.error);
    return noStore(
      NextResponse.json({
        status: compiled.ok ? "invalid" : "compile_error",
        candidateId,
        diagnostic,
      }),
    );
  });
};
