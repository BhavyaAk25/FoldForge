export type LiveReadinessCaseStatus =
  "passed" | "failed" | "not_run_budget_exhausted";

export interface LiveReadinessCaseResultLike {
  readonly status: LiveReadinessCaseStatus;
}

export interface LiveReadinessGateSummary {
  readonly selectedCaseCount: number;
  readonly completedCaseCount: number;
  readonly passedCount: number;
  readonly selectedRequiredPassedCount: number;
  readonly selectedRunPassed: boolean;
  readonly releaseRequiredCaseCount: number;
  readonly releaseRequiredPassedCount: number;
  readonly releaseGatePassed: boolean;
  readonly passed: boolean;
}

const RELEASE_REQUIRED_CASE_COUNT = 5;
const RELEASE_REQUIRED_PASSED_COUNT = 4;

export const summarizeLiveReadinessGate = (input: {
  readonly selectedCaseCount: number;
  readonly results: readonly LiveReadinessCaseResultLike[];
}): LiveReadinessGateSummary => {
  if (
    !Number.isSafeInteger(input.selectedCaseCount) ||
    input.selectedCaseCount < 1 ||
    input.selectedCaseCount > RELEASE_REQUIRED_CASE_COUNT ||
    input.results.length !== input.selectedCaseCount
  ) {
    throw new Error(
      "Live readiness results must match one to five selected cases.",
    );
  }

  const completedCaseCount = input.results.filter(
    (result) => result.status !== "not_run_budget_exhausted",
  ).length;
  const passedCount = input.results.filter(
    (result) => result.status === "passed",
  ).length;
  const selectedRequiredPassedCount = Math.ceil(input.selectedCaseCount * 0.8);
  const selectedRunPassed =
    completedCaseCount === input.selectedCaseCount &&
    passedCount >= selectedRequiredPassedCount;
  const releaseGatePassed =
    input.selectedCaseCount === RELEASE_REQUIRED_CASE_COUNT &&
    completedCaseCount === RELEASE_REQUIRED_CASE_COUNT &&
    passedCount >= RELEASE_REQUIRED_PASSED_COUNT;

  return {
    selectedCaseCount: input.selectedCaseCount,
    completedCaseCount,
    passedCount,
    selectedRequiredPassedCount,
    selectedRunPassed,
    releaseRequiredCaseCount: RELEASE_REQUIRED_CASE_COUNT,
    releaseRequiredPassedCount: RELEASE_REQUIRED_PASSED_COUNT,
    releaseGatePassed,
    // Top-level pass is intentionally the sealed release gate. A smoke run can
    // succeed without being mislabeled as complete submission evidence.
    passed: releaseGatePassed,
  };
};
