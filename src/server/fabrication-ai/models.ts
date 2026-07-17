import { zodResponsesFunction, zodTextFormat } from "openai/helpers/zod";
import type { ResponseCreateParamsWithTools } from "openai/lib/ResponsesParser";
import type { ResponseUsage } from "openai/resources/responses/responses";

import { canonicalSerialize } from "@/core/canonical";
import {
  FabricationIntentV1Schema,
  ProgramPatchV1Schema,
} from "@/core/fabrication/schemas";
import type {
  CandidateV2,
  FabricationIntentV1,
  FabricationProgramV1,
  ProgramPatchV1,
  VerificationReportV2,
} from "@/core/fabrication/types";
import { getOpenAIClient } from "@/server/ai/client";
import type {
  PaidEvalBudget,
  PaidEvalOperation,
} from "@/server/ai/paid-eval-budget";

import {
  FabricationNarrativeV1Schema,
  ProgramProposalV1Schema,
  type FabricationNarrativeV1,
  type ProgramProposalV1,
} from "./contracts";
import {
  FABRICATION_INTENT_PROMPT,
  FABRICATION_NARRATIVE_PROMPT,
  FABRICATION_PROGRAM_PROMPT,
  FABRICATION_REPAIR_PROMPT,
} from "./prompts";

export const FOLDFORGE_MODEL = "gpt-5.6-sol";

const runMeteredRequest = async <
  Response extends {
    readonly id: string;
    readonly usage?: ResponseUsage | null;
  },
>(input: {
  readonly budget: PaidEvalBudget | null;
  readonly operation: PaidEvalOperation;
  readonly maxOutputTokens: number;
  readonly request: unknown;
  readonly execute: () => Promise<Response>;
}): Promise<Response> => {
  if (!input.budget) return input.execute();
  return input.budget.run({
    operation: input.operation,
    maxOutputTokens: input.maxOutputTokens,
    request: input.request,
    execute: input.execute,
  });
};

class LiveEvaluationBudgetRequiredError extends Error {
  readonly code = "budget_required";

  constructor() {
    super(
      "Live OpenAI evaluations require the persistent paid-evaluation budget.",
    );
    this.name = "LiveEvaluationBudgetRequiredError";
  }
}

const assertEvaluationBudget = (budget: PaidEvalBudget | null): void => {
  if (process.env.ENABLE_LIVE_OPENAI_EVALS === "true" && !budget) {
    throw new LiveEvaluationBudgetRequiredError();
  }
};

export interface FabricationIntentModel {
  compileIntent(
    prompt: string,
    safetyIdentifier: string,
  ): Promise<FabricationIntentV1>;
}

export interface FabricationProgramModel {
  generateProgram(
    intent: FabricationIntentV1,
    candidateOrdinal: number,
    usedTopologyIds: readonly string[],
    safetyIdentifier: string,
  ): Promise<ProgramProposalV1>;
}

export interface FabricationRepairModel {
  diagnoseRepair(
    program: FabricationProgramV1,
    report: VerificationReportV2,
    repairCycle: number,
    safetyIdentifier: string,
  ): Promise<ProgramPatchV1 | null>;
}

export interface FabricationNarrativeModel {
  generateNarrative(
    candidate: CandidateV2,
    safetyIdentifier: string,
  ): Promise<FabricationNarrativeV1>;
}

export class OpenAIFabricationIntentModel implements FabricationIntentModel {
  constructor(private readonly usageBudget: PaidEvalBudget | null = null) {
    assertEvaluationBudget(usageBudget);
  }

  async compileIntent(
    prompt: string,
    safetyIdentifier: string,
  ): Promise<FabricationIntentV1> {
    const maxOutputTokens = 3_000;
    const request = {
      model: FOLDFORGE_MODEL,
      instructions: FABRICATION_INTENT_PROMPT,
      input: [{ role: "user", content: prompt }],
      reasoning: { effort: "high" },
      text: {
        format: zodTextFormat(
          FabricationIntentV1Schema,
          "fabrication_intent_v1",
        ),
      },
      max_output_tokens: maxOutputTokens,
      parallel_tool_calls: false,
      safety_identifier: safetyIdentifier,
      store: false,
      service_tier: "default",
    } satisfies ResponseCreateParamsWithTools;
    const openAI = getOpenAIClient();
    const response = await runMeteredRequest({
      budget: this.usageBudget,
      operation: "compile_intent",
      maxOutputTokens,
      request,
      execute: () => openAI.responses.parse(request),
    });
    if (!response.output_parsed) {
      throw new Error("GPT-5.6 Sol returned no parsed fabrication intent.");
    }
    return FabricationIntentV1Schema.parse(response.output_parsed);
  }
}

export class OpenAIFabricationProgramModel implements FabricationProgramModel {
  constructor(private readonly usageBudget: PaidEvalBudget | null = null) {
    assertEvaluationBudget(usageBudget);
  }

  async generateProgram(
    intent: FabricationIntentV1,
    candidateOrdinal: number,
    usedTopologyIds: readonly string[],
    safetyIdentifier: string,
  ): Promise<ProgramProposalV1> {
    const maxOutputTokens = 8_000;
    const request = {
      model: FOLDFORGE_MODEL,
      instructions: FABRICATION_PROGRAM_PROMPT,
      input: [
        {
          role: "user",
          content: canonicalSerialize({
            intent,
            candidateOrdinal,
            usedTopologyIds,
          }),
        },
      ],
      reasoning: { effort: "high" },
      text: {
        format: zodTextFormat(
          ProgramProposalV1Schema,
          "fabrication_program_proposal_v1",
        ),
      },
      max_output_tokens: maxOutputTokens,
      parallel_tool_calls: false,
      safety_identifier: safetyIdentifier,
      store: false,
      service_tier: "default",
    } satisfies ResponseCreateParamsWithTools;
    const openAI = getOpenAIClient();
    const response = await runMeteredRequest({
      budget: this.usageBudget,
      operation: "generate_program",
      maxOutputTokens,
      request,
      execute: () => openAI.responses.parse(request),
    });
    if (!response.output_parsed) {
      throw new Error("GPT-5.6 Sol returned no parsed fabrication program.");
    }
    return ProgramProposalV1Schema.parse(response.output_parsed);
  }
}

export class OpenAIFabricationRepairModel implements FabricationRepairModel {
  constructor(private readonly usageBudget: PaidEvalBudget | null = null) {
    assertEvaluationBudget(usageBudget);
  }

  async diagnoseRepair(
    program: FabricationProgramV1,
    report: VerificationReportV2,
    repairCycle: number,
    safetyIdentifier: string,
  ): Promise<ProgramPatchV1 | null> {
    const maxOutputTokens = 2_000;
    const request = {
      model: FOLDFORGE_MODEL,
      instructions: FABRICATION_REPAIR_PROMPT,
      input: [
        {
          role: "user",
          content: canonicalSerialize({ program, report, repairCycle }),
        },
      ],
      reasoning: { effort: "high" },
      tools: [
        zodResponsesFunction({
          name: "apply_parameter_patch",
          description:
            "Propose one bounded patch grounded in deterministic failure fields.",
          parameters: ProgramPatchV1Schema,
        }),
      ],
      tool_choice: { type: "function", name: "apply_parameter_patch" },
      max_output_tokens: maxOutputTokens,
      parallel_tool_calls: false,
      safety_identifier: safetyIdentifier,
      store: false,
      service_tier: "default",
    } satisfies ResponseCreateParamsWithTools;
    const openAI = getOpenAIClient();
    const response = await runMeteredRequest({
      budget: this.usageBudget,
      operation: "diagnose_repair",
      maxOutputTokens,
      request,
      execute: () => openAI.responses.parse(request),
    });
    const toolCall = response.output.find(
      (item) =>
        item.type === "function_call" && item.name === "apply_parameter_patch",
    );
    if (!toolCall || toolCall.type !== "function_call") return null;
    return ProgramPatchV1Schema.parse(JSON.parse(toolCall.arguments));
  }
}

export class OpenAIFabricationNarrativeModel implements FabricationNarrativeModel {
  constructor(private readonly usageBudget: PaidEvalBudget | null = null) {
    assertEvaluationBudget(usageBudget);
  }

  async generateNarrative(
    candidate: CandidateV2,
    safetyIdentifier: string,
  ): Promise<FabricationNarrativeV1> {
    const maxOutputTokens = 2_000;
    const request = {
      model: FOLDFORGE_MODEL,
      instructions: FABRICATION_NARRATIVE_PROMPT,
      input: [{ role: "user", content: canonicalSerialize(candidate) }],
      reasoning: { effort: "medium" },
      text: {
        format: zodTextFormat(
          FabricationNarrativeV1Schema,
          "fabrication_narrative_v1",
        ),
      },
      max_output_tokens: maxOutputTokens,
      parallel_tool_calls: false,
      safety_identifier: safetyIdentifier,
      store: false,
      service_tier: "default",
    } satisfies ResponseCreateParamsWithTools;
    const openAI = getOpenAIClient();
    const response = await runMeteredRequest({
      budget: this.usageBudget,
      operation: "generate_narrative",
      maxOutputTokens,
      request,
      execute: () => openAI.responses.parse(request),
    });
    if (!response.output_parsed) {
      throw new Error("GPT-5.6 Sol returned no parsed fabrication narrative.");
    }
    return FabricationNarrativeV1Schema.parse(response.output_parsed);
  }
}
