import OpenAI from "openai";
import { z } from "zod";

import { FabricationModelContractError } from "./model-contract-error";

/**
 * Provider-agnostic structured-output client.
 *
 * Every supported provider (Google Gemini, Groq, OpenRouter, Ollama, OpenAI)
 * exposes the OpenAI-compatible Chat Completions endpoint, so one client covers
 * all of them. Only plain JSON mode is used, because free providers differ in
 * how much JSON Schema they accept for strict structured output. The schema is
 * placed in the instructions instead, and the reply is validated with Zod; one
 * corrective retry quotes the validation issues back to the model.
 */

const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";
const DEFAULT_MODEL = "gemini-2.5-flash";
const REQUEST_TIMEOUT_MS = 120_000;
const CORRECTIVE_RETRIES = 1;
const MAXIMUM_REPORTED_ISSUES = 6;

export interface LlmConfiguration {
  readonly apiKey: string;
  readonly baseURL: string;
  readonly model: string;
}

type Environment = Readonly<Record<string, string | undefined>>;

const nonEmpty = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/**
 * Reads the AI configuration. A key is required except for a self-hosted
 * endpoint (for example Ollama on localhost), which accepts any placeholder.
 */
export const llmConfiguration = (
  environment: Environment = process.env,
): LlmConfiguration | null => {
  const apiKey =
    nonEmpty(environment.AI_API_KEY) ?? nonEmpty(environment.GEMINI_API_KEY);
  const baseURL = nonEmpty(environment.AI_BASE_URL);
  if (!apiKey && !baseURL) return null;
  return {
    apiKey: apiKey ?? "not-required",
    baseURL: baseURL ?? GEMINI_OPENAI_BASE_URL,
    model: nonEmpty(environment.AI_MODEL) ?? DEFAULT_MODEL,
  };
};

export const isLlmConfigured = (environment: Environment = process.env) =>
  llmConfiguration(environment) !== null;

export class LlmNotConfiguredError extends Error {
  constructor() {
    super("No AI provider is configured. Set AI_API_KEY (see .env.example).");
    this.name = "LlmNotConfiguredError";
  }
}

export class LlmStructuredOutputError extends FabricationModelContractError {
  constructor(
    message: string,
    readonly issues: readonly string[],
  ) {
    super("invalid_plan", message);
    this.name = "LlmStructuredOutputError";
  }
}

export interface StructuredRequest<Schema extends z.ZodType> {
  readonly schema: Schema;
  readonly schemaName: string;
  readonly instructions: string;
  readonly input: string;
}

export interface StructuredResult<Value> {
  readonly value: Value;
  readonly modelId: string;
  readonly responseId: string;
}

let cachedClient: { readonly key: string; readonly client: OpenAI } | null =
  null;

const clientFor = (configuration: LlmConfiguration): OpenAI => {
  const key = `${configuration.baseURL}\u0000${configuration.apiKey}`;
  if (cachedClient?.key !== key) {
    cachedClient = {
      key,
      client: new OpenAI({
        apiKey: configuration.apiKey,
        baseURL: configuration.baseURL,
        maxRetries: 1,
        timeout: REQUEST_TIMEOUT_MS,
      }),
    };
  }
  return cachedClient.client;
};

/** Accepts bare JSON or JSON wrapped in a Markdown code fence. */
export const extractJsonText = (content: string): string => {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/u.exec(content);
  return (fenced?.[1] ?? content).trim();
};

const describeIssues = (error: z.ZodError): string[] =>
  error.issues
    .slice(0, MAXIMUM_REPORTED_ISSUES)
    .map(
      (issue) =>
        `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`,
    );

type ParseOutcome<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly issues: readonly string[] };

export const parseStructuredContent = <Schema extends z.ZodType>(
  schema: Schema,
  content: string,
): ParseOutcome<z.infer<Schema>> => {
  let raw: unknown;
  try {
    raw = JSON.parse(extractJsonText(content));
  } catch {
    return { ok: false, issues: ["The reply was not valid JSON."] };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, issues: describeIssues(parsed.error) };
};

export const generateStructured = async <Schema extends z.ZodType>(
  request: StructuredRequest<Schema>,
  environment: Environment = process.env,
): Promise<StructuredResult<z.infer<Schema>>> => {
  const configuration = llmConfiguration(environment);
  if (!configuration) throw new LlmNotConfiguredError();
  const client = clientFor(configuration);
  const jsonSchema = JSON.stringify(
    z.toJSONSchema(request.schema, { io: "input", unrepresentable: "any" }),
  );
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `${request.instructions}\n\nReply with one JSON object only, no prose and no Markdown. It must validate against this JSON Schema (${request.schemaName}):\n${jsonSchema}`,
    },
    { role: "user", content: request.input },
  ];

  let lastIssues: readonly string[] = [];
  for (let attempt = 0; attempt <= CORRECTIVE_RETRIES; attempt += 1) {
    const completion = await client.chat.completions.create({
      model: configuration.model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    const content = completion.choices[0]?.message.content ?? "";
    const outcome = parseStructuredContent(request.schema, content);
    if (outcome.ok) {
      return {
        value: outcome.value,
        modelId: configuration.model,
        responseId: completion.id || `${request.schemaName}-${Date.now()}`,
      };
    }
    lastIssues = outcome.issues;
    messages.push(
      { role: "assistant", content },
      {
        role: "user",
        content: `That JSON did not validate:\n- ${outcome.issues.join("\n- ")}\nReturn the corrected JSON object only.`,
      },
    );
  }
  throw new LlmStructuredOutputError(
    `The model did not return a valid ${request.schemaName}.`,
    lastIssues,
  );
};
