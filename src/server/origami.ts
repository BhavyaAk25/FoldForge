import { animateSequence, type FoldAnimation } from "@/core/origami/animate";
import { ORIGAMI_CATALOG, type OrigamiModelId } from "@/core/origami/catalog";
import type { CreasePatternV1 } from "@/core/origami/crease-pattern";
import {
  creasePatternSvg,
  foldFile,
  instructionsSvg,
  type InstructionStep,
} from "@/core/origami/export";
import { ORIGAMI_MODELS } from "@/core/origami/models";
import {
  deriveSequence,
  edgesAlong,
  foldedTransforms,
} from "@/core/origami/sequence";

/**
 * A library model, derived and checked on the server. Derivation fails only if
 * the library itself is broken (the tests derive every model), so a failure is
 * an invariant violation, not a user error.
 */
export interface OrigamiPayload {
  readonly id: OrigamiModelId;
  readonly name: string;
  readonly summary: string;
  readonly viewDeg: number;
  /** The coloured side starts down, so the paper's back is its first face up. */
  readonly colorDown: boolean;
  readonly pattern: CreasePatternV1;
  readonly steps: readonly {
    readonly instruction: string;
    readonly added: readonly number[];
  }[];
  readonly animation: Omit<FoldAnimation, "faces">;
  readonly verification: {
    /** Every intermediate state passed Maekawa, Kawasaki, and face consistency. */
    readonly stepsChecked: number;
    readonly mountains: number;
    readonly valleys: number;
    readonly interiorVertices: number;
  };
}

interface Built {
  readonly payload: OrigamiPayload;
  readonly instructions: readonly InstructionStep[];
}

const cache = new Map<OrigamiModelId, Built>();

const build = (id: OrigamiModelId): Built => {
  const cached = cache.get(id);
  if (cached) return cached;
  const model = ORIGAMI_MODELS.find((m) => m.id === id);
  const entry = ORIGAMI_CATALOG.find((e) => e.id === id);
  if (!model || !entry)
    throw new Error(`Origami model ${id} is missing from the library.`);
  const derived = deriveSequence(model.sequence);
  if (!derived.ok)
    throw new Error(
      `Origami model ${id} does not derive: ${derived.error.kind} at step ${derived.error.step}.`,
    );
  const animation = animateSequence(derived.value, model.sequence.anchor);
  const pattern = derived.value.at(-1)!.pattern;
  const hasBase = derived.value[0]!.step.kind === "creases";
  const instructions = derived.value.map((step, index): InstructionStep => {
    const move = hasBase ? index - 1 : index;
    return {
      instruction: step.instruction,
      before: move < 0 ? null : (animation.keyframes[move] ?? null),
      line: move < 0 ? null : (animation.moves[move]?.line ?? null),
    };
  });
  const built: Built = {
    payload: {
      id,
      name: entry.name,
      summary: model.summary,
      viewDeg: model.viewDeg,
      colorDown: model.colorDown ?? false,
      pattern,
      // Each step's creases, as edges of the finished pattern the page draws.
      steps: derived.value.map((step) => ({
        instruction: step.instruction,
        added: edgesAlong(pattern, step.added),
      })),
      animation: {
        collapse: animation.collapse,
        collapseStrain: animation.collapseStrain,
        keyframes: animation.keyframes,
        moves: animation.moves,
      },
      verification: {
        stepsChecked: derived.value.length,
        mountains: pattern.edges.filter((e) => e.assignment === "M").length,
        valleys: pattern.edges.filter((e) => e.assignment === "V").length,
        interiorVertices: pattern.vertices.filter(
          (v) => v.x > 1e-7 && v.y > 1e-7 && v.x < 1 - 1e-7 && v.y < 1 - 1e-7,
        ).length,
      },
    },
    instructions,
  };
  cache.set(id, built);
  return built;
};

export const origamiPayload = (id: OrigamiModelId): OrigamiPayload =>
  build(id).payload;

export type OrigamiExportFormat = "svg" | "fold" | "instructions";

export const origamiExport = (
  id: OrigamiModelId,
  format: OrigamiExportFormat,
  paperMm: number,
): {
  readonly body: string;
  readonly contentType: string;
  readonly filename: string;
} => {
  const { payload, instructions } = build(id);
  const { pattern, name } = payload;
  switch (format) {
    case "svg":
      return {
        body: creasePatternSvg(pattern, name, paperMm),
        contentType: "image/svg+xml",
        filename: `${id}-crease-pattern.svg`,
      };
    case "fold": {
      const model = ORIGAMI_MODELS.find((m) => m.id === id)!;
      const transforms = foldedTransforms(pattern, model.sequence.anchor) ?? [];
      return {
        body: foldFile(pattern, name, transforms),
        contentType: "application/json",
        filename: `${id}.fold`,
      };
    }
    case "instructions":
      return {
        body: instructionsSvg(
          pattern,
          name,
          instructions,
          payload.animation.keyframes.at(-1)!,
          payload.viewDeg,
          paperMm,
        ),
        contentType: "image/svg+xml",
        filename: `${id}-instructions.svg`,
      };
  }
};
