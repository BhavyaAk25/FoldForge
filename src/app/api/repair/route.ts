import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { compileFabricationProgram } from "@/core/fabrication/compiler";
import { applyProgramPatch } from "@/core/fabrication/repair";
import { ProgramPatchV1Schema } from "@/core/fabrication/schemas";
import { scoreFabricationCandidate } from "@/core/fabrication/scoring";
import type {
  CandidateScoreV2,
  FabricationIntentV1,
  FabricationIRV1,
  FabricationProgramV1,
  ProgramPatchV1,
  VerificationReportV2,
} from "@/core/fabrication/types";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import { runAuthorizedLiveRoute } from "@/server/api/live-authorization";
import { apiError } from "@/server/api/response";
import {
  API_BODY_LIMIT_BYTES,
  LIVE_OPERATION_POLICIES,
} from "@/server/api/security-policy";
import { RepairFabricationRequestSchema } from "@/server/fabrication-ai/contracts";
import { OpenAIFabricationRepairModel } from "@/server/fabrication-ai/models";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

type RepairStatus = "infeasible" | "passed" | "still_invalid";

interface Evaluation {
  readonly ir: FabricationIRV1;
  readonly report: VerificationReportV2;
  readonly score: CandidateScoreV2;
}

const evaluate = (
  intent: FabricationIntentV1,
  program: FabricationProgramV1,
  candidateId: string,
): Evaluation | null => {
  const compiled = compileFabricationProgram(intent, program);
  if (!compiled.ok) return null;
  const report = verifyFabricationIr(compiled.value, candidateId);
  return {
    ir: compiled.value,
    report,
    score: scoreFabricationCandidate(compiled.value, report, intent),
  };
};

const outcome = (
  status: RepairStatus,
  candidateId: string,
  patch: ProgramPatchV1 | null,
  program: FabricationProgramV1,
  evaluation: Evaluation | null,
): NextResponse =>
  NextResponse.json({
    status,
    candidateId,
    patch,
    program,
    ir: evaluation?.ir ?? null,
    report: evaluation?.report ?? null,
    score: evaluation?.score ?? null,
  });

const invalidRequest = (): NextResponse =>
  apiError(
    "INVALID_REQUEST",
    "The fabrication repair request is malformed.",
    400,
  );

const invalidModelResponse = (): NextResponse =>
  apiError(
    "MODEL_RESPONSE_ERROR",
    "The model did not return a valid bounded repair.",
    502,
  );

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const response = await runAuthorizedLiveRoute(
    {
      request,
      operation: "repair",
      reservedInputTokens: API_BODY_LIMIT_BYTES.repair / 4,
      reservedOutputTokens: LIVE_OPERATION_POLICIES.repair.maximumOutputTokens,
    },
    async ({ body, safetyIdentifier }) => {
      const parsedRequest = RepairFabricationRequestSchema.safeParse(body);
      if (!parsedRequest.success) return invalidRequest();
      const { candidateId, intent, program, repairCycle } = parsedRequest.data;
      const before = evaluate(intent, program, candidateId);
      if (!before) {
        return outcome("infeasible", candidateId, null, program, null);
      }
      if (before.report.valid) {
        return outcome("passed", candidateId, null, program, before);
      }
      if (
        !before.report.failures.some(
          (failure) =>
            failure.severity === "hard" &&
            failure.repairableProgramPaths.length > 0,
        )
      ) {
        return outcome("infeasible", candidateId, null, program, before);
      }

      try {
        const proposedPatch =
          await new OpenAIFabricationRepairModel().diagnoseRepair(
            program,
            before.report,
            repairCycle,
            safetyIdentifier,
          );
        if (!proposedPatch) {
          return outcome("infeasible", candidateId, null, program, before);
        }
        const parsedPatch = ProgramPatchV1Schema.safeParse(proposedPatch);
        if (!parsedPatch.success) return invalidModelResponse();
        if (parsedPatch.data.repairCycle !== repairCycle) {
          return outcome("infeasible", candidateId, null, program, before);
        }
        const applied = applyProgramPatch(
          program,
          parsedPatch.data,
          before.report,
        );
        if (!applied.ok) {
          return outcome("infeasible", candidateId, null, program, before);
        }
        const after = evaluate(intent, applied.value, candidateId);
        if (!after) {
          return outcome(
            "infeasible",
            candidateId,
            parsedPatch.data,
            applied.value,
            null,
          );
        }
        return outcome(
          after.report.valid ? "passed" : "still_invalid",
          candidateId,
          parsedPatch.data,
          applied.value,
          after,
        );
      } catch {
        return invalidModelResponse();
      }
    },
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
};
