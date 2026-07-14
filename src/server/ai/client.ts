import OpenAI from "openai";

import {
  assertLiveModelEnabled,
  isLiveModelEnabled,
} from "@/server/live-model";

let client: OpenAI | null = null;

export const isLiveAiEnabled = (): boolean => isLiveModelEnabled();

export const getOpenAIClient = (): OpenAI => {
  assertLiveModelEnabled();

  client ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 60_000,
  });
  return client;
};
