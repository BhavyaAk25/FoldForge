import type { RefObject } from "react";

import {
  FabricationPreview,
  type FabricationPreviewMode,
} from "@/components/fabrication-preview";
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
    description: "Print it or send it to a cutting machine.",
  },
  {
    format: "dxf",
    label: "DXF drawing",
    description: "Open it in CAD or laser-cutting software.",
  },
  {
    format: "glb",
    label: "GLB model",
    description: "View the assembled design in a 3D app.",
  },
  {
    format: "fold",
    label: "FOLD file",
    description: "Open it in compatible folding software.",
  },
  {
    format: "json",
    label: "Design data",
    description: "Inspect the complete technical design record.",
  },
] as const;

interface FoldForgeResultsProps {
  readonly assemblySteps: readonly string[];
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
            ? "Explore the pop-up flower card."
            : "Compare your designs."}
        </h2>
        <p className={styles.sectionIntro}>
          {experienceMode === "saved"
            ? "This example is not a response to your current prompt. It is a prepared design you can inspect, move, and export while live generation is off."
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
            rotationDeg={rotationDeg}
            label={`${selected.label} ${previewMode} preview`}
          />
          <div className={styles.controls}>
            <label>
              Open and close
              <input
                aria-label="Open and close the design"
                type="range"
                min="0"
                max="1"
                step="0.01"
                disabled={!selected.ir.driver}
                value={motionPosition}
                aria-valuetext={`${Math.round(motionPosition * 100)} percent`}
                onChange={(event) =>
                  onMotionPositionChange(Number(event.currentTarget.value))
                }
              />
              <output>{Math.round(motionPosition * 100)}%</output>
            </label>
            <label>
              Rotate view
              <input
                aria-label="Rotate the preview"
                type="range"
                min="-180"
                max="180"
                step="1"
                value={rotationDeg}
                onChange={(event) =>
                  onRotationChange(Number(event.currentTarget.value))
                }
              />
              <output>{rotationDeg}°</output>
            </label>
          </div>
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
        </aside>
      </div>

      <div className={styles.deliveryGrid}>
        <section className={styles.exportPanel}>
          <p className={styles.eyebrow}>Exact files for this design</p>
          <h3>Download your design.</h3>
          <p className={styles.panelIntro}>
            Pick the format that matches what you want to do next.
          </p>
          <div className={styles.exportButtons}>
            {EXPORT_OPTIONS.map((option) => (
              <button
                key={option.format}
                type="button"
                disabled={exportingFormat !== null}
                aria-label={`Download ${option.format.toUpperCase()}`}
                onClick={() => onExport(option.format)}
              >
                <strong>
                  {exportingFormat === option.format
                    ? "Preparing…"
                    : option.label}
                </strong>
                <span>{option.description}</span>
              </button>
            ))}
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
