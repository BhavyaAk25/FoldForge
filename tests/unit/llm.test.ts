import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const create = vi.fn();

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

const {
  LlmNotConfiguredError,
  LlmStructuredOutputError,
  extractJsonText,
  generateStructured,
  llmConfiguration,
  parseStructuredContent,
} = await import("@/server/fabrication-ai/llm");

const Schema = z.object({ name: z.string(), count: z.number().int() }).strict();
const environment = { AI_API_KEY: "test-key" };
const reply = (content: string) => ({
  id: "chatcmpl-1",
  choices: [{ message: { content } }],
});

describe("llmConfiguration", () => {
  it("is null without a key or base URL", () => {
    expect(llmConfiguration({})).toBeNull();
  });

  it("defaults to Gemini's OpenAI-compatible endpoint", () => {
    expect(llmConfiguration({ GEMINI_API_KEY: "k" })).toEqual({
      apiKey: "k",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      model: "gemini-2.5-flash",
    });
  });

  it("allows a keyless self-hosted endpoint", () => {
    expect(
      llmConfiguration({
        AI_BASE_URL: "http://localhost:11434/v1",
        AI_MODEL: "qwen2.5",
      }),
    ).toEqual({
      apiKey: "not-required",
      baseURL: "http://localhost:11434/v1",
      model: "qwen2.5",
    });
  });
});

describe("structured parsing", () => {
  it("strips Markdown fences", () => {
    expect(extractJsonText('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("reports schema issues with paths", () => {
    const outcome = parseStructuredContent(Schema, '{"name":"x","count":1.5}');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.issues[0]).toMatch(/^count:/u);
  });
});

describe("generateStructured", () => {
  beforeEach(() => create.mockReset());

  it("throws when no provider is configured", async () => {
    await expect(
      generateStructured(
        { schema: Schema, schemaName: "S", instructions: "i", input: "u" },
        {},
      ),
    ).rejects.toBeInstanceOf(LlmNotConfiguredError);
  });

  it("retries once with the validation issues, then succeeds", async () => {
    create
      .mockResolvedValueOnce(reply('{"name":"x"}'))
      .mockResolvedValueOnce(reply('{"name":"x","count":2}'));
    const result = await generateStructured(
      { schema: Schema, schemaName: "S", instructions: "i", input: "u" },
      environment,
    );
    expect(result.value).toEqual({ name: "x", count: 2 });
    expect(create).toHaveBeenCalledTimes(2);
    const retryMessages = create.mock.calls[1]?.[0].messages;
    expect(retryMessages.at(-1).content).toContain("count");
  });

  it("fails after the corrective retry is exhausted", async () => {
    create.mockResolvedValue(reply("not json"));
    await expect(
      generateStructured(
        { schema: Schema, schemaName: "S", instructions: "i", input: "u" },
        environment,
      ),
    ).rejects.toBeInstanceOf(LlmStructuredOutputError);
  });
});
