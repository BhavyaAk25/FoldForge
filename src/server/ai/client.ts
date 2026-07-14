import OpenAI from "openai";

let client: OpenAI | null = null;

export const isLiveAiEnabled = (): boolean =>
  process.env.ENABLE_LIVE_OPENAI === "true" &&
  Boolean(process.env.OPENAI_API_KEY);

export const getOpenAIClient = (): OpenAI => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
};
