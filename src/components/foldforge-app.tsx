"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import {
  FabricationPreview,
  type FabricationPreviewMode,
} from "@/components/fabrication-preview";
import { buildFabricationCandidate } from "@/core/fabrication/candidate";
import { CandidateV2Schema } from "@/core/fabrication/schemas";
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
  type RepairEvidence,
} from "@/lib/api-contracts";
import {
  downloadCandidateExport,
  FoldForgeApiError,
  getJson,
  postJson,
} from "@/lib/client-api";

import styles from "./foldforge-app.module.css";

type AccessState = "granted" | "needed" | "unknown";
type StudioPhase = "idle" | "intent" | "programs" | "repair" | "ready";

const CHECKPOINT_KEY = "foldforge.studio.checkpoint.v3";
const CHECKPOINT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const COMPILER_VERSION = "foldforge-fabrication-v1";
const MODEL_ID = "gpt-5.6-sol";
const BASE_SEED = 20_260_714;

const EXAMPLE_PROMPTS = [
  "Make a one-sheet desk organizer with a sliding front tray and two folding wings.",
  "Create a pop-up fox card with recognizable ears, muzzle, and a fold-flat mechanism.",
  "Design a compact cardstock display that opens one side panel through 90 degrees.",
] as const;

const DEFAULT_PROMPT = EXAMPLE_PROMPTS[0];

const formatFailure = (error: unknown): string => {
  if (error instanceof FoldForgeApiError) return error.message;
  if (error instanceof z.ZodError) {
    return "The server returned data outside the strict fabrication contract.";
  }
  return "The forge stopped safely. Your previous checkpoint is unchanged.";
};

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
      modelId: MODEL_ID,
      modelResponseId: null,
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
  `Stock is fixed to ${candidate.program.sheets.map((sheet) => sheet.material.label).join(", ")}.`,
  `Budget: ${candidate.intent.fabricationBudget.maximumPanels} panels and ${candidate.intent.fabricationBudget.maximumJointAndConnectorCount} joints/connectors maximum.`,
  `Assembly strategy: ${candidate.program.assemblyStrategy.replaceAll("_", " ")}; glue ${candidate.intent.fabricationBudget.glueAllowed ? "is allowed" : "is not allowed"}.`,
];

export function FoldForgeApp() {
  const [health, setHealth] = useState<HealthApiResponse | null>(null);
  const [accessState, setAccessState] = useState<AccessState>("unknown");
  const [accessCode, setAccessCode] = useState("");
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [intent, setIntent] = useState<FabricationIntentV1 | null>(null);
  const [candidates, setCandidates] = useState<readonly CandidateV2[]>([]);
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
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocusResultsRef = useRef(false);

  const busy = phase === "intent" || phase === "programs" || phase === "repair";
  const solAvailable = health?.liveAiEnabled === true;
  const baseSelected = useMemo(
    () =>
      candidates.find((candidate) => candidate.candidateId === selectedId) ??
      candidates[0] ??
      null,
    [candidates, selectedId],
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
        if (!nextHealth.liveAiEnabled) setStatusMessage("Sol is off.");
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
        setPrompt(restored.prompt);
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
    if (!checkpointReady) return;
    const checkpoint = StudioCheckpointSchema.parse({
      version: 3,
      savedAt: new Date().toISOString(),
      prompt,
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
    intent,
    narrative,
    prompt,
    repairEvidence,
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

  const requireAccess = useCallback((requestError: unknown): boolean => {
    if (
      requestError instanceof FoldForgeApiError &&
      requestError.code === "ACCESS_REQUIRED"
    ) {
      setAccessState("needed");
      setError("Enter the studio access code, then forge again.");
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
    if (!solAvailable || busy || prompt.trim().length === 0) return;
    setError("");
    setPhase("intent");
    setStatusMessage("Normalizing fabrication intent…");
    const generatedAtIso = new Date().toISOString();

    try {
      const nextIntent = await postJson(
        "/api/intent",
        { prompt },
        IntentApiResponseSchema,
      );
      if (nextIntent.scopeStatus !== "supported") {
        setPhase("idle");
        setError(
          nextIntent.clarificationQuestion ??
            nextIntent.unsupportedReason ??
            "This request needs one more fabrication constraint.",
        );
        return;
      }

      const usedTopologyIds: string[] = [];
      const fingerprints = new Set<string>();
      const accepted: CandidateV2[] = [];
      const evidenceByCandidate: Record<string, RepairEvidence[]> = {};

      for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
        setPhase("programs");
        setStatusMessage(`Forging candidate ${ordinal} of 3…`);
        const generated = await postJson(
          "/api/programs",
          {
            intent: nextIntent,
            candidateOrdinal: ordinal,
            usedTopologyIds,
          },
          ProgramsApiResponseSchema,
        );
        usedTopologyIds.push(generated.proposal.program.topologyId);
        if (fingerprints.has(generated.programStructureFingerprint)) continue;
        fingerprints.add(generated.programStructureFingerprint);

        const candidateId = candidateIdFor(ordinal, generated.proposal.program);
        let currentProgram = generated.proposal.program;
        let evaluation = await postJson(
          "/api/compile",
          { intent: nextIntent, program: currentProgram, candidateId },
          CompileApiResponseSchema,
        );
        const evidence: RepairEvidence[] = [];
        const appliedPatchIds: string[] = [];
        let repairCycle = 0;
        let passed = evaluation.status === "passed";

        for (
          let cycle = 1;
          evaluation.status === "invalid" && cycle <= 5;
          cycle += 1
        ) {
          setPhase("repair");
          setStatusMessage(`Repairing candidate ${ordinal}, cycle ${cycle}…`);
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
          );
          if (
            repaired.patch &&
            (repaired.status === "passed" ||
              repaired.status === "still_invalid")
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
          };
        }

        if (!passed) continue;
        const candidate = buildCandidate(
          candidateId,
          nextIntent,
          currentProgram,
          ordinal,
          generatedAtIso,
          appliedPatchIds,
          repairCycle,
        );
        if (!candidate) continue;
        accepted.push(candidate);
        if (evidence.length > 0) evidenceByCandidate[candidateId] = evidence;
      }

      const ranked = rankedCandidates(accepted).slice(0, 3);
      if (ranked.length === 0) {
        throw new Error("No hard-valid candidates were produced.");
      }
      setIntent(nextIntent);
      setCandidates(ranked);
      setSelectedId(ranked[0]?.candidateId ?? "");
      setRepairEvidence(evidenceByCandidate);
      setNarrative(null);
      shouldFocusResultsRef.current = true;
      setPhase("ready");
      setAccessState("granted");
      setStatusMessage(
        `${ranked.length} hard-valid candidate${ranked.length === 1 ? "" : "s"} ready.`,
      );
    } catch (forgeError) {
      setPhase(candidates.length > 0 ? "ready" : "idle");
      if (!requireAccess(forgeError)) setError(formatFailure(forgeError));
    }
  };

  const chooseCandidate = (candidateId: string) => {
    setSelectedId(candidateId);
    setMotionPosition(0.65);
    setNarrative(null);
    setStatusMessage("Candidate selected.");
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
    if (!exportCandidate || finalizing || !solAvailable) return;
    setFinalizing(true);
    setError("");
    setStatusMessage("Writing concise build notes…");
    try {
      const result = await postJson(
        "/api/finalize",
        { candidate: exportCandidate },
        FinalizeApiResponseSchema,
      );
      setNarrative(result.narrative);
      setAccessState("granted");
      setStatusMessage("Build notes ready.");
    } catch (finalizeError) {
      if (!requireAccess(finalizeError)) setError(formatFailure(finalizeError));
    } finally {
      setFinalizing(false);
    }
  };

  const limitations = baseSelected
    ? (narrative?.limitations ?? fallbackLimitations(baseSelected))
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
              ? "Checking Sol"
              : solAvailable
                ? accessState === "granted"
                  ? "Sol ready · access granted"
                  : accessState === "needed"
                    ? "Sol ready · access needed"
                    : "Sol ready"
                : "Sol is off"}
          </span>
          {candidates.length > 0 ? (
            <span className={styles.checkpointLabel}>Checkpoint saved</span>
          ) : null}
        </div>
      </header>

      <main className={styles.main} id="studio-main">
        <section className={styles.compose} aria-labelledby="studio-title">
          <div className={styles.intro}>
            <p className={styles.eyebrow}>Prompt-to-fabrication studio</p>
            <h1 id="studio-title">Describe. Forge. Export.</h1>
            <p>
              Sol proposes bounded sheet programs. Code compiles, verifies, and
              ranks every candidate before it appears here.
            </p>
          </div>

          <div className={styles.promptPanel}>
            <label htmlFor="fabrication-prompt">
              Describe what to fabricate
            </label>
            <textarea
              id="fabrication-prompt"
              maxLength={4_000}
              rows={5}
              value={prompt}
              onChange={(event) => setPrompt(event.currentTarget.value)}
            />
            <div className={styles.promptMeta}>
              <span>{prompt.length}/4,000</span>
              <span>Access codes are never saved.</span>
            </div>
            <div className={styles.exampleChips} aria-label="Example prompts">
              {EXAMPLE_PROMPTS.map((example, index) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setPrompt(example)}
                >
                  Example {index + 1}
                </button>
              ))}
            </div>
            <button
              className={styles.forgeButton}
              type="button"
              disabled={!solAvailable || busy || prompt.trim().length === 0}
              onClick={() => void forge()}
            >
              {busy ? "Forging…" : "Forge 3 candidates"}
            </button>
            {!solAvailable && health ? (
              <p className={styles.offlineNote}>
                Sol is off. Arbitrary generation is unavailable until live
                service is enabled.
              </p>
            ) : null}
          </div>
        </section>

        {accessState === "needed" ? (
          <form
            className={styles.accessBar}
            onSubmit={(event) => {
              event.preventDefault();
              void unlock();
            }}
          >
            <label htmlFor="access-code">Studio access code</label>
            <input
              id="access-code"
              type="password"
              autoComplete="off"
              value={accessCode}
              onChange={(event) => setAccessCode(event.currentTarget.value)}
            />
            <button type="submit" disabled={accessCode.length === 0}>
              Unlock
            </button>
          </form>
        ) : null}

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
          <section className={styles.results} aria-labelledby="results-title">
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>Hard-valid only</p>
              <h2 id="results-title" ref={resultsHeadingRef} tabIndex={-1}>
                Compare candidates.
              </h2>
            </div>

            <div className={styles.candidateRail}>
              {candidates.map((candidate) => (
                <button
                  key={candidate.candidateId}
                  className={
                    candidate.candidateId === baseSelected.candidateId
                      ? styles.selectedCard
                      : undefined
                  }
                  type="button"
                  aria-pressed={
                    candidate.candidateId === baseSelected.candidateId
                  }
                  data-testid="candidate-card"
                  onClick={() => chooseCandidate(candidate.candidateId)}
                >
                  <span className={styles.rank}>#{candidate.rank}</span>
                  <span>
                    <strong>{candidate.label}</strong>
                    <small>{candidate.program.topologyId}</small>
                  </span>
                  <b>{candidate.score.totalScore?.toFixed(1)}</b>
                </button>
              ))}
            </div>

            <div className={styles.workbench}>
              <div className={styles.previewColumn}>
                <div className={styles.previewToolbar}>
                  <div className={styles.segmented} aria-label="Preview mode">
                    {(["assembled", "pattern"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={previewMode === mode}
                        onClick={() => setPreviewMode(mode)}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                  <span>
                    {baseSelected.program.behavior.replaceAll("_", " ")}
                  </span>
                </div>
                <FabricationPreview
                  ir={baseSelected.ir}
                  mode={previewMode}
                  motionPosition={motionPosition}
                  rotationDeg={rotationDeg}
                  label={`${baseSelected.label} ${previewMode} preview`}
                />
                <div className={styles.controls}>
                  <label>
                    Motion
                    <input
                      aria-label="Motion position"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      disabled={!baseSelected.ir.driver}
                      value={motionPosition}
                      onChange={(event) =>
                        setMotionPosition(Number(event.currentTarget.value))
                      }
                    />
                    <output>{Math.round(motionPosition * 100)}%</output>
                  </label>
                  <label>
                    Rotation
                    <input
                      aria-label="Preview rotation"
                      type="range"
                      min="-180"
                      max="180"
                      step="1"
                      value={rotationDeg}
                      onChange={(event) =>
                        setRotationDeg(Number(event.currentTarget.value))
                      }
                    />
                    <output>{rotationDeg}°</output>
                  </label>
                </div>
                <dl className={styles.metrics}>
                  <div>
                    <dt>Score</dt>
                    <dd>{baseSelected.score.totalScore?.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt>Panels</dt>
                    <dd>{baseSelected.ir.panels.length}</dd>
                  </div>
                  <div>
                    <dt>Sheets</dt>
                    <dd>{baseSelected.ir.sheets.length}</dd>
                  </div>
                  <div>
                    <dt>Cut paths</dt>
                    <dd>
                      {
                        baseSelected.ir.paths.filter(
                          (path) => path.kind === "cut",
                        ).length
                      }
                    </dd>
                  </div>
                </dl>
              </div>

              <aside
                className={styles.inspector}
                aria-label="Candidate details"
              >
                <section className={styles.summaryCard}>
                  <span>Selected program</span>
                  <h3>{baseSelected.label}</h3>
                  <p>{baseSelected.program.designSummary}</p>
                </section>

                {selectedRepairs.length > 0 ? (
                  <details className={styles.evidenceCard} open>
                    <summary>Repair evidence</summary>
                    {selectedRepairs.map((entry) => (
                      <div key={`${entry.patch.patchId}-${entry.cycle}`}>
                        <strong>
                          Cycle {entry.cycle}: {entry.beforeFailureId}
                        </strong>
                        <p>{entry.beforeFailureMessage}</p>
                        <p>
                          Patch: {entry.patch.diagnosis} (
                          {entry.result.replace("_", " ")})
                        </p>
                        <ul>
                          {entry.patch.operations.map((operation) => (
                            <li key={operation.operationId}>
                              {operation.path}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </details>
                ) : null}

                <details className={styles.evidenceCard}>
                  <summary>
                    Verifier evidence ·{" "}
                    {baseSelected.verification.checks.length} checks
                  </summary>
                  <ul>
                    {baseSelected.verification.checks.map((check) => (
                      <li key={check.checkId}>
                        <span>{check.status}</span> {check.message}
                      </li>
                    ))}
                  </ul>
                </details>
              </aside>
            </div>

            <div className={styles.deliveryGrid}>
              <section className={styles.exportPanel}>
                <p className={styles.eyebrow}>Exact selected candidate</p>
                <h3>Export.</h3>
                <div className={styles.exportButtons}>
                  {(["svg", "dxf", "glb", "json", "fold"] as const).map(
                    (format) => (
                      <button
                        key={format}
                        type="button"
                        disabled={exportingFormat !== null}
                        onClick={() => void exportFormat(format)}
                      >
                        {exportingFormat === format
                          ? "Preparing…"
                          : `Download ${format.toUpperCase()}`}
                      </button>
                    ),
                  )}
                </div>
                <button
                  className={styles.narrativeButton}
                  type="button"
                  disabled={!solAvailable || finalizing}
                  onClick={() => void finalizeNarrative()}
                >
                  {finalizing ? "Writing…" : "Add Sol build notes"}
                </button>
              </section>

              <section className={styles.buildPanel}>
                <h3>Assembly</h3>
                <ol>
                  {(assemblySteps.length > 0
                    ? assemblySteps
                    : [baseSelected.program.designSummary]
                  ).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <h3>Limitations</h3>
                <ul>
                  {limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
                {narrative ? (
                  <p className={styles.narrativeSummary}>
                    <strong>{narrative.summary}</strong> {narrative.mechanism}
                    {narrative.assemblySteps.length > 0
                      ? ` Sol notes: ${narrative.assemblySteps.join(" ")}`
                      : ""}
                  </p>
                ) : null}
              </section>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
