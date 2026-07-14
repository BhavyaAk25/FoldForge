"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { StandPreview } from "@/components/preview/stand-preview";
import { MATERIALS, PRODUCT_LIMITS } from "@/core/constants";
import { DEMO_CONSTRAINT } from "@/core/constraints";
import { DesignConstraintSchema, type DesignConstraint } from "@/core/schemas";
import {
  CompileApiResponseSchema,
  FinalizeApiResponseSchema,
  GenerateApiResponseSchema,
  RepairApiResponseSchema,
  type CandidateData,
  type CandidateWithReportData,
  type FinalizeApiResponse,
  type GenerateApiResponse,
  type RepairApiResponse,
} from "@/lib/api-contracts";
import { downloadExport, FoldForgeApiError, postJson } from "@/lib/client-api";

import styles from "./foldforge-app.module.css";

type Stage = "specify" | "workshop" | "export";
type PreviewMode = "folded" | "flat";

const INSTALLATION_KEY = "foldforge.installation.v1";
const CHECKPOINT_KEY = "foldforge.checkpoint.v1";
const MUTE_KEY = "foldforge.muted.v1";
const DEFAULT_PROMPT =
  "Make a stable portrait phone stand for a 71.5 × 147.6 × 7.8 mm, 172 g phone. Use US Letter 110 lb cover, no glue, and a 65° viewing angle.";

const HealthSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("foldforge"),
    model: z.literal("gpt-5.6-sol"),
    liveAiEnabled: z.boolean(),
    accessRequired: z.boolean(),
    physicalStatus: z.literal("awaiting_user"),
  })
  .strict();

const AccessSchema = z
  .object({ granted: z.literal(true), required: z.boolean() })
  .strict();

const CheckpointSchema = z
  .object({
    version: z.literal(2),
    expiresAt: z.string().datetime(),
    prompt: z.string(),
    stage: z.enum(["specify", "workshop", "export"]),
    constraint: DesignConstraintSchema,
    generation: GenerateApiResponseSchema.nullable(),
    repair: RepairApiResponseSchema.nullable(),
    finalization: FinalizeApiResponseSchema.nullable(),
    selectedId: z.string(),
    compileMode: z.enum(["gpt-5.6-sol", "deterministic-controls"]),
  })
  .strict();

interface NumericFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
}

function NumericField({
  id,
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
}: NumericFieldProps) {
  const invalid = !Number.isFinite(value) || value < min || value > max;
  const errorId = `${id}-error`;
  return (
    <label className={styles.field} htmlFor={id}>
      <span>{label}</span>
      <span className={styles.inputWithUnit}>
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={`${label} in ${unit}`}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        />
        <span aria-hidden="true">{unit}</span>
      </span>
      {invalid ? (
        <small className={styles.fieldError} id={errorId}>
          Supported range: {min}–{max} {unit}.
        </small>
      ) : null}
    </label>
  );
}

const candidateInput = (candidate: CandidateData) => ({
  id: candidate.id,
  strategy: candidate.strategy,
  variant: candidate.variant,
  seed: candidate.seed,
  parameters: candidate.parameters,
});

const formatFailure = (error: unknown): string => {
  if (error instanceof FoldForgeApiError) {
    return error.details.length > 0
      ? `${error.message} ${error.details.join(" ")}`
      : error.message;
  }
  if (error instanceof z.ZodError)
    return "The server returned data outside the expected strict contract.";
  return "Something interrupted the workshop. Your last checkpoint is safe.";
};

const downloadName = (candidate: CandidateData, format: "svg" | "fold") =>
  `foldforge-${candidate.id}.${format}`;

export function FoldForgeApp() {
  const [stage, setStage] = useState<Stage>("specify");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [constraint, setConstraint] =
    useState<DesignConstraint>(DEMO_CONSTRAINT);
  const [generation, setGeneration] = useState<GenerateApiResponse | null>(
    null,
  );
  const [repair, setRepair] = useState<RepairApiResponse | null>(null);
  const [finalization, setFinalization] = useState<FinalizeApiResponse | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState("");
  const [compileMode, setCompileMode] = useState<
    "gpt-5.6-sol" | "deterministic-controls"
  >("deterministic-controls");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("folded");
  const [rotationDeg, setRotationDeg] = useState(-18);
  const [showRepaired, setShowRepaired] = useState(true);
  const [installationId, setInstallationId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState<
    "generate" | "repair" | "finalize" | "export" | "access" | null
  >(null);
  const [error, setError] = useState("");
  const [liveMessage, setLiveMessage] = useState({ text: "", sequence: 0 });
  const [muted, setMuted] = useState(true);
  const [health, setHealth] = useState<z.infer<typeof HealthSchema> | null>(
    null,
  );
  const [accessCode, setAccessCode] = useState("");
  const [accessGranted, setAccessGranted] = useState(false);
  const stageHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStageRef = useRef<Stage>(stage);

  const announce = useCallback((text: string) => {
    setLiveMessage((current) => ({ text, sequence: current.sequence + 1 }));
  }, []);

  const playTone = useCallback(
    (frequencyHz: number) => {
      if (muted || typeof AudioContext === "undefined") return;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequencyHz;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + 0.12,
      );
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.13);
      oscillator.addEventListener("ended", () => void context.close());
    },
    [muted],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedInstallation = localStorage.getItem(INSTALLATION_KEY);
      const nextInstallation = storedInstallation ?? crypto.randomUUID();
      if (!storedInstallation)
        localStorage.setItem(INSTALLATION_KEY, nextInstallation);
      setInstallationId(nextInstallation);
      setMuted(localStorage.getItem(MUTE_KEY) !== "false");

      const checkpoint = localStorage.getItem(CHECKPOINT_KEY);
      if (checkpoint) {
        try {
          const parsed = CheckpointSchema.parse(JSON.parse(checkpoint));
          if (Date.parse(parsed.expiresAt) <= Date.now()) {
            throw new Error("Checkpoint expired.");
          }
          setPrompt(parsed.prompt);
          setConstraint(parsed.constraint);
          setGeneration(parsed.generation);
          setRepair(parsed.repair);
          setFinalization(parsed.finalization);
          setSelectedId(parsed.selectedId);
          setCompileMode(parsed.compileMode);
          setStage(
            parsed.stage === "export" && !parsed.finalization
              ? "workshop"
              : parsed.stage,
          );
        } catch {
          localStorage.removeItem(CHECKPOINT_KEY);
        }
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    void fetch("/api/health", { cache: "no-store" })
      .then((response) => response.json())
      .then((value: unknown) => setHealth(HealthSchema.parse(value)))
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      CHECKPOINT_KEY,
      JSON.stringify({
        version: 2,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
        prompt,
        stage,
        constraint,
        generation,
        repair,
        finalization,
        selectedId,
        compileMode,
      }),
    );
  }, [
    compileMode,
    constraint,
    finalization,
    generation,
    hydrated,
    prompt,
    repair,
    selectedId,
    stage,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(MUTE_KEY, String(muted));
  }, [hydrated, muted]);

  useEffect(() => {
    if (!hydrated || previousStageRef.current === stage) return;
    previousStageRef.current = stage;
    const timer = window.setTimeout(() => {
      stageHeadingRef.current?.focus({ preventScroll: true });
      stageHeadingRef.current?.scrollIntoView({ block: "start" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hydrated, stage]);

  const selectedEntry = useMemo(
    () =>
      generation?.candidates.find(
        (entry) => entry.candidate.id === selectedId,
      ) ??
      generation?.candidates[0] ??
      null,
    [generation, selectedId],
  );

  const repairedEntry = useMemo<CandidateWithReportData | null>(() => {
    if (!repair) return null;
    return {
      candidate: repair.outcome.candidate,
      report: repair.outcome.report,
    };
  }, [repair]);

  const activeEntry =
    showRepaired && repairedEntry ? repairedEntry : selectedEntry;
  const activeFailure = activeEntry?.report.checks.find(
    (check) => check.status === "fail",
  );
  const trace = useMemo(() => {
    const base = generation
      ? [
          ...(compileMode === "gpt-5.6-sol"
            ? [
                {
                  source: "USER" as const,
                  summary: `Requested: ${prompt}`,
                  timestamp: "Current session",
                  kind: "request",
                  inputHash: "client input",
                  candidateId: null,
                },
              ]
            : []),
          {
            source:
              compileMode === "gpt-5.6-sol"
                ? ("AI" as const)
                : ("CODE" as const),
            summary:
              compileMode === "gpt-5.6-sol"
                ? "GPT-5.6 compiled the request into strict constraints."
                : "Structured controls supplied deterministic constraints; live AI is disabled.",
            timestamp: "Current session",
            kind: "constraint_compilation",
            inputHash: "server validated",
            candidateId: null,
          },
          {
            source: "CODE" as const,
            summary: `Generated nine candidates, verified them in fixed order, and displayed three representatives.`,
            timestamp: "Current session",
            kind: "candidate_generation",
            inputHash: "deterministic seed",
            candidateId: null,
          },
        ]
      : [];
    return [
      ...base,
      ...(repair?.outcome.trace.map((event) => ({
        source: event.source,
        summary: event.summary,
        timestamp: event.timestamp,
        kind: event.kind,
        inputHash: event.inputHash,
        candidateId: event.candidateId,
      })) ?? []),
    ];
  }, [compileMode, generation, prompt, repair]);

  const patchConstraint = <Key extends keyof DesignConstraint>(
    key: Key,
    value: DesignConstraint[Key],
  ) => setConstraint((current) => ({ ...current, [key]: value }));

  const generate = async () => {
    setBusy("generate");
    setError("");
    playTone(330);
    try {
      const compiled = await postJson(
        "/api/compile",
        { prompt, installationId, providedConstraint: constraint },
        CompileApiResponseSchema,
      );
      setCompileMode(compiled.mode);
      if (compiled.outcome.status !== "ready") {
        setError(
          compiled.outcome.clarifyingQuestion ||
            compiled.outcome.interpretationSummary,
        );
        announce(
          "The request needs attention before geometry can be generated.",
        );
        return;
      }

      const normalizedConstraint = compiled.outcome.constraint;
      setConstraint(normalizedConstraint);
      const nextGeneration = await postJson(
        "/api/generate",
        { constraint: normalizedConstraint, seed: 20260714 },
        GenerateApiResponseSchema,
      );
      const failing = nextGeneration.candidates.find(
        (entry) => !entry.report.valid,
      );
      setGeneration(nextGeneration);
      setSelectedId(
        failing?.candidate.id ??
          nextGeneration.candidates[0]?.candidate.id ??
          "",
      );
      setRepair(null);
      setFinalization(null);
      setShowRepaired(false);
      setStage("workshop");
      playTone(520);
      announce(
        `Generated ${nextGeneration.internalCandidateCount} deterministic candidates and displayed three representatives.`,
      );
    } catch (caught) {
      setError(formatFailure(caught));
      announce("Generation failed. Review the error message.");
    } finally {
      setBusy(null);
    }
  };

  const runRepair = async () => {
    if (!selectedEntry || selectedEntry.report.valid) return;
    setBusy("repair");
    setError("");
    playTone(360);
    try {
      const nextRepair = await postJson(
        "/api/repair",
        {
          candidate: candidateInput(selectedEntry.candidate),
          constraint,
          installationId,
        },
        RepairApiResponseSchema,
      );
      setRepair(nextRepair);
      setShowRepaired(true);
      playTone(nextRepair.outcome.status === "passed" ? 620 : 210);
      announce(
        nextRepair.outcome.status === "passed"
          ? `The candidate passed after ${nextRepair.outcome.cycles.length} bounded repair cycles.`
          : `${nextRepair.outcome.reason} ${nextRepair.outcome.cycles.length} repair cycles completed.`,
      );
    } catch (caught) {
      setError(formatFailure(caught));
      announce("The bounded repair loop failed safely.");
    } finally {
      setBusy(null);
    }
  };

  const finalize = async () => {
    if (!generation || !activeEntry?.report.valid) return;
    setBusy("finalize");
    setError("");
    playTone(410);
    try {
      const nextFinalization = await postJson(
        "/api/finalize",
        {
          candidates: [candidateInput(activeEntry.candidate)],
          constraint,
          installationId,
        },
        FinalizeApiResponseSchema,
      );
      setFinalization(nextFinalization);
      setStage("export");
      playTone(680);
      announce(
        `Export candidate ${nextFinalization.winner.candidate.id} is deterministically valid and ready.`,
      );
    } catch (caught) {
      setError(formatFailure(caught));
      announce(
        "Finalization stopped because no safe export could be prepared.",
      );
    } finally {
      setBusy(null);
    }
  };

  const exportFile = async (format: "svg" | "fold") => {
    if (!finalization) return;
    setBusy("export");
    setError("");
    playTone(440);
    try {
      const candidate = finalization.winner.candidate;
      await downloadExport(
        format,
        { candidate: candidateInput(candidate), constraint },
        downloadName(candidate, format),
      );
      announce(`${format.toUpperCase()} export downloaded.`);
    } catch (caught) {
      setError(formatFailure(caught));
      announce(`${format.toUpperCase()} export failed safely.`);
    } finally {
      setBusy(null);
    }
  };

  const submitAccess = async () => {
    setBusy("access");
    setError("");
    try {
      await postJson("/api/access", { code: accessCode }, AccessSchema);
      setAccessCode("");
      setAccessGranted(true);
      announce("Live model access granted for this browser session.");
    } catch (caught) {
      setError(formatFailure(caught));
      announce("The access code was not accepted.");
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setStage("specify");
    setGeneration(null);
    setRepair(null);
    setFinalization(null);
    setSelectedId("");
    setError("");
    localStorage.removeItem(CHECKPOINT_KEY);
    announce("Started a fresh FoldForge session.");
  };

  return (
    <main className={styles.shell}>
      <p
        className={styles.srOnly}
        aria-live="polite"
        aria-atomic="true"
        data-sequence={liveMessage.sequence}
      >
        {liveMessage.text}
      </p>

      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label="FoldForge home">
          <span className={styles.mark} aria-hidden="true">
            F
          </span>
          <span>
            <strong>FoldForge</strong>
            <small>software-verified paper geometry</small>
          </span>
        </a>
        <div className={styles.headerActions}>
          <span
            className={`${styles.statusPill} ${health?.liveAiEnabled ? styles.live : styles.offline}`}
          >
            <span aria-hidden="true" />
            {health?.liveAiEnabled ? "GPT‑5.6 live" : "offline contracts"}
          </span>
          <button
            className={styles.iconButton}
            type="button"
            onClick={() => setMuted((value) => !value)}
            aria-pressed={!muted}
            aria-label="Workshop sounds"
          >
            {muted ? "Sound off" : "Sound on"}
          </button>
        </div>
      </header>

      <section className={styles.hero} id="top">
        <div>
          <p className={styles.eyebrow}>One strip · five creases · two slots</p>
          <h1>Turn a flat sheet into a stand you can inspect.</h1>
          <p>
            FoldForge separates creative judgment from calculated fact. It
            generates a constrained paper stand, measures failures, repairs
            bounded parameters, and exports only geometry that passes every
            software check.
          </p>
        </div>
        <aside className={styles.physicalNotice}>
          <span>Physical status</span>
          <strong>Validation pending</strong>
          <p>
            Geometry is verified in software. Load-bearing performance is not
            claimed until a printed stand completes the physical checklist.
          </p>
        </aside>
      </section>

      <nav className={styles.stageNav} aria-label="FoldForge stages">
        {(["specify", "workshop", "export"] as const).map((item, index) => {
          const enabled =
            item === "specify" ||
            (item === "workshop" && generation !== null) ||
            (item === "export" && finalization !== null);
          return (
            <button
              key={item}
              type="button"
              className={stage === item ? styles.activeStage : ""}
              disabled={!enabled}
              aria-current={stage === item ? "step" : undefined}
              onClick={() => setStage(item)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {item}
            </button>
          );
        })}
      </nav>

      {error ? (
        <div className={styles.errorBanner} role="alert">
          <strong>Workshop stopped safely.</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>
            Dismiss
          </button>
        </div>
      ) : null}

      {health?.liveAiEnabled && health.accessRequired && !accessGranted ? (
        <section className={styles.accessBar} aria-labelledby="access-title">
          <div>
            <strong id="access-title">Judge access</strong>
            <span>A short-lived HttpOnly cookie unlocks live model calls.</span>
          </div>
          <label>
            <span className={styles.srOnly}>Demo access code</span>
            <input
              type="password"
              value={accessCode}
              onChange={(event) => setAccessCode(event.currentTarget.value)}
              autoComplete="one-time-code"
            />
          </label>
          <button
            type="button"
            onClick={() => void submitAccess()}
            disabled={busy !== null || accessCode.length === 0}
          >
            {busy === "access" ? "Checking…" : "Unlock"}
          </button>
        </section>
      ) : null}

      {stage === "specify" ? (
        <section className={styles.stagePanel} aria-labelledby="specify-title">
          <div className={styles.stageHeading}>
            <div>
              <p className={styles.eyebrow}>Stage 01 / Specify</p>
              <h2 id="specify-title" ref={stageHeadingRef} tabIndex={-1}>
                Define the physical problem.
              </h2>
            </div>
            <p>
              Dimensions and mass are essential. Structured controls remain the
              source of truth while live GPT‑5.6 access is disabled.
            </p>
          </div>

          <div className={styles.specifyGrid}>
            <div className={styles.promptCard}>
              <label htmlFor="design-prompt">
                {health?.liveAiEnabled
                  ? "Describe the stand"
                  : "Natural-language prompt (live GPT only)"}
              </label>
              <textarea
                id="design-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.currentTarget.value)}
                maxLength={2000}
                rows={7}
                disabled={!health?.liveAiEnabled}
                required={health?.liveAiEnabled}
                aria-describedby="prompt-mode-note"
              />
              <p className={styles.promptModeNote} id="prompt-mode-note">
                {health?.liveAiEnabled
                  ? "GPT‑5.6 compiles this text into the controls below."
                  : "Offline mode does not interpret this text. Use the structured controls as the source of truth."}
              </p>
              <div className={styles.promptFooter}>
                <span>{prompt.length} / 2,000</span>
                <span>
                  {compileMode === "gpt-5.6-sol"
                    ? "AI interpreted"
                    : "not applied offline"}
                </span>
              </div>
            </div>

            <div className={styles.controlsCard}>
              <fieldset>
                <legend>Device</legend>
                <div className={styles.fieldGrid}>
                  <NumericField
                    id="object-width"
                    label="Width"
                    value={constraint.objectWidthMm}
                    unit="mm"
                    min={1}
                    max={220}
                    step={0.1}
                    onChange={(value) =>
                      patchConstraint("objectWidthMm", value)
                    }
                  />
                  <NumericField
                    id="object-height"
                    label="Height"
                    value={constraint.objectHeightMm}
                    unit="mm"
                    min={1}
                    max={320}
                    step={0.1}
                    onChange={(value) =>
                      patchConstraint("objectHeightMm", value)
                    }
                  />
                  <NumericField
                    id="object-depth"
                    label="Depth"
                    value={constraint.objectDepthMm}
                    unit="mm"
                    min={1}
                    max={30}
                    step={0.1}
                    onChange={(value) =>
                      patchConstraint("objectDepthMm", value)
                    }
                  />
                  <NumericField
                    id="object-mass"
                    label="Mass"
                    value={constraint.objectMassG}
                    unit="g"
                    min={1}
                    max={PRODUCT_LIMITS.maximumObjectMassG}
                    step={1}
                    onChange={(value) => patchConstraint("objectMassG", value)}
                  />
                </div>
                <label className={styles.field} htmlFor="orientation">
                  <span>Orientation</span>
                  <select
                    id="orientation"
                    value={constraint.orientation}
                    onChange={(event) =>
                      patchConstraint(
                        "orientation",
                        event.currentTarget.value as "portrait" | "landscape",
                      )
                    }
                  >
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </label>
              </fieldset>

              <fieldset>
                <legend>Sheet & view</legend>
                <div className={styles.fieldGrid}>
                  <NumericField
                    id="sheet-width"
                    label="Sheet width"
                    value={constraint.sheetWidthMm}
                    unit="mm"
                    min={180}
                    max={330}
                    step={0.1}
                    onChange={(value) => patchConstraint("sheetWidthMm", value)}
                  />
                  <NumericField
                    id="sheet-height"
                    label="Sheet height"
                    value={constraint.sheetHeightMm}
                    unit="mm"
                    min={250}
                    max={500}
                    step={0.1}
                    onChange={(value) =>
                      patchConstraint("sheetHeightMm", value)
                    }
                  />
                  <NumericField
                    id="angle"
                    label="View angle"
                    value={constraint.targetViewingAngleDeg}
                    unit="deg"
                    min={50}
                    max={75}
                    step={1}
                    onChange={(value) =>
                      patchConstraint("targetViewingAngleDeg", value)
                    }
                  />
                  <NumericField
                    id="margin"
                    label="Print margin"
                    value={constraint.printableMarginMm}
                    unit="mm"
                    min={3}
                    max={15}
                    step={0.1}
                    onChange={(value) =>
                      patchConstraint("printableMarginMm", value)
                    }
                  />
                </div>
                <label className={styles.field} htmlFor="material">
                  <span>Material</span>
                  <select
                    id="material"
                    value={constraint.materialProfile}
                    onChange={(event) =>
                      patchConstraint(
                        "materialProfile",
                        event.currentTarget
                          .value as DesignConstraint["materialProfile"],
                      )
                    }
                  >
                    <option value="cover_65lb">65 lb cover</option>
                    <option value="cover_80lb">80 lb cover</option>
                    <option value="cover_110lb">110 lb cover</option>
                  </select>
                </label>
              </fieldset>
            </div>
          </div>

          <div className={styles.constraintSummary}>
            <div>
              <span>Topology</span>
              <strong>5 creases / 2 internal cuts</strong>
            </div>
            <div>
              <span>Release</span>
              <strong>Dual tabs · no glue</strong>
            </div>
            <div>
              <span>Sheet</span>
              <strong>
                {constraint.sheetWidthMm} × {constraint.sheetHeightMm} mm
              </strong>
            </div>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={
                busy !== null ||
                installationId.length < 8 ||
                !DesignConstraintSchema.safeParse(constraint).success ||
                (health?.liveAiEnabled === true && prompt.trim().length === 0)
              }
              onClick={() => void generate()}
            >
              {busy === "generate"
                ? "Forging geometry…"
                : "Generate candidates"}
              <span aria-hidden="true">→</span>
            </button>
          </div>
          <p className={styles.privacyNote}>
            Checkpoints remain on this device for up to 24 hours. When live GPT
            is enabled, prompts are processed by OpenAI and may be retained
            under its API abuse-monitoring policy. Reset clears the design
            checkpoint.
          </p>
        </section>
      ) : null}

      {stage === "workshop" && generation && activeEntry ? (
        <section className={styles.stagePanel} aria-labelledby="workshop-title">
          <div className={styles.stageHeading}>
            <div>
              <p className={styles.eyebrow}>Stage 02 / Workshop</p>
              <h2 id="workshop-title" ref={stageHeadingRef} tabIndex={-1}>
                Inspect the evidence.
              </h2>
            </div>
            <p>
              Nine internal samples were generated. One representative from each
              strategy is shown; only hard-check passes can be ranked.
            </p>
          </div>

          <div className={styles.candidateRail} aria-label="Candidate choices">
            {generation.candidates.map((entry) => (
              <button
                key={entry.candidate.id}
                type="button"
                className={
                  selectedEntry?.candidate.id === entry.candidate.id
                    ? styles.selectedCandidate
                    : ""
                }
                onClick={() => {
                  setSelectedId(entry.candidate.id);
                  setRepair(null);
                  setShowRepaired(false);
                  playTone(300);
                }}
                aria-pressed={
                  selectedEntry?.candidate.id === entry.candidate.id
                }
              >
                <span
                  className={
                    entry.report.valid ? styles.passDot : styles.failDot
                  }
                  aria-hidden="true"
                />
                <span>
                  <strong>{entry.candidate.strategy}</strong>
                  <small>
                    {entry.report.valid
                      ? `score ${entry.report.scoreBreakdown.total.toFixed(1)}`
                      : entry.report.hardFailures[0]}
                  </small>
                </span>
              </button>
            ))}
          </div>

          <div className={styles.workshopGrid}>
            <div className={styles.previewColumn}>
              <div className={styles.previewToolbar}>
                <div className={styles.segmented}>
                  <button
                    type="button"
                    className={
                      previewMode === "folded" ? styles.segmentActive : ""
                    }
                    onClick={() => setPreviewMode("folded")}
                    aria-pressed={previewMode === "folded"}
                  >
                    Folded
                  </button>
                  <button
                    type="button"
                    className={
                      previewMode === "flat" ? styles.segmentActive : ""
                    }
                    onClick={() => setPreviewMode("flat")}
                    aria-pressed={previewMode === "flat"}
                  >
                    Flat pattern
                  </button>
                </div>
                {repairedEntry ? (
                  <div className={styles.segmented}>
                    <button
                      type="button"
                      className={!showRepaired ? styles.segmentActive : ""}
                      onClick={() => setShowRepaired(false)}
                      aria-pressed={!showRepaired}
                    >
                      Before
                    </button>
                    <button
                      type="button"
                      className={showRepaired ? styles.segmentActive : ""}
                      onClick={() => setShowRepaired(true)}
                      aria-pressed={showRepaired}
                    >
                      After repair
                    </button>
                  </div>
                ) : null}
              </div>

              <StandPreview
                entry={activeEntry}
                mode={previewMode}
                rotationDeg={rotationDeg}
                failureRefs={activeFailure?.geometryRefs ?? []}
              />
              {previewMode === "folded" ? (
                <label
                  className={styles.rotationControl}
                  htmlFor="preview-rotation"
                >
                  <span>Rotate preview</span>
                  <input
                    id="preview-rotation"
                    type="range"
                    min={-65}
                    max={65}
                    value={rotationDeg}
                    onChange={(event) =>
                      setRotationDeg(Number(event.currentTarget.value))
                    }
                  />
                  <output>{rotationDeg}°</output>
                </label>
              ) : null}

              <div className={styles.measurementGrid}>
                <div>
                  <span>Base depth</span>
                  <strong>
                    {activeEntry.candidate.parameters.baseDepthMm.toFixed(1)} mm
                  </strong>
                </div>
                <div>
                  <span>Stand width</span>
                  <strong>
                    {activeEntry.candidate.parameters.standWidthMm.toFixed(1)}{" "}
                    mm
                  </strong>
                </div>
                <div>
                  <span>Backrest</span>
                  <strong>
                    {activeEntry.candidate.parameters.backrestAngleDeg.toFixed(
                      1,
                    )}
                    °
                  </strong>
                </div>
                <div>
                  <span>Flat length</span>
                  <strong>
                    {activeEntry.candidate.geometry.derived.flatLengthMm.toFixed(
                      1,
                    )}{" "}
                    mm
                  </strong>
                </div>
              </div>
            </div>

            <aside className={styles.inspector}>
              <div
                className={
                  activeEntry.report.valid
                    ? styles.validCard
                    : styles.failureCard
                }
              >
                <span>
                  {activeEntry.report.valid
                    ? "Deterministic result"
                    : "Measured failure"}
                </span>
                <h3>
                  {activeEntry.report.valid
                    ? "All hard checks pass"
                    : (activeFailure?.label ?? "Hard check failed")}
                </h3>
                <p>
                  {activeEntry.report.valid
                    ? `Eligible score: ${activeEntry.report.scoreBreakdown.total.toFixed(1)} / 100.`
                    : activeFailure?.message}
                </p>
                {!activeEntry.report.valid && activeFailure ? (
                  <dl>
                    <div>
                      <dt>Actual</dt>
                      <dd>{String(activeFailure.actual)}</dd>
                    </div>
                    <div>
                      <dt>Expected</dt>
                      <dd>{activeFailure.expected}</dd>
                    </div>
                  </dl>
                ) : null}
              </div>

              {selectedEntry && !selectedEntry.report.valid && !repair ? (
                <button
                  className={styles.primaryButton}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void runRepair()}
                >
                  {busy === "repair"
                    ? "Running bounded repair…"
                    : "Diagnose & repair"}
                  <span aria-hidden="true">↗</span>
                </button>
              ) : null}

              {repair ? (
                <div className={styles.patchCard}>
                  <div>
                    <span>
                      {repair.mode === "gpt-5.6-sol"
                        ? "AI patch / code validation"
                        : "Code patch / code validation"}
                    </span>
                    <strong>
                      {repair.outcome.status === "passed"
                        ? "Repair passed"
                        : `Infeasible after ${repair.outcome.cycles.length} cycle${repair.outcome.cycles.length === 1 ? "" : "s"}`}
                    </strong>
                  </div>
                  {repair.outcome.status === "infeasible" ? (
                    <p className={styles.repairReason}>
                      {repair.outcome.reason}
                    </p>
                  ) : null}
                  {repair.outcome.cycles.map((cycle) => (
                    <section key={cycle.cycle}>
                      <h4>Cycle {cycle.cycle}</h4>
                      {cycle.patch.operations.map((operation, index) => (
                        <p key={`${operation.parameter}-${index}`}>
                          <code>
                            {operation.operation} {operation.parameter}{" "}
                            {operation.value} {operation.unit}
                          </code>
                          <span>{operation.reason}</span>
                        </p>
                      ))}
                    </section>
                  ))}
                </div>
              ) : null}

              <div className={styles.checkList}>
                <div className={styles.inspectorHeading}>
                  <strong>Verifier</strong>
                  <span>
                    {
                      activeEntry.report.checks.filter(
                        (check) => check.status === "pass",
                      ).length
                    }{" "}
                    passed
                  </span>
                </div>
                <ol>
                  {activeEntry.report.checks.map((check) => (
                    <li key={check.id} data-status={check.status}>
                      <span aria-hidden="true">
                        {check.status === "pass"
                          ? "✓"
                          : check.status === "fail"
                            ? "!"
                            : "·"}
                      </span>
                      <span>
                        <strong>{check.label}</strong>
                        <small>
                          {check.status === "not_run"
                            ? "Not run after fail-fast stop"
                            : check.message}
                        </small>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </aside>
          </div>

          <section className={styles.tracePanel} aria-labelledby="trace-title">
            <div className={styles.inspectorHeading}>
              <strong id="trace-title">Source-labelled design trace</strong>
              <span>AI never overrides code</span>
            </div>
            <ol>
              {trace.map((event, index) => (
                <li key={`${event.source}-${index}`}>
                  <span data-source={event.source}>{event.source}</span>
                  <div>
                    <p>{event.summary}</p>
                    <small>
                      {event.timestamp} · {event.kind}
                      {event.candidateId
                        ? ` · ${event.candidateId}`
                        : ""} · {event.inputHash}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className={styles.stageFooter}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => setStage("specify")}
            >
              ← Revise constraints
            </button>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={busy !== null || !activeEntry.report.valid}
              onClick={() => void finalize()}
            >
              {busy === "finalize"
                ? "Revalidating…"
                : "Prepare selected verified export"}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      ) : null}

      {stage === "export" && finalization ? (
        <section className={styles.stagePanel} aria-labelledby="export-title">
          <div className={styles.stageHeading}>
            <div>
              <p className={styles.eyebrow}>Stage 03 / Export</p>
              <h2 id="export-title" ref={stageHeadingRef} tabIndex={-1}>
                Make the digital plan physical.
              </h2>
            </div>
            <p>
              The server rebuilt this geometry from parameters and re-ran every
              hard check before enabling either download.
            </p>
          </div>

          <div className={styles.exportHero}>
            <div>
              <span className={styles.successBadge}>Verified in software</span>
              <h3>
                {finalization.winner.candidate.strategy} /{" "}
                {finalization.winner.candidate.id}
              </h3>
              <p>{finalization.narrative.summary}</p>
              <div className={styles.exportActions}>
                <button
                  className={styles.primaryButton}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void exportFile("svg")}
                >
                  Download SVG
                </button>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void exportFile("fold")}
                >
                  Download FOLD 1.2
                </button>
                <button
                  className={styles.textButton}
                  type="button"
                  onClick={() => window.print()}
                >
                  Print this guide
                </button>
              </div>
            </div>
            <div className={styles.scaleCard}>
              <span>Scale check</span>
              <div aria-hidden="true">
                <i />
                <i />
              </div>
              <strong>50 mm</strong>
              <p>
                Print at 100% / actual size. Measure the SVG calibration line
                before cutting.
              </p>
            </div>
          </div>

          <div className={styles.exportGrid}>
            <section>
              <span className={styles.eyebrow}>Fold legend</span>
              <h3>Cut once. Score first.</h3>
              <ul className={styles.legend}>
                <li>
                  <span className={styles.cutSwatch} />
                  Solid graphite — perimeter cut
                </li>
                <li>
                  <span className={styles.slotSwatch} />
                  Solid red — internal slot cut
                </li>
                <li>
                  <span className={styles.foldSwatch} />
                  Dashed teal — score and fold
                </li>
              </ul>
              <p className={styles.profileNote}>
                FOLD export uses the FoldForge 1.2 edge profile. Slits are
                encoded as cut edges; some consumers do not render slit-face
                topology.
              </p>
            </section>
            <section>
              <span className={styles.eyebrow}>Assembly</span>
              <h3>Seven deliberate moves.</h3>
              <ol className={styles.instructions}>
                {finalization.narrative.foldingSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
            <section>
              <span className={styles.eyebrow}>Physical checklist</span>
              <h3>Validate before regular use.</h3>
              <ul className={styles.instructions}>
                <li>
                  Print on {MATERIALS[constraint.materialProfile].label} at 100%
                  / actual size.
                </li>
                <li>Accept the 50 mm scale line only from 49.5 to 50.5 mm.</li>
                <li>Release and relock both tabs for 10 complete cycles.</li>
                <li>Hold an equivalent test mass centered for 60 seconds.</li>
                <li>Repeat for 60 seconds with the mass offset by 5 mm.</li>
                <li>
                  Fail on collapse, tear, slot growth, buckling, tipping, or
                  slip over 3 mm.
                </li>
              </ul>
            </section>
          </div>

          <section className={styles.limitations}>
            <div>
              <span>Physical test required</span>
              <h3>Software cannot measure paper strength or friction.</h3>
            </div>
            <ul>
              {finalization.narrative.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
              <li>
                Test with a sacrificial device or equivalent weight before
                regular use.
              </li>
              <li>
                Stop if tabs tear, slots elongate, or the device touches the
                rear support boundary.
              </li>
            </ul>
          </section>

          <div className={styles.stageFooter}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => setStage("workshop")}
            >
              ← Back to workshop
            </button>
            <button className={styles.textButton} type="button" onClick={reset}>
              Start a new stand
            </button>
          </div>
        </section>
      ) : null}

      <footer className={styles.footer}>
        <span>FoldForge / deterministic core v0.1</span>
        <span>Physical validation pending · no load-bearing claim</span>
      </footer>
    </main>
  );
}
