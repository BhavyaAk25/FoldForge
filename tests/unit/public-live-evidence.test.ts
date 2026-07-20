import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { z } from "zod";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

const sha256 = (source: string): string =>
  createHash("sha256").update(source).digest("hex");

const readIfPresent = async (filePath: string): Promise<string | null> => {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
};

const PublicLiveEvidenceSchema = z
  .object({
    version: z.literal(5),
    evidenceStatus: z.literal("partial_live_failure_with_compiler_source_gap"),
    model: z.literal("gpt-5.6-sol"),
    paidBuildSha: z.literal("1041e136c6233ab8eb04512d3087178b3d548266"),
    workingTreeWasClean: z.literal(true),
    sourceArtifactHashes: z
      .object({
        readinessSha256: Sha256Schema,
        originalSealedLedgerSha256: Sha256Schema,
        firstContinuationLedgerSha256: Sha256Schema,
        secondContinuationLedgerSha256: Sha256Schema,
        thirdContinuationLedgerSha256: Sha256Schema,
        originalToFirstContinuationClaimSha256: Sha256Schema,
        firstToSecondContinuationClaimSha256: Sha256Schema,
        secondToThirdContinuationClaimSha256: Sha256Schema,
      })
      .strict(),
    sourceAvailability: z
      .object({
        compilerReport: z
          .object({
            status: z.literal("unavailable_overwritten_by_offline_run"),
            historicalSha256: Sha256Schema,
            claimBoundary: z.string().min(1),
          })
          .strict(),
        readinessAndLedgerArtifacts: z.literal(
          "available_locally_ignored_not_public",
        ),
      })
      .strict(),
    compilerContract: z
      .object({
        passed: z.literal(true),
        evidenceClass: z.literal("summary_only_source_report_unavailable"),
        sourceReportAvailable: z.literal(false),
        caseCount: z.literal(3),
        completedCaseCount: z.literal(3),
        supportedCaseCount: z.literal(1),
        boundaryCaseCount: z.literal(2),
        schemaValidityRate: z.literal(1),
        explicitConstraintRecallRate: z.literal(1),
        unitNormalizationAccuracyRate: z.literal(1),
        correctStatusRate: z.literal(1),
        correctRefusalOrClarificationRate: z.literal(1),
        chargedCostUsd: z.literal(0.11435875),
      })
      .strict(),
    readinessAttempt: z
      .object({
        startedAtIso: z.string().datetime(),
        selectedCaseCount: z.literal(1),
        passedCount: z.literal(0),
        releaseGatePassed: z.literal(false),
        failedCaseId: z.string().min(1),
        failureStage: z.literal("first_program_proposal"),
        failureCode: z.literal("budget_usage_invalid"),
        programResponseStatus: z.literal("incomplete"),
        programIncompleteReason: z.literal("max_output_tokens"),
        intentChargedCostUsd: z.literal(0.08897875),
        programConservativeChargeUsd: z.literal(0.687725),
        durationMs: z.number().positive(),
        explicitConstraintChecksPassed: z.literal(18),
        explicitConstraintCheckCount: z.literal(18),
        generatedCandidateCount: z.literal(0),
        verifiedCandidateCount: z.literal(0),
        repairedCandidateCount: z.literal(0),
        exportFormats: z.tuple([]),
      })
      .strict(),
    sealedBudget: z
      .object({
        builderAuthorizedBudgetUsd: z.literal(4),
        preRequestReservationCeilingUsd: z.literal(3.7),
        carriedCostBeforeFinalContinuationUsd: z.literal(2.722365),
        conservativeChargedCostUsd: z.literal(3.6134275),
        remainingUnderReservationCeilingUsd: z.literal(0.0865725),
        requestCount: z.literal(24),
        successfulIntentRequestCount: z.literal(20),
        failedOrUnsettledProgramRequestCount: z.literal(4),
        continuationCount: z.literal(3),
        haltedReason: z.literal("usage_invalid"),
        furtherPaidRequestsAllowedUnderEnforcedMaximum: z.literal(false),
      })
      .strict(),
    privacy: z
      .object({
        containsPrompts: z.literal(false),
        containsModelBodies: z.literal(false),
        containsResponseIds: z.literal(false),
        containsCredentials: z.literal(false),
      })
      .strict(),
    claimsNotEstablished: z.array(z.string().min(1)).min(5),
  })
  .strict();

describe("public Sol evidence packet", () => {
  it("is strict, sanitized, and explicitly records the failed release gate", async () => {
    const source = await readFile(
      "submission/evidence/sol-live-evidence.json",
      "utf8",
    );
    const evidence = PublicLiveEvidenceSchema.parse(JSON.parse(source));

    expect(source).not.toMatch(/resp_[a-zA-Z0-9]+/);
    expect(source).not.toMatch(/sk-[a-zA-Z0-9_-]+/);
    expect(evidence.readinessAttempt.releaseGatePassed).toBe(false);
    expect(evidence.readinessAttempt.programResponseStatus).toBe("incomplete");
    expect(evidence.readinessAttempt.programIncompleteReason).toBe(
      "max_output_tokens",
    );
    expect(
      evidence.sealedBudget.furtherPaidRequestsAllowedUnderEnforcedMaximum,
    ).toBe(false);
    expect(
      evidence.sealedBudget.conservativeChargedCostUsd +
        evidence.sealedBudget.remainingUnderReservationCeilingUsd,
    ).toBeCloseTo(evidence.sealedBudget.preRequestReservationCeilingUsd, 9);
    expect(evidence.compilerContract.sourceReportAvailable).toBe(false);
    expect(evidence.sourceAvailability.compilerReport.status).toBe(
      "unavailable_overwritten_by_offline_run",
    );
    const localSources = [
      [
        "artifacts/evals/live-readiness.json",
        evidence.sourceArtifactHashes.readinessSha256,
      ],
      [
        "artifacts/evals/live-cost-ledger.json",
        evidence.sourceArtifactHashes.originalSealedLedgerSha256,
      ],
      [
        "artifacts/evals/live-cost-ledger-continuation-1.json",
        evidence.sourceArtifactHashes.firstContinuationLedgerSha256,
      ],
      [
        "artifacts/evals/live-cost-ledger-continuation-2.json",
        evidence.sourceArtifactHashes.secondContinuationLedgerSha256,
      ],
      [
        "artifacts/evals/live-cost-ledger-continuation-3.json",
        evidence.sourceArtifactHashes.thirdContinuationLedgerSha256,
      ],
    ] as const;
    for (const [filePath, expectedHash] of localSources) {
      const localSource = await readIfPresent(filePath);
      if (localSource !== null) expect(sha256(localSource)).toBe(expectedHash);
    }
    const overwrittenCompiler = await readIfPresent(
      "artifacts/evals/compiler.json",
    );
    if (overwrittenCompiler !== null) {
      expect(sha256(overwrittenCompiler)).not.toBe(
        evidence.sourceAvailability.compilerReport.historicalSha256,
      );
    }
    expect(
      evidence.sealedBudget.carriedCostBeforeFinalContinuationUsd +
        evidence.compilerContract.chargedCostUsd +
        evidence.readinessAttempt.intentChargedCostUsd +
        evidence.readinessAttempt.programConservativeChargeUsd,
    ).toBeCloseTo(evidence.sealedBudget.conservativeChargedCostUsd, 9);
    expect(
      evidence.sealedBudget.successfulIntentRequestCount +
        evidence.sealedBudget.failedOrUnsettledProgramRequestCount,
    ).toBe(evidence.sealedBudget.requestCount);
    expect(evidence.claimsNotEstablished).toContain(
      "live end-to-end prompt-to-fabrication success",
    );
    expect(new Set(evidence.claimsNotEstablished)).toEqual(
      new Set([
        "live program generation",
        "live verifier-grounded repair",
        "live selected artifact export",
        "live end-to-end prompt-to-fabrication success",
        "sealed release readiness",
      ]),
    );
  });
});
