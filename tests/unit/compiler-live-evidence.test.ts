import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { requireCleanBuildEvidence } from "../../scripts/lib/build-evidence";
import {
  loadCompilerLiveEvidence,
  requireCompilerLiveEvidence,
} from "../../scripts/lib/compiler-live-evidence";

describe("paid evaluation build evidence", () => {
  const temporaryDirectories: string[] = [];
  const currentBuild = {
    gitSha: "a".repeat(40),
    workingTreeClean: true,
  } as const;

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
    temporaryDirectories.length = 0;
  });

  const writeReport = async (report: unknown): Promise<string> => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "foldforge-compiler-evidence-"),
    );
    temporaryDirectories.push(directory);
    const reportPath = path.join(directory, "compiler.json");
    await writeFile(reportPath, `${JSON.stringify(report)}\n`, "utf8");
    return reportPath;
  };

  const paidEntries = () =>
    Array.from({ length: 3 }, (_, index) => ({
      sequence: index + 1,
      operation: "compile_intent" as const,
      responseId: `resp_${index}`,
      outcome: "succeeded" as const,
      inputTokens: 1_000 + index,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 100,
      reasoningTokens: 50,
      providerFailureCategory: null,
      chargedCostUsd: 0.01 + index / 1_000,
      maximumCostUsd: 0.25,
    }));

  const validReport = (gitSha = currentBuild.gitSha) => ({
    model: "gpt-5.6-sol",
    liveStatus: "run",
    livePassed: true,
    evaluationCaseCount: 3,
    buildEvidence: { gitSha, workingTreeClean: true },
    completionBuildEvidence: { gitSha, workingTreeClean: true },
    paidRunEntries: paidEntries(),
    results: [
      {
        caseId: "supported-001",
        executionStatus: "completed",
        schemaValid: true,
        expectedStatus: "supported",
        actualStatus: "supported",
        statusCorrect: true,
      },
      {
        caseId: "unsupported-001",
        executionStatus: "completed",
        schemaValid: true,
        expectedStatus: "unsupported",
        actualStatus: "unsupported",
        statusCorrect: true,
      },
      {
        caseId: "prompt-injection-schema-escape",
        executionStatus: "completed",
        schemaValid: true,
        expectedStatus: "unsupported",
        actualStatus: "unsupported",
        statusCorrect: true,
      },
    ],
  });

  it("accepts three successful compiler calls from the same clean build", async () => {
    const reportPath = await writeReport(validReport());

    await expect(
      loadCompilerLiveEvidence(reportPath, currentBuild, paidEntries()),
    ).resolves.toMatchObject({
      available: true,
      sameBuild: true,
      passed: true,
      gitSha: currentBuild.gitSha,
      intentCallCount: 3,
      supportedPassed: true,
      refusalPassed: true,
      injectionPassed: true,
      ledgerLineageMatched: true,
    });
  });

  it("rejects stale, incomplete, missing, and dirty build evidence", async () => {
    const stalePath = await writeReport(validReport("b".repeat(40)));
    const incompletePath = await writeReport({
      ...validReport(),
      paidRunEntries: validReport().paidRunEntries.slice(0, 2),
    });
    const missingInjectionPath = await writeReport({
      ...validReport(),
      results: validReport().results.map((result) =>
        result.caseId === "prompt-injection-schema-escape"
          ? { ...result, caseId: "unsupported-002" }
          : result,
      ),
    });
    const replacedLedgerPath = await writeReport(validReport());

    await expect(
      loadCompilerLiveEvidence(stalePath, currentBuild, paidEntries()),
    ).resolves.toMatchObject({ sameBuild: false, passed: false });
    await expect(
      loadCompilerLiveEvidence(incompletePath, currentBuild, paidEntries()),
    ).resolves.toMatchObject({ available: true, passed: false });
    await expect(
      loadCompilerLiveEvidence(
        missingInjectionPath,
        currentBuild,
        paidEntries(),
      ),
    ).resolves.toMatchObject({ available: true, passed: false });
    await expect(
      loadCompilerLiveEvidence(replacedLedgerPath, currentBuild, []),
    ).resolves.toMatchObject({
      sameBuild: true,
      ledgerLineageMatched: false,
      passed: false,
    });
    await expect(
      loadCompilerLiveEvidence(
        path.join(tmpdir(), "missing-report.json"),
        currentBuild,
        paidEntries(),
      ),
    ).resolves.toMatchObject({ available: false, passed: false });
    expect(() =>
      requireCleanBuildEvidence({
        gitSha: currentBuild.gitSha,
        workingTreeClean: false,
      }),
    ).toThrow(/clean working tree/u);
  });

  it("blocks provider work when compiler evidence fails preflight", async () => {
    const providerRequest = vi.fn(async () => undefined);
    const missingPath = path.join(tmpdir(), "missing-compiler-report.json");

    await expect(
      (async () => {
        await requireCompilerLiveEvidence(
          missingPath,
          currentBuild,
          paidEntries(),
        );
        await providerRequest();
      })(),
    ).rejects.toThrow(/before any provider request/u);
    expect(providerRequest).not.toHaveBeenCalled();
  });
});
