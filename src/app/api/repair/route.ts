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
import {
  forgeDiagnostic,
  type ForgeDiagnosticV1,
} from "@/lib/forge-diagnostics";
import {
  modelFailureDiagnostic,
  verificationFailureDiagnostic,
} from "@/server/api/forge-diagnostic";
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

type EvaluationResult =
  | { readonly ok: true; readonly value: Evaluation }
  | { readonly ok: false; readonly failureKind: string };

const evaluate = (
  intent: FabricationIntentV1,
  program: FabricationProgramV1,
  candidateId: string,
): EvaluationResult => {
  const compiled = compileFabricationProgram(intent, program);
  if (!compiled.ok) {
    return { ok: false, failureKind: compiled.error.kind };
  }
  const report = verifyFabricationIr(compiled.value, candidateId);
  return {
    ok: true,
    value: {
      ir: compiled.value,
      report,
      score: scoreFabricationCandidate(compiled.value, report, intent),
    },
  };
};

const outcome = (
  status: RepairStatus,
  candidateId: string,
  patch: ProgramPatchV1 | null,
  program: FabricationProgramV1,
  evaluation: Evaluation | null,
  diagnostic: ForgeDiagnosticV1 | null,
): NextResponse =>
  NextResponse.json({
    status,
    candidateId,
    patch,
    program,
    ir: evaluation?.ir ?? null,
    report: evaluation?.report ?? null,
    score: evaluation?.score ?? null,
    diagnostic,
  });

const repairCompileDiagnostic = (
  failureKind: string,
  repairCycle: number,
  modelCall: "not_started" | "attempted",
): ForgeDiagnosticV1 =>
  forgeDiagnostic({
    stage: "repair",
    kind: "compilation",
    code: "PROGRAM_COMPILE_ERROR",
    message: "The program could not be compiled safely for repair.",
    modelCall,
    failureIds: [`compile.${failureKind}`],
    repairCycle,
  });

const invalidRequest = (): NextResponse =>
  apiError(
    "INVALID_REQUEST",
    "The fabrication repair request is malformed.",
    400,
    [],
    forgeDiagnostic({
      stage: "repair",
      kind: "request",
      code: "INVALID_REPAIR_REQUEST",
      message: "The fabrication repair request is malformed.",
      modelCall: "not_started",
    }),
  );

const invalidModelResponse = (): NextResponse =>
  apiError(
    "MODEL_RESPONSE_ERROR",
    "The model did not return a valid bounded repair.",
    502,
    [],
    forgeDiagnostic({
      stage: "repair",
      kind: "contract",
      code: "MODEL_REPAIR_INVALID",
      message: "The model repair did not satisfy the bounded patch contract.",
      modelCall: "attempted",
    }),
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
      if (!before.ok) {
        return outcome(
          "infeasible",
          candidateId,
          null,
          program,
          null,
          repairCompileDiagnostic(
            before.failureKind,
            repairCycle,
            "not_started",
          ),
        );
      }
      if (before.value.report.valid) {
        return outcome(
          "passed",
          candidateId,
          null,
          program,
          before.value,
          null,
        );
      }
      if (
        !before.value.report.failures.some(
          (failure) =>
            failure.severity === "hard" &&
            failure.repairableProgramPaths.length > 0,
        )
      ) {
        return outcome(
          "infeasible",
          candidateId,
          null,
          program,
          before.value,
          verificationFailureDiagnostic({
            stage: "repair",
            report: before.value.report,
            repairCycle,
            code: "REPAIR_INFEASIBLE",
            modelCall: "not_started",
          }),
        );
      }

      try {
        const proposedPatch =
          await new OpenAIFabricationRepairModel().diagnoseRepair(
            program,
            before.value.report,
            repairCycle,
            safetyIdentifier,
          );
        if (!proposedPatch) {
          return outcome(
            "infeasible",
            candidateId,
            null,
            program,
            before.value,
            verificationFailureDiagnostic({
              stage: "repair",
              report: before.value.report,
              repairCycle,
              code: "REPAIR_INFEASIBLE",
              modelCall: "attempted",
            }),
          );
        }
        const parsedPatch = ProgramPatchV1Schema.safeParse(proposedPatch);
        if (!parsedPatch.success) return invalidModelResponse();
        if (parsedPatch.data.repairCycle !== repairCycle) {
          return outcome(
            "infeasible",
            candidateId,
            null,
            program,
            before.value,
            forgeDiagnostic({
              stage: "repair",
              kind: "contract",
              code: "REPAIR_PATCH_REJECTED",
              message: "The repair patch targeted the wrong repair cycle.",
              modelCall: "attempted",
              failureIds: before.value.report.failures
                .slice(0, 24)
                .map((failure) => failure.failureId),
              failedAtStage: before.value.report.failedAtStage,
              repairCycle,
            }),
          );
        }
        const applied = applyProgramPatch(
          program,
          parsedPatch.data,
          before.value.report,
        );
        if (!applied.ok) {
          return outcome(
            "infeasible",
            candidateId,
            null,
            program,
            before.value,
            forgeDiagnostic({
              stage: "repair",
              kind: "repair",
              code: "REPAIR_PATCH_REJECTED",
              message: `The repair patch could not be applied safely (${applied.error.id}).`,
              modelCall: "attempted",
              failureIds: [
                applied.error.id,
                ...before.value.report.failures.map(
                  (failure) => failure.failureId,
                ),
              ].slice(0, 24),
              failedAtStage: before.value.report.failedAtStage,
              repairCycle,
            }),
          );
        }
        const after = evaluate(intent, applied.value, candidateId);
        if (!after.ok) {
          return outcome(
            "infeasible",
            candidateId,
            parsedPatch.data,
            applied.value,
            null,
            repairCompileDiagnostic(
              after.failureKind,
              repairCycle,
              "attempted",
            ),
          );
        }
        return outcome(
          after.value.report.valid ? "passed" : "still_invalid",
          candidateId,
          parsedPatch.data,
          applied.value,
          after.value,
          after.value.report.valid
            ? null
            : verificationFailureDiagnostic({
                stage: "repair",
                report: after.value.report,
                repairCycle,
                code: "REPAIR_INCOMPLETE",
                modelCall: "attempted",
              }),
        );
      } catch (error) {
        const diagnostic = modelFailureDiagnostic("repair", error);
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
