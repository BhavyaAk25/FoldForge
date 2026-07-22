import { canonicalSerialize } from "@/core/canonical";
import { templateSpecForIntent } from "@/core/fabrication/design-templates";
import {
  FABRICATION_SYNTHESIZER_VERSION,
  synthesizeFabricationDesign,
} from "@/core/fabrication/design-synthesis";
import { FABRICATION_PLAN_EXPANDER_VERSION } from "@/core/fabrication/planning";
import type { FabricationIntentV1 } from "@/core/fabrication/types";
import { sha256Hex } from "@/core/sha256";

import {
  FabricationDesignSpecProposalV3Schema,
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
  readonly message?: string;
  readonly behavior?: FabricationIntentV1["behavior"];
  readonly planHash?: string;
  readonly topologyId?: string;
  readonly resolverEvaluationCount?: number;
  readonly proposalCount?: number;
  readonly proposalFailures?: readonly {
    readonly proposalIndex: number;
    readonly planHash: string;
    readonly structuralFingerprint: string | null;
    readonly code: string;
  }[];
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

interface FabricationDesignSpecFunctionCallCandidate {
  readonly type: "function_call";
  readonly name: "submit_fabrication_design_spec";
  readonly arguments?: unknown;
}

const isDesignSpecFunctionCall = (
  item: unknown,
): item is FabricationDesignSpecFunctionCallCandidate =>
  typeof item === "object" &&
  item !== null &&
  "type" in item &&
  item.type === "function_call" &&
  "name" in item &&
  item.name === "submit_fabrication_design_spec";

export const fabricationProgramProposalFromResponse = (input: {
  readonly response: CompletedFabricationPlanResponse;
  readonly intent: FabricationIntentV1;
  readonly candidateOrdinal: number;
  readonly modelId: string;
}): ProgramProposalV1 => {
  if (input.response.status !== "completed") {
    throw new FabricationProgramModelError(
      "model_incomplete",
      "GPT-5.6 Sol did not complete the fabrication design specification.",
    );
  }
  const calls = (input.response.output ?? []).filter(isDesignSpecFunctionCall);
  const call = calls[0];
  if (!call) {
    throw new FabricationProgramModelError(
      "missing_plan_call",
      "GPT-5.6 Sol returned no fabrication design specification call.",
    );
  }
  if (calls.length !== 1) {
    throw new FabricationProgramModelError(
      "duplicate_plan_call",
      "GPT-5.6 Sol returned more than one fabrication design specification call.",
    );
  }
  if (typeof call.arguments !== "string") {
    throw new FabricationProgramModelError(
      "invalid_plan",
      "GPT-5.6 Sol returned malformed fabrication design specification arguments.",
      { phase: "decoding", code: "arguments_not_string", path: [] },
    );
  }
  let rawSpec: unknown;
  try {
    rawSpec = JSON.parse(call.arguments);
  } catch {
    throw new FabricationProgramModelError(
      "invalid_plan",
      "GPT-5.6 Sol returned malformed fabrication design specification arguments.",
      { phase: "decoding", code: "invalid_json", path: [] },
    );
  }
  const parsed = FabricationDesignSpecProposalV3Schema.safeParse(rawSpec);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new FabricationProgramModelError(
      "invalid_plan",
      "GPT-5.6 Sol returned an invalid fabrication design specification.",
      {
        phase: "schema",
        code: issue?.code ?? "contract_invalid",
        path: issue?.path.map(String).slice(0, 12) ?? [],
        ...(issue?.message ? { message: issue.message.slice(0, 500) } : {}),
      },
    );
  }
  // From-scratch synthesis of the model's spec runs first. If it exhausts, fall
  // back to a proven parametric template for the object class, fit to the user's
  // dimensions, so a common request still yields a real, verified, buildable
  // design instead of an error. Only fail when both paths fail.
  const primary = synthesizeFabricationDesign(
    input.intent,
    parsed.data.designSpec,
    input.candidateOrdinal,
  );
  let chosenSpec: unknown = parsed.data.designSpec;
  let synthesized = primary;
  if (!primary.ok) {
    const templateSpec = templateSpecForIntent(input.intent);
    if (templateSpec) {
      const templated = synthesizeFabricationDesign(
        input.intent,
        templateSpec,
        input.candidateOrdinal,
      );
      if (templated.ok) {
        synthesized = templated;
        chosenSpec = templateSpec;
      }
    }
  }
  const specHash = sha256Hex(canonicalSerialize(chosenSpec));
  if (!synthesized.ok) {
    // Only reached when BOTH from-scratch synthesis and any parametric template
    // fail — a genuinely unbuildable request. Log the exact inputs (no secrets)
    // so the residual case can be reproduced and covered offline.
    try {
      console.error(
        `FOLDFORGE_SPEC_CAPTURE_BEGIN ${JSON.stringify({
          error: synthesized.error,
          templateAttempted: templateSpecForIntent(input.intent) !== null,
          intent: input.intent,
          designSpec: parsed.data.designSpec,
        })} FOLDFORGE_SPEC_CAPTURE_END`,
      );
    } catch {
      // Diagnostic logging must never affect request handling.
    }
    throw new FabricationProgramModelError(
      "invalid_plan",
      synthesized.error.message,
      {
        phase: "expansion",
        code: synthesized.error.code,
        path: synthesized.error.path,
        message: synthesized.error.message.slice(0, 500),
        behavior: input.intent.behavior,
        planHash: specHash,
        resolverEvaluationCount: synthesized.error.evaluatedCandidateCount,
        proposalCount: 1,
        proposalFailures: synthesized.error.terminalFailureCodes.map(
          (code, proposalIndex) => ({
            proposalIndex,
            planHash: specHash,
            structuralFingerprint: null,
            code,
          }),
        ),
      },
    );
  }
  return ProgramProposalV1Schema.parse({
    diversityClaim: parsed.data.diversityClaim,
    program: synthesized.value,
    provenance: {
      modelId: input.modelId,
      modelResponseId: input.response.id,
      planHash: specHash,
      expanderVersion: FABRICATION_PLAN_EXPANDER_VERSION,
      synthesizerVersion: FABRICATION_SYNTHESIZER_VERSION,
      proposalCount: 1,
      evaluatedProposalCount: 1,
      selectedProposalIndex: 0,
      synthesisEvaluationCount: synthesized.diagnostics.evaluatedCandidateCount,
      synthesisNogoodCount: synthesized.diagnostics.nogoodCount,
      terminalFailureCodes: synthesized.diagnostics.terminalFailureCodes,
    },
  });
};
