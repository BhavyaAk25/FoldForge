import { compileFabricationProgram } from "@/core/fabrication/compiler";
import type {
  FabricationIntentV1,
  FabricationProgramV1,
  VerificationReportV2,
} from "@/core/fabrication/types";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import type { FabricationProgramOutcome } from "@/server/fabrication-ai/orchestration";

export interface RepairProbeMutationEvidence {
  readonly purpose: "deliberate_evaluation_probe";
  readonly path: string;
  readonly originalValue: number;
  readonly mutatedValue: number;
  readonly unit: "mm" | "deg";
}

export const evaluateFabricationProgramForEvidence = (
  intent: FabricationIntentV1,
  program: FabricationProgramV1,
  candidateId: string,
): VerificationReportV2 | null => {
  const compiled = compileFabricationProgram(intent, program);
  return compiled.ok ? verifyFabricationIr(compiled.value, candidateId) : null;
};

export const createRepairEvidence = (
  initialReport: VerificationReportV2 | null,
  outcome: FabricationProgramOutcome,
  mutation: RepairProbeMutationEvidence | null,
  repairResponseIds: readonly string[],
) => {
  const cycles = outcome.cycles.map((cycle, index) => {
    const beforeReport =
      index === 0 ? initialReport : (outcome.cycles[index - 1]?.report ?? null);
    const citedFailureIds = [
      ...new Set(
        cycle.patch.operations.flatMap((operation) => operation.failureIds),
      ),
    ];
    const citedFailures = citedFailureIds.map((failureId) => {
      const failure = beforeReport?.failures.find(
        (candidate) => candidate.failureId === failureId,
      );
      return {
        failureId,
        foundInBeforeReport: failure !== undefined,
        stage: failure?.stage ?? null,
        actual: failure?.actual ?? null,
        expected: failure?.expected ?? null,
        repairableProgramPaths: failure?.repairableProgramPaths ?? [],
      };
    });
    const operations = cycle.patch.operations.map((operation) => ({
      operationId: operation.operationId,
      operation: operation.operation,
      path: operation.path,
      value: operation.value,
      expectedCurrentValue: operation.expectedCurrentValue,
      unit: operation.unit,
      failureIds: operation.failureIds,
      grounded:
        operation.failureIds.every((failureId) =>
          citedFailures.some(
            (failure) =>
              failure.failureId === failureId &&
              failure.foundInBeforeReport &&
              failure.repairableProgramPaths.includes(operation.path),
          ),
        ) && operation.failureIds.length > 0,
      reason: operation.reason,
      expectedEffect: operation.expectedEffect,
    }));
    const diagnosisGrounded = citedFailureIds.some((failureId) =>
      cycle.patch.diagnosis.includes(failureId),
    );
    return {
      cycle: cycle.cycle,
      responseId: repairResponseIds[index] ?? null,
      diagnosis: cycle.patch.diagnosis,
      beforeProgramHash: cycle.beforeProgramHash,
      afterProgramHash: cycle.afterProgramHash,
      citedFailures,
      operations,
      diagnosisGrounded,
      deterministicRevalidation: {
        reportId: cycle.report.reportId,
        valid: cycle.report.valid,
        failedAtStage: cycle.report.failedAtStage,
      },
      grounded:
        diagnosisGrounded &&
        operations.every((operation) => operation.grounded),
    };
  });
  const finalReport = outcome.report;
  const responseProvenanceComplete =
    repairResponseIds.length === cycles.length &&
    repairResponseIds.every((responseId) => responseId.length > 0);
  const passed =
    initialReport !== null &&
    !initialReport.valid &&
    cycles.length > 0 &&
    cycles.every((cycle) => cycle.grounded) &&
    responseProvenanceComplete &&
    outcome.status === "passed" &&
    finalReport?.valid === true;
  return {
    passed,
    evidenceType:
      mutation === null ? "natural_model_candidate" : mutation.purpose,
    mutation,
    initialFailureStage: initialReport?.failedAtStage ?? null,
    initialFailures:
      initialReport?.failures.map((failure) => ({
        failureId: failure.failureId,
        stage: failure.stage,
        actual: failure.actual,
        expected: failure.expected,
        repairableProgramPaths: failure.repairableProgramPaths,
      })) ?? [],
    cycles,
    responseProvenanceComplete,
    finalStatus: outcome.status,
    finalReportId: finalReport?.reportId ?? null,
    finalValid: finalReport?.valid ?? false,
  };
};

export type RepairEvidence = ReturnType<typeof createRepairEvidence>;
