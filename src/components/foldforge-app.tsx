"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import type { FabricationPreviewMode } from "@/components/fabrication-preview";
import { FoldForgeResults } from "@/components/foldforge-results";
import {
  DEFAULT_PROMPT,
  DUCK_CREASE_PATTERN_PROMPT,
  FoldForgeStart,
  type AccessState,
  type ExamplePrompt,
  type SavedExampleId,
} from "@/components/foldforge-start";
import { buildFabricationCandidate } from "@/core/fabrication/candidate";
import {
  createFacetedDuckGiftBoxShowcase,
  createPullTabPopUpFlowerShowcase,
} from "@/core/fabrication/examples";
import { CandidateV2Schema } from "@/core/fabrication/schemas";
import { repairInputHash } from "@/core/fabrication/repair";
import type {
  CandidateV2,
  ExportFormat,
  FabricationIntentV1,
  FabricationProgramV1,
} from "@/core/fabrication/types";
import {
  AccessApiResponseSchema,
  CompileApiResponseSchema,
  FinalizeApiResponseSchema,
  HealthApiResponseSchema,
  IntentApiResponseSchema,
  ProgramsApiResponseSchema,
  RepairApiResponseSchema,
  StudioCheckpointSchema,
  type FinalizeApiResponse,
  type HealthApiResponse,
  type ProgramsApiResponse,
  type RepairEvidence,
} from "@/lib/api-contracts";
import {
  downloadCandidateExport,
  FoldForgeApiError,
  FoldForgeDiagnosticError,
  getJson,
  postJson,
} from "@/lib/client-api";
import {
  forgeDiagnostic,
  type ForgeDiagnosticV1,
} from "@/lib/forge-diagnostics";
import {
  forgePromptHash,
  forgeResultMatchesPrompt,
  sameForgeResultBinding,
  type ForgeResultBinding,
} from "@/lib/forge-result-binding";

import styles from "./foldforge-app.module.css";

type StudioPhase = "idle" | "intent" | "programs" | "repair" | "ready";
type ExperienceMode = "live" | "saved";

const CHECKPOINT_KEY = "foldforge.studio.checkpoint.v6";
const CHECKPOINT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const COMPILER_VERSION = "foldforge-fabrication-v1";
const BASE_SEED = 20_260_714;

const SAVED_EXAMPLE_GENERATED_AT = "2026-07-14T00:00:00.000Z";

const formatFailure = (error: unknown): string => {
  const diagnostic =
    error instanceof FoldForgeDiagnosticError
      ? error.diagnostic
      : error instanceof FoldForgeApiError
        ? error.diagnostic
        : null;
  if (diagnostic) {
    const failureSuffix =
      diagnostic.failureIds.length > 0
        ? ` Check: ${diagnostic.failureIds.slice(0, 3).join(", ")}.`
        : "";
    return `${diagnostic.message}${failureSuffix}`;
  }
  if (error instanceof FoldForgeApiError) return error.message;
  if (error instanceof z.ZodError) {
    return "The response could not be checked safely. Please try again.";
  }
  return "FoldForge stopped safely. Your saved work is unchanged.";
};

const newForgeAttemptId = (): string => crypto.randomUUID();

const candidateIdFor = (ordinal: number, program: FabricationProgramV1) =>
  `candidate-${ordinal}-${program.topologyId.slice(0, 48)}`;

const selectedCandidate = (candidate: CandidateV2): CandidateV2 =>
  CandidateV2Schema.parse({
    ...candidate,
    selectionStatus: "selected",
    exportMetadata: {
      ...candidate.exportMetadata,
      selectedCandidateId: candidate.candidateId,
    },
  });

const buildCandidate = (
  candidateId: string,
  intent: FabricationIntentV1,
  program: FabricationProgramV1,
  ordinal: number,
  generatedAtIso: string,
  appliedPatchIds: readonly string[],
  repairCycle: number,
  generationProvenance: ProgramsApiResponse["proposal"]["provenance"] | null,
): CandidateV2 | null => {
  const built = buildFabricationCandidate({
    candidateId,
    intent,
    program,
    rank: null,
    selectionStatus: "eligible",
    provenance: {
      compilerVersion: COMPILER_VERSION,
      generatedAtIso,
      deterministicSeed: BASE_SEED + ordinal,
      modelId: generationProvenance?.modelId ?? null,
      modelResponseId: generationProvenance?.modelResponseId ?? null,
      modelPlanHash: generationProvenance?.planHash ?? null,
      planExpanderVersion: generationProvenance?.expanderVersion ?? null,
      parentCandidateId: null,
      appliedPatchIds,
      repairCycle,
    },
  });
  return built.ok ? built.value : null;
};

const rankedCandidates = (
  candidates: readonly CandidateV2[],
): readonly CandidateV2[] =>
  [...candidates]
    .sort(
      (left, right) =>
        (right.score.totalScore ?? 0) - (left.score.totalScore ?? 0),
    )
    .map((candidate, index) =>
      CandidateV2Schema.parse({
        ...candidate,
        rank: index + 1,
        selectionStatus: index === 0 ? "recommended" : "eligible",
      }),
    );

const fallbackLimitations = (candidate: CandidateV2): readonly string[] => [
  `Use ${candidate.program.sheets.map((sheet) => sheet.material.label).join(", ")}.`,
  `This design uses no more than ${candidate.intent.fabricationBudget.maximumPanels} pieces and ${candidate.intent.fabricationBudget.maximumJointAndConnectorCount} joins.`,
  `Glue ${candidate.intent.fabricationBudget.glueAllowed ? "may be used" : "is not needed"}.`,
];

export function FoldForgeApp() {
  const [health, setHealth] = useState<HealthApiResponse | null>(null);
  const [accessState, setAccessState] = useState<AccessState>("unknown");
  const [accessCode, setAccessCode] = useState("");
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [resultBinding, setResultBinding] = useState<ForgeResultBinding | null>(
    null,
  );
  const [intent, setIntent] = useState<FabricationIntentV1 | null>(null);
  const [candidates, setCandidates] = useState<readonly CandidateV2[]>([]);
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>("live");
  const [savedLimitation, setSavedLimitation] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [repairEvidence, setRepairEvidence] = useState<
    Record<string, readonly RepairEvidence[]>
  >({});
  const [narrative, setNarrative] = useState<
    FinalizeApiResponse["narrative"] | null
  >(null);
  const [phase, setPhase] = useState<StudioPhase>("idle");
  const [statusMessage, setStatusMessage] = useState("Ready.");
  const [error, setError] = useState("");
  const [previewMode, setPreviewMode] =
    useState<FabricationPreviewMode>("assembled");
  const [motionPosition, setMotionPosition] = useState(0.65);
  const [rotationDeg, setRotationDeg] = useState(-18);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(
    null,
  );
  const [finalizing, setFinalizing] = useState(false);
  const [checkpointReady, setCheckpointReady] = useState(false);
  const accessCodeInputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocusResultsRef = useRef(false);
  const forgeInFlightRef = useRef(false);
  const latestPromptRef = useRef(prompt);
  const activeForgeBindingRef = useRef<ForgeResultBinding | null>(null);
  const resultBindingRef = useRef<ForgeResultBinding | null>(null);

  const busy = phase === "intent" || phase === "programs" || phase === "repair";
  const solAvailable = health?.liveAiEnabled === true;
  const baseSelected = useMemo(
    () =>
      experienceMode === "saved" ||
      forgeResultMatchesPrompt(resultBinding, prompt)
        ? (candidates.find(
            (candidate) => candidate.candidateId === selectedId,
          ) ??
          candidates[0] ??
          null)
        : null,
    [candidates, experienceMode, prompt, resultBinding, selectedId],
  );
  const exportCandidate = useMemo(
    () => (baseSelected ? selectedCandidate(baseSelected) : null),
    [baseSelected],
  );
  const selectedRepairs = baseSelected
    ? (repairEvidence[baseSelected.candidateId] ?? [])
    : [];

  useEffect(() => {
    void getJson("/api/health", HealthApiResponseSchema)
      .then((nextHealth) => {
        setHealth(nextHealth);
        if (!nextHealth.liveAiEnabled) {
          setStatusMessage(
            "Live generation is off. Saved examples are still available.",
          );
        }
      })
      .catch((healthError: unknown) => setError(formatFailure(healthError)));
  }, []);

  useEffect(() => {
    let restored: z.infer<typeof StudioCheckpointSchema> | null = null;
    try {
      const raw = window.localStorage.getItem(CHECKPOINT_KEY);
      if (raw) {
        const parsed = StudioCheckpointSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          const age = Date.now() - Date.parse(parsed.data.savedAt);
          if (age >= 0 && age <= CHECKPOINT_MAX_AGE_MS) restored = parsed.data;
        }
      }
    } catch {
      window.localStorage.removeItem(CHECKPOINT_KEY);
    }

    const restoreTimer = window.setTimeout(() => {
      if (restored) {
        setExperienceMode("live");
        setPrompt(restored.prompt);
        latestPromptRef.current = restored.prompt;
        setResultBinding(restored.resultBinding);
        resultBindingRef.current = restored.resultBinding;
        setIntent(restored.intent);
        setCandidates(restored.candidates);
        setSelectedId(restored.selectedId);
        setRepairEvidence(restored.repairEvidence);
        setNarrative(restored.narrative);
      }
      if (restored && restored.candidates.length > 0) {
        setPhase("ready");
        setStatusMessage("Checkpoint restored.");
      }
      setCheckpointReady(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!checkpointReady || experienceMode === "saved") return;
    const checkpoint = StudioCheckpointSchema.parse({
      version: 4,
      savedAt: new Date().toISOString(),
      prompt,
      resultBinding,
      intent,
      candidates,
      selectedId,
      repairEvidence,
      narrative,
    });
    try {
      window.localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint));
    } catch {
      // A quota failure does not affect the active in-memory studio.
    }
  }, [
    candidates,
    checkpointReady,
    experienceMode,
    intent,
    narrative,
    prompt,
    repairEvidence,
    resultBinding,
    selectedId,
  ]);

  useEffect(() => {
    if (
      phase !== "ready" ||
      candidates.length === 0 ||
      !shouldFocusResultsRef.current
    ) {
      return;
    }
    shouldFocusResultsRef.current = false;
    resultsHeadingRef.current?.focus();
  }, [candidates, phase]);

  useEffect(() => {
    if (accessState === "needed") accessCodeInputRef.current?.focus();
  }, [accessState]);

  const requireAccess = useCallback((requestError: unknown): boolean => {
    if (
      requestError instanceof FoldForgeApiError &&
      requestError.code === "ACCESS_REQUIRED"
    ) {
      setAccessState("needed");
      setError("Enter the demo access code, then try again.");
      return true;
    }
    return false;
  }, []);

  const unlock = async () => {
    setError("");
    try {
      await postJson(
        "/api/access",
        { code: accessCode },
        AccessApiResponseSchema,
      );
      setAccessCode("");
      setAccessState("granted");
      setStatusMessage("Access granted.");
    } catch (unlockError) {
      setError(formatFailure(unlockError));
    }
  };

  const forge = async () => {
    if (
      !solAvailable ||
      busy ||
      forgeInFlightRef.current ||
      prompt.trim().length === 0
    ) {
      return;
    }
    forgeInFlightRef.current = true;
    const requestedPrompt = prompt.trim();
    const forgeAttemptId = newForgeAttemptId();
    const forgeBinding: ForgeResultBinding = {
      attemptId: forgeAttemptId,
      promptHash: forgePromptHash(requestedPrompt),
    };
    activeForgeBindingRef.current = forgeBinding;
    latestPromptRef.current = requestedPrompt;
    setPrompt(requestedPrompt);
    setError("");
    setExperienceMode("live");
    setSavedLimitation(null);
    setIntent(null);
    setCandidates([]);
    setSelectedId("");
    setRepairEvidence({});
    setNarrative(null);
    setResultBinding(null);
    resultBindingRef.current = null;
    setPhase("intent");
    setStatusMessage("Understanding your request…");
    const generatedAtIso = new Date().toISOString();

    try {
      const nextIntent = await postJson(
        "/api/intent",
        { prompt: requestedPrompt },
        IntentApiResponseSchema,
        { attemptId: forgeAttemptId, stage: "intent" },
      );
      if (nextIntent.scopeStatus !== "supported") {
        setPhase("idle");
        setError(
          nextIntent.clarificationQuestion ??
            nextIntent.unsupportedReason ??
            "Add one more detail so FoldForge can build this safely.",
        );
        return;
      }

      const evidenceByCandidate: Record<string, RepairEvidence[]> = {};
      const ordinal = 1;
      setPhase("programs");
      setStatusMessage("Creating your design…");
      const generated = await postJson(
        "/api/programs",
        {
          intent: nextIntent,
          candidateOrdinal: ordinal,
          usedTopologyIds: [],
        },
        ProgramsApiResponseSchema,
        { attemptId: forgeAttemptId, stage: "program" },
      );

      const candidateId = candidateIdFor(ordinal, generated.proposal.program);
      let currentProgram = generated.proposal.program;
      let evaluation = await postJson(
        "/api/compile",
        { intent: nextIntent, program: currentProgram, candidateId },
        CompileApiResponseSchema,
        { stage: "compile" },
      );
      const evidence: RepairEvidence[] = [];
      const appliedPatchIds: string[] = [];
      const seenRepairInputs = new Set<string>();
      let repairCycle = 0;
      let passed = evaluation.status === "passed";
      let terminalDiagnostic: ForgeDiagnosticV1 | null =
        evaluation.status === "passed" ? null : evaluation.diagnostic;

      for (
        let cycle = 1;
        evaluation.status === "invalid" && cycle <= 5;
        cycle += 1
      ) {
        const repairableHardFailure = evaluation.report.failures.find(
          (failure) =>
            failure.severity === "hard" &&
            failure.repairableProgramPaths.length > 0,
        );
        if (!repairableHardFailure) {
          terminalDiagnostic = forgeDiagnostic({
            stage: "repair",
            kind: "repair",
            code: "REPAIR_INFEASIBLE",
            message:
              evaluation.diagnostic.message +
              " No paid repair was attempted because this failure has no bounded repair path.",
            modelCall: "not_started",
            failureIds: evaluation.diagnostic.failureIds,
            failedAtStage: evaluation.diagnostic.failedAtStage,
            repairCycle: cycle,
          });
          break;
        }
        const canonicalRepairInput = repairInputHash(
          currentProgram,
          evaluation.report,
        );
        if (seenRepairInputs.has(canonicalRepairInput)) {
          terminalDiagnostic = forgeDiagnostic({
            stage: "repair",
            kind: "repair",
            code: "DUPLICATE_REPAIR_INPUT",
            message:
              "The same checked design reached repair twice, so no additional paid repair was attempted.",
            modelCall: "not_started",
            failureIds: evaluation.diagnostic.failureIds,
            failedAtStage: evaluation.diagnostic.failedAtStage,
            repairCycle: cycle,
          });
          break;
        }
        seenRepairInputs.add(canonicalRepairInput);
        setPhase("repair");
        setStatusMessage("Checking and improving your design…");
        const failure =
          evaluation.report.failures.find(
            (entry) => entry.severity === "hard",
          ) ?? evaluation.report.failures[0];
        const repaired = await postJson(
          "/api/repair",
          {
            intent: nextIntent,
            program: currentProgram,
            candidateId,
            repairCycle: cycle,
          },
          RepairApiResponseSchema,
          { attemptId: forgeAttemptId, stage: "repair" },
        );
        terminalDiagnostic = repaired.diagnostic;
        if (
          repaired.patch &&
          (repaired.status === "passed" || repaired.status === "still_invalid")
        ) {
          evidence.push({
            cycle,
            beforeFailureId: failure?.failureId ?? "verification.failure",
            beforeFailureMessage:
              failure?.message ?? "A hard verifier check failed.",
            patch: repaired.patch,
            result: repaired.status,
          });
          appliedPatchIds.push(repaired.patch.patchId);
        }
        if (repaired.status === "infeasible") break;
        currentProgram = repaired.program;
        repairCycle = cycle;
        if (repaired.status === "passed") {
          passed = true;
          break;
        }
        if (!repaired.ir || !repaired.report || !repaired.score) break;
        evaluation = {
          status: "invalid",
          candidateId,
          ir: repaired.ir,
          report: repaired.report,
          score: repaired.score,
          diagnostic: repaired.diagnostic,
        };
      }

      if (!passed) {
        throw new FoldForgeDiagnosticError(
          terminalDiagnostic ??
            forgeDiagnostic({
              stage: "compile",
              kind: "unknown",
              code: "DESIGN_NOT_VERIFIED",
              message: "The generated design did not pass verification.",
            }),
        );
      }
      const candidate = buildCandidate(
        candidateId,
        nextIntent,
        currentProgram,
        ordinal,
        generatedAtIso,
        appliedPatchIds,
        repairCycle,
        generated.proposal.provenance,
      );
      if (!candidate) {
        throw new FoldForgeDiagnosticError(
          forgeDiagnostic({
            stage: "compile",
            kind: "compilation",
            code: "CANDIDATE_BUILD_FAILED",
            message:
              "The verified program could not be assembled into a source-equivalent candidate.",
          }),
        );
      }
      if (evidence.length > 0) evidenceByCandidate[candidateId] = evidence;

      const ranked = rankedCandidates([candidate]);
      const checkedDesign = ranked[0];
      if (!checkedDesign) {
        throw new FoldForgeDiagnosticError(
          forgeDiagnostic({
            stage: "compile",
            kind: "compilation",
            code: "CANDIDATE_SELECTION_FAILED",
            message: "The verified candidate could not be selected safely.",
          }),
        );
      }
      if (
        !sameForgeResultBinding(activeForgeBindingRef.current, forgeBinding) ||
        !forgeResultMatchesPrompt(forgeBinding, latestPromptRef.current)
      ) {
        throw new FoldForgeDiagnosticError(
          forgeDiagnostic({
            stage: "compile",
            kind: "request",
            code: "STALE_FORGE_RESULT",
            message:
              "The prompt changed before this design completed, so the result was discarded.",
            modelCall: "not_applicable",
          }),
        );
      }
      setIntent(nextIntent);
      setCandidates([checkedDesign]);
      setSelectedId(checkedDesign.candidateId);
      setRepairEvidence(evidenceByCandidate);
      setNarrative(null);
      setResultBinding(forgeBinding);
      resultBindingRef.current = forgeBinding;
      shouldFocusResultsRef.current = true;
      setPhase("ready");
      setAccessState("granted");
      setStatusMessage("Your checked design is ready.");
    } catch (forgeError) {
      if (sameForgeResultBinding(activeForgeBindingRef.current, forgeBinding)) {
        setPhase("idle");
        if (!requireAccess(forgeError)) setError(formatFailure(forgeError));
      }
    } finally {
      if (sameForgeResultBinding(activeForgeBindingRef.current, forgeBinding)) {
        activeForgeBindingRef.current = null;
      }
      forgeInFlightRef.current = false;
    }
  };

  const chooseCandidate = (candidateId: string) => {
    setSelectedId(candidateId);
    setMotionPosition(0.65);
    setNarrative(null);
    setStatusMessage("Design selected.");
  };

  const applyExamplePrompt = (example: ExamplePrompt) => {
    setPrompt(example.prompt);
    latestPromptRef.current = example.prompt;
    setIntent(null);
    setCandidates([]);
    setSelectedId("");
    setRepairEvidence({});
    setNarrative(null);
    setResultBinding(null);
    resultBindingRef.current = null;
    setExperienceMode("live");
    setSavedLimitation(null);
    setPhase("idle");
    setError("");
    setStatusMessage(`${example.title} prompt ready to edit.`);
    promptRef.current?.focus();
  };

  const openSavedExample = (exampleId: SavedExampleId) => {
    const showcase =
      exampleId === "duck"
        ? createFacetedDuckGiftBoxShowcase()
        : createPullTabPopUpFlowerShowcase();
    const isDuck = exampleId === "duck";
    const program: FabricationProgramV1 = {
      ...showcase.program,
      candidateLabel: isDuck
        ? "Static duck crease pattern"
        : "Vertical-lift flower study",
      designSummary: isDuck
        ? "A prepared static crease-pattern study with a faceted duck silhouette. The verified file contains cut and score geometry only; no lid motion or open-and-close animation is modeled."
        : "A prepared motion study: a directly driven vertical tab moves a rigid flower crown 30 mm along its guide.",
    };
    const candidate = buildCandidate(
      `saved-example-${exampleId}`,
      showcase.intent,
      program,
      1,
      SAVED_EXAMPLE_GENERATED_AT,
      [],
      0,
      null,
    );
    if (!candidate) {
      setError("The saved example could not be opened safely.");
      return;
    }

    const ranked = rankedCandidates([candidate]);
    const savedPrompt = isDuck ? DUCK_CREASE_PATTERN_PROMPT : showcase.prompt;
    const savedBinding: ForgeResultBinding = {
      attemptId: newForgeAttemptId(),
      promptHash: forgePromptHash(savedPrompt),
    };
    setPrompt(savedPrompt);
    latestPromptRef.current = savedPrompt;
    setIntent(showcase.intent);
    setCandidates(ranked);
    setSelectedId(ranked[0]?.candidateId ?? "");
    setRepairEvidence({});
    setNarrative(null);
    setResultBinding(savedBinding);
    resultBindingRef.current = savedBinding;
    setExperienceMode("saved");
    setSavedLimitation(showcase.limitation);
    setPreviewMode("assembled");
    setMotionPosition(isDuck ? 0 : 0.65);
    setError("");
    shouldFocusResultsRef.current = true;
    setPhase("ready");
    setStatusMessage(
      `Saved ${isDuck ? "static duck crease-pattern" : "vertical-lift flower"} example opened.`,
    );
  };

  const exportFormat = async (format: ExportFormat) => {
    if (!exportCandidate || exportingFormat) return;
    setError("");
    setExportingFormat(format);
    setStatusMessage(`Preparing ${format.toUpperCase()}…`);
    try {
      const filename = await downloadCandidateExport(format, exportCandidate);
      setStatusMessage(`${filename} downloaded.`);
    } catch (exportError) {
      setError(formatFailure(exportError));
    } finally {
      setExportingFormat(null);
    }
  };

  const finalizeNarrative = async () => {
    if (
      !exportCandidate ||
      !resultBinding ||
      !forgeResultMatchesPrompt(resultBinding, prompt) ||
      finalizing ||
      !solAvailable
    ) {
      return;
    }
    const finalizingBinding = resultBinding;
    setFinalizing(true);
    setError("");
    setStatusMessage("Writing concise build notes…");
    try {
      const result = await postJson(
        "/api/finalize",
        { candidate: exportCandidate },
        FinalizeApiResponseSchema,
        { attemptId: finalizingBinding.attemptId, stage: "finalize" },
      );
      if (
        !sameForgeResultBinding(resultBindingRef.current, finalizingBinding) ||
        !forgeResultMatchesPrompt(finalizingBinding, latestPromptRef.current)
      ) {
        return;
      }
      setNarrative(result.narrative);
      setAccessState("granted");
      setStatusMessage("Build notes ready.");
    } catch (finalizeError) {
      if (
        sameForgeResultBinding(resultBindingRef.current, finalizingBinding) &&
        forgeResultMatchesPrompt(finalizingBinding, latestPromptRef.current) &&
        !requireAccess(finalizeError)
      ) {
        setError(formatFailure(finalizeError));
      }
    } finally {
      setFinalizing(false);
    }
  };

  const limitations = baseSelected
    ? (narrative?.limitations ?? [
        ...(savedLimitation ? [savedLimitation] : []),
        ...fallbackLimitations(baseSelected),
      ])
    : [];
  const assemblySteps = baseSelected
    ? [...baseSelected.program.blueprint.assemblyOperations]
        .sort((left, right) => left.order - right.order)
        .map((operation) => operation.instruction)
    : [];

  return (
    <div className={styles.shell} id="top">
      <a className={styles.skipLink} href="#studio-main">
        Skip to studio
      </a>
      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label="FoldForge home">
          <span aria-hidden="true">FF</span>
          FoldForge
        </a>
        <div className={styles.healthGroup}>
          <span
            className={`${styles.statusPill ?? ""} ${solAvailable ? (styles.live ?? "") : (styles.offline ?? "")}`}
          >
            <span aria-hidden="true" />
            {!health
              ? "Checking live generation"
              : solAvailable
                ? accessState === "granted"
                  ? "Live generation ready · access granted"
                  : accessState === "needed"
                    ? "Live generation ready · access needed"
                    : "Live generation ready"
                : "Live generation off"}
          </span>
          {candidates.length > 0 ? (
            <span className={styles.checkpointLabel}>
              {experienceMode === "saved"
                ? "Saved example open"
                : "Checkpoint saved"}
            </span>
          ) : null}
        </div>
      </header>

      <main className={styles.main} id="studio-main">
        <FoldForgeStart
          accessCode={accessCode}
          accessCodeInputRef={accessCodeInputRef}
          accessState={accessState}
          busy={busy}
          healthKnown={health !== null}
          liveGenerationAvailable={solAvailable}
          onAccessCodeChange={setAccessCode}
          onCreate={() => void forge()}
          onOpenSavedExample={openSavedExample}
          onPromptChange={(nextPrompt) => {
            latestPromptRef.current = nextPrompt;
            setPrompt(nextPrompt);
            if (candidates.length > 0) {
              setIntent(null);
              setCandidates([]);
              setSelectedId("");
              setRepairEvidence({});
              setNarrative(null);
              setResultBinding(null);
              resultBindingRef.current = null;
              setExperienceMode("live");
              setSavedLimitation(null);
              setPhase("idle");
              setStatusMessage(
                "Prompt changed. Create a new design to continue.",
              );
            }
          }}
          onSelectExample={applyExamplePrompt}
          onSubmitAccess={() => void unlock()}
          prompt={prompt}
          promptRef={promptRef}
        />

        <p className={styles.liveRegion} aria-live="polite" aria-atomic="true">
          {statusMessage}
        </p>
        {error ? (
          <div className={styles.errorBanner} role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")}>
              Dismiss
            </button>
          </div>
        ) : null}

        {candidates.length > 0 && baseSelected ? (
          <FoldForgeResults
            assemblySteps={assemblySteps}
            buildSha={health?.buildSha ?? null}
            candidates={candidates}
            experienceMode={experienceMode}
            exportingFormat={exportingFormat}
            finalizing={finalizing}
            limitations={limitations}
            liveGenerationAvailable={solAvailable}
            motionPosition={motionPosition}
            narrative={narrative}
            onChooseCandidate={chooseCandidate}
            onExport={(format) => void exportFormat(format)}
            onFinalize={() => void finalizeNarrative()}
            onMotionPositionChange={setMotionPosition}
            onPreviewModeChange={setPreviewMode}
            onRotationChange={setRotationDeg}
            previewMode={previewMode}
            repairs={selectedRepairs}
            resultsHeadingRef={resultsHeadingRef}
            rotationDeg={rotationDeg}
            selected={baseSelected}
          />
        ) : null}
      </main>
    </div>
  );
}
