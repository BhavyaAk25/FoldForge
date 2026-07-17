import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ResponseUsage } from "openai/resources/responses/responses";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fabricationProgramHash } from "@/core/fabrication/compiler";
import { PaidEvalBudget } from "@/server/ai/paid-eval-budget";
import {
  FOLDFORGE_MODEL,
  OpenAIFabricationIntentModel,
  OpenAIFabricationProgramModel,
  OpenAIFabricationRepairModel,
} from "@/server/fabrication-ai/models";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

const { parseResponse } = vi.hoisted(() => ({
  parseResponse: vi.fn(),
}));

const usage: ResponseUsage = {
  input_tokens: 1_000,
  input_tokens_details: {
    cached_tokens: 200,
    cache_write_tokens: 100,
  },
  output_tokens: 100,
  output_tokens_details: { reasoning_tokens: 60 },
  total_tokens: 1_100,
};

vi.mock("@/server/ai/client", () => ({
  getOpenAIClient: () => ({ responses: { parse: parseResponse } }),
}));

describe("GPT-5.6 Sol fabrication model boundary", () => {
  let temporaryDirectories: string[] = [];

  beforeEach(() => {
    parseResponse.mockReset();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(
      temporaryDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
    temporaryDirectories = [];
  });

  const openBudget = async (budgetUsd: string): Promise<PaidEvalBudget> => {
    const directory = await mkdtemp(path.join(tmpdir(), "foldforge-model-"));
    temporaryDirectories.push(directory);
    return PaidEvalBudget.open({
      ledgerPath: path.join(directory, "live-cost-ledger.json"),
      environment: { LIVE_EVAL_BUDGET_USD: budgetUsd },
    });
  };

  it("compiles intent with strict structured output and privacy controls", async () => {
    parseResponse.mockResolvedValue({ output_parsed: fixtureIntent() });
    const result = await new OpenAIFabricationIntentModel().compileIntent(
      "Make a winged display.",
      "ff_subject",
    );

    expect(result.intentId).toBe("intent-winged-display");
    expect(parseResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: FOLDFORGE_MODEL,
        reasoning: { effort: "high" },
        store: false,
        parallel_tool_calls: false,
        safety_identifier: "ff_subject",
        service_tier: "default",
      }),
    );
    expect(parseResponse.mock.calls[0]?.[0]).not.toHaveProperty(
      "previous_response_id",
    );
  });

  it("generates a complete program through a strict response schema", async () => {
    parseResponse.mockResolvedValue({
      output_parsed: {
        diversityClaim: "Use one direct fold with a grounded base.",
        program: fixtureProgram(),
      },
    });
    const result = await new OpenAIFabricationProgramModel().generateProgram(
      fixtureIntent(),
      1,
      [],
      "ff_subject",
    );

    expect(result.program.programId).toBe("program-winged-display");
    expect(parseResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: FOLDFORGE_MODEL,
        reasoning: { effort: "high" },
        max_output_tokens: 8_000,
        store: false,
        safety_identifier: "ff_subject",
        service_tier: "default",
      }),
    );
  });

  it("accepts only a strict function patch and never treats it as success", async () => {
    const program = fixtureProgram();
    const patch = {
      version: "1",
      patchId: "patch-width",
      programId: program.programId,
      baseProgramHash: fabricationProgramHash(program),
      repairCycle: 1,
      diagnosis: "Reduce the panel width named by the failure.",
      operations: [
        {
          operationId: "operation-width",
          operation: "set_number",
          path: "/blueprint/panels/panel-base/widthMm",
          value: 75,
          expectedCurrentValue: 80,
          unit: "mm",
          failureIds: ["packing.sheet_bounds#panel-base"],
          reason: "The panel exceeds its sheet.",
          expectedEffect: "The panel moves inside the printable bounds.",
        },
      ],
      authoredBy: "ai",
      changesIntent: false,
    } as const;
    parseResponse.mockResolvedValue({
      output: [
        {
          type: "function_call",
          name: "apply_parameter_patch",
          arguments: JSON.stringify(patch),
        },
      ],
    });
    const report = {
      version: "2",
      reportId: "report-repair",
      candidateId: "candidate-repair",
      programId: program.programId,
      irId: "ir:00000000000000000000000000000000",
      irHash: "0".repeat(64),
      valid: false,
      completedStage: "sheet_packing",
      failedAtStage: "sheet_packing",
      checks: [],
      failures: [],
      metrics: [],
      motionSummary: null,
      exportEquivalence: [],
    } as const;

    const result = await new OpenAIFabricationRepairModel().diagnoseRepair(
      program,
      report,
      1,
      "ff_subject",
    );

    expect(result).toEqual(patch);
    expect(parseResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: FOLDFORGE_MODEL,
        tool_choice: {
          type: "function",
          name: "apply_parameter_patch",
        },
        parallel_tool_calls: false,
        store: false,
        service_tier: "default",
      }),
    );
  });

  it("fails closed when the model omits the required patch call", async () => {
    parseResponse.mockResolvedValue({ output: [] });
    const program = fixtureProgram();
    const report = {
      version: "2",
      reportId: "report-repair",
      candidateId: "candidate-repair",
      programId: program.programId,
      irId: "ir:00000000000000000000000000000000",
      irHash: "0".repeat(64),
      valid: false,
      completedStage: "schema",
      failedAtStage: "schema",
      checks: [],
      failures: [],
      metrics: [],
      motionSummary: null,
      exportEquivalence: [],
    } as const;
    await expect(
      new OpenAIFabricationRepairModel().diagnoseRepair(
        program,
        report,
        1,
        "ff_subject",
      ),
    ).resolves.toBeNull();
  });

  it("requires a persistent budget whenever live evaluations are enabled", () => {
    vi.stubEnv("ENABLE_LIVE_OPENAI_EVALS", "true");
    expect(() => new OpenAIFabricationIntentModel()).toThrowError(
      expect.objectContaining({ code: "budget_required" }),
    );
  });

  it("settles response usage before returning a parsed model value", async () => {
    const budget = await openBudget("3.70");
    parseResponse.mockResolvedValue({
      id: "resp-metered-intent",
      usage,
      output_parsed: fixtureIntent(),
    });

    const result = await new OpenAIFabricationIntentModel(budget).compileIntent(
      "Make a winged display.",
      "ff_subject",
    );

    expect(result.intentId).toBe("intent-winged-display");
    expect(budget.snapshot()).toMatchObject({
      chargedCostUsd: 0.007225,
      requestCount: 1,
      haltedReason: null,
      entries: [
        {
          operation: "compile_intent",
          responseId: "resp-metered-intent",
          outcome: "succeeded",
        },
      ],
    });
    await budget.close();
  });

  it("blocks an unaffordable model call before invoking Responses", async () => {
    const budget = await openBudget("0.01");

    await expect(
      new OpenAIFabricationProgramModel(budget).generateProgram(
        fixtureIntent(),
        1,
        [],
        "ff_subject",
      ),
    ).rejects.toMatchObject({ code: "budget_exhausted" });
    expect(parseResponse).not.toHaveBeenCalled();
    await budget.close();
  });
});
