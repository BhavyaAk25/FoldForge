import { canonicalSerialize } from "@/core/canonical";
import type { FabricationDesignSpecV3 } from "@/core/fabrication/design-spec";
import { templateSpecForIntent } from "@/core/fabrication/design-templates";
import {
  FABRICATION_SYNTHESIZER_VERSION,
  synthesizeFabricationDesign,
} from "@/core/fabrication/design-synthesis";
import { FABRICATION_PLAN_EXPANDER_VERSION } from "@/core/fabrication/planning";
import type { FabricationIntentV1 } from "@/core/fabrication/types";
import { sha256Hex } from "@/core/sha256";

import { ProgramProposalV1Schema, type ProgramProposalV1 } from "./contracts";
import {
  FabricationModelContractError,
  type FabricationModelContractErrorCode,
} from "./model-contract-error";

/** Model identifier recorded when no language model was involved. */
export const TEMPLATE_MODEL_ID = "none (parametric template)";

export interface FabricationProgramFailureDetail {
  readonly phase: "decoding" | "schema" | "expansion";
  readonly code: string;
  readonly path: readonly string[];
  readonly message?: string;
  readonly behavior?: FabricationIntentV1["behavior"];
  readonly planHash?: string;
  readonly resolverEvaluationCount?: number;
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

type Synthesized = Extract<
  ReturnType<typeof synthesizeFabricationDesign>,
  { readonly ok: true }
>;

const proposalFor = (input: {
  readonly synthesized: Synthesized;
  readonly spec: FabricationDesignSpecV3;
  readonly diversityClaim: string;
  readonly modelId: string;
  readonly responseId: string;
  readonly generationSource: "synthesis" | "template";
}): ProgramProposalV1 =>
  ProgramProposalV1Schema.parse({
    diversityClaim: input.diversityClaim,
    program: input.synthesized.value,
    provenance: {
      modelId: input.modelId,
      modelResponseId: input.responseId,
      planHash: sha256Hex(canonicalSerialize(input.spec)),
      expanderVersion: FABRICATION_PLAN_EXPANDER_VERSION,
      synthesizerVersion: FABRICATION_SYNTHESIZER_VERSION,
      proposalCount: 1,
      evaluatedProposalCount: 1,
      selectedProposalIndex: 0,
      synthesisEvaluationCount:
        input.synthesized.diagnostics.evaluatedCandidateCount,
      synthesisNogoodCount: input.synthesized.diagnostics.nogoodCount,
      terminalFailureCodes: input.synthesized.diagnostics.terminalFailureCodes,
      generationSource: input.generationSource,
    },
  });

/**
 * Builds a proposal from a parametric template fitted to the intent's size, or
 * returns null when no template class matches. Used both when no AI provider
 * is configured and when the model's own spec cannot be synthesized.
 */
export const templateProgramProposal = (
  intent: FabricationIntentV1,
  candidateOrdinal: number,
  modelId: string = TEMPLATE_MODEL_ID,
  responseId = `template-${intent.intentId}`,
): ProgramProposalV1 | null => {
  const templateSpec = templateSpecForIntent(intent);
  if (!templateSpec) return null;
  const synthesized = synthesizeFabricationDesign(
    intent,
    templateSpec,
    candidateOrdinal,
  );
  if (!synthesized.ok) return null;
  return proposalFor({
    synthesized,
    spec: templateSpec,
    diversityClaim: `Parametric ${templateSpec.label.toLowerCase()} template fitted to the requested size.`,
    modelId,
    responseId,
    generationSource: "template",
  });
};

/**
 * Synthesizes the model's design spec into a verified program. When the
 * from-scratch synthesis exhausts, a matching parametric template fitted to
 * the user's dimensions is tried before failing, and the result records
 * `generationSource: "template"` so it is never mistaken for model geometry.
 */
export const programProposalFromDesignSpec = (input: {
  readonly proposal: {
    readonly diversityClaim: string;
    readonly designSpec: FabricationDesignSpecV3;
  };
  readonly intent: FabricationIntentV1;
  readonly candidateOrdinal: number;
  readonly modelId: string;
  readonly responseId: string;
}): ProgramProposalV1 => {
  const spec = input.proposal.designSpec;
  const primary = synthesizeFabricationDesign(
    input.intent,
    spec,
    input.candidateOrdinal,
  );
  if (primary.ok) {
    return proposalFor({
      synthesized: primary,
      spec,
      diversityClaim: input.proposal.diversityClaim,
      modelId: input.modelId,
      responseId: input.responseId,
      generationSource: "synthesis",
    });
  }
  const templated = templateProgramProposal(
    input.intent,
    input.candidateOrdinal,
    input.modelId,
    input.responseId,
  );
  if (templated) return templated;
  throw new FabricationProgramModelError(
    "invalid_plan",
    primary.error.message,
    {
      phase: "expansion",
      code: primary.error.code,
      path: primary.error.path,
      message: primary.error.message.slice(0, 500),
      behavior: input.intent.behavior,
      planHash: sha256Hex(canonicalSerialize(spec)),
      resolverEvaluationCount: primary.error.evaluatedCandidateCount,
    },
  );
};
