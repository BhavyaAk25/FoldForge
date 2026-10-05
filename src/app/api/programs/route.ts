import { NextResponse } from "next/server";

import { compileFabricationProgram } from "@/core/fabrication/compiler";
import { programStructureFingerprint } from "@/core/fabrication/program-fingerprint";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import { forgeDiagnostic } from "@/lib/forge-diagnostics";
import {
  compilationFailureDiagnostic,
  modelFailureDiagnostic,
  verificationFailureDiagnostic,
} from "@/server/api/forge-diagnostic";
import { runModelRoute } from "@/server/api/model-route";
import { apiError } from "@/server/api/response";
import {
  ForgeFabricationRequestSchema,
  type ProgramProposalV1,
} from "@/server/fabrication-ai/contracts";
import { isLlmConfigured } from "@/server/fabrication-ai/llm";
import { LlmFabricationProgramModel } from "@/server/fabrication-ai/models";
import { templateFallback } from "@/server/fabrication-ai/plan-response";
import type { FabricationIntentV1 } from "@/core/fabrication/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const invalidRequest = (): NextResponse =>
  apiError(
    "INVALID_REQUEST",
    "The fabrication program request is malformed.",
    400,
    [],
    forgeDiagnostic({
      stage: "program",
      kind: "request",
      code: "INVALID_PROGRAM_REQUEST",
      message: "The fabrication program request is malformed.",
      modelCall: "not_started",
    }),
  );

const noTemplate = (): NextResponse =>
  apiError(
    "PROMPT_NEEDS_AI",
    "No parametric template matches this object. Configure AI_API_KEY to design it.",
    422,
    [],
    forgeDiagnostic({
      stage: "program",
      kind: "request",
      code: "PROMPT_NEEDS_AI",
      message:
        "No parametric template matches this object. Configure AI_API_KEY to design it.",
      modelCall: "not_started",
    }),
  );

const verifiedResponse = (
  intent: FabricationIntentV1,
  proposal: ProgramProposalV1,
  candidateOrdinal: number,
): NextResponse => {
  const compiled = compileFabricationProgram(intent, proposal.program);
  if (!compiled.ok) {
    const diagnostic = compilationFailureDiagnostic(compiled.error);
    return apiError(diagnostic.code, diagnostic.message, 502, [], diagnostic);
  }
  const report = verifyFabricationIr(
    compiled.value,
    `program-boundary-${candidateOrdinal}`,
  );
  if (!report.valid) {
    const diagnostic = verificationFailureDiagnostic({
      stage: "compile",
      report,
      code: "DESIGN_INVALID",
      modelCall: "attempted",
    });
    return apiError(diagnostic.code, diagnostic.message, 502, [], diagnostic);
  }
  // The intent the program was verified against; the client compiles and
  // exports against this one (it differs only after a relaxed template fallback).
  return NextResponse.json({
    intent,
    proposal,
    programStructureFingerprint: programStructureFingerprint(proposal.program),
  });
};

export const POST = (request: Request): Promise<NextResponse> =>
  runModelRoute(request, "programs", async (body) => {
    const parsedRequest = ForgeFabricationRequestSchema.safeParse(body);
    if (!parsedRequest.success) return invalidRequest();
    const { intent, candidateOrdinal, usedTopologyIds } = parsedRequest.data;

    if (!isLlmConfigured()) {
      const templated = templateFallback(intent, candidateOrdinal);
      return templated
        ? verifiedResponse(
            templated.intent,
            templated.proposal,
            candidateOrdinal,
          )
        : noTemplate();
    }

    try {
      const proposal = await new LlmFabricationProgramModel().generateProgram(
        intent,
        candidateOrdinal,
        usedTopologyIds,
      );
      return verifiedResponse(intent, proposal, candidateOrdinal);
    } catch (error) {
      // Provider or contract failure: a matching template still yields a
      // verified design, labelled generationSource "template".
      const templated = templateFallback(intent, candidateOrdinal);
      if (templated) {
        return verifiedResponse(
          templated.intent,
          templated.proposal,
          candidateOrdinal,
        );
      }
      const diagnostic = modelFailureDiagnostic("program", error);
      return apiError(diagnostic.code, diagnostic.message, 502, [], diagnostic);
    }
  });
