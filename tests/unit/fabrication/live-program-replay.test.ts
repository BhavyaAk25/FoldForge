import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { canonicalSerialize } from "@/core/canonical";
import { fabricationPlanFromProgram } from "@/core/fabrication/planning";
import { sha256Hex } from "@/core/sha256";
import type { PaidEvalBudgetSnapshot } from "@/server/ai/paid-eval-budget";
import { FOLDFORGE_MODEL } from "@/server/fabrication-ai/models";
import {
  expandRecoveredProgramPlans,
  loadRecoveredProgramPlanCheckpoint,
  requireProgramResponseLedgerEvidence,
  retrieveRecoveredProgramPlans,
} from "../../../scripts/lib/live-program-replay";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

const responseIds = ["resp_one", "resp_two", "resp_three"] as const;
const usage = {
  input_tokens: 1_000,
  input_tokens_details: {
    cache_write_tokens: 100,
    cached_tokens: 200,
  },
  output_tokens: 500,
  output_tokens_details: { reasoning_tokens: 300 },
  total_tokens: 1_500,
} as const;

const proposal = (topologyId: string) => ({
  diversityClaim: `Distinct ${topologyId} structure.`,
  plan: {
    ...fabricationPlanFromProgram(fixtureProgram()),
    topologyId,
  },
});

const checkpoint = () => ({
  version: 1,
  sourceBuildSha: "a".repeat(40),
  entries: responseIds.map((responseId, index) => {
    const recoveredProposal = proposal(`topology-${index + 1}`);
    return {
      responseId,
      planHash: sha256Hex(canonicalSerialize(recoveredProposal.plan)),
      proposal: recoveredProposal,
      usage,
    };
  }),
});

const paidUsage = (): PaidEvalBudgetSnapshot => ({
  budgetUsd: 2,
  chargedCostUsd: 0.3,
  remainingBudgetUsd: 1.7,
  requestCount: 3,
  haltedReason: null,
  pendingReservation: null,
  entries: responseIds.map((responseId, index) => ({
    sequence: index + 1,
    operation: "generate_program" as const,
    responseId,
    outcome: "succeeded" as const,
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.input_tokens_details.cached_tokens,
    cacheWriteTokens: usage.input_tokens_details.cache_write_tokens,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.output_tokens_details.reasoning_tokens,
    providerFailureCategory: null,
    chargedCostUsd: 0.1,
    maximumCostUsd: 0.2,
  })),
});

describe("live paid-program response replay", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
    temporaryDirectories.length = 0;
  });

  const writeCheckpoint = async (value: unknown): Promise<string> => {
    const directory = await mkdtemp(path.join(tmpdir(), "foldforge-replay-"));
    temporaryDirectories.push(directory);
    const checkpointPath = path.join(directory, "checkpoint.json");
    await writeFile(checkpointPath, JSON.stringify(value), "utf8");
    return checkpointPath;
  };

  it("validates extraction-time hashes, ledger usage, and current expansion", async () => {
    const checkpointPath = await writeCheckpoint(checkpoint());
    const recovered = await loadRecoveredProgramPlanCheckpoint(
      checkpointPath,
      responseIds,
    );

    expect(recovered.source).toBe("checkpoint");
    expect(recovered.sourceBuildSha).toBe("a".repeat(40));
    expect(
      requireProgramResponseLedgerEvidence(recovered.entries, paidUsage()),
    ).toHaveLength(3);
    const expanded = expandRecoveredProgramPlans({
      recoveredPlans: recovered,
      intent: fixtureIntent(),
    });
    expect(expanded.map((entry) => entry.provenance.modelResponseId)).toEqual(
      responseIds,
    );
    expect(expanded.map((entry) => entry.program.topologyId)).toEqual([
      "topology-1",
      "topology-2",
      "topology-3",
    ]);
  });

  it("fails closed when a checkpoint plan changed after extraction", async () => {
    const changed = checkpoint();
    changed.entries[0] = {
      ...changed.entries[0]!,
      proposal: proposal("tampered-topology"),
    };
    const checkpointPath = await writeCheckpoint(changed);

    await expect(
      loadRecoveredProgramPlanCheckpoint(checkpointPath, responseIds),
    ).rejects.toThrow("does not match its extraction-time hash");
  });

  it("requires exact explicit response order and exact paid usage", async () => {
    const checkpointPath = await writeCheckpoint(checkpoint());
    await expect(
      loadRecoveredProgramPlanCheckpoint(checkpointPath, [
        responseIds[1],
        responseIds[0],
        responseIds[2],
      ]),
    ).rejects.toThrow("explicit response-ID order");

    const recovered = await loadRecoveredProgramPlanCheckpoint(
      checkpointPath,
      responseIds,
    );
    const mismatched = paidUsage();
    const first = mismatched.entries[0]!;
    const modified: PaidEvalBudgetSnapshot = {
      ...mismatched,
      entries: [
        { ...first, outputTokens: 499 },
        ...mismatched.entries.slice(1),
      ],
    };
    expect(() =>
      requireProgramResponseLedgerEvidence(recovered.entries, modified),
    ).toThrow("usage does not match the paid ledger");
  });

  it("retrieves each existing response exactly once without generation", async () => {
    const retrieve = vi.fn(async (responseId: string) => {
      const index = responseIds.indexOf(
        responseId as (typeof responseIds)[number],
      );
      return {
        id: responseId,
        model: FOLDFORGE_MODEL,
        status: "completed",
        output: [
          {
            type: "function_call",
            name: "submit_fabrication_plan",
            arguments: JSON.stringify(proposal(`retrieved-${index + 1}`)),
          },
        ],
        usage,
      };
    });

    const recovered = await retrieveRecoveredProgramPlans(
      responseIds,
      retrieve,
    );
    expect(retrieve.mock.calls.map((call) => call[0])).toEqual(responseIds);
    expect(retrieve).toHaveBeenCalledTimes(3);
    expect(recovered.source).toBe("responses_retrieve");
  });

  it.each([
    {
      label: "wrong model",
      response: {
        id: responseIds[0],
        model: "gpt-5.6",
        status: "completed",
        output: [],
        usage,
      },
    },
    {
      label: "incomplete response",
      response: {
        id: responseIds[0],
        model: FOLDFORGE_MODEL,
        status: "in_progress",
        output: [],
        usage,
      },
    },
    {
      label: "missing function call",
      response: {
        id: responseIds[0],
        model: FOLDFORGE_MODEL,
        status: "completed",
        output: [],
        usage,
      },
    },
  ])("rejects a $label", async ({ response }) => {
    await expect(
      retrieveRecoveredProgramPlans(responseIds, async () => response),
    ).rejects.toThrow();
  });
});
