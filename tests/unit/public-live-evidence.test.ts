import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { z } from "zod";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

const PublicLiveEvidenceSchema = z
  .object({
    version: z.literal(2),
    evidenceStatus: z.literal("partial_live_failure"),
    model: z.literal("gpt-5.6-sol"),
    paidBuildSha: z.string().regex(/^[a-f0-9]{40}$/),
    workingTreeWasClean: z.literal(true),
    sourceReportHashes: z
      .object({
        compilerSha256: Sha256Schema,
        readinessSha256: Sha256Schema,
        originalSealedLedgerSha256: Sha256Schema,
        continuationLedgerSha256: Sha256Schema,
        continuationClaimSha256: Sha256Schema,
      })
      .strict(),
    compilerContract: z
      .object({
        passed: z.literal(true),
        caseCount: z.literal(3),
        completedCaseCount: z.literal(3),
        supportedCaseCount: z.literal(1),
        boundaryCaseCount: z.literal(2),
        schemaValidityRate: z.literal(1),
        explicitConstraintRecallRate: z.literal(1),
        unitNormalizationAccuracyRate: z.literal(1),
        correctStatusRate: z.literal(1),
        correctRefusalOrClarificationRate: z.literal(1),
        chargedCostUsd: z.number().positive(),
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
        failureCode: z.string().min(1),
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
        authorizedMaximumUsd: z.literal(4),
        enforcedMaximumUsd: z.literal(3.7),
        originalCarriedCostUsd: z.literal(0.8307225),
        conservativeChargedCostUsd: z.number().positive().max(3.7),
        remainingUnderEnforcedMaximumUsd: z.number().nonnegative(),
        requestCount: z.literal(14),
        successfulIntentRequestCount: z.literal(12),
        unsettledProgramRequestCount: z.literal(2),
        continuationCount: z.literal(1),
        haltedReason: z.literal("unsettled_request_failure"),
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
    expect(
      evidence.sealedBudget.conservativeChargedCostUsd +
        evidence.sealedBudget.remainingUnderEnforcedMaximumUsd,
    ).toBe(evidence.sealedBudget.enforcedMaximumUsd);
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
