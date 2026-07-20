import { readFile } from "node:fs/promises";

import { z } from "zod";

import { canonicalSerialize } from "../../src/core/canonical";
import { sha256Hex } from "../../src/core/sha256";
import type { FabricationIntentV1 } from "../../src/core/fabrication/types";
import type { PaidEvalBudgetSnapshot } from "../../src/server/ai/paid-eval-budget";
import {
  FabricationPlanProposalV1Schema,
  type FabricationPlanProposalV1,
  type ProgramProposalV1,
} from "../../src/server/fabrication-ai/contracts";
import { FOLDFORGE_MODEL } from "../../src/server/fabrication-ai/models";
import { fabricationProgramProposalFromResponse } from "../../src/server/fabrication-ai/plan-response";

const ResponseIdSchema = z.string().regex(/^resp_[A-Za-z0-9_-]+$/u);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const TokenCountSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const RecoveredUsageSchema = z
  .object({
    input_tokens: TokenCountSchema,
    input_tokens_details: z
      .object({
        cache_write_tokens: TokenCountSchema,
        cached_tokens: TokenCountSchema,
      })
      .strict(),
    output_tokens: TokenCountSchema,
    output_tokens_details: z
      .object({ reasoning_tokens: TokenCountSchema })
      .strict(),
    total_tokens: TokenCountSchema,
  })
  .strict()
  .superRefine((usage, context) => {
    if (usage.total_tokens !== usage.input_tokens + usage.output_tokens) {
      context.addIssue({
        code: "custom",
        message: "Recovered total tokens do not reconcile.",
      });
    }
  });

const RecoveredProgramPlanCheckpointSchema = z
  .object({
    version: z.literal(1),
    sourceBuildSha: z.string().regex(/^[a-f0-9]{40}$/u),
    entries: z
      .array(
        z
          .object({
            responseId: ResponseIdSchema,
            planHash: Sha256Schema,
            proposal: FabricationPlanProposalV1Schema,
            usage: RecoveredUsageSchema,
          })
          .strict(),
      )
      .length(3),
  })
  .strict();

interface RetrievedProgramResponse {
  readonly id: string;
  readonly model?: string | null;
  readonly status?: string | null;
  readonly output?: readonly unknown[] | null;
  readonly usage?: unknown;
}

export interface RecoveredProgramPlan {
  readonly responseId: string;
  readonly planHash: string;
  readonly proposal: FabricationPlanProposalV1;
  readonly usage: z.infer<typeof RecoveredUsageSchema> | null;
}

export interface RecoveredProgramPlanSet {
  readonly source: "checkpoint" | "responses_retrieve";
  readonly sourceBuildSha: string | null;
  readonly sourceFileSha256: string | null;
  readonly entries: readonly RecoveredProgramPlan[];
}

const requireUniqueOrderedResponseIds = (
  responseIds: readonly string[],
): readonly string[] => {
  const parsed = z.array(ResponseIdSchema).length(3).parse(responseIds);
  if (new Set(parsed).size !== parsed.length) {
    throw new Error("Program response IDs must be unique.");
  }
  return parsed;
};

const requireExactResponseIdOrder = (
  actual: readonly string[],
  expected: readonly string[],
): void => {
  if (
    actual.length !== expected.length ||
    actual.some((responseId, index) => responseId !== expected[index])
  ) {
    throw new Error(
      "Recovered program plans do not match the explicit response-ID order.",
    );
  }
};

const parsePlanFunctionCall = (
  response: RetrievedProgramResponse,
): FabricationPlanProposalV1 => {
  if (response.status !== "completed") {
    throw new Error("A retrieved program response is not completed.");
  }
  if (
    response.model !== FOLDFORGE_MODEL &&
    !response.model?.startsWith(`${FOLDFORGE_MODEL}-`)
  ) {
    throw new Error("A retrieved response was not produced by GPT-5.6 Sol.");
  }
  const calls = (response.output ?? []).filter(
    (
      item,
    ): item is {
      readonly type: "function_call";
      readonly name: "submit_fabrication_plan";
      readonly arguments: string;
    } =>
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      item.type === "function_call" &&
      "name" in item &&
      item.name === "submit_fabrication_plan" &&
      "arguments" in item &&
      typeof item.arguments === "string",
  );
  if (calls.length !== 1) {
    throw new Error(
      "A retrieved response must contain exactly one fabrication plan call.",
    );
  }
  try {
    return FabricationPlanProposalV1Schema.parse(
      JSON.parse(calls[0]?.arguments ?? ""),
    );
  } catch {
    throw new Error("A retrieved fabrication plan is malformed.");
  }
};

export const loadRecoveredProgramPlanCheckpoint = async (
  checkpointPath: string,
  expectedResponseIds: readonly string[],
): Promise<RecoveredProgramPlanSet> => {
  const ids = requireUniqueOrderedResponseIds(expectedResponseIds);
  const contents = await readFile(checkpointPath, "utf8");
  let raw: unknown;
  try {
    raw = JSON.parse(contents) as unknown;
  } catch {
    throw new Error("The recovered-plan checkpoint is not valid JSON.");
  }
  const checkpoint = RecoveredProgramPlanCheckpointSchema.parse(raw);
  requireExactResponseIdOrder(
    checkpoint.entries.map((entry) => entry.responseId),
    ids,
  );
  const entries = checkpoint.entries.map((entry) => {
    const computedPlanHash = sha256Hex(canonicalSerialize(entry.proposal.plan));
    if (computedPlanHash !== entry.planHash) {
      throw new Error(
        `Recovered plan ${entry.responseId} does not match its extraction-time hash.`,
      );
    }
    return entry;
  });
  return {
    source: "checkpoint",
    sourceBuildSha: checkpoint.sourceBuildSha,
    sourceFileSha256: sha256Hex(contents),
    entries,
  };
};

export const retrieveRecoveredProgramPlans = async (
  expectedResponseIds: readonly string[],
  retrieve: (responseId: string) => Promise<unknown>,
): Promise<RecoveredProgramPlanSet> => {
  const ids = requireUniqueOrderedResponseIds(expectedResponseIds);
  const entries: RecoveredProgramPlan[] = [];
  for (const responseId of ids) {
    const raw = await retrieve(responseId);
    if (typeof raw !== "object" || raw === null || !("id" in raw)) {
      throw new Error("A retrieved program response is malformed.");
    }
    const response = raw as RetrievedProgramResponse;
    if (response.id !== responseId) {
      throw new Error("The provider returned an unexpected response ID.");
    }
    const proposal = parsePlanFunctionCall(response);
    const usage = RecoveredUsageSchema.parse(response.usage);
    entries.push({
      responseId,
      planHash: sha256Hex(canonicalSerialize(proposal.plan)),
      proposal,
      usage,
    });
  }
  return {
    source: "responses_retrieve",
    sourceBuildSha: null,
    sourceFileSha256: null,
    entries,
  };
};

export const requireProgramResponseLedgerEvidence = (
  entries: readonly RecoveredProgramPlan[],
  paidUsage: PaidEvalBudgetSnapshot,
): ReadonlyArray<PaidEvalBudgetSnapshot["entries"][number]> =>
  entries.map((entry) => {
    const matches = paidUsage.entries.filter(
      (candidate) =>
        candidate.responseId === entry.responseId &&
        candidate.operation === "generate_program" &&
        candidate.outcome === "succeeded",
    );
    if (matches.length !== 1) {
      throw new Error(
        `Program response ${entry.responseId} is not bound to exactly one successful paid generation.`,
      );
    }
    const match = matches[0];
    if (
      !match ||
      match.inputTokens === null ||
      match.cachedInputTokens === null ||
      match.cacheWriteTokens === null ||
      match.outputTokens === null ||
      match.reasoningTokens === null
    ) {
      throw new Error(
        `Program response ${entry.responseId} has incomplete paid usage.`,
      );
    }
    if (
      entry.usage &&
      (entry.usage.input_tokens !== match.inputTokens ||
        entry.usage.input_tokens_details.cached_tokens !==
          match.cachedInputTokens ||
        entry.usage.input_tokens_details.cache_write_tokens !==
          match.cacheWriteTokens ||
        entry.usage.output_tokens !== match.outputTokens ||
        entry.usage.output_tokens_details.reasoning_tokens !==
          match.reasoningTokens)
    ) {
      throw new Error(
        `Program response ${entry.responseId} usage does not match the paid ledger.`,
      );
    }
    return match;
  });

export const expandRecoveredProgramPlans = (input: {
  readonly recoveredPlans: RecoveredProgramPlanSet;
  readonly intent: FabricationIntentV1;
}): readonly ProgramProposalV1[] =>
  input.recoveredPlans.entries.map((entry, index) => {
    const proposal = fabricationProgramProposalFromResponse({
      response: {
        id: entry.responseId,
        status: "completed",
        output: [
          {
            type: "function_call",
            name: "submit_fabrication_plan",
            arguments: JSON.stringify(entry.proposal),
          },
        ],
      },
      intent: input.intent,
      candidateOrdinal: index + 1,
      modelId: FOLDFORGE_MODEL,
    });
    if (proposal.provenance.planHash !== entry.planHash) {
      throw new Error(
        `Expanded plan ${entry.responseId} changed from its recovered hash.`,
      );
    }
    return proposal;
  });
