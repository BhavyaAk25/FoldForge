import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { forgeDiagnostic } from "@/lib/forge-diagnostics";
import { modelFailureDiagnostic } from "@/server/api/forge-diagnostic";
import { runAuthorizedLiveRoute } from "@/server/api/live-authorization";
import { apiError } from "@/server/api/response";
import {
  API_BODY_LIMIT_BYTES,
  LIVE_OPERATION_POLICIES,
} from "@/server/api/security-policy";
import {
  ForgeFabricationRequestSchema,
  ProgramProposalV1Schema,
} from "@/server/fabrication-ai/contracts";
import { OpenAIFabricationProgramModel } from "@/server/fabrication-ai/models";
import { programStructureFingerprint } from "@/server/fabrication-ai/orchestration";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

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

const invalidModelResponse = (): NextResponse =>
  apiError(
    "MODEL_RESPONSE_ERROR",
    "The model did not return a valid fabrication program.",
    502,
    [],
    forgeDiagnostic({
      stage: "program",
      kind: "contract",
      code: "MODEL_PLAN_INVALID",
      message: "The model plan did not satisfy the fabrication contract.",
      modelCall: "attempted",
    }),
  );

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const response = await runAuthorizedLiveRoute(
    {
      request,
      operation: "programs",
      reservedInputTokens: API_BODY_LIMIT_BYTES.programs / 4,
      reservedOutputTokens:
        LIVE_OPERATION_POLICIES.programs.maximumOutputTokens,
    },
    async ({ body, safetyIdentifier }) => {
      const parsedRequest = ForgeFabricationRequestSchema.safeParse(body);
      if (!parsedRequest.success) return invalidRequest();

      try {
        const proposed =
          await new OpenAIFabricationProgramModel().generateProgram(
            parsedRequest.data.intent,
            parsedRequest.data.candidateOrdinal,
            parsedRequest.data.usedTopologyIds,
            safetyIdentifier,
          );
        const proposal = ProgramProposalV1Schema.safeParse(proposed);
        if (!proposal.success) return invalidModelResponse();
        return NextResponse.json({
          proposal: proposal.data,
          programStructureFingerprint: programStructureFingerprint(
            proposal.data.program,
          ),
        });
      } catch (error) {
        const diagnostic = modelFailureDiagnostic("program", error);
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
