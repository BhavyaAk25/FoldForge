import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildFabricationCandidate,
  finalizeFabricationCandidate,
} from "../src/core/fabrication/candidate";
import type { CandidateV2, ExportFormat } from "../src/core/fabrication/types";
import { sha256Hex } from "../src/core/sha256";
import {
  PaidEvalBudget,
  PaidEvalBudgetError,
  type PaidEvalBudgetSnapshot,
} from "../src/server/ai/paid-eval-budget";
import {
  evaluateLiveIntentConstraints,
  type LiveIntentConstraintEvidence,
} from "../src/server/evals/live-constraint-evidence";
import {
  LIVE_READINESS_CASES,
  type LiveReadinessCaseDefinition,
} from "../src/server/evals/live-readiness-cases";
import {
  summarizeLiveReadinessGate,
  type LiveReadinessCaseStatus,
} from "../src/server/evals/live-readiness-gate";
import {
  createRepairEvidence,
  evaluateFabricationProgramForEvidence,
  type RepairEvidence,
} from "../src/server/evals/live-repair-evidence";
import { createMotionRangeRepairProbe } from "../src/server/evals/repair-probe";
import {
  FOLDFORGE_MODEL,
  OpenAIFabricationIntentModel,
  OpenAIFabricationNarrativeModel,
  OpenAIFabricationProgramModel,
  OpenAIFabricationRepairModel,
} from "../src/server/fabrication-ai/models";
import {
  generateDistinctFabricationPrograms,
  runFabricationRepairLoop,
} from "../src/server/fabrication-ai/orchestration";
import {
  validateFinalizedConsumerArtifacts,
  type ConsumerValidationResult,
} from "./lib/consumer-validation";
import {
  writeLiveArtifactPack,
  type ArtifactPackEvidence,
} from "./lib/live-artifact-pack";
import {
  captureBuildEvidence,
  requireCleanBuildEvidence,
  requireUnchangedCleanBuildEvidence,
} from "./lib/build-evidence";
import { loadCompilerLiveEvidence } from "./lib/compiler-live-evidence";

const REQUESTED_FORMATS = [
  "svg",
  "dxf",
  "glb",
  "json",
  "fold",
] as const satisfies readonly ExportFormat[];

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
};

const requestedCountValue = Number(
  argument("--cases") ?? LIVE_READINESS_CASES.length,
);
if (!Number.isInteger(requestedCountValue)) {
  throw new Error("--cases must be an integer.");
}
const requestedCount = Math.max(
  1,
  Math.min(LIVE_READINESS_CASES.length, requestedCountValue),
);
const selectedCases = LIVE_READINESS_CASES.slice(0, requestedCount);
const reportPath = path.resolve("artifacts/evals/live-readiness.json");
const artifactRoot = path.resolve("artifacts/evals/live-readiness");
const runStartedIso = new Date().toISOString();
const buildEvidence = captureBuildEvidence();
const runId = sha256Hex(runStartedIso).slice(0, 16);
const runArtifactRoot = path.join(artifactRoot, runId);
const liveEnabled =
  process.env.ENABLE_LIVE_OPENAI === "true" &&
  process.env.ENABLE_LIVE_OPENAI_EVALS === "true" &&
  process.env.LIVE_MODEL_KILL_SWITCH !== "true";

const writeReport = async (report: unknown): Promise<void> => {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report)}\n`);
};

const errorCode = (error: unknown): string => {
  if (error instanceof PaidEvalBudgetError) return `budget_${error.code}`;
  if (typeof error === "object" && error !== null && "kind" in error) {
    return `pipeline_${String(error.kind)}`;
  }
  return "live_pipeline_error";
};

interface CandidateRun {
  readonly candidate: CandidateV2 | null;
  readonly repaired: boolean;
  readonly repairEvidence: RepairEvidence | null;
  readonly structureFingerprint: string;
}

interface LiveCaseResult {
  readonly caseId: string;
  readonly status: LiveReadinessCaseStatus;
  readonly failureCode: string | null;
  readonly promptHash: string;
  readonly durationMs: number;
  readonly constraintEvidence: LiveIntentConstraintEvidence | null;
  readonly intentResponseId: string | null;
  readonly programResponseIds: readonly string[];
  readonly narrativeResponseId: string | null;
  readonly topologyFingerprints: readonly string[];
  readonly generatedCandidateCount: number;
  readonly verifiedCandidateCount: number;
  readonly repairedCandidateCount: number;
  readonly repairEvidence: RepairEvidence | null;
  readonly selectedCandidateId: string | null;
  readonly selectedIrHash: string | null;
  readonly selectedScore: number | null;
  readonly exportFormats: readonly string[];
  readonly foldStatus: string | null;
  readonly sourceEquivalent: boolean;
  readonly consumerValidation: ConsumerValidationResult | null;
  readonly artifactPack: ArtifactPackEvidence | null;
}

const emptyResult = (
  liveCase: LiveReadinessCaseDefinition,
  status: LiveReadinessCaseStatus,
  failureCode: string,
  durationMs = 0,
): LiveCaseResult => ({
  caseId: liveCase.caseId,
  status,
  failureCode,
  promptHash: sha256Hex(liveCase.prompt),
  durationMs,
  constraintEvidence: null,
  intentResponseId: null,
  programResponseIds: [],
  narrativeResponseId: null,
  topologyFingerprints: [],
  generatedCandidateCount: 0,
  verifiedCandidateCount: 0,
  repairedCandidateCount: 0,
  repairEvidence: null,
  selectedCandidateId: null,
  selectedIrHash: null,
  selectedScore: null,
  exportFormats: [],
  foldStatus: null,
  sourceEquivalent: false,
  consumerValidation: null,
  artifactPack: null,
});

const responseIdsSince = (
  budget: PaidEvalBudget,
  entryCount: number,
  operation:
    | "compile_intent"
    | "generate_program"
    | "diagnose_repair"
    | "generate_narrative",
): readonly string[] =>
  budget
    .snapshot()
    .entries.slice(entryCount)
    .filter(
      (entry) => entry.operation === operation && entry.outcome === "succeeded",
    )
    .flatMap((entry) => (entry.responseId ? [entry.responseId] : []));

if (!liveEnabled) {
  await writeReport({
    reportVersion: 2,
    mode: "gpt-5.6-sol-live-readiness",
    model: FOLDFORGE_MODEL,
    liveStatus: "blocked-user-enable-required",
    evidenceBoundary: "No model request was made.",
    caseCount: selectedCases.length,
    selectedRunPassed: false,
    releaseGatePassed: false,
    passed: false,
  });
} else {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error(
      "OPENAI_API_KEY is required before the paid live evaluation can run.",
    );
  }
  requireCleanBuildEvidence(buildEvidence);
  const budget = await PaidEvalBudget.open({
    beforeReservation: () => {
      requireUnchangedCleanBuildEvidence(buildEvidence);
    },
  });
  const paidRunStartRequestCount = budget.snapshot().requestCount;
  const results: LiveCaseResult[] = [];
  let budgetStopped = false;
  let paidUsage: PaidEvalBudgetSnapshot;

  try {
    const safetyIdentifier = `ff_live_eval_${randomBytes(16).toString("hex")}`;
    const intentModel = new OpenAIFabricationIntentModel(budget);
    const programModel = new OpenAIFabricationProgramModel(budget);
    const repairModel = new OpenAIFabricationRepairModel(budget);
    const narrativeModel = new OpenAIFabricationNarrativeModel(budget);
    for (const [caseIndex, liveCase] of selectedCases.entries()) {
      const startedAt = performance.now();
      const beforeIntentEntries = budget.snapshot().entries.length;
      let partialResult = emptyResult(liveCase, "failed", "in_progress");
      let beforeProgramEntries: number | null = null;
      try {
        const intent = await intentModel.compileIntent(
          liveCase.prompt,
          safetyIdentifier,
        );
        const intentResponseId = responseIdsSince(
          budget,
          beforeIntentEntries,
          "compile_intent",
        )[0];
        if (!intentResponseId) throw new Error("intent_response_id_missing");
        partialResult = { ...partialResult, intentResponseId };
        const constraintEvidence = evaluateLiveIntentConstraints(
          intent,
          liveCase.expected,
        );
        partialResult = { ...partialResult, constraintEvidence };
        if (!constraintEvidence.passed) {
          results.push({
            ...emptyResult(
              liveCase,
              "failed",
              "explicit_constraint_recall_failed",
              Number((performance.now() - startedAt).toFixed(3)),
            ),
            constraintEvidence,
            intentResponseId,
          });
          continue;
        }

        const programEvidenceStart = budget.snapshot().entries.length;
        beforeProgramEntries = programEvidenceStart;
        const proposals = await generateDistinctFabricationPrograms(
          intent,
          safetyIdentifier,
          programModel,
          3,
          (outcome) => {
            const observedFingerprints = [
              ...partialResult.topologyFingerprints,
              outcome.structureFingerprint,
            ];
            partialResult = {
              ...partialResult,
              programResponseIds: responseIdsSince(
                budget,
                programEvidenceStart,
                "generate_program",
              ),
              topologyFingerprints: observedFingerprints,
              generatedCandidateCount:
                partialResult.generatedCandidateCount +
                (outcome.status === "generated" ? 1 : 0),
            };
          },
        );
        const programResponseIds = responseIdsSince(
          budget,
          beforeProgramEntries,
          "generate_program",
        );
        const generated = proposals.filter(
          (proposal) => proposal.status === "generated",
        );
        partialResult = {
          ...partialResult,
          programResponseIds,
          topologyFingerprints: proposals.map(
            (proposal) => proposal.structureFingerprint,
          ),
          generatedCandidateCount: generated.length,
        };
        const candidateRuns: CandidateRun[] = [];

        for (const [index, proposal] of proposals.entries()) {
          if (proposal.status !== "generated") continue;
          const candidateId = `live:${liveCase.caseId}:${index + 1}`;
          const initialReport = evaluateFabricationProgramForEvidence(
            intent,
            proposal.proposal.program,
            candidateId,
          );
          const beforeRepairEntries = budget.snapshot().entries.length;
          const outcome = await runFabricationRepairLoop(
            intent,
            proposal.proposal.program,
            candidateId,
            safetyIdentifier,
            repairModel,
          );
          const repairResponseIds = responseIdsSince(
            budget,
            beforeRepairEntries,
            "diagnose_repair",
          );
          const repair =
            outcome.cycles.length > 0
              ? createRepairEvidence(
                  initialReport,
                  outcome,
                  null,
                  repairResponseIds,
                )
              : null;
          let candidate: CandidateV2 | null = null;
          if (outcome.status === "passed") {
            const built = buildFabricationCandidate({
              candidateId,
              intent,
              program: outcome.program,
              selectionStatus: "eligible",
              provenance: {
                compilerVersion: "foldforge-fabrication-v1",
                generatedAtIso: runStartedIso,
                deterministicSeed: 20_260_717 + caseIndex * 10 + index,
                modelId: FOLDFORGE_MODEL,
                modelResponseId: programResponseIds[index] ?? null,
                parentCandidateId: null,
                appliedPatchIds: outcome.cycles.map(
                  (cycle) => cycle.patch.patchId,
                ),
                repairCycle: outcome.cycles.length,
              },
            });
            if (built.ok) candidate = built.value;
          }
          candidateRuns.push({
            candidate,
            repaired: outcome.cycles.length > 0,
            repairEvidence: repair,
            structureFingerprint: proposal.structureFingerprint,
          });
        }

        const verified = candidateRuns
          .filter(
            (run): run is CandidateRun & { readonly candidate: CandidateV2 } =>
              run.candidate !== null,
          )
          .toSorted(
            (left, right) =>
              (right.candidate.score.totalScore ?? 0) -
              (left.candidate.score.totalScore ?? 0),
          );
        const winner = verified[0];
        if (
          !winner ||
          verified.length !== 3 ||
          generated.length !== 3 ||
          programResponseIds.length !== 3
        ) {
          results.push({
            ...emptyResult(
              liveCase,
              "failed",
              "three_verified_distinct_candidates_required",
              Number((performance.now() - startedAt).toFixed(3)),
            ),
            constraintEvidence,
            intentResponseId,
            programResponseIds,
            topologyFingerprints: proposals.map(
              (proposal) => proposal.structureFingerprint,
            ),
            generatedCandidateCount: generated.length,
            verifiedCandidateCount: verified.length,
            repairedCandidateCount: verified.filter((run) => run.repaired)
              .length,
          });
          continue;
        }

        let measuredRepair =
          candidateRuns
            .map((run) => run.repairEvidence)
            .find((evidence) => evidence?.passed) ?? null;
        if (!measuredRepair && liveCase.requiresRepairEvidence) {
          const probe = createMotionRangeRepairProbe(winner.candidate.program);
          const probeCandidateId = `live:${liveCase.caseId}:repair-probe`;
          const probeInitialReport = evaluateFabricationProgramForEvidence(
            intent,
            probe.program,
            probeCandidateId,
          );
          const beforeProbeRepairEntries = budget.snapshot().entries.length;
          const probeOutcome = await runFabricationRepairLoop(
            intent,
            probe.program,
            probeCandidateId,
            safetyIdentifier,
            repairModel,
          );
          const probeResponseIds = responseIdsSince(
            budget,
            beforeProbeRepairEntries,
            "diagnose_repair",
          );
          measuredRepair = createRepairEvidence(
            probeInitialReport,
            probeOutcome,
            probe.mutation,
            probeResponseIds,
          );
        }
        if (liveCase.requiresRepairEvidence && !measuredRepair?.passed) {
          results.push({
            ...emptyResult(
              liveCase,
              "failed",
              "measured_repair_evidence_required",
              Number((performance.now() - startedAt).toFixed(3)),
            ),
            constraintEvidence,
            intentResponseId,
            programResponseIds,
            topologyFingerprints: proposals.map(
              (proposal) => proposal.structureFingerprint,
            ),
            generatedCandidateCount: generated.length,
            verifiedCandidateCount: verified.length,
            repairedCandidateCount: verified.filter((run) => run.repaired)
              .length,
            repairEvidence: measuredRepair,
          });
          continue;
        }

        const selected = buildFabricationCandidate({
          candidateId: winner.candidate.candidateId,
          intent,
          program: winner.candidate.program,
          rank: 1,
          selectionStatus: "selected",
          provenance: {
            compilerVersion: winner.candidate.provenance.compilerVersion,
            generatedAtIso: winner.candidate.provenance.generatedAtIso,
            deterministicSeed: winner.candidate.provenance.deterministicSeed,
            modelId: winner.candidate.provenance.modelId,
            modelResponseId: winner.candidate.provenance.modelResponseId,
            parentCandidateId: winner.candidate.provenance.parentCandidateId,
            appliedPatchIds: winner.candidate.provenance.appliedPatchIds,
            repairCycle: winner.candidate.provenance.repairCycle,
          },
        });
        if (!selected.ok) throw selected.error;
        const finalized = finalizeFabricationCandidate({
          candidate: selected.value,
          requestedFormats: REQUESTED_FORMATS,
        });
        if (!finalized.ok) throw finalized.error;
        const consumerValidation = await validateFinalizedConsumerArtifacts({
          sourceCandidateId: finalized.value.candidate.candidateId,
          sourceIrHash: finalized.value.candidate.verification.irHash,
          artifacts: finalized.value.artifacts,
          foldOmission: finalized.value.foldOmission,
        });
        if (consumerValidation.json.assemblyOperationCount < 1) {
          throw new Error("deterministic_assembly_operations_required");
        }
        const beforeNarrativeEntries = budget.snapshot().entries.length;
        const narrative = await narrativeModel.generateNarrative(
          finalized.value.candidate,
          safetyIdentifier,
        );
        const narrativeResponseId = responseIdsSince(
          budget,
          beforeNarrativeEntries,
          "generate_narrative",
        )[0];
        if (!narrativeResponseId) {
          throw new Error("narrative_response_id_missing");
        }
        const artifactPack = await writeLiveArtifactPack({
          artifactRoot: runArtifactRoot,
          reportDirectory: path.relative(
            process.cwd(),
            path.join(runArtifactRoot, liveCase.caseId),
          ),
          buildEvidence,
          caseId: liveCase.caseId,
          candidate: finalized.value.candidate,
          artifacts: finalized.value.artifacts,
          consumerValidation,
          narrative,
        });

        results.push({
          caseId: liveCase.caseId,
          status: "passed",
          failureCode: null,
          promptHash: sha256Hex(liveCase.prompt),
          durationMs: Number((performance.now() - startedAt).toFixed(3)),
          constraintEvidence,
          intentResponseId,
          programResponseIds,
          narrativeResponseId,
          topologyFingerprints: proposals.map(
            (proposal) => proposal.structureFingerprint,
          ),
          generatedCandidateCount: generated.length,
          verifiedCandidateCount: verified.length,
          repairedCandidateCount: verified.filter((run) => run.repaired).length,
          repairEvidence: measuredRepair,
          selectedCandidateId: finalized.value.candidate.candidateId,
          selectedIrHash: finalized.value.candidate.verification.irHash,
          selectedScore: finalized.value.candidate.score.totalScore,
          exportFormats: finalized.value.artifacts.map(
            (artifact) => artifact.format,
          ),
          foldStatus: finalized.value.foldOmission
            ? `omitted:${finalized.value.foldOmission.code}`
            : "generated",
          sourceEquivalent:
            finalized.value.candidate.exportMetadata.sourceEquivalent,
          consumerValidation,
          artifactPack,
        });
      } catch (error) {
        const durationMs = Number((performance.now() - startedAt).toFixed(3));
        if (beforeProgramEntries !== null) {
          partialResult = {
            ...partialResult,
            programResponseIds: responseIdsSince(
              budget,
              beforeProgramEntries,
              "generate_program",
            ),
          };
        }
        if (error instanceof PaidEvalBudgetError) {
          budgetStopped = true;
          const currentStatus: LiveReadinessCaseStatus =
            error.code === "budget_exhausted" &&
            partialResult.intentResponseId === null
              ? "not_run_budget_exhausted"
              : "failed";
          results.push({
            ...partialResult,
            status: currentStatus,
            failureCode: errorCode(error),
            durationMs,
          });
          for (const notRun of selectedCases.slice(caseIndex + 1)) {
            results.push(
              emptyResult(
                notRun,
                "not_run_budget_exhausted",
                "not_run_after_budget_halt",
              ),
            );
          }
          break;
        }
        results.push({
          ...partialResult,
          status: "failed",
          failureCode: errorCode(error),
          durationMs,
        });
      }
    }
  } finally {
    paidUsage = budget.snapshot();
    await budget.close();
  }
  const completionBuildEvidence =
    requireUnchangedCleanBuildEvidence(buildEvidence);

  const gate = summarizeLiveReadinessGate({
    selectedCaseCount: selectedCases.length,
    results,
  });
  const measuredRepairPassed = results.some(
    (result) => result.repairEvidence?.passed,
  );
  const passedResults = results.filter((result) => result.status === "passed");
  const exactArtifactConsumerChecksPassed =
    passedResults.length > 0 &&
    passedResults.every(
      (result) =>
        result.consumerValidation?.sourceIrHash === result.selectedIrHash,
    );
  const compilerContractEvidence = await loadCompilerLiveEvidence(
    path.resolve("artifacts/evals/compiler.json"),
    buildEvidence,
    paidUsage.entries,
  );
  const releaseEvidencePassed =
    gate.releaseGatePassed &&
    compilerContractEvidence.passed &&
    measuredRepairPassed &&
    exactArtifactConsumerChecksPassed &&
    !budgetStopped;
  await writeReport({
    reportVersion: 2,
    mode: "gpt-5.6-sol-live-readiness",
    model: FOLDFORGE_MODEL,
    liveStatus: budgetStopped ? "budget-halted" : "run",
    evidenceBoundary:
      "Live model evidence with bounded typed patch excerpts; prompt and complete model response bodies are not stored in this report.",
    runStartedIso,
    runId,
    buildEvidence,
    completionBuildEvidence,
    approvedMaximumCostUsd: 4,
    enforcedMaximumCostUsd: paidUsage.budgetUsd,
    caseCount: selectedCases.length,
    ...gate,
    measuredRepairPassed,
    exactArtifactConsumerChecksPassed,
    compilerContractEvidence,
    paidUsage,
    paidRunStartRequestCount,
    paidRunEntries: paidUsage.entries.slice(paidRunStartRequestCount),
    results,
    passed: releaseEvidencePassed,
  });
  if (!releaseEvidencePassed) process.exitCode = 1;
}
