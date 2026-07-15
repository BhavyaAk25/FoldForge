import { NextResponse } from "next/server";

import { compileFabricationProgram } from "@/core/fabrication/compiler";
import { scoreFabricationCandidate } from "@/core/fabrication/scoring";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import { apiError, parseRouteJsonBody } from "@/server/api/response";
import { API_BODY_LIMIT_BYTES } from "@/server/api/security-policy";
import { safeSecurityError } from "@/server/api/security-response";
import { runBoundedDeterministicRequest } from "@/server/deterministic-route-guard";
import { CompileFabricationRequestSchema } from "@/server/fabrication-ai/contracts";
import { guardMutationRequest } from "@/server/request-guard";

export const dynamic = "force-dynamic";

const noStore = (response: NextResponse): NextResponse => {
  response.headers.set("Cache-Control", "no-store");
  return response;
};

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

    const { candidateId, intent, program } = parsed.data;
    const compiled = compileFabricationProgram(intent, program);
    if (!compiled.ok) {
      return noStore(
        NextResponse.json({
          status: "compile_error",
          candidateId,
          ir: null,
          report: null,
          score: null,
        }),
      );
    }

    const report = verifyFabricationIr(compiled.value, candidateId);
    const score = scoreFabricationCandidate(compiled.value, report, intent);
    return noStore(
      NextResponse.json({
        status: report.valid ? "passed" : "invalid",
        candidateId,
        ir: compiled.value,
        report,
        score,
      }),
    );
  });
};
