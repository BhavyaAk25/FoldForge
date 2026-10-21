"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import type { FabricationPreviewMode } from "@/components/fabrication-preview";
import dynamic from "next/dynamic";
import {
  DEFAULT_PROMPT,
  FoldForgeStart,
  type ExamplePrompt,
} from "@/components/foldforge-start";
import { CandidateV2Schema } from "@/core/fabrication/schemas";

import type {
  CandidateV2,
  ExportFormat,
  FabricationIntentV1,
  FabricationProgramV1,
} from "@/core/fabrication/types";
import {
  CompileApiResponseSchema,
  FinalizeApiResponseSchema,
  HealthApiResponseSchema,
  IntentApiResponseSchema,
  ProgramsApiResponseSchema,
  SavedExampleApiResponseSchema,
  StudioCheckpointSchema,
  type FinalizeApiResponse,
  type FoldExport,
  type HealthApiResponse,
} from "@/lib/api-contracts";
import type { SavedExampleId } from "@/lib/saved-examples";
import {
  downloadCandidateExport,
  FoldForgeApiError,
  FoldForgeDiagnosticError,
  getJson,
  postJson,
} from "@/lib/client-api";
import { forgeDiagnostic } from "@/lib/forge-diagnostics";
import {
  OrigamiPayloadSchema,
  type OrigamiPayloadResponse,
} from "@/lib/origami-contract";
import {
  PapercraftPayloadSchema,
  type Alternative,
  PopupPayloadSchema,
  RouteResponseSchema,
  type PapercraftPayload,
  type PopupPayload,
} from "@/lib/papercraft-contract";
import {
  forgePromptHash,
  forgeResultMatchesPrompt,
  sameForgeResultBinding,
  type ForgeResultBinding,
} from "@/lib/forge-result-binding";

import styles from "./foldforge-app.module.css";

// The results panel carries the 3D engine, so it loads only once a design
// exists; the start screen stays light.
const loadResultsPanel = () => import("./foldforge-results");
const FoldForgeResults = dynamic(
  () => loadResultsPanel().then((module) => module.FoldForgeResults),
  { ssr: false },
);

const loadPopupPanel = () => import("./popup-results");
const PopupResults = dynamic(
  () => loadPopupPanel().then((module) => module.PopupResults),
  { ssr: false },
);

const loadPapercraftPanel = () => import("./papercraft-results");
const PapercraftResults = dynamic(
  () => loadPapercraftPanel().then((module) => module.PapercraftResults),
  { ssr: false },
);

const loadOrigamiPanel = () => import("./origami-results");
const OrigamiResults = dynamic(
  () => loadOrigamiPanel().then((module) => module.OrigamiResults),
  { ssr: false },
);

type StudioPhase = "idle" | "intent" | "programs" | "ready";
type ExperienceMode = "live" | "saved";

const CHECKPOINT_KEY = "foldforge.studio.checkpoint.v7";
const CHECKPOINT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
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

const fallbackLimitations = (candidate: CandidateV2): readonly string[] => [
  `Use ${candidate.program.sheets.map((sheet) => sheet.material.label).join(", ")}.`,
  `This design uses no more than ${candidate.intent.fabricationBudget.maximumPanels} pieces and ${candidate.intent.fabricationBudget.maximumJointAndConnectorCount} joins.`,
  `Glue ${candidate.intent.fabricationBudget.glueAllowed ? "may be used" : "is not needed"}.`,
];

export function FoldForgeApp() {
  const [health, setHealth] = useState<HealthApiResponse | null>(null);
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [resultBinding, setResultBinding] = useState<ForgeResultBinding | null>(
    null,
  );
  const [intent, setIntent] = useState<FabricationIntentV1 | null>(null);
  const [candidates, setCandidates] = useState<readonly CandidateV2[]>([]);
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>("live");
  const [generationSource, setGenerationSource] = useState<
    "synthesis" | "template" | null
  >(null);
  const [savedLimitation, setSavedLimitation] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [foldExports, setFoldExports] = useState<Record<string, FoldExport>>(
    {},
  );
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
  const [resultsFocusRequest, setResultsFocusRequest] = useState(0);
  const [origami, setOrigami] = useState<{
    readonly payload: OrigamiPayloadResponse;
    readonly paperMm: number;
    readonly paperColor: string;
    /** Why the AI picked this model, when the prompt named none. */
    readonly aiReason: string | null;
    /** The subject a generated design was made for. */
    readonly title: string | null;
    /** The same subject as cut-and-glue papercraft, built on request. */
    readonly alternative: Alternative | null;
  } | null>(null);
  const [popup, setPopup] = useState<{
    readonly payload: PopupPayload;
    readonly aiReason: string | null;
  } | null>(null);
  const [papercraft, setPapercraft] = useState<{
    readonly payload: PapercraftPayload;
    readonly aiReason: string | null;
  } | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const forgeInFlightRef = useRef(false);
  const latestPromptRef = useRef(prompt);
  const activeForgeBindingRef = useRef<ForgeResultBinding | null>(null);
  const resultBindingRef = useRef<ForgeResultBinding | null>(null);

  const busy = phase === "intent" || phase === "programs";
  const aiAvailable = health?.liveAiEnabled === true;
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
  const selectedFoldExport = baseSelected
    ? (foldExports[baseSelected.candidateId] ?? null)
    : null;

  useEffect(() => {
    void getJson("/api/health", HealthApiResponseSchema)
      .then((nextHealth) => {
        setHealth(nextHealth);
        if (!nextHealth.liveAiEnabled) {
          setStatusMessage(
            "No AI key configured: boxes, pop-up cards, and stand-up figures still work through parametric templates.",
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
        setFoldExports(restored.foldExports);
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
      version: 5,
      savedAt: new Date().toISOString(),
      prompt,
      resultBinding,
      intent,
      candidates,
      selectedId,
      foldExports,
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
    foldExports,
    narrative,
    prompt,
    resultBinding,
    selectedId,
  ]);

  /** Builds a pop-up card or 3D papercraft figure: a route's answer or an origami result's alternative. */
  const buildPapercraft = async (
    choice: Alternative,
    aiReason: string | null,
    current: () => boolean,
  ): Promise<void> => {
    setPhase("programs");
    if (choice.engine === "popup") {
      void loadPopupPanel();
      setStatusMessage(`Building the ${choice.card.title.toLowerCase()}…`);
      const payload = await postJson(
        "/api/popup",
        { card: choice.card },
        PopupPayloadSchema,
      );
      if (!current()) return;
      setPopup({ payload, aiReason });
      setPhase("ready");
      setStatusMessage(`${payload.card.title}: printable card ready.`);
      return;
    }
    void loadPapercraftPanel();
    setStatusMessage(`Building the ${choice.figure.title.toLowerCase()}…`);
    const payload = await postJson(
      "/api/papercraft",
      { figure: choice.figure },
      PapercraftPayloadSchema,
    );
    if (!current()) return;
    setPapercraft({ payload, aiReason });
    setPhase("ready");
    setStatusMessage(`${payload.title}: printable 3D papercraft ready.`);
  };

  const forge = async () => {
    if (busy || forgeInFlightRef.current || prompt.trim().length === 0) {
      return;
    }
    forgeInFlightRef.current = true;
    // Fetch the 3D results panel while the server designs.
    void loadResultsPanel();
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
    setGenerationSource(null);
    setIntent(null);
    setCandidates([]);
    setSelectedId("");
    setFoldExports({});
    setNarrative(null);
    setResultBinding(null);
    resultBindingRef.current = null;
    setOrigami(null);
    setPapercraft(null);
    setPopup(null);
    setPhase("intent");
    setStatusMessage("Understanding your request…");

    try {
      // The server routes the prompt: origami, a 3D papercraft figure, or
      // the mechanism engine below (boxes, cards, stands). Words decide
      // first; only an unrecognised prompt costs an AI call.
      const route = await postJson(
        "/api/choose",
        { prompt: requestedPrompt },
        RouteResponseSchema,
      );
      const current = () =>
        sameForgeResultBinding(activeForgeBindingRef.current, forgeBinding);
      if (route.engine === "origami") {
        void loadOrigamiPanel();
        const payload = await getJson(
          `/api/origami/${route.modelId}`,
          OrigamiPayloadSchema,
        );
        if (!current()) return;
        setOrigami({
          payload,
          paperMm: route.paperSizeMm,
          paperColor: route.paperColor,
          aiReason: route.reason,
          title: route.title,
          alternative: route.alternative,
        });
        setPhase("ready");
        setStatusMessage(
          `${route.title ?? payload.name}: folding sequence ready.`,
        );
        return;
      }
      if (route.engine === "popup" || route.engine === "figure") {
        await buildPapercraft(route, route.reason, current);
        return;
      }

      const nextIntent = await postJson(
        "/api/intent",
        { prompt: requestedPrompt },
        IntentApiResponseSchema,
        { stage: "intent" },
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
        { stage: "program" },
      );

      // A template fallback may verify against a relaxed intent; every later
      // check and the export must use exactly that one.
      const verifiedIntent = generated.intent;
      const candidateId = candidateIdFor(ordinal, generated.proposal.program);
      const currentProgram = generated.proposal.program;
      // The server compiles, verifies, and scores the design once and
      // returns the finished candidate; the browser only renders it.
      const { modelId, modelResponseId, planHash, expanderVersion } =
        generated.proposal.provenance;
      const evaluation = await postJson(
        "/api/compile",
        {
          intent: verifiedIntent,
          program: currentProgram,
          candidateId,
          generation: { modelId, modelResponseId, planHash, expanderVersion },
        },
        CompileApiResponseSchema,
        { stage: "compile" },
      );
      if (evaluation.status !== "passed") {
        throw new FoldForgeDiagnosticError(
          forgeDiagnostic({
            stage: "compile",
            kind: "contract",
            code: "SERVER_VERIFICATION_DRIFT",
            message:
              "The server-selected program did not reproduce its verified result.",
            modelCall: "not_applicable",
            failureIds: evaluation.diagnostic.failureIds,
            failedAtStage: evaluation.diagnostic.failedAtStage,
          }),
        );
      }
      const checkedDesign = evaluation.candidate;
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
      setIntent(verifiedIntent);
      setCandidates([checkedDesign]);
      setSelectedId(checkedDesign.candidateId);
      setGenerationSource(
        generated.proposal.provenance.generationSource ?? null,
      );
      setFoldExports({ [checkedDesign.candidateId]: evaluation.foldExport });
      setNarrative(null);
      setResultBinding(forgeBinding);
      resultBindingRef.current = forgeBinding;
      setResultsFocusRequest((request) => request + 1);
      setPhase("ready");
      setStatusMessage("Your checked design is ready.");
    } catch (forgeError) {
      if (sameForgeResultBinding(activeForgeBindingRef.current, forgeBinding)) {
        setPhase("idle");
        setError(formatFailure(forgeError));
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
    setOrigami(null);
    setPapercraft(null);
    setPopup(null);
    setPrompt(example.prompt);
    latestPromptRef.current = example.prompt;
    setIntent(null);
    setCandidates([]);
    setGenerationSource(null);
    setSelectedId("");
    setFoldExports({});
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

  const openSavedExample = async (exampleId: SavedExampleId) => {
    setError("");
    void loadResultsPanel();
    let example;
    try {
      example = await getJson(
        `/api/examples/${exampleId}`,
        SavedExampleApiResponseSchema,
      );
    } catch (exampleError) {
      setError(formatFailure(exampleError));
      return;
    }
    const { candidate } = example;
    setOrigami(null);
    setPapercraft(null);
    setPopup(null);
    const savedBinding: ForgeResultBinding = {
      attemptId: newForgeAttemptId(),
      promptHash: forgePromptHash(example.prompt),
    };
    setPrompt(example.prompt);
    latestPromptRef.current = example.prompt;
    setIntent(candidate.intent);
    setCandidates([candidate]);
    setSelectedId(candidate.candidateId);
    setFoldExports({ [candidate.candidateId]: example.foldExport });
    setNarrative(null);
    setResultBinding(savedBinding);
    resultBindingRef.current = savedBinding;
    setExperienceMode("saved");
    setGenerationSource(null);
    setSavedLimitation(example.limitation);
    setPreviewMode("assembled");
    setMotionPosition(0.65);
    setResultsFocusRequest((request) => request + 1);
    setPhase("ready");
    setStatusMessage("Saved vertical-lift flower example opened.");
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
      !aiAvailable
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
        { stage: "finalize" },
      );
      if (
        !sameForgeResultBinding(resultBindingRef.current, finalizingBinding) ||
        !forgeResultMatchesPrompt(finalizingBinding, latestPromptRef.current)
      ) {
        return;
      }
      setNarrative(result.narrative);
      setStatusMessage("Build notes ready.");
    } catch (finalizeError) {
      if (
        sameForgeResultBinding(resultBindingRef.current, finalizingBinding) &&
        forgeResultMatchesPrompt(finalizingBinding, latestPromptRef.current)
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
            className={`${styles.statusPill ?? ""} ${aiAvailable ? (styles.live ?? "") : (styles.offline ?? "")}`}
          >
            <span aria-hidden="true" />
            {!health
              ? "Checking AI"
              : aiAvailable
                ? `AI ready · ${health.aiModel ?? "model"}`
                : "Template mode · no AI key"}
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
          busy={busy}
          healthKnown={health !== null}
          aiAvailable={aiAvailable}
          onCreate={() => void forge()}
          onOpenSavedExample={(exampleId) => void openSavedExample(exampleId)}
          onPromptChange={(nextPrompt) => {
            latestPromptRef.current = nextPrompt;
            setPrompt(nextPrompt);
            if (origami || papercraft || popup) {
              setOrigami(null);
              setPapercraft(null);
              setPopup(null);
              setPhase("idle");
            }
            if (candidates.length > 0) {
              setIntent(null);
              setCandidates([]);
              setSelectedId("");
              setFoldExports({});
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

        {origami ? (
          <OrigamiResults
            payload={origami.payload}
            paperMm={origami.paperMm}
            paperColor={origami.paperColor}
            aiReason={origami.aiReason}
            title={origami.title}
          >
            {origami.alternative && !papercraft && !popup ? (
              <aside
                className={styles.alternative}
                aria-label="Cut-and-glue version"
              >
                <p>
                  <strong>Prefer cut and glue?</strong> The{" "}
                  {(origami.alternative.engine === "figure"
                    ? origami.alternative.figure.title
                    : origami.alternative.card.title
                  ).toLowerCase()}{" "}
                  also comes as 3D papercraft: printed pages, numbered glue
                  tabs, and a 3D preview.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const choice = origami.alternative;
                    if (!choice) return;
                    // Still current if the prompt has not changed since the click.
                    const asked = latestPromptRef.current;
                    void buildPapercraft(
                      choice,
                      null,
                      () => latestPromptRef.current === asked,
                    ).catch((reason: unknown) => {
                      setPhase("ready");
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : "The papercraft version could not be built.",
                      );
                    });
                  }}
                >
                  Make the cut-and-glue version
                </button>
              </aside>
            ) : null}
          </OrigamiResults>
        ) : null}

        {popup ? (
          <PopupResults payload={popup.payload} aiReason={popup.aiReason} />
        ) : null}

        {papercraft ? (
          <PapercraftResults
            payload={papercraft.payload}
            aiReason={papercraft.aiReason}
          />
        ) : null}

        {candidates.length > 0 && baseSelected ? (
          <FoldForgeResults
            assemblySteps={assemblySteps}
            buildSha={health?.buildSha ?? null}
            candidates={candidates}
            experienceMode={experienceMode}
            exportingFormat={exportingFormat}
            finalizing={finalizing}
            generationSource={generationSource}
            limitations={limitations}
            liveGenerationAvailable={aiAvailable}
            motionPosition={motionPosition}
            narrative={narrative}
            onChooseCandidate={chooseCandidate}
            onExport={(format) => void exportFormat(format)}
            onFinalize={() => void finalizeNarrative()}
            onMotionPositionChange={setMotionPosition}
            onPreviewModeChange={setPreviewMode}
            onRotationChange={setRotationDeg}
            previewMode={previewMode}
            foldExport={selectedFoldExport}
            focusRequest={resultsFocusRequest}
            rotationDeg={rotationDeg}
            selected={baseSelected}
          />
        ) : null}
      </main>
    </div>
  );
}
