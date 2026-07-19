export type FabricationModelContractErrorCode =
  | "model_incomplete"
  | "missing_plan_call"
  | "duplicate_plan_call"
  | "invalid_plan";

export class FabricationModelContractError extends Error {
  constructor(
    readonly code: FabricationModelContractErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FabricationModelContractError";
  }
}

export class FabricationIntentModelError extends FabricationModelContractError {
  constructor(message: string) {
    super("model_incomplete", message);
    this.name = "FabricationIntentModelError";
  }
}
