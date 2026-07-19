import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ResponseUsage } from "openai/resources/responses/responses";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fabricationProgramHash } from "@/core/fabrication/compiler";
import { canonicalSerialize } from "@/core/canonical";
import { buildFabricationCandidate } from "@/core/fabrication/candidate";
import { FABRICATION_PLAN_EXPANDER_VERSION } from "@/core/fabrication/planning";
import { sha256Hex } from "@/core/sha256";
import { PaidEvalBudget } from "@/server/ai/paid-eval-budget";
import {
  FABRICATION_INTENT_MAX_OUTPUT_TOKENS,
  FABRICATION_PROGRAM_MAX_OUTPUT_TOKENS,
  FOLDFORGE_MODEL,
  OpenAIFabricationIntentModel,
  OpenAIFabricationProgramModel,
  OpenAIFabricationRepairModel,
  fabricationNarrativeInput,
  fabricationPlanningInput,
  fabricationSemanticReferenceKeys,
} from "@/server/fabrication-ai/models";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";
import {
  fixtureLiveAcceptancePlan,
  fixtureSemanticPlan,
} from "../../fixtures/semantic-plan";

const {
  cancelResponse,
  createResponse,
  getClient,
  parseResponse,
  retrieveResponse,
} = vi.hoisted(() => ({
  cancelResponse: vi.fn(),
  createResponse: vi.fn(),
  getClient: vi.fn(),
  parseResponse: vi.fn(),
  retrieveResponse: vi.fn(),
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

const planFunctionOutput = (diversityClaim: string) => [
  {
    type: "function_call",
    name: "submit_fabrication_plan",
    arguments: JSON.stringify({
      diversityClaim,
      plan: fixtureSemanticPlan(),
    }),
  },
];

vi.mock("@/server/ai/client", () => ({
  getOpenAIClient: getClient,
}));

describe("GPT-5.6 Sol fabrication model boundary", () => {
  let temporaryDirectories: string[] = [];

  beforeEach(() => {
    cancelResponse.mockReset();
    createResponse.mockReset();
    parseResponse.mockReset();
    retrieveResponse.mockReset();
    getClient.mockReset();
    getClient.mockReturnValue({
      responses: {
        cancel: cancelResponse,
        create: createResponse,
        parse: parseResponse,
        retrieve: retrieveResponse,
      },
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
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
        reasoning: { effort: "medium" },
        max_output_tokens: FABRICATION_INTENT_MAX_OUTPUT_TOKENS,
        store: false,
        parallel_tool_calls: false,
        safety_identifier: "ff_subject",
        service_tier: "default",
      }),
    );
    expect(parseResponse.mock.calls[0]?.[0]).not.toHaveProperty(
      "previous_response_id",
    );
    expect(parseResponse.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        instructions: expect.stringContaining(
          "flat-storage requirements such as folding, collapsing, or returning flat require a fold_flat constraint",
        ),
      }),
    );
    expect(parseResponse.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        instructions: expect.stringContaining(
          "maximumStackThicknessMm to the selected stock thickness multiplied by fabricationBudget.maximumPanels",
        ),
      }),
    );
    expect(parseResponse.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        instructions: expect.stringContaining(
          "Unsupported scope takes precedence over missing dimensions or materials",
        ),
      }),
    );
    expect(getClient).toHaveBeenCalledWith({ paidEvaluation: false });
  });

  it("classifies a truncated intent response as an incomplete model contract", async () => {
    parseResponse.mockResolvedValue({ output_parsed: null });

    await expect(
      new OpenAIFabricationIntentModel().compileIntent(
        "Make a playing-card box.",
        "ff_subject",
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "model_incomplete",
        name: "FabricationIntentModelError",
      }),
    );
  });

  it("generates a complete program through a strict response schema", async () => {
    createResponse.mockResolvedValue({
      id: "resp-program",
      status: "completed",
      output: planFunctionOutput("Use one direct fold with a grounded base."),
    });
    const result = await new OpenAIFabricationProgramModel().generateProgram(
      fixtureIntent(),
      1,
      [],
      "ff_subject",
    );

    expect(result.program).toMatchObject({
      intentId: "intent-winged-display",
      topologyId: "topology-two-panel-fold",
    });
    expect(result.provenance).toEqual({
      modelId: FOLDFORGE_MODEL,
      modelResponseId: "resp-program",
      planHash: sha256Hex(canonicalSerialize(fixtureSemanticPlan())),
      expanderVersion: FABRICATION_PLAN_EXPANDER_VERSION,
    });
    expect(createResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: FOLDFORGE_MODEL,
        instructions: expect.stringContaining(
          "choose the simplest verification-friendly construction",
        ),
        reasoning: { effort: "low" },
        max_output_tokens: FABRICATION_PROGRAM_MAX_OUTPUT_TOKENS,
        background: true,
        store: false,
        safety_identifier: "ff_subject",
        service_tier: "default",
        tool_choice: {
          type: "function",
          name: "submit_fabrication_plan",
        },
        tools: [
          expect.objectContaining({
            type: "function",
            name: "submit_fabrication_plan",
            strict: true,
          }),
        ],
      }),
      { maxRetries: 0, timeout: 15_000 },
    );
    expect(createResponse.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        instructions: expect.stringContaining(
          "Never author flat transforms, packing coordinates, global axes or origins, quaternions",
        ),
      }),
    );
    expect(createResponse.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        instructions: expect.stringContaining(
          "Code owns canonical identifiers, non-overlapping sheet packing",
        ),
      }),
    );
    expect(createResponse.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        instructions: expect.stringContaining(
          "rectangle vertices [(0,0),(1,0),(1,1),(0,1)]: edges 0 top, 1 right, 2 bottom, 3 left",
        ),
      }),
    );
    expect(createResponse.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        instructions: expect.stringContaining(
          "canonical panel-front maps to panel key front",
        ),
      }),
    );
    expect(createResponse.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        instructions: expect.stringContaining(
          "perform a silent deterministic-expansion audit",
        ),
      }),
    );
  });

  it("allows a smaller explicit output ceiling for bounded live acceptance", async () => {
    createResponse.mockResolvedValue({
      id: "resp-capped-program",
      status: "completed",
      output: planFunctionOutput("Use one bounded fold."),
    });

    await new OpenAIFabricationProgramModel(null, 4_000).generateProgram(
      fixtureIntent(),
      1,
      [],
      "ff_subject",
    );

    expect(createResponse).toHaveBeenCalledWith(
      expect.objectContaining({ max_output_tokens: 4_000 }),
      expect.anything(),
    );
    expect(() => new OpenAIFabricationProgramModel(null, 999)).toThrow(
      "between 1000",
    );
  });

  it("leaves conservative reasoning headroom above representative semantic JSON", () => {
    const largestVisibleTokenEstimate = Math.ceil(
      Buffer.byteLength(
        JSON.stringify({
          diversityClaim: "A concise topology-specific proposal.",
          plan: fixtureLiveAcceptancePlan(),
        }),
        "utf8",
      ) / 3,
    );

    expect(largestVisibleTokenEstimate).toBeLessThanOrEqual(
      FABRICATION_PROGRAM_MAX_OUTPUT_TOKENS / 2,
    );
  });

  it("preserves the exact request alongside the compact normalized brief", () => {
    const intent = fixtureIntent();
    const input = fabricationPlanningInput(intent, []);
    const serialized = canonicalSerialize(input);

    expect(input).toMatchObject({
      designBrief: {
        objectLabel: intent.objectLabel,
        requestedSize: intent.requestedSize,
        stockOptions: intent.stockOptions,
      },
      exactRequirements: intent.sourcePrompt,
      semanticReferenceKeys: [],
      diversity: null,
    });
    expect(serialized).toContain(intent.sourcePrompt);
    expect(serialized).not.toContain(intent.intentId);
    expect(serialized).not.toContain('"scopeStatus"');
    expect(serialized).not.toContain('"clarificationQuestion"');
    expect(serialized).not.toContain('"unsupportedReason"');
    expect(serialized).not.toContain('"candidateOrdinal"');
    expect(serialized).not.toContain('"usedTopologyIds"');

    expect(fabricationPlanningInput(intent, ["topology-used"])).toMatchObject({
      diversity: { topologyIdsAlreadyUsed: ["topology-used"] },
    });
  });

  it("normalizes canonical intent references to unprefixed semantic keys", () => {
    const base = fixtureIntent();
    const intent = {
      ...base,
      semanticConstraints: [
        {
          constraintId: "contact-lid-front",
          kind: "contact" as const,
          hard: true,
          source: "user" as const,
          geometryRefs: [
            { kind: "panel" as const, id: "panel-front" },
            { kind: "panel" as const, id: "panel-panel-lid" },
            { kind: "connector" as const, id: "connector-lid-lock-tab" },
            { kind: "connector" as const, id: "connector-lid-lock-slot" },
          ],
          minimumAreaMm2: 0,
          during: "rest" as const,
        },
        {
          constraintId: "motion-lid",
          kind: "motion" as const,
          hard: true,
          source: "user" as const,
          outputId: "output-output-lid",
          minimumValue: 0,
          maximumValue: 90,
          unit: "deg" as const,
        },
      ],
    };

    expect(fabricationSemanticReferenceKeys(intent)).toEqual([
      {
        canonicalId: "connector-lid-lock-slot",
        semanticKind: "connector_relationship",
        semanticKey: "lid-lock",
        connectorMember: "slot",
      },
      {
        canonicalId: "connector-lid-lock-tab",
        semanticKind: "connector_relationship",
        semanticKey: "lid-lock",
        connectorMember: "tab",
      },
      {
        canonicalId: "output-output-lid",
        semanticKind: "output",
        semanticKey: "lid",
        connectorMember: null,
      },
      {
        canonicalId: "panel-front",
        semanticKind: "panel",
        semanticKey: "front",
        connectorMember: null,
      },
      {
        canonicalId: "panel-panel-lid",
        semanticKind: "panel",
        semanticKey: "lid",
        connectorMember: null,
      },
    ]);
  });

  it("builds narrative input without resending compiled coordinates", () => {
    const candidate = buildFabricationCandidate({
      candidateId: "candidate-narrative-input",
      intent: fixtureIntent(),
      program: fixtureProgram(),
      selectionStatus: "selected",
      provenance: {
        compilerVersion: "foldforge-test",
        generatedAtIso: "2026-07-18T00:00:00.000Z",
        deterministicSeed: 2_026_071_8,
        modelId: FOLDFORGE_MODEL,
        modelResponseId: "resp-narrative-input",
        modelPlanHash: "a".repeat(64),
        planExpanderVersion: FABRICATION_PLAN_EXPANDER_VERSION,
        parentCandidateId: null,
        appliedPatchIds: [],
        repairCycle: 0,
      },
    });
    expect(candidate.ok).toBe(true);
    if (!candidate.ok) return;

    const compact = canonicalSerialize(
      fabricationNarrativeInput(candidate.value),
    );
    const complete = canonicalSerialize(candidate.value);
    expect(compact).not.toContain('"vertices"');
    expect(compact).not.toContain('"paths"');
    expect(compact.length).toBeLessThan(complete.length / 2);
  });

  it("polls a background program without retrying model generation", async () => {
    vi.useFakeTimers();
    createResponse.mockResolvedValue({
      id: "resp-background-program",
      status: "queued",
      output_text: "",
    });
    retrieveResponse.mockResolvedValue({
      id: "resp-background-program",
      status: "completed",
      output: planFunctionOutput("Use a polled background response."),
    });

    const resultPromise = new OpenAIFabricationProgramModel().generateProgram(
      fixtureIntent(),
      1,
      [],
      "ff_subject",
    );
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toMatchObject({
      program: { intentId: "intent-winged-display" },
    });
    expect(createResponse).toHaveBeenCalledTimes(1);
    expect(retrieveResponse).toHaveBeenCalledTimes(1);
    expect(retrieveResponse).toHaveBeenCalledWith(
      "resp-background-program",
      undefined,
      { maxRetries: 0, timeout: 10_000 },
    );
  });

  it("retries only background retrieval after a transient connection error", async () => {
    vi.useFakeTimers();
    createResponse.mockResolvedValue({
      id: "resp-background-retry",
      status: "in_progress",
      output_text: "",
    });
    retrieveResponse
      .mockRejectedValueOnce(new Error("temporary retrieval failure"))
      .mockResolvedValue({
        id: "resp-background-retry",
        status: "completed",
        output: planFunctionOutput("Retrieve the existing generation again."),
      });

    const resultPromise = new OpenAIFabricationProgramModel().generateProgram(
      fixtureIntent(),
      1,
      [],
      "ff_subject",
    );
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toMatchObject({
      program: { intentId: "intent-winged-display" },
    });
    expect(createResponse).toHaveBeenCalledTimes(1);
    expect(retrieveResponse).toHaveBeenCalledTimes(2);
  });

  it("rejects a terminal background response without a complete program", async () => {
    createResponse.mockResolvedValue({
      id: "resp-background-failed",
      status: "failed",
      output_text: "",
    });

    await expect(
      new OpenAIFabricationProgramModel().generateProgram(
        fixtureIntent(),
        1,
        [],
        "ff_subject",
      ),
    ).rejects.toMatchObject({ code: "model_incomplete" });
    expect(createResponse).toHaveBeenCalledTimes(1);
    expect(retrieveResponse).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "a missing tool call",
      output: [],
      code: "missing_plan_call",
    },
    {
      label: "the wrong tool call",
      output: [
        {
          type: "function_call",
          name: "unrelated_tool",
          arguments: "{}",
        },
      ],
      code: "missing_plan_call",
    },
    {
      label: "malformed arguments",
      output: [
        {
          type: "function_call",
          name: "submit_fabrication_plan",
          arguments: "{",
        },
      ],
      code: "invalid_plan",
    },
    {
      label: "duplicate plan calls",
      output: [
        ...planFunctionOutput("First plan."),
        ...planFunctionOutput("Second plan."),
      ],
      code: "duplicate_plan_call",
    },
    {
      label: "one valid and one malformed duplicate plan call",
      output: [
        ...planFunctionOutput("First plan."),
        {
          type: "function_call",
          name: "submit_fabrication_plan",
          arguments: null,
        },
      ],
      code: "duplicate_plan_call",
    },
    {
      label: "an unresolved plan",
      output: [
        {
          type: "function_call",
          name: "submit_fabrication_plan",
          arguments: JSON.stringify({
            diversityClaim: "Use a missing sheet.",
            plan: {
              ...fixtureSemanticPlan(),
              panels: fixtureSemanticPlan().panels.map((panel) => ({
                ...panel,
                sheetIndex: 3,
              })),
            },
          }),
        },
      ],
      code: "invalid_plan",
    },
  ])("fails closed for $label", async ({ output, code }) => {
    createResponse.mockResolvedValue({
      id: "resp-invalid-plan-call",
      status: "completed",
      output,
    });

    await expect(
      new OpenAIFabricationProgramModel().generateProgram(
        fixtureIntent(),
        1,
        [],
        "ff_subject",
      ),
    ).rejects.toMatchObject({ code });
  });

  it("retains only a bounded safe mapping diagnostic for an invalid plan", async () => {
    createResponse.mockResolvedValue({
      id: "resp-invalid-plan-detail",
      status: "completed",
      output: [
        {
          type: "function_call",
          name: "submit_fabrication_plan",
          arguments: JSON.stringify({
            diversityClaim: "Use a missing sheet.",
            plan: {
              ...fixtureSemanticPlan(),
              panels: fixtureSemanticPlan().panels.map((panel) => ({
                ...panel,
                sheetIndex: 3,
              })),
            },
          }),
        },
      ],
    });

    await expect(
      new OpenAIFabricationProgramModel().generateProgram(
        fixtureIntent(),
        1,
        [],
        "ff_subject",
      ),
    ).rejects.toMatchObject({
      code: "invalid_plan",
      safeDetail: {
        phase: "expansion",
        code: "invalid_reference",
        path: ["panels", expect.any(String), "sheetIndex"],
      },
    });
  });

  it("cancels program polling at the route-safe deadline", async () => {
    vi.useFakeTimers();
    createResponse.mockResolvedValue({
      id: "resp-background-timeout",
      status: "queued",
      output_text: "",
    });
    retrieveResponse.mockResolvedValue({
      id: "resp-background-timeout",
      status: "in_progress",
      output_text: "",
    });
    cancelResponse.mockResolvedValue({
      id: "resp-background-timeout",
      status: "cancelled",
      output_text: "",
    });

    const resultPromise = new OpenAIFabricationProgramModel().generateProgram(
      fixtureIntent(),
      1,
      [],
      "ff_subject",
    );
    const assertion = expect(resultPromise).rejects.toMatchObject({
      code: "model_incomplete",
    });
    await vi.runAllTimersAsync();

    await assertion;
    expect(createResponse).toHaveBeenCalledTimes(1);
    expect(cancelResponse).toHaveBeenCalledTimes(1);
    expect(cancelResponse.mock.calls[0]?.[0]).toBe("resp-background-timeout");
    expect(cancelResponse.mock.calls[0]?.[1]).toEqual({
      maxRetries: 0,
      timeout: 5_000,
    });
  });

  it("accepts a completed plan call returned by a cancellation race", async () => {
    vi.useFakeTimers();
    createResponse.mockResolvedValue({
      id: "resp-background-race",
      status: "queued",
      output_text: "",
    });
    retrieveResponse.mockResolvedValue({
      id: "resp-background-race",
      status: "in_progress",
      output_text: "",
    });
    cancelResponse.mockResolvedValue({
      id: "resp-background-race",
      status: "completed",
      output: planFunctionOutput("Completion won the cancellation race."),
    });

    const resultPromise = new OpenAIFabricationProgramModel().generateProgram(
      fixtureIntent(),
      1,
      [],
      "ff_subject",
    );
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toMatchObject({
      program: { intentId: "intent-winged-display" },
    });
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
    expect(getClient).toHaveBeenCalledWith({ paidEvaluation: true });
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

  it("keeps one reservation open until a background program settles", async () => {
    const budget = await openBudget("3.70");
    createResponse.mockResolvedValue({
      id: "resp-metered-background",
      status: "queued",
      output_text: "",
    });
    retrieveResponse.mockResolvedValue({
      id: "resp-metered-background",
      status: "completed",
      output: planFunctionOutput("Settle after background polling."),
      usage,
    });

    const resultPromise = new OpenAIFabricationProgramModel(
      budget,
    ).generateProgram(fixtureIntent(), 1, [], "ff_subject");

    await expect(resultPromise).resolves.toMatchObject({
      program: { intentId: "intent-winged-display" },
    });
    expect(budget.snapshot()).toMatchObject({
      requestCount: 1,
      haltedReason: null,
      pendingReservation: null,
      entries: [
        {
          operation: "generate_program",
          responseId: "resp-metered-background",
          outcome: "succeeded",
        },
      ],
    });
    await budget.close();
  });

  it("charges and halts when a metered cancellation has no usage", async () => {
    const budget = await openBudget("3.70");
    vi.useFakeTimers();
    let markCreateStarted: (() => void) | null = null;
    const createStarted = new Promise<void>((resolve) => {
      markCreateStarted = resolve;
    });
    createResponse.mockImplementation(async () => {
      markCreateStarted?.();
      return {
        id: "resp-metered-cancelled",
        status: "queued",
        output_text: "",
      };
    });
    retrieveResponse.mockResolvedValue({
      id: "resp-metered-cancelled",
      status: "in_progress",
      output_text: "",
    });
    cancelResponse.mockResolvedValue({
      id: "resp-metered-cancelled",
      status: "cancelled",
      output_text: "",
    });

    const resultPromise = new OpenAIFabricationProgramModel(
      budget,
    ).generateProgram(fixtureIntent(), 1, [], "ff_subject");
    const assertion = expect(resultPromise).rejects.toMatchObject({
      code: "missing_usage",
    });
    await createStarted;
    await vi.runAllTimersAsync();
    await assertion;

    const snapshot = budget.snapshot();
    expect(snapshot).toMatchObject({
      requestCount: 1,
      haltedReason: "missing_usage",
      pendingReservation: null,
      entries: [
        {
          operation: "generate_program",
          responseId: "resp-metered-cancelled",
          outcome: "missing_usage",
        },
      ],
    });
    expect(snapshot.chargedCostUsd).toBe(snapshot.entries[0]?.maximumCostUsd);
    await budget.close();
  });

  it("charges and halts when background cancellation does not settle", async () => {
    const budget = await openBudget("3.70");
    vi.useFakeTimers();
    let markCreateStarted: (() => void) | null = null;
    const createStarted = new Promise<void>((resolve) => {
      markCreateStarted = resolve;
    });
    createResponse.mockImplementation(async () => {
      markCreateStarted?.();
      return {
        id: "resp-metered-cancel-error",
        status: "queued",
        output_text: "",
      };
    });
    retrieveResponse.mockResolvedValue({
      id: "resp-metered-cancel-error",
      status: "in_progress",
      output_text: "",
    });
    cancelResponse.mockRejectedValue(new Error("cancel transport failed"));

    const resultPromise = new OpenAIFabricationProgramModel(
      budget,
    ).generateProgram(fixtureIntent(), 1, [], "ff_subject");
    const assertion = expect(resultPromise).rejects.toMatchObject({
      code: "unsettled_request_failure",
    });
    await createStarted;
    await vi.runAllTimersAsync();
    await assertion;

    const snapshot = budget.snapshot();
    expect(snapshot).toMatchObject({
      requestCount: 1,
      haltedReason: "unsettled_request_failure",
      pendingReservation: null,
      entries: [
        {
          operation: "generate_program",
          responseId: null,
          outcome: "unsettled_request_failure",
          providerFailureCategory: "Error",
        },
      ],
    });
    expect(snapshot.chargedCostUsd).toBe(snapshot.entries[0]?.maximumCostUsd);
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
    expect(createResponse).not.toHaveBeenCalled();
    await budget.close();
  });
});
