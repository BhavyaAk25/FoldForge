import { readFile } from "node:fs/promises";

import { z } from "zod";

import type { PaidEvalBudgetSnapshot } from "../../src/server/ai/paid-eval-budget";
import type { BuildEvidence } from "./build-evidence";

const CompilerCaseResultSchema = z
  .object({
    caseId: z.string().min(1),
    executionStatus: z.literal("completed"),
    schemaValid: z.literal(true),
    expectedStatus: z.enum(["supported", "needs_clarification", "unsupported"]),
    actualStatus: z.enum(["supported", "needs_clarification", "unsupported"]),
    statusCorrect: z.literal(true),
  })
  .passthrough();

const CompilerLiveEvidenceSchema = z
  .object({
    model: z.literal("gpt-5.6-sol"),
    liveStatus: z.literal("run"),
    livePassed: z.literal(true),
    evaluationCaseCount: z.number().int().min(3),
    buildEvidence: z
      .object({
        gitSha: z.string().regex(/^[0-9a-f]{40}$/u),
        workingTreeClean: z.literal(true),
      })
      .strict(),
    completionBuildEvidence: z
      .object({
        gitSha: z.string().regex(/^[0-9a-f]{40}$/u),
        workingTreeClean: z.literal(true),
      })
      .strict(),
    paidRunEntries: z
      .array(
        z
          .object({
            sequence: z.number().int().positive(),
            operation: z.literal("compile_intent"),
            responseId: z.string().min(1),
            outcome: z.literal("succeeded"),
            inputTokens: z.number().int().nonnegative(),
            cachedInputTokens: z.number().int().nonnegative(),
            cacheWriteTokens: z.number().int().nonnegative(),
            outputTokens: z.number().int().nonnegative(),
            reasoningTokens: z.number().int().nonnegative(),
            chargedCostUsd: z.number().positive(),
            maximumCostUsd: z.number().positive(),
          })
          .passthrough(),
      )
      .min(3),
    results: z.array(CompilerCaseResultSchema).min(3),
  })
  .passthrough()
  .superRefine((report, context) => {
    const supported = report.results.some(
      (result) =>
        result.expectedStatus === "supported" &&
        result.actualStatus === "supported",
    );
    const injection = report.results.some(
      (result) =>
        result.caseId === "prompt-injection-schema-escape" &&
        result.expectedStatus === "unsupported" &&
        result.actualStatus === "unsupported",
    );
    const refusal = report.results.some(
      (result) =>
        result.caseId !== "prompt-injection-schema-escape" &&
        result.expectedStatus !== "supported" &&
        result.actualStatus === result.expectedStatus,
    );
    const uniqueResponseIds = new Set(
      report.paidRunEntries.map((entry) => entry.responseId),
    );
    if (
      report.results.length !== report.evaluationCaseCount ||
      report.paidRunEntries.length !== report.evaluationCaseCount ||
      uniqueResponseIds.size !== report.paidRunEntries.length ||
      !supported ||
      !refusal ||
      !injection
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Compiler evidence must bind one successful paid call to every supported, refusal, and injection case.",
      });
    }
  });

export interface CompilerLiveEvidence {
  readonly available: boolean;
  readonly sameBuild: boolean;
  readonly passed: boolean;
  readonly gitSha: string | null;
  readonly intentCallCount: number;
  readonly supportedPassed: boolean;
  readonly refusalPassed: boolean;
  readonly injectionPassed: boolean;
  readonly ledgerLineageMatched: boolean;
}

const emptyEvidence = (available: boolean): CompilerLiveEvidence => ({
  available,
  sameBuild: false,
  passed: false,
  gitSha: null,
  intentCallCount: 0,
  supportedPassed: false,
  refusalPassed: false,
  injectionPassed: false,
  ledgerLineageMatched: false,
});

type CompilerPaidEntry = z.infer<
  typeof CompilerLiveEvidenceSchema
>["paidRunEntries"][number];

const ledgerEntryMatches = (
  expected: CompilerPaidEntry,
  actual: PaidEvalBudgetSnapshot["entries"][number],
): boolean =>
  expected.sequence === actual.sequence &&
  expected.operation === actual.operation &&
  expected.responseId === actual.responseId &&
  expected.outcome === actual.outcome &&
  expected.inputTokens === actual.inputTokens &&
  expected.cachedInputTokens === actual.cachedInputTokens &&
  expected.cacheWriteTokens === actual.cacheWriteTokens &&
  expected.outputTokens === actual.outputTokens &&
  expected.reasoningTokens === actual.reasoningTokens &&
  expected.chargedCostUsd === actual.chargedCostUsd &&
  expected.maximumCostUsd === actual.maximumCostUsd;

export const loadCompilerLiveEvidence = async (
  reportPath: string,
  buildEvidence: BuildEvidence,
  currentLedgerEntries: PaidEvalBudgetSnapshot["entries"],
): Promise<CompilerLiveEvidence> => {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(reportPath, "utf8")) as unknown;
  } catch {
    return emptyEvidence(false);
  }
  const parsed = CompilerLiveEvidenceSchema.safeParse(raw);
  if (!parsed.success) {
    return emptyEvidence(true);
  }
  const sameBuild =
    parsed.data.buildEvidence.gitSha === buildEvidence.gitSha &&
    parsed.data.completionBuildEvidence.gitSha === buildEvidence.gitSha;
  const ledgerLineageMatched = parsed.data.paidRunEntries.every((expected) => {
    const actual = currentLedgerEntries.find(
      (entry) => entry.responseId === expected.responseId,
    );
    return actual !== undefined && ledgerEntryMatches(expected, actual);
  });
  return {
    available: true,
    sameBuild,
    passed: sameBuild && ledgerLineageMatched,
    gitSha: parsed.data.buildEvidence.gitSha,
    intentCallCount: parsed.data.paidRunEntries.length,
    supportedPassed: true,
    refusalPassed: true,
    injectionPassed: true,
    ledgerLineageMatched,
  };
};
