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
      model: "gemini-flash-latest",
      models: [
        "gemini-flash-latest",
        "gemini-3.5-flash",
        "gemini-flash-lite-latest",
        "gemini-3.5-flash-lite",
      ],
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
      models: ["qwen2.5"],
    });
  });

  it("reads a comma-separated model fallback list", () => {
    expect(
      llmConfiguration({ AI_API_KEY: "k", AI_MODEL: " a , b ,," })?.models,
    ).toEqual(["a", "b"]);
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

  it("moves to the next model when one is retired, busy, or rate limited", async () => {
    const unavailable = (status: number) =>
      Object.assign(new Error(`status ${status}`), { status });
    create
      .mockRejectedValueOnce(unavailable(404))
      .mockRejectedValueOnce(unavailable(429))
      .mockResolvedValueOnce(reply('{"name":"x","count":1}'));
    const result = await generateStructured(
      { schema: Schema, schemaName: "S", instructions: "i", input: "u" },
      { AI_API_KEY: "k", AI_MODEL: "retired,limited,working" },
    );
    expect(result.modelId).toBe("working");
    expect(create.mock.calls.map((call) => call[0].model)).toEqual([
      "retired",
      "limited",
      "working",
    ]);
  });

  it("does not hide authentication failures behind fallbacks", async () => {
    create.mockRejectedValueOnce(
      Object.assign(new Error("bad key"), { status: 401 }),
    );
    await expect(
      generateStructured(
        { schema: Schema, schemaName: "S", instructions: "i", input: "u" },
        { AI_API_KEY: "k", AI_MODEL: "a,b" },
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
