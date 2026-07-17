import OpenAI from "openai";

import {
  assertLiveEvaluationModelEnabled,
  assertLiveModelEnabled,
} from "@/server/live-model";

export const OPENAI_PRODUCTION_TIMEOUT_MS = 180_000;
export const OPENAI_PAID_EVALUATION_TIMEOUT_MS = 180_000;

let productionClient: OpenAI | null = null;
let paidEvaluationClient: OpenAI | null = null;

export const getOpenAIClient = (
  options: { readonly paidEvaluation?: boolean } = {},
): OpenAI => {
  if (options.paidEvaluation) {
    assertLiveEvaluationModelEnabled();
    paidEvaluationClient ??= new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 0,
      timeout: OPENAI_PAID_EVALUATION_TIMEOUT_MS,
    });
    return paidEvaluationClient;
  }

  assertLiveModelEnabled();
  productionClient ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: OPENAI_PRODUCTION_TIMEOUT_MS,
  });
  return productionClient;
};
