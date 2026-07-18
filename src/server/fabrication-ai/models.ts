import { zodResponsesFunction, zodTextFormat } from "openai/helpers/zod";
import type { ResponseCreateParamsWithTools } from "openai/lib/ResponsesParser";
import type {
  Response as OpenAIResponse,
  ResponseCreateParamsNonStreaming,
  ResponseUsage,
} from "openai/resources/responses/responses";

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
export const FABRICATION_PROGRAM_MAX_OUTPUT_TOKENS = 8_000;

const PROGRAM_BACKGROUND_POLL_INTERVAL_MS = 2_000;
const PROGRAM_BACKGROUND_RETRIEVAL_ATTEMPTS = 3;
const PROGRAM_BACKGROUND_MAX_WAIT_MS = 210_000;
const PROGRAM_BACKGROUND_CREATE_TIMEOUT_MS = 15_000;
const PROGRAM_BACKGROUND_RETRIEVAL_TIMEOUT_MS = 10_000;
const PROGRAM_BACKGROUND_CANCELLATION_RESERVE_MS = 5_000;

const delay = async (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

const retrieveBackgroundResponse = async (
  openAI: ReturnType<typeof getOpenAIClient>,
  responseId: string,
  retrievalDeadlineMs: number,
): Promise<OpenAIResponse | null> => {
  let lastError: unknown = new Error("Background response retrieval failed.");
  for (
    let attempt = 1;
    attempt <= PROGRAM_BACKGROUND_RETRIEVAL_ATTEMPTS;
    attempt += 1
  ) {
    const remainingMs = retrievalDeadlineMs - Date.now();
    if (remainingMs <= 0) return null;
    try {
      return await openAI.responses.retrieve(responseId, undefined, {
        maxRetries: 0,
        timeout: Math.min(PROGRAM_BACKGROUND_RETRIEVAL_TIMEOUT_MS, remainingMs),
      });
    } catch (error) {
      lastError = error;
      if (attempt < PROGRAM_BACKGROUND_RETRIEVAL_ATTEMPTS) {
        // Retrievals do not start model work, so bounded retries improve
        // connection resilience without risking duplicate paid generations.
        const retryDelayMs = Math.min(
          PROGRAM_BACKGROUND_POLL_INTERVAL_MS,
          retrievalDeadlineMs - Date.now(),
        );
        if (retryDelayMs <= 0) return null;
        await delay(retryDelayMs);
      }
    }
  }
  throw lastError;
};

const runBackgroundResponse = async (
  openAI: ReturnType<typeof getOpenAIClient>,
  request: ResponseCreateParamsNonStreaming,
): Promise<OpenAIResponse> => {
  const startedAtMs = Date.now();
  const responseDeadlineMs = startedAtMs + PROGRAM_BACKGROUND_MAX_WAIT_MS;
  const retrievalDeadlineMs =
    responseDeadlineMs - PROGRAM_BACKGROUND_CANCELLATION_RESERVE_MS;
  let response = await openAI.responses.create(request, {
    maxRetries: 0,
    timeout: Math.min(
      PROGRAM_BACKGROUND_CREATE_TIMEOUT_MS,
      retrievalDeadlineMs - startedAtMs,
    ),
  });
  while (response.status === "queued" || response.status === "in_progress") {
    const remainingRetrievalMs = retrievalDeadlineMs - Date.now();
    if (remainingRetrievalMs <= 0) {
      const remainingResponseMs = responseDeadlineMs - Date.now();
      if (remainingResponseMs <= 0) return response;
      return openAI.responses.cancel(response.id, {
        maxRetries: 0,
        timeout: remainingResponseMs,
      });
    }
    await delay(
      Math.min(PROGRAM_BACKGROUND_POLL_INTERVAL_MS, remainingRetrievalMs),
    );
    const retrieved = await retrieveBackgroundResponse(
      openAI,
      response.id,
      retrievalDeadlineMs,
    );
    if (retrieved) response = retrieved;
  }
  return response;
};

const responseOutputText = (response: OpenAIResponse): string => {
  if (
    typeof response.output_text === "string" &&
    response.output_text.length > 0
  ) {
    return response.output_text;
  }
  const texts: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content) {
      if (content.type === "output_text") texts.push(content.text);
    }
  }
  return texts.join("");
};

const runMeteredRequest = async <
  Request extends { readonly max_output_tokens: number },
  Response extends {
    readonly id: string;
    readonly usage?: ResponseUsage | null;
  },
>(input: {
  readonly budget: PaidEvalBudget | null;
  readonly operation: PaidEvalOperation;
  readonly request: Request;
  readonly execute: (request: Request) => Promise<Response>;
}): Promise<Response> => {
  if (!input.budget) return input.execute(input.request);
  return input.budget.run({
    operation: input.operation,
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
    const openAI = getOpenAIClient({
      paidEvaluation: this.usageBudget !== null,
    });
    const response = await runMeteredRequest({
      budget: this.usageBudget,
      operation: "compile_intent",
      request,
      execute: (meteredRequest) => openAI.responses.parse(meteredRequest),
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
    const maxOutputTokens = FABRICATION_PROGRAM_MAX_OUTPUT_TOKENS;
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
      reasoning: { effort: "medium" },
      text: {
        format: zodTextFormat(
          ProgramProposalV1Schema,
          "fabrication_program_proposal_v1",
        ),
      },
      max_output_tokens: maxOutputTokens,
      background: true,
      parallel_tool_calls: false,
      safety_identifier: safetyIdentifier,
      store: false,
      service_tier: "default",
    } satisfies ResponseCreateParamsWithTools;
    const openAI = getOpenAIClient({
      paidEvaluation: this.usageBudget !== null,
    });
    const response = await runMeteredRequest({
      budget: this.usageBudget,
      operation: "generate_program",
      request,
      execute: (meteredRequest) =>
        runBackgroundResponse(openAI, meteredRequest),
    });
    const outputText = responseOutputText(response);
    if (response.status !== "completed" || outputText.length === 0) {
      throw new Error("GPT-5.6 Sol returned no parsed fabrication program.");
    }
    return ProgramProposalV1Schema.parse(JSON.parse(outputText));
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
    const openAI = getOpenAIClient({
      paidEvaluation: this.usageBudget !== null,
    });
    const response = await runMeteredRequest({
      budget: this.usageBudget,
      operation: "diagnose_repair",
      request,
      execute: (meteredRequest) => openAI.responses.parse(meteredRequest),
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
    const openAI = getOpenAIClient({
      paidEvaluation: this.usageBudget !== null,
    });
    const response = await runMeteredRequest({
      budget: this.usageBudget,
      operation: "generate_narrative",
      request,
      execute: (meteredRequest) => openAI.responses.parse(meteredRequest),
    });
    if (!response.output_parsed) {
      throw new Error("GPT-5.6 Sol returned no parsed fabrication narrative.");
    }
    return FabricationNarrativeV1Schema.parse(response.output_parsed);
  }
}
