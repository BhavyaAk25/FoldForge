import type {
  ProgramPatchV1,
  VerificationFailureV2,
  VerificationReportV2,
  VerificationStage,
} from "./types";

const EPSILON = 1e-9;

const STAGE_ORDER: Readonly<Record<VerificationStage, number>> = {
  schema: 0,
  topology: 1,
  panel_geometry: 2,
  connections: 3,
  sheet_packing: 4,
  rigid_transforms: 5,
  motion: 6,
  collision: 7,
  semantics: 8,
  export_equivalence: 9,
  scoring: 10,
};

export interface RepairMetricChange {
  readonly failureId: string;
  readonly before: number | null;
  readonly after: number | null;
  readonly expected: number | null;
  readonly unit: string | null;
  readonly improved: boolean;
}

export type RepairProgressResult =
  | {
      readonly ok: true;
      readonly measurements: readonly RepairMetricChange[];
    }
  | {
      readonly ok: false;
      readonly reason: "repair.no_geometric_effect";
      readonly measurements: readonly RepairMetricChange[];
    };

const numericValue = (
  failure: VerificationFailureV2 | undefined,
  field: "actual" | "expected",
): number | null => {
  const value = failure?.[field].value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const failureKey = (failureId: string): string => failureId.split("#", 1)[0]!;

const matchingAfterFailure = (
  before: VerificationFailureV2,
  after: VerificationReportV2,
): VerificationFailureV2 | undefined =>
  after.failures.find((failure) => failure.failureId === before.failureId) ??
  after.failures.find(
    (failure) =>
      failure.severity === "hard" &&
      failureKey(failure.failureId) === failureKey(before.failureId),
  );

const metricChange = (
  before: VerificationFailureV2,
  after: VerificationFailureV2 | undefined,
): RepairMetricChange => {
  const beforeValue = numericValue(before, "actual");
  const expectedValue = numericValue(before, "expected");
  const afterValue = numericValue(after, "actual");
  const unitsMatch =
    after === undefined ||
    (before.actual.unit === after.actual.unit &&
      before.expected.unit === after.expected.unit);
  const improved =
    after === undefined ||
    (unitsMatch &&
      beforeValue !== null &&
      expectedValue !== null &&
      afterValue !== null &&
      Math.abs(afterValue - expectedValue) + EPSILON <
        Math.abs(beforeValue - expectedValue));
  return {
    failureId: before.failureId,
    before: beforeValue,
    after: afterValue,
    expected: expectedValue,
    unit: before.actual.unit,
    improved,
  };
};

export const evaluateRepairProgress = (
  before: VerificationReportV2,
  after: VerificationReportV2,
  patch: ProgramPatchV1,
): RepairProgressResult => {
  const referencedFailureIds = new Set(
    patch.operations.flatMap((operation) => operation.failureIds),
  );
  const targeted = before.failures.filter(
    (failure) =>
      failure.severity === "hard" &&
      referencedFailureIds.has(failure.failureId),
  );
  const measurements = targeted.map((failure) =>
    metricChange(failure, matchingAfterFailure(failure, after)),
  );
  const earliestTargetStage = Math.min(
    ...targeted.map((failure) => STAGE_ORDER[failure.stage]),
  );
  const beforeFailureIds = new Set(
    before.failures
      .filter((failure) => failure.severity === "hard")
      .map((failure) => failure.failureId),
  );
  const beforeFailureKeys = new Set(
    before.failures
      .filter((failure) => failure.severity === "hard")
      .map((failure) => failureKey(failure.failureId)),
  );
  const introducedEarlierFailure = after.failures.some(
    (failure) =>
      failure.severity === "hard" &&
      !beforeFailureIds.has(failure.failureId) &&
      !beforeFailureKeys.has(failureKey(failure.failureId)) &&
      STAGE_ORDER[failure.stage] <= earliestTargetStage,
  );
  if (
    measurements.length === 0 ||
    measurements.some((measurement) => !measurement.improved) ||
    introducedEarlierFailure
  ) {
    return {
      ok: false,
      reason: "repair.no_geometric_effect",
      measurements,
    };
  }
  return { ok: true, measurements };
};

export const repairProgressMessage = (result: RepairProgressResult): string => {
  const detail = result.measurements
    .map((measurement) => {
      const unit = measurement.unit ? ` ${measurement.unit}` : "";
      return `${measurement.failureId}: ${measurement.before ?? "unmeasured"}${unit} -> ${measurement.after ?? "resolved"}${unit}`;
    })
    .join("; ");
  return detail.length > 0
    ? `The repair made no measurable geometric progress (${detail}).`
    : "The repair did not target a measurable hard verifier failure.";
};
