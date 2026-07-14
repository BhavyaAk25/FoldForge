import { stableHash } from "./canonical";
import { PARAMETER_RANGES } from "./constants";
import { clamp } from "./math";
import { err, ok, type Result } from "./result";
import {
  CandidateParametersSchema,
  ParameterPatchSchema,
  type CandidateParameters,
  type ParameterPatch,
  type PatchOperation,
} from "./schemas";
import type { VerificationReport } from "./types";

export type RepairErrorCode =
  | "invalid_patch"
  | "ungrounded_failure"
  | "unrelated_parameter"
  | "duplicate_parameter"
  | "invalid_delta"
  | "out_of_range";

export interface RepairError {
  readonly code: RepairErrorCode;
  readonly message: string;
  readonly operationIndex: number | null;
}

const allowedParametersByFailure: Readonly<
  Record<string, readonly PatchOperation["parameter"][]>
> = {
  "geometry.rear_run": [
    "baseDepthMm",
    "backrestRiseMm",
    "backrestAngleDeg",
    "frontToeDepthMm",
  ],
  "sheet.bounds": [
    "baseDepthMm",
    "standWidthMm",
    "backrestRiseMm",
    "backrestAngleDeg",
    "lipHeightMm",
    "tabDepthMm",
  ],
  "sheet.margin": ["baseDepthMm", "standWidthMm", "backrestRiseMm"],
  "feature.minimum": [
    "standWidthMm",
    "tabDepthMm",
    "tabWidthMm",
    "slotClearanceMm",
    "panelClearanceMm",
  ],
  "retention.lip": ["lipHeightMm", "backrestAngleDeg"],
  "retention.toe": ["frontToeDepthMm", "backrestAngleDeg"],
  "angle.target": ["backrestAngleDeg"],
  "fold.intersections": [
    "baseDepthMm",
    "backrestRiseMm",
    "backrestAngleDeg",
    "lipHeightMm",
    "panelClearanceMm",
  ],
  "contact.nominal": ["standWidthMm", "backrestRiseMm", "backrestAngleDeg"],
  "stability.support_polygon": [
    "baseDepthMm",
    "standWidthMm",
    "frontToeDepthMm",
    "backrestAngleDeg",
  ],
};

const valueAfterOperation = (
  current: number,
  operation: PatchOperation,
): number => {
  const range = PARAMETER_RANGES[operation.parameter];
  switch (operation.operation) {
    case "set":
      return operation.value;
    case "increase":
      return current + operation.value;
    case "decrease":
      return current - operation.value;
    case "clamp":
      return clamp(operation.value, range.min, range.max);
  }
};

export const applyParameterPatch = (
  parameters: CandidateParameters,
  patch: ParameterPatch,
  report: VerificationReport,
): Result<CandidateParameters, RepairError> => {
  const parsedPatch = ParameterPatchSchema.safeParse(patch);
  if (!parsedPatch.success) {
    return err({
      code: "invalid_patch",
      message: "Patch does not match the strict bounded schema.",
      operationIndex: null,
    });
  }

  const next: CandidateParameters = { ...parameters };
  const changed = new Set<PatchOperation["parameter"]>();

  for (const [index, operation] of parsedPatch.data.operations.entries()) {
    if (!report.hardFailures.includes(operation.verificationId)) {
      return err({
        code: "ungrounded_failure",
        message: `Patch references failure ${operation.verificationId}, which is not present in the report.`,
        operationIndex: index,
      });
    }

    const allowed = allowedParametersByFailure[operation.verificationId] ?? [];
    if (!allowed.includes(operation.parameter)) {
      return err({
        code: "unrelated_parameter",
        message: `${operation.parameter} is not an allowed repair lever for ${operation.verificationId}.`,
        operationIndex: index,
      });
    }

    if (changed.has(operation.parameter)) {
      return err({
        code: "duplicate_parameter",
        message: `A patch cycle may modify ${operation.parameter} only once.`,
        operationIndex: index,
      });
    }

    const expectedUnit =
      operation.parameter === "backrestAngleDeg" ? "deg" : "mm";
    if (operation.unit !== expectedUnit) {
      return err({
        code: "invalid_patch",
        message: `${operation.parameter} requires ${expectedUnit}.`,
        operationIndex: index,
      });
    }

    if (
      (operation.operation === "increase" ||
        operation.operation === "decrease") &&
      operation.value <= 0
    ) {
      return err({
        code: "invalid_delta",
        message: "Increase and decrease operations require a positive delta.",
        operationIndex: index,
      });
    }

    next[operation.parameter] = valueAfterOperation(
      next[operation.parameter],
      operation,
    );
    changed.add(operation.parameter);
  }

  const parsedParameters = CandidateParametersSchema.safeParse(next);
  if (!parsedParameters.success) {
    return err({
      code: "out_of_range",
      message:
        "Patch would move one or more parameters outside the approved range.",
      operationIndex: null,
    });
  }

  return ok(parsedParameters.data);
};

export const repairInputHash = (
  parameters: CandidateParameters,
  report: VerificationReport,
): string =>
  stableHash({
    parameters,
    hardFailures: report.hardFailures,
    checks: report.checks.map(({ id, status, actual }) => ({
      id,
      status,
      actual,
    })),
  });
