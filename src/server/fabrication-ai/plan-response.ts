import { canonicalSerialize } from "@/core/canonical";
import {
  expandFabricationPlan,
  FABRICATION_PLAN_EXPANDER_VERSION,
} from "@/core/fabrication/planning";
import type { FabricationIntentV1 } from "@/core/fabrication/types";
import { sha256Hex } from "@/core/sha256";

import {
  FabricationPlanProposalV1Schema,
  ProgramProposalV1Schema,
  type FabricationPlanProposalV1,
  type ProgramProposalV1,
} from "./contracts";

export interface CompletedFabricationPlanResponse {
  readonly id: string;
  readonly status?: string | null;
  readonly output?: readonly unknown[] | null;
}

export class FabricationProgramModelError extends Error {
  constructor(
    readonly code:
      | "model_incomplete"
      | "missing_plan_call"
      | "duplicate_plan_call"
      | "invalid_plan",
    message: string,
  ) {
    super(message);
    this.name = "FabricationProgramModelError";
  }
}

interface FabricationPlanFunctionCallCandidate {
  readonly type: "function_call";
  readonly name: "submit_fabrication_plan";
  readonly arguments?: unknown;
}

const isFabricationPlanFunctionCallCandidate = (
  item: unknown,
): item is FabricationPlanFunctionCallCandidate =>
  typeof item === "object" &&
  item !== null &&
  "type" in item &&
  item.type === "function_call" &&
  "name" in item &&
  item.name === "submit_fabrication_plan";

export const fabricationProgramProposalFromResponse = (input: {
  readonly response: CompletedFabricationPlanResponse;
  readonly intent: FabricationIntentV1;
  readonly candidateOrdinal: number;
  readonly modelId: string;
}): ProgramProposalV1 => {
  if (input.response.status !== "completed") {
    throw new FabricationProgramModelError(
      "model_incomplete",
      "GPT-5.6 Sol did not complete the fabrication plan.",
    );
  }
  const planCalls = (input.response.output ?? []).filter(
    isFabricationPlanFunctionCallCandidate,
  );
  const planCall = planCalls[0];
  if (!planCall) {
    throw new FabricationProgramModelError(
      "missing_plan_call",
      "GPT-5.6 Sol returned no fabrication plan call.",
    );
  }
  if (planCalls.length !== 1) {
    throw new FabricationProgramModelError(
      "duplicate_plan_call",
      "GPT-5.6 Sol returned more than one fabrication plan call.",
    );
  }
  if (typeof planCall.arguments !== "string") {
    throw new FabricationProgramModelError(
      "invalid_plan",
      "GPT-5.6 Sol returned malformed fabrication plan arguments.",
    );
  }
  let proposal: FabricationPlanProposalV1;
  try {
    proposal = FabricationPlanProposalV1Schema.parse(
      JSON.parse(planCall.arguments),
    );
  } catch {
    throw new FabricationProgramModelError(
      "invalid_plan",
      "GPT-5.6 Sol returned malformed fabrication plan arguments.",
    );
  }
  const expanded = expandFabricationPlan(
    input.intent,
    proposal.plan,
    input.candidateOrdinal,
  );
  if (!expanded.ok) {
    throw new FabricationProgramModelError(
      "invalid_plan",
      "GPT-5.6 Sol returned an invalid fabrication plan.",
    );
  }
  return ProgramProposalV1Schema.parse({
    diversityClaim: proposal.diversityClaim,
    program: expanded.value,
    provenance: {
      modelId: input.modelId,
      modelResponseId: input.response.id,
      planHash: sha256Hex(canonicalSerialize(proposal.plan)),
      expanderVersion: FABRICATION_PLAN_EXPANDER_VERSION,
    },
  });
};
