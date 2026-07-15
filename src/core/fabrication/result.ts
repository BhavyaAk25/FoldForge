import type { ZodType } from "zod";

import { err, ok, type Result } from "../result";

export type FabricationContractName =
  | "FabricationIntentV1"
  | "FabricationProgramV1"
  | "FabricationIRV1"
  | "VerificationReportV2"
  | "ProgramPatchV1"
  | "CandidateV2";

export interface FabricationContractIssue {
  readonly code: string;
  readonly path: readonly string[];
  readonly message: string;
}

export interface FabricationContractValidationError {
  readonly kind: "contract_validation";
  readonly contract: FabricationContractName;
  readonly issues: readonly FabricationContractIssue[];
}

export interface FabricationLimitError {
  readonly kind: "limit_exceeded";
  readonly limit: string;
  readonly actual: number;
  readonly maximum: number;
}

export interface FabricationReferenceError {
  readonly kind: "invalid_reference";
  readonly referenceKind: string;
  readonly referenceId: string;
  readonly ownerId: string;
}

export interface UnsupportedFabricationError {
  readonly kind: "unsupported_fabrication";
  readonly reason: string;
}

export type FabricationDomainError =
  | FabricationContractValidationError
  | FabricationLimitError
  | FabricationReferenceError
  | UnsupportedFabricationError;

export type FabricationResult<T, E extends FabricationDomainError> = Result<
  T,
  E
>;

export const fabricationOk = <T>(value: T): FabricationResult<T, never> =>
  ok(value);

export const fabricationErr = <E extends FabricationDomainError>(
  error: E,
): FabricationResult<never, E> => err(error);

export const parseFabricationContract = <T>(
  contract: FabricationContractName,
  schema: ZodType<T>,
  input: unknown,
): FabricationResult<T, FabricationContractValidationError> => {
  const parsed = schema.safeParse(input);
  if (parsed.success) return fabricationOk(parsed.data);

  return fabricationErr({
    kind: "contract_validation",
    contract,
    issues: parsed.error.issues.map((issue) => ({
      code: issue.code,
      path: issue.path.map(String),
      message: issue.message,
    })),
  });
};

export const mapFabricationResult = <T, U, E extends FabricationDomainError>(
  result: FabricationResult<T, E>,
  transform: (value: T) => U,
): FabricationResult<U, E> =>
  result.ok ? fabricationOk(transform(result.value)) : result;
