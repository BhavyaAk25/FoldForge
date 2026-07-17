import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ResponseUsage } from "openai/resources/responses/responses";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAXIMUM_PAID_EVAL_BUDGET_USD,
  PaidEvalBudget,
  PaidEvalBudgetError,
} from "@/server/ai/paid-eval-budget";

const responseUsage = (input?: {
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningTokens?: number;
}): ResponseUsage => {
  const inputTokens = input?.inputTokens ?? 1_000;
  const outputTokens = input?.outputTokens ?? 100;
  return {
    input_tokens: inputTokens,
    input_tokens_details: {
      cached_tokens: input?.cachedInputTokens ?? 200,
      cache_write_tokens: input?.cacheWriteTokens ?? 100,
    },
    output_tokens: outputTokens,
    output_tokens_details: {
      reasoning_tokens: input?.reasoningTokens ?? 60,
    },
    total_tokens: inputTokens + outputTokens,
  };
};

describe("persistent paid OpenAI evaluation budget", () => {
  let temporaryDirectory: string;
  let ledgerPath: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), "foldforge-paid-eval-"),
    );
    ledgerPath = path.join(temporaryDirectory, "live-cost-ledger.json");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  const openBudget = (
    budgetUsd = "3.70",
    selectedLedgerPath = ledgerPath,
  ): Promise<PaidEvalBudget> =>
    PaidEvalBudget.open({
      ledgerPath: selectedLedgerPath,
      environment: { LIVE_EVAL_BUDGET_USD: budgetUsd },
    });

  it("requires a plain positive budget no greater than the compiled cap", async () => {
    await expect(
      PaidEvalBudget.open({ ledgerPath, environment: {} }),
    ).rejects.toMatchObject({ code: "budget_required" });
    await expect(openBudget("4.00")).rejects.toMatchObject({
      code: "invalid_budget",
    });
    await expect(openBudget("1e0")).rejects.toMatchObject({
      code: "invalid_budget",
    });
    expect(MAXIMUM_PAID_EVAL_BUDGET_USD).toBe(3.7);
  });

  it("charges ordinary, cached, cache-write, and output tokens exactly", async () => {
    const budget = await openBudget();
    await expect(
      budget.run({
        operation: "compile_intent",
        maxOutputTokens: 3_000,
        request: { input: "bounded" },
        execute: async () => ({
          id: "resp-cost",
          usage: responseUsage(),
        }),
      }),
    ).resolves.toMatchObject({ id: "resp-cost" });

    const snapshot = budget.snapshot();
    // 700 ordinary + 200 cached + 100 cache-write input tokens, plus 100
    // output tokens. The 60 reasoning tokens are already part of output.
    expect(snapshot.chargedCostUsd).toBe(0.007225);
    expect(snapshot.entries[0]).toMatchObject({
      responseId: "resp-cost",
      inputTokens: 1_000,
      cachedInputTokens: 200,
      cacheWriteTokens: 100,
      outputTokens: 100,
      reasoningTokens: 60,
      chargedCostUsd: 0.007225,
      outcome: "succeeded",
    });
    await budget.close();
  });

  it("persists cumulative usage across sequential evaluation processes", async () => {
    const first = await openBudget();
    await first.run({
      operation: "compile_intent",
      maxOutputTokens: 3_000,
      request: { input: "first" },
      execute: async () => ({ id: "resp-first", usage: responseUsage() }),
    });
    await first.close();

    const second = await openBudget();
    expect(second.snapshot()).toMatchObject({
      budgetUsd: 3.7,
      chargedCostUsd: 0.007225,
      requestCount: 1,
      haltedReason: null,
    });
    await second.run({
      operation: "compile_intent",
      maxOutputTokens: 3_000,
      request: { input: "second" },
      execute: async () => ({ id: "resp-second", usage: responseUsage() }),
    });
    expect(second.snapshot().chargedCostUsd).toBe(0.01445);
    await second.close();
  });

  it("rejects a second process while the persistent run lock is held", async () => {
    const first = await openBudget();
    await expect(openBudget()).rejects.toMatchObject({ code: "run_locked" });
    await first.close();
    const afterRelease = await openBudget();
    await afterRelease.close();
  });

  it("rejects concurrent calls before a second provider callback starts", async () => {
    const budget = await openBudget();
    let releaseFirst: (value: {
      id: string;
      usage: ResponseUsage;
    }) => void = () => {
      throw new Error("The first response was not initialized.");
    };
    const firstResponse = new Promise<{
      id: string;
      usage: ResponseUsage;
    }>((resolve) => {
      releaseFirst = resolve;
    });
    const first = budget.run({
      operation: "compile_intent",
      maxOutputTokens: 3_000,
      request: { input: "first" },
      execute: () => firstResponse,
    });
    await vi.waitFor(() => {
      expect(budget.snapshot().pendingReservation).not.toBeNull();
    });
    const secondCallback = vi.fn();
    await expect(
      budget.run({
        operation: "compile_intent",
        maxOutputTokens: 3_000,
        request: { input: "second" },
        execute: secondCallback,
      }),
    ).rejects.toMatchObject({ code: "concurrent_request" });
    expect(secondCallback).not.toHaveBeenCalled();
    releaseFirst({ id: "resp-first", usage: responseUsage() });
    await first;
    await budget.close();
  });

  it("denies an unaffordable call before invoking the provider", async () => {
    const budget = await openBudget("0.01");
    const execute = vi.fn();
    await expect(
      budget.run({
        operation: "generate_program",
        maxOutputTokens: 8_000,
        request: { input: "too expensive" },
        execute,
      }),
    ).rejects.toMatchObject({ code: "budget_exhausted" });
    expect(execute).not.toHaveBeenCalled();
    expect(budget.snapshot()).toMatchObject({
      chargedCostUsd: 0,
      haltedReason: "budget_exhausted",
    });
    await budget.close();
  });

  it("rechecks immutable build state before every reservation", async () => {
    const beforeReservation = vi.fn(() => {
      throw new Error("build changed");
    });
    const budget = await PaidEvalBudget.open({
      ledgerPath,
      environment: { LIVE_EVAL_BUDGET_USD: "3.70" },
      beforeReservation,
    });
    const execute = vi.fn();

    await expect(
      budget.run({
        operation: "compile_intent",
        maxOutputTokens: 3_000,
        request: { input: "must remain uncommitted" },
        execute,
      }),
    ).rejects.toThrow("build changed");
    expect(beforeReservation).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
    expect(budget.snapshot()).toMatchObject({
      chargedCostUsd: 0,
      requestCount: 0,
      pendingReservation: null,
    });
    await budget.close();
  });

  it("charges the full reservation and halts when usage is missing", async () => {
    const budget = await openBudget();
    await expect(
      budget.run({
        operation: "compile_intent",
        maxOutputTokens: 3_000,
        request: { input: "missing usage" },
        execute: async () => ({ id: "resp-no-usage" }),
      }),
    ).rejects.toMatchObject({ code: "missing_usage" });
    const snapshot = budget.snapshot();
    expect(snapshot.haltedReason).toBe("missing_usage");
    expect(snapshot.entries[0]?.chargedCostUsd).toBe(
      snapshot.entries[0]?.maximumCostUsd,
    );
    await expect(
      budget.run({
        operation: "compile_intent",
        maxOutputTokens: 3_000,
        request: { input: "must not run" },
        execute: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: "budget_exhausted" });
    await budget.close();
  });

  it("charges the full reservation and halts after a provider failure", async () => {
    const budget = await openBudget();
    await expect(
      budget.run({
        operation: "diagnose_repair",
        maxOutputTokens: 2_000,
        request: { input: "provider failure" },
        execute: async () => {
          throw new Error("network timeout");
        },
      }),
    ).rejects.toMatchObject({ code: "provider_failure" });
    expect(budget.snapshot()).toMatchObject({
      haltedReason: "provider_failure",
      requestCount: 1,
    });
    await budget.close();
  });

  it("fails closed on inconsistent provider usage", async () => {
    const budget = await openBudget();
    const invalidUsage = responseUsage();
    invalidUsage.total_tokens += 1;
    await expect(
      budget.run({
        operation: "compile_intent",
        maxOutputTokens: 3_000,
        request: { input: "invalid usage" },
        execute: async () => ({ id: "resp-invalid", usage: invalidUsage }),
      }),
    ).rejects.toMatchObject({ code: "usage_invalid" });
    expect(budget.snapshot().haltedReason).toBe("usage_invalid");
    await budget.close();
  });

  it("rejects requests that could enter long-context pricing", async () => {
    const budget = await openBudget();
    const execute = vi.fn();
    await expect(
      budget.run({
        operation: "generate_program",
        maxOutputTokens: 1,
        request: { input: "x".repeat(140_000) },
        execute,
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(execute).not.toHaveBeenCalled();
    await budget.close();
  });

  it("recovers an unresolved persisted reservation as fully charged and halted", async () => {
    await writeFile(
      ledgerPath,
      `${JSON.stringify({
        version: "1",
        budgetNanodollars: 3_700_000_000,
        chargedNanodollars: 0,
        haltedReason: null,
        pendingReservation: {
          reservationId: "7bc1ae5e-d404-4cab-909f-561e2857167a",
          sequence: 1,
          operation: "generate_program",
          inputTokenCeiling: 10_000,
          outputTokenCeiling: 8_000,
          reservedNanodollars: 302_500_000,
          createdAtIso: "2026-07-17T12:00:00.000Z",
        },
        entries: [],
      })}\n`,
      "utf8",
    );
    await writeFile(
      path.join(temporaryDirectory, "live-cost-ledger.lock"),
      `${JSON.stringify({
        pid: 99_999_999,
        acquiredAtIso: "2026-07-17T12:00:00.000Z",
      })}\n`,
      "utf8",
    );

    const budget = await openBudget();
    expect(budget.snapshot()).toMatchObject({
      chargedCostUsd: 0.3025,
      haltedReason: "recovered_pending_reservation",
      pendingReservation: null,
      requestCount: 1,
      entries: [
        {
          outcome: "recovered_pending_reservation",
          chargedCostUsd: 0.3025,
        },
      ],
    });
    const persisted = JSON.parse(await readFile(ledgerPath, "utf8")) as unknown;
    expect(persisted).toMatchObject({
      pendingReservation: null,
      haltedReason: "recovered_pending_reservation",
      chargedNanodollars: 302_500_000,
    });
    await budget.close();
  });

  it("rejects a changed limit for an existing cumulative ledger", async () => {
    const budget = await openBudget();
    await budget.close();
    await expect(openBudget("3.00")).rejects.toBeInstanceOf(
      PaidEvalBudgetError,
    );
    await expect(openBudget("3.00")).rejects.toMatchObject({
      code: "invalid_budget",
    });
  });
});
