import { canonicalSerialize } from "@/core/canonical";
import { compileFabricationProgram } from "@/core/fabrication/compiler";
import {
  expandFabricationPlan,
  FABRICATION_PLAN_EXPANDER_VERSION,
} from "@/core/fabrication/planning";
import { expandResolvedSemanticFabricationPlan } from "@/core/fabrication/semantic-plan-expansion";
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

export interface FabricationProgramFailureDetail {
  readonly phase: "decoding" | "schema" | "expansion";
  readonly code: string;
  readonly path: readonly string[];
  readonly limit?: {
    readonly name: string;
    readonly actual: number;
    readonly maximum: number;
  };
}

export class FabricationProgramModelError extends FabricationModelContractError {
  constructor(
    code: FabricationModelContractErrorCode,
    message: string,
    readonly safeDetail: FabricationProgramFailureDetail | null = null,
  ) {
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

const expansionFailureDetail = (
  error: unknown,
): FabricationProgramFailureDetail => {
  if (typeof error !== "object" || error === null) {
    return { phase: "expansion", code: "unknown", path: [] };
  }
  const record = error as Record<string, unknown>;
  const issues = Array.isArray(record.issues) ? record.issues : [];
  const firstIssue = issues[0];
  const issueRecord =
    typeof firstIssue === "object" && firstIssue !== null
      ? (firstIssue as Record<string, unknown>)
      : null;
  const directPath = Array.isArray(record.path) ? record.path : null;
  const issuePath = Array.isArray(issueRecord?.path) ? issueRecord.path : null;
  const limit =
    record.kind === "limit_exceeded" &&
    typeof record.limit === "string" &&
    typeof record.actual === "number" &&
    typeof record.maximum === "number"
      ? {
          name: record.limit,
          actual: record.actual,
          maximum: record.maximum,
        }
      : null;
  return {
    phase: "expansion",
    code:
      typeof record.code === "string"
        ? record.code
        : typeof record.kind === "string"
          ? record.kind
          : "unknown",
    path: (directPath ?? issuePath ?? []).map(String).slice(0, 12),
    ...(limit ? { limit } : {}),
  };
};

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
      { phase: "decoding", code: "arguments_not_string", path: [] },
    );
  }
  let rawProposal: unknown;
  try {
    rawProposal = JSON.parse(planCall.arguments);
  } catch {
    throw new FabricationProgramModelError(
      "invalid_plan",
      "GPT-5.6 Sol returned malformed fabrication plan arguments.",
      { phase: "decoding", code: "invalid_json", path: [] },
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
        expanded: expandResolvedSemanticFabricationPlan(
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
    const issue = semanticProposal.error.issues[0];
    throw new FabricationProgramModelError(
      "invalid_plan",
      "GPT-5.6 Sol returned malformed fabrication plan arguments.",
      {
        phase: "schema",
        code: issue?.code ?? "unknown",
        path: issue?.path.map(String).slice(0, 12) ?? [],
      },
    );
  })();
  const { proposal, expanded } = parsed;
  if (!expanded.ok) {
    throw new FabricationProgramModelError(
      "invalid_plan",
      "GPT-5.6 Sol returned an invalid fabrication plan.",
      expansionFailureDetail(expanded.error),
    );
  }
  const compiled = compileFabricationProgram(input.intent, expanded.value);
  if (!compiled.ok) {
    throw new FabricationProgramModelError(
      "invalid_plan",
      "GPT-5.6 Sol returned a fabrication plan that did not compile.",
      expansionFailureDetail(compiled.error),
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
