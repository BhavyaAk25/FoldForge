import OpenAI from "openai";

import {
  assertLiveEvaluationModelEnabled,
  assertLiveModelEnabled,
} from "@/server/live-model";

let client: OpenAI | null = null;

export const getOpenAIClient = (
  options: { readonly paidEvaluation?: boolean } = {},
): OpenAI => {
  if (options.paidEvaluation) assertLiveEvaluationModelEnabled();
  else assertLiveModelEnabled();

  client ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 60_000,
  });
  return client;
};
