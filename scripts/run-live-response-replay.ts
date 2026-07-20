import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildFabricationCandidate,
  finalizeFabricationCandidate,
} from "../src/core/fabrication/candidate";
import type { CandidateV2, ExportFormat } from "../src/core/fabrication/types";
import { sha256Hex } from "../src/core/sha256";
import { getOpenAIClient } from "../src/server/ai/client";
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
  createRepairEvidence,
  evaluateFabricationProgramForEvidence,
  type RepairEvidence,
} from "../src/server/evals/live-repair-evidence";
import { createMotionRangeRepairProbe } from "../src/server/evals/repair-probe";
import {
  FOLDFORGE_MODEL,
  OpenAIFabricationIntentModel,
  OpenAIFabricationNarrativeModel,
  OpenAIFabricationRepairModel,
} from "../src/server/fabrication-ai/models";
import {
  programStructureFingerprint,
  runFabricationRepairLoop,
} from "../src/server/fabrication-ai/orchestration";
import {
  captureBuildEvidence,
  requireCleanBuildEvidence,
  requireUnchangedCleanBuildEvidence,
  type BuildEvidence,
} from "./lib/build-evidence";
import {
  requireCompilerLiveEvidence,
  type CompilerLiveEvidence,
} from "./lib/compiler-live-evidence";
import {
  validateFinalizedConsumerArtifacts,
  type ConsumerValidationResult,
} from "./lib/consumer-validation";
import {
  expandRecoveredProgramPlans,
  loadRecoveredProgramPlanCheckpoint,
  requireProgramResponseLedgerEvidence,
  retrieveRecoveredProgramPlans,
  type RecoveredProgramPlanSet,
} from "./lib/live-program-replay";
import {
  writeLiveArtifactPack,
  type ArtifactPackEvidence,
} from "./lib/live-artifact-pack";

const REQUESTED_FORMATS = [
  "svg",
  "dxf",
  "glb",
  "json",
  "fold",
] as const satisfies readonly ExportFormat[];

const argumentValues = (name: string): readonly string[] =>
  process.argv.flatMap((value, index) =>
    value === name && process.argv[index + 1] ? [process.argv[index + 1]!] : [],
  );

const argument = (name: string): string | null => {
  const values = argumentValues(name);
  if (values.length > 1) throw new Error(`${name} may be provided only once.`);
  return values[0] ?? null;
};

const requireArgument = (name: string): string => {
  const value = argument(name)?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const requireArtifactPath = (
  value: string,
  root: string,
  argumentName: string,
): string => {
  const resolved = path.resolve(value);
  const allowedRoot = path.resolve(root);
  const relative = path.relative(allowedRoot, resolved);
  if (
    relative.length === 0 ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${argumentName} must identify a file below ${root}.`);
  }
  return resolved;
};

const requestedCaseId = argument("--case") ?? LIVE_READINESS_CASES[0]?.caseId;
const selectedCase = LIVE_READINESS_CASES.find(
  (candidate) => candidate.caseId === requestedCaseId,
);
if (!selectedCase)
  throw new Error("--case must identify a live readiness case.");

const programResponseIds = argumentValues("--program-response-id");
if (programResponseIds.length !== 3) {
  throw new Error("Exactly three --program-response-id values are required.");
}
const compilerReportPath = requireArtifactPath(
  requireArgument("--compiler-report"),
  "artifacts/evals/live",
  "--compiler-report",
);
const ledgerPath = requireArtifactPath(
  requireArgument("--ledger"),
  "artifacts/evals",
  "--ledger",
);
const checkpointArgument = argument("--program-plan-checkpoint");
const checkpointPath = checkpointArgument
  ? requireArtifactPath(
      checkpointArgument,
      "artifacts/evals/live",
      "--program-plan-checkpoint",
    )
  : null;

const runStartedIso = new Date().toISOString();
const runId = sha256Hex(
  `${runStartedIso}:${randomBytes(16).toString("hex")}`,
).slice(0, 16);
const artifactRoot = path.resolve("artifacts/evals/live-response-replay");
await mkdir(artifactRoot, { recursive: true });
const runArtifactRoot = path.join(artifactRoot, runId);
await mkdir(runArtifactRoot, { recursive: false });
const reportPath = path.join(runArtifactRoot, "live-response-replay.json");
const buildEvidence = captureBuildEvidence();
const liveEnabled =
  process.env.ENABLE_LIVE_OPENAI === "true" &&
  process.env.ENABLE_LIVE_OPENAI_EVALS === "true" &&
  process.env.LIVE_MODEL_KILL_SWITCH !== "true";

const fileSha256 = async (filePath: string): Promise<string> =>
  sha256Hex(await readFile(filePath, "utf8"));

const writeReport = async (report: unknown): Promise<void> => {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
};

const responseIdsSince = (
  budget: PaidEvalBudget,
  entryCount: number,
  operation: "compile_intent" | "diagnose_repair" | "generate_narrative",
): readonly string[] =>
  budget
    .snapshot()
    .entries.slice(entryCount)
    .filter(
      (entry) => entry.operation === operation && entry.outcome === "succeeded",
    )
    .flatMap((entry) => (entry.responseId ? [entry.responseId] : []));

const failureCode = (error: unknown): string => {
  if (error instanceof PaidEvalBudgetError) return `budget_${error.code}`;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return `pipeline_${error.code}`;
  }
  return "replay_validation_failed";
};

interface CandidateRun {
  readonly candidate: CandidateV2 | null;
  readonly repaired: boolean;
  readonly repairEvidence: RepairEvidence | null;
  readonly structureFingerprint: string;
}

interface ReplayResult {
  readonly caseId: string;
  readonly promptHash: string;
  readonly constraintEvidence: LiveIntentConstraintEvidence;
  readonly intentResponseId: string;
  readonly programResponseIds: readonly string[];
  readonly programPlanHashes: readonly string[];
  readonly topologyFingerprints: readonly string[];
  readonly recoveredCandidateCount: number;
  readonly verifiedCandidateCount: number;
  readonly repairedCandidateCount: number;
  readonly repairEvidence: RepairEvidence | null;
  readonly narrativeResponseId: string;
  readonly selectedCandidateId: string;
  readonly selectedIrHash: string;
  readonly selectedScore: number | null;
  readonly exportFormats: readonly string[];
  readonly foldStatus: string;
  readonly sourceEquivalent: boolean;
  readonly consumerValidation: ConsumerValidationResult;
  readonly artifactPack: ArtifactPackEvidence;
}

const runReplayCase = async (input: {
  readonly liveCase: LiveReadinessCaseDefinition;
  readonly recoveredPlans: RecoveredProgramPlanSet;
  readonly budget: PaidEvalBudget;
  readonly safetyIdentifier: string;
}): Promise<ReplayResult> => {
  const intentModel = new OpenAIFabricationIntentModel(input.budget);
  const repairModel = new OpenAIFabricationRepairModel(input.budget);
  const narrativeModel = new OpenAIFabricationNarrativeModel(input.budget);
  const beforeIntentEntries = input.budget.snapshot().entries.length;
  const intent = await intentModel.compileIntent(
    input.liveCase.prompt,
    input.safetyIdentifier,
  );
  const intentResponseIds = responseIdsSince(
    input.budget,
    beforeIntentEntries,
    "compile_intent",
  );
  if (intentResponseIds.length !== 1) {
    throw new Error("Replay requires exactly one fresh intent response.");
  }
  const intentResponseId = intentResponseIds[0]!;
  const constraintEvidence = evaluateLiveIntentConstraints(
    intent,
    input.liveCase.expected,
  );
  if (!constraintEvidence.passed) {
    throw new Error("Fresh intent compilation missed an explicit constraint.");
  }

  const proposals = expandRecoveredProgramPlans({
    recoveredPlans: input.recoveredPlans,
    intent,
  });
  const topologyFingerprints = proposals.map((proposal) =>
    programStructureFingerprint(proposal.program),
  );
  if (
    new Set(topologyFingerprints).size !== proposals.length ||
    new Set(proposals.map((proposal) => proposal.program.topologyId)).size !==
      proposals.length
  ) {
    throw new Error("Recovered plans are not topology-distinct.");
  }

  const candidateRuns: CandidateRun[] = [];
  for (const [index, proposal] of proposals.entries()) {
    const candidateId = `replay:${input.liveCase.caseId}:${index + 1}`;
    const initialReport = evaluateFabricationProgramForEvidence(
      intent,
      proposal.program,
      candidateId,
    );
    const beforeRepairEntries = input.budget.snapshot().entries.length;
    const outcome = await runFabricationRepairLoop(
      intent,
      proposal.program,
      candidateId,
      input.safetyIdentifier,
      repairModel,
    );
    const repairResponseIds = responseIdsSince(
      input.budget,
      beforeRepairEntries,
      "diagnose_repair",
    );
    const repairEvidence =
      outcome.cycles.length > 0
        ? createRepairEvidence(initialReport, outcome, null, repairResponseIds)
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
          deterministicSeed: 20_260_717 + index,
          modelId: proposal.provenance.modelId,
          modelResponseId: proposal.provenance.modelResponseId,
          modelPlanHash: proposal.provenance.planHash,
          planExpanderVersion: proposal.provenance.expanderVersion,
          parentCandidateId: null,
          appliedPatchIds: outcome.cycles.map((cycle) => cycle.patch.patchId),
          repairCycle: outcome.cycles.length,
        },
      });
      if (built.ok) candidate = built.value;
    }
    candidateRuns.push({
      candidate,
      repaired: outcome.cycles.length > 0,
      repairEvidence,
      structureFingerprint: topologyFingerprints[index]!,
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
  if (!winner || verified.length !== 3) {
    throw new Error(
      "Replay requires three deterministically verified candidates.",
    );
  }

  let measuredRepair =
    candidateRuns
      .map((run) => run.repairEvidence)
      .find((evidence) => evidence?.passed) ?? null;
  if (!measuredRepair && input.liveCase.requiresRepairEvidence) {
    const probe = createMotionRangeRepairProbe(winner.candidate.program);
    const probeCandidateId = `replay:${input.liveCase.caseId}:repair-probe`;
    const initialReport = evaluateFabricationProgramForEvidence(
      intent,
      probe.program,
      probeCandidateId,
    );
    const beforeRepairEntries = input.budget.snapshot().entries.length;
    const outcome = await runFabricationRepairLoop(
      intent,
      probe.program,
      probeCandidateId,
      input.safetyIdentifier,
      repairModel,
    );
    measuredRepair = createRepairEvidence(
      initialReport,
      outcome,
      probe.mutation,
      responseIdsSince(input.budget, beforeRepairEntries, "diagnose_repair"),
    );
  }
  if (input.liveCase.requiresRepairEvidence && !measuredRepair?.passed) {
    throw new Error("The replay did not produce measured repair evidence.");
  }

  const selected = buildFabricationCandidate({
    candidateId: winner.candidate.candidateId,
    intent,
    program: winner.candidate.program,
    rank: 1,
    selectionStatus: "selected",
    provenance: winner.candidate.provenance,
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
    throw new Error("Source-bound assembly operations are required.");
  }

  const beforeNarrativeEntries = input.budget.snapshot().entries.length;
  const narrative = await narrativeModel.generateNarrative(
    finalized.value.candidate,
    input.safetyIdentifier,
  );
  const narrativeResponseIds = responseIdsSince(
    input.budget,
    beforeNarrativeEntries,
    "generate_narrative",
  );
  if (narrativeResponseIds.length !== 1) {
    throw new Error("Replay requires exactly one paid narrative response.");
  }
  const artifactPack = await writeLiveArtifactPack({
    artifactRoot: runArtifactRoot,
    reportDirectory: path.relative(
      process.cwd(),
      path.join(runArtifactRoot, input.liveCase.caseId),
    ),
    buildEvidence,
    caseId: input.liveCase.caseId,
    candidate: finalized.value.candidate,
    artifacts: finalized.value.artifacts,
    consumerValidation,
    narrative,
  });

  return {
    caseId: input.liveCase.caseId,
    promptHash: sha256Hex(input.liveCase.prompt),
    constraintEvidence,
    intentResponseId,
    programResponseIds: input.recoveredPlans.entries.map(
      (entry) => entry.responseId,
    ),
    programPlanHashes: input.recoveredPlans.entries.map(
      (entry) => entry.planHash,
    ),
    topologyFingerprints,
    recoveredCandidateCount: proposals.length,
    verifiedCandidateCount: verified.length,
    repairedCandidateCount: verified.filter((run) => run.repaired).length,
    repairEvidence: measuredRepair,
    narrativeResponseId: narrativeResponseIds[0]!,
    selectedCandidateId: finalized.value.candidate.candidateId,
    selectedIrHash: finalized.value.candidate.verification.irHash,
    selectedScore: finalized.value.candidate.score.totalScore,
    exportFormats: finalized.value.artifacts.map((artifact) => artifact.format),
    foldStatus: finalized.value.foldOmission
      ? `omitted:${finalized.value.foldOmission.code}`
      : "generated",
    sourceEquivalent: finalized.value.candidate.exportMetadata.sourceEquivalent,
    consumerValidation,
    artifactPack,
  };
};

if (!liveEnabled) {
  await writeReport({
    reportVersion: 1,
    mode: "gpt-5.6-sol-live-response-replay",
    model: FOLDFORGE_MODEL,
    liveStatus: "blocked-user-enable-required",
    evidenceBoundary: "No model request or response retrieval was made.",
    replayPassed: false,
    releaseGatePassed: false,
  });
  process.exitCode = 1;
} else {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is required for live response replay.");
  }
  requireCleanBuildEvidence(buildEvidence);
  const ledgerSha256Before = await fileSha256(ledgerPath);
  const compilerReportSha256 = await fileSha256(compilerReportPath);
  let budget: PaidEvalBudget | null = null;
  let paidUsageBefore: PaidEvalBudgetSnapshot | null = null;
  let paidUsageAfter: PaidEvalBudgetSnapshot | null = null;
  let recoveredPlans: RecoveredProgramPlanSet | null = null;
  let compilerContractEvidence: CompilerLiveEvidence | null = null;
  let compilerEvidenceBuildSha: string | null = null;
  let sourceProgramPaidEntries: readonly PaidEvalBudgetSnapshot["entries"][number][] =
    [];
  let result: ReplayResult | null = null;
  let replayFailureCode: string | null = null;
  let paidRunStartRequestCount: number | null = null;

  try {
    budget = await PaidEvalBudget.open({
      ledgerPath,
      beforeReservation: () => {
        requireUnchangedCleanBuildEvidence(buildEvidence);
      },
    });
    paidUsageBefore = budget.snapshot();
    recoveredPlans = checkpointPath
      ? await loadRecoveredProgramPlanCheckpoint(
          checkpointPath,
          programResponseIds,
        )
      : await retrieveRecoveredProgramPlans(
          programResponseIds,
          async (responseId) => {
            const openAI = getOpenAIClient({ paidEvaluation: true });
            return openAI.responses.retrieve(responseId, undefined, {
              maxRetries: 0,
            });
          },
        );
    sourceProgramPaidEntries = requireProgramResponseLedgerEvidence(
      recoveredPlans.entries,
      paidUsageBefore,
    );
    const compilerEvidenceBuild: BuildEvidence = recoveredPlans.sourceBuildSha
      ? {
          gitSha: recoveredPlans.sourceBuildSha,
          workingTreeClean: true,
        }
      : buildEvidence;
    compilerEvidenceBuildSha = compilerEvidenceBuild.gitSha;
    compilerContractEvidence = await requireCompilerLiveEvidence(
      compilerReportPath,
      compilerEvidenceBuild,
      paidUsageBefore.entries,
    );
    paidRunStartRequestCount = paidUsageBefore.requestCount;
    result = await runReplayCase({
      liveCase: selectedCase,
      recoveredPlans,
      budget,
      safetyIdentifier: `ff_live_replay_${randomBytes(16).toString("hex")}`,
    });
  } catch (error) {
    replayFailureCode = failureCode(error);
  } finally {
    if (budget) {
      paidUsageAfter = budget.snapshot();
      await budget.close();
    }
  }

  const completionBuildEvidence =
    requireUnchangedCleanBuildEvidence(buildEvidence);
  const ledgerSha256After = await fileSha256(ledgerPath);
  const paidRunEntries =
    paidUsageAfter && paidRunStartRequestCount !== null
      ? paidUsageAfter.entries.slice(paidRunStartRequestCount)
      : [];
  const newProgramGenerationCount = paidRunEntries.filter(
    (entry) => entry.operation === "generate_program",
  ).length;
  const freshIntentCallCount = paidRunEntries.filter(
    (entry) => entry.operation === "compile_intent",
  ).length;
  const replayPassed =
    result !== null &&
    replayFailureCode === null &&
    freshIntentCallCount === 1 &&
    newProgramGenerationCount === 0 &&
    compilerContractEvidence?.passed === true;

  await writeReport({
    reportVersion: 1,
    mode: "gpt-5.6-sol-live-response-replay",
    model: FOLDFORGE_MODEL,
    liveStatus: replayPassed ? "run" : "failed",
    evidenceScope:
      "One-case recovery of already-paid program plans; this is not the five-case release gate.",
    evidenceBoundary:
      "Only validated plan hashes, source response IDs, bounded repair evidence, and paid usage are recorded; prompts and complete model response bodies are excluded.",
    runStartedIso,
    runId,
    buildEvidence,
    completionBuildEvidence,
    source: recoveredPlans
      ? {
          kind: recoveredPlans.source,
          generationBuildSha: recoveredPlans.sourceBuildSha,
          checkpointSha256: recoveredPlans.sourceFileSha256,
          programResponseIds: recoveredPlans.entries.map(
            (entry) => entry.responseId,
          ),
          programPlanHashes: recoveredPlans.entries.map(
            (entry) => entry.planHash,
          ),
          paidEntries: sourceProgramPaidEntries,
        }
      : null,
    compilerReportSha256,
    compilerEvidenceBuildSha,
    compilerContractEvidence,
    ledgerSha256Before,
    ledgerSha256After,
    paidUsageBefore,
    paidUsageAfter,
    paidRunStartRequestCount,
    paidRunEntries,
    freshIntentCallCount,
    newProgramGenerationCount,
    result,
    replayFailureCode,
    replayPassed,
    releaseGatePassed: false,
  });
  if (!replayPassed) process.exitCode = 1;
}
