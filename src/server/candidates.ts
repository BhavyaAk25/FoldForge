import {
  buildFabricationCandidate,
  type CandidateBuildError,
} from "@/core/fabrication/candidate";
import { createPullTabPopUpFlowerShowcase } from "@/core/fabrication/examples";
import { inspectFabricationFoldCompatibility } from "@/core/fabrication/export";
import type { Result } from "@/core/result";
import type {
  CandidateV2,
  FabricationIntentV1,
  FabricationProgramV1,
} from "@/core/fabrication/types";
import { type SavedExampleId } from "@/lib/saved-examples";

/**
 * Builds finished candidates on the server: compile, verify, score, and hash
 * once here, so the browser only renders the result.
 */

const COMPILER_VERSION = "foldforge-fabrication-v1";
const BASE_SEED = 20_260_714;
const SAVED_EXAMPLE_GENERATED_AT = "2026-07-14T00:00:00.000Z";

/** Model provenance carried from /api/programs into the candidate record. */
export interface GenerationProvenance {
  readonly modelId: string;
  readonly modelResponseId: string;
  readonly planHash: string;
  readonly expanderVersion: string;
}

export interface FoldExportAvailability {
  readonly available: boolean;
  readonly reason: string | null;
}

export interface BuiltCandidate {
  readonly candidate: CandidateV2;
  readonly foldExport: FoldExportAvailability;
}

const foldExportFor = (candidate: CandidateV2): FoldExportAvailability => {
  const compatibility = inspectFabricationFoldCompatibility({
    ir: candidate.ir,
    sourceCandidateId: candidate.candidateId,
    sourceIrHash: candidate.verification.irHash,
  });
  return compatibility.status === "omitted"
    ? { available: false, reason: compatibility.reason.message }
    : { available: true, reason: null };
};

export const buildCandidate = (input: {
  readonly candidateId: string;
  readonly intent: FabricationIntentV1;
  readonly program: FabricationProgramV1;
  readonly generation: GenerationProvenance | null;
  readonly generatedAtIso: string;
}): Result<BuiltCandidate, CandidateBuildError> => {
  const built = buildFabricationCandidate({
    candidateId: input.candidateId,
    intent: input.intent,
    program: input.program,
    // The forge shows one design, so it is the recommended one.
    rank: 1,
    selectionStatus: "recommended",
    provenance: {
      compilerVersion: COMPILER_VERSION,
      generatedAtIso: input.generatedAtIso,
      deterministicSeed: BASE_SEED + 1,
      modelId: input.generation?.modelId ?? null,
      modelResponseId: input.generation?.modelResponseId ?? null,
      modelPlanHash: input.generation?.planHash ?? null,
      planExpanderVersion: input.generation?.expanderVersion ?? null,
      parentCandidateId: null,
      appliedPatchIds: [],
      repairCycle: 0,
    },
  });
  return built.ok
    ? {
        ok: true,
        value: {
          candidate: built.value,
          foldExport: foldExportFor(built.value),
        },
      }
    : built;
};

export interface SavedExample extends BuiltCandidate {
  readonly prompt: string;
  readonly limitation: string | null;
}

/** A prepared example, labelled as such and verified like any design. */
export const savedExample = (id: SavedExampleId): SavedExample | null => {
  const showcase = createPullTabPopUpFlowerShowcase();
  const built = buildCandidate({
    candidateId: `saved-example-${id}`,
    intent: showcase.intent,
    program: {
      ...showcase.program,
      candidateLabel: "Vertical-lift flower study",
      designSummary:
        "A prepared motion study: a directly driven vertical tab moves a rigid flower crown 30 mm along its guide.",
    },
    generation: null,
    generatedAtIso: SAVED_EXAMPLE_GENERATED_AT,
  });
  if (!built.ok) return null;
  return {
    ...built.value,
    prompt: showcase.prompt,
    limitation: showcase.limitation,
  };
};
