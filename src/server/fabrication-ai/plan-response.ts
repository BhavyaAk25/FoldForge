import { canonicalSerialize } from "@/core/canonical";
import {
  expandFabricationPlan,
  FABRICATION_PLAN_EXPANDER_VERSION,
} from "@/core/fabrication/planning";
import { expandSemanticFabricationPlan } from "@/core/fabrication/semantic-plan-expansion";
import type { FabricationIntentV1 } from "@/core/fabrication/types";
import { sha256Hex } from "@/core/sha256";

import {
  FabricationPlanProposalV1Schema,
  FabricationPlanProposalV2Schema,
  ProgramProposalV1Schema,
  type ProgramProposalV1,
} from "./contracts";
import {
  FabricationModelContractError,
  type FabricationModelContractErrorCode,
} from "./model-contract-error";

export interface CompletedFabricationPlanResponse {
  readonly id: string;
  readonly status?: string | null;
  readonly output?: readonly unknown[] | null;
}

export class FabricationProgramModelError extends FabricationModelContractError {
  constructor(code: FabricationModelContractErrorCode, message: string) {
    super(code, message);
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
  let rawProposal: unknown;
  try {
    rawProposal = JSON.parse(planCall.arguments);
  } catch {
    throw new FabricationProgramModelError(
      "invalid_plan",
      "GPT-5.6 Sol returned malformed fabrication plan arguments.",
    );
  }
  const semanticProposal =
    FabricationPlanProposalV2Schema.safeParse(rawProposal);
  const legacyProposal = semanticProposal.success
    ? null
    : FabricationPlanProposalV1Schema.safeParse(rawProposal);
  const parsed = (() => {
    if (semanticProposal.success) {
      return {
        proposal: semanticProposal.data,
        expanded: expandSemanticFabricationPlan(
          input.intent,
          semanticProposal.data.plan,
          input.candidateOrdinal,
        ),
      };
    }
    if (legacyProposal?.success) {
      return {
        proposal: legacyProposal.data,
        expanded: expandFabricationPlan(
          input.intent,
          legacyProposal.data.plan,
          input.candidateOrdinal,
        ),
      };
    }
    throw new FabricationProgramModelError(
      "invalid_plan",
      "GPT-5.6 Sol returned malformed fabrication plan arguments.",
    );
  })();
  const { proposal, expanded } = parsed;
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
