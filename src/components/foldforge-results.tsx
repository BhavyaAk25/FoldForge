import type { RefObject } from "react";

import {
  FabricationPreview,
  type FabricationPreviewMode,
} from "@/components/fabrication-preview";
import { inspectFabricationFoldCompatibility } from "@/core/fabrication/export";
import type { CandidateV2, ExportFormat } from "@/core/fabrication/types";
import type { FinalizeApiResponse, RepairEvidence } from "@/lib/api-contracts";

import styles from "./foldforge-app.module.css";

type ExperienceMode = "live" | "saved";

interface ExportOption {
  readonly description: string;
  readonly format: ExportFormat;
  readonly label: string;
}

const EXPORT_OPTIONS: readonly ExportOption[] = [
  {
    format: "svg",
    label: "SVG pattern",
    description: "Open in any browser. Print at 100% or send to a cutter.",
  },
  {
    format: "dxf",
    label: "DXF drawing",
    description: "Open in CAD, choose Zoom Extents, and keep units in mm.",
  },
  {
    format: "glb",
    label: "GLB model",
    description: "Open in a 3D viewer and play “FoldForge Open Close”.",
  },
  {
    format: "fold",
    label: "FOLD file",
    description: "Open the crease pattern in FOLD-compatible origami software.",
  },
  {
    format: "json",
    label: "Design data",
    description: "Inspect the complete technical design record.",
  },
] as const;

interface FoldForgeResultsProps {
  readonly assemblySteps: readonly string[];
  readonly buildSha: string | null;
  readonly candidates: readonly CandidateV2[];
  readonly experienceMode: ExperienceMode;
  readonly exportingFormat: ExportFormat | null;
  readonly finalizing: boolean;
  readonly limitations: readonly string[];
  readonly liveGenerationAvailable: boolean;
  readonly motionPosition: number;
  readonly narrative: FinalizeApiResponse["narrative"] | null;
  readonly onChooseCandidate: (candidateId: string) => void;
  readonly onExport: (format: ExportFormat) => void;
  readonly onFinalize: () => void;
  readonly onMotionPositionChange: (position: number) => void;
  readonly onPreviewModeChange: (mode: FabricationPreviewMode) => void;
  readonly onRotationChange: (rotationDeg: number) => void;
  readonly previewMode: FabricationPreviewMode;
  readonly repairs: readonly RepairEvidence[];
  readonly resultsHeadingRef: RefObject<HTMLHeadingElement | null>;
  readonly rotationDeg: number;
  readonly selected: CandidateV2;
}

export function FoldForgeResults({
  assemblySteps,
  buildSha,
  candidates,
  experienceMode,
  exportingFormat,
  finalizing,
  limitations,
  liveGenerationAvailable,
  motionPosition,
  narrative,
  onChooseCandidate,
  onExport,
  onFinalize,
  onMotionPositionChange,
  onPreviewModeChange,
  onRotationChange,
  previewMode,
  repairs,
  resultsHeadingRef,
  rotationDeg,
  selected,
}: FoldForgeResultsProps) {
  const hasMotion = selected.ir.driver !== null;
  const foldCompatibility = inspectFabricationFoldCompatibility({
    ir: selected.ir,
    sourceCandidateId: selected.candidateId,
    sourceIrHash: selected.verification.irHash,
  });

  return (
    <section className={styles.results} aria-labelledby="results-title">
      <div className={styles.sectionHeading}>
        <p className={styles.eyebrow}>
          {experienceMode === "saved"
            ? "Saved example · prepared in advance"
            : "All designs passed our checks"}
        </p>
        <h2 id="results-title" ref={resultsHeadingRef} tabIndex={-1}>
          {experienceMode === "saved"
            ? `Explore the ${selected.label.toLowerCase()}.`
            : "Compare your designs."}
        </h2>
        <p className={styles.sectionIntro}>
          {experienceMode === "saved"
            ? hasMotion
              ? "This example is not a response to your current prompt. It is a prepared design you can inspect, move, and export while live generation is off."
              : "This example is not a response to your current prompt. It is a prepared static crease-pattern study you can inspect, rotate, and export; no open-and-close motion is modeled."
            : "Choose a design, inspect the 3D result and flat pattern, then download the one you want to make."}
        </p>
      </div>

      <div className={styles.candidateRail}>
        {candidates.map((candidate) => (
          <button
            key={candidate.candidateId}
            className={
              candidate.candidateId === selected.candidateId
                ? styles.selectedCard
                : undefined
            }
            type="button"
            aria-pressed={candidate.candidateId === selected.candidateId}
            data-testid="candidate-card"
            onClick={() => onChooseCandidate(candidate.candidateId)}
          >
            <span className={styles.rank}>{candidate.rank}</span>
            <span>
              <strong>{candidate.label}</strong>
              <small>
                {candidate.rank === 1
                  ? "Recommended by the checks"
                  : "Checked design"}
              </small>
            </span>
            <b
              aria-label={`Design score ${candidate.score.totalScore?.toFixed(1)}`}
            >
              {candidate.score.totalScore?.toFixed(1)}
            </b>
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
                  onClick={() => onPreviewModeChange(mode)}
                >
                  {mode === "assembled" ? "3D result" : "Cut-and-fold pattern"}
                </button>
              ))}
            </div>
            <span>{selected.program.behavior.replaceAll("_", " ")}</span>
          </div>
          <FabricationPreview
            ir={selected.ir}
            mode={previewMode}
            motionPosition={motionPosition}
            onRotationChange={onRotationChange}
            rotationDeg={rotationDeg}
            label={`${selected.label} ${previewMode} preview`}
          />
          {previewMode === "assembled" && hasMotion ? (
            <div className={styles.controls} data-testid="motion-controls">
              <label>
                Open and close
                <input
                  aria-label="Open and close the design"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={motionPosition}
                  aria-valuetext={`${Math.round(motionPosition * 100)} percent`}
                  onChange={(event) =>
                    onMotionPositionChange(Number(event.currentTarget.value))
                  }
                />
                <output>{Math.round(motionPosition * 100)}%</output>
              </label>
              <div className={styles.motionEndpoints}>
                <button type="button" onClick={() => onMotionPositionChange(0)}>
                  Closed
                </button>
                <button type="button" onClick={() => onMotionPositionChange(1)}>
                  Open
                </button>
              </div>
            </div>
          ) : null}
          <dl className={styles.metrics}>
            <div>
              <dt>Design score</dt>
              <dd>{selected.score.totalScore?.toFixed(1)}</dd>
            </div>
            <div>
              <dt>Pieces</dt>
              <dd>{selected.ir.panels.length}</dd>
            </div>
            <div>
              <dt>Sheets</dt>
              <dd>{selected.ir.sheets.length}</dd>
            </div>
            <div>
              <dt>Cuts</dt>
              <dd>
                {selected.ir.paths.filter((path) => path.kind === "cut").length}
              </dd>
            </div>
          </dl>
        </div>

        <aside className={styles.inspector} aria-label="Design details">
          <section className={styles.summaryCard}>
            <span>About this design</span>
            <h3>{selected.label}</h3>
            <p>{selected.program.designSummary}</p>
          </section>

          {repairs.length > 0 ? (
            <details className={styles.evidenceCard} open>
              <summary>What FoldForge fixed</summary>
              {repairs.map((entry) => (
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
                      <li key={operation.operationId}>{operation.path}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </details>
          ) : null}

          <details className={styles.evidenceCard}>
            <summary>
              Technical checks · {selected.verification.checks.length} passed
            </summary>
            <ul>
              {selected.verification.checks.map((check) => (
                <li key={check.checkId}>
                  <span>{check.status}</span> {check.message}
                </li>
              ))}
            </ul>
          </details>

          <details className={styles.evidenceCard} data-testid="design-trace">
            <summary>Who did what · selected proof</summary>
            <ol className={styles.designTrace}>
              <li>
                <strong>USER</strong>
                <span>
                  {experienceMode === "saved"
                    ? "Opened this disclosed prepared example."
                    : "Provided the brief and fabrication constraints."}
                </span>
              </li>
              <li>
                <strong>AI</strong>
                <span>
                  {experienceMode === "saved"
                    ? "Not called for this prepared example."
                    : `${selected.provenance.modelId ?? "The configured model"} proposed the typed design program${repairs.length > 0 ? " and bounded repair" : ""}.`}
                </span>
              </li>
              <li>
                <strong>CODE</strong>
                <span>
                  Compiled the geometry, ran{" "}
                  {selected.verification.checks.length}
                  {" checks"}, applied any allowed patch, and ranked only valid
                  candidates.
                </span>
              </li>
            </ol>
            <dl className={styles.proofHashes}>
              <div>
                <dt>Selected candidate hash</dt>
                <dd>
                  <code>{selected.verification.irHash}</code>
                </dd>
              </div>
              <div>
                <dt>Build SHA</dt>
                <dd>
                  <code>{buildSha ?? "Unavailable in this environment"}</code>
                </dd>
              </div>
            </dl>
          </details>
        </aside>
      </div>

      <div className={styles.deliveryGrid}>
        <section className={styles.exportPanel}>
          <p className={styles.eyebrow}>Exact files for this design</p>
          <h3>Download your design.</h3>
          <p className={styles.panelIntro}>
            The pattern preview above is what SVG and DXF contain. Pick the file
            for your next tool.
          </p>
          <div className={styles.exportButtons}>
            {EXPORT_OPTIONS.map((option) => {
              const foldUnavailable =
                option.format === "fold" &&
                foldCompatibility.status === "omitted";
              const description = foldUnavailable
                ? foldCompatibility.reason.message
                : option.format === "glb" && !hasMotion
                  ? "Open in a 3D viewer. This static model has no animation clip."
                  : option.description;
              return (
                <button
                  key={option.format}
                  type="button"
                  disabled={exportingFormat !== null || foldUnavailable}
                  aria-label={
                    foldUnavailable
                      ? "FOLD unavailable"
                      : `Download ${option.format.toUpperCase()}`
                  }
                  data-export-status={foldUnavailable ? "unavailable" : "ready"}
                  onClick={() => onExport(option.format)}
                >
                  <strong>
                    {exportingFormat === option.format
                      ? "Preparing…"
                      : foldUnavailable
                        ? "FOLD unavailable"
                        : option.label}
                  </strong>
                  <span>{description}</span>
                </button>
              );
            })}
          </div>
          {liveGenerationAvailable ? (
            <button
              className={styles.narrativeButton}
              type="button"
              disabled={finalizing}
              onClick={onFinalize}
            >
              {finalizing
                ? "Writing build notes…"
                : "Add plain-language build notes"}
            </button>
          ) : null}
        </section>

        <section className={styles.buildPanel}>
          <h3>How to assemble it</h3>
          <ol>
            {(assemblySteps.length > 0
              ? assemblySteps
              : [selected.program.designSummary]
            ).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <h3>What you should check before making it</h3>
          <ul>
            {limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
          {narrative ? (
            <p className={styles.narrativeSummary}>
              <strong>{narrative.summary}</strong> {narrative.mechanism}
              {narrative.assemblySteps.length > 0
                ? ` Build notes: ${narrative.assemblySteps.join(" ")}`
                : ""}
            </p>
          ) : null}
        </section>
      </div>
    </section>
  );
}
