import { animateSequence, type FoldAnimation } from "@/core/origami/animate";
import { isOrigamiModelId, ORIGAMI_CATALOG } from "@/core/origami/catalog";
import type { CreasePatternV1 } from "@/core/origami/crease-pattern";
import {
  creasePatternSvg,
  foldFile,
  formDiagram,
  instructionsSvg,
  stepDiagram,
  type InstructionStep,
} from "@/core/origami/export";
import type { ModelShape } from "@/core/origami/families";
import { designShape, parseDesignId } from "@/core/origami/generate";
import { ORIGAMI_MODELS } from "@/core/origami/models";
import {
  deriveSequence,
  edgesAlong,
  foldedTransforms,
} from "@/core/origami/sequence";

/**
 * A library model or a generated design, derived and checked on the server.
 * A library model that fails to derive is a broken library (the tests derive
 * every one), an invariant violation; a design id that fails is not found.
 */
export interface OrigamiPayload {
  /** A library id ("crane") or a design id ("neck_0.53_0_0.78_25"). */
  readonly id: string;
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

// Library models are few; generated designs are bounded by evicting the oldest.
const cache = new Map<string, Built>();
const CACHE_LIMIT = 128;

const FAMILY_NAMES = {
  neck: "Long-necked figure",
  bird: "Winged bird",
} as const;

/** The model an id names: a library entry or a design, with its display name. */
const resolve = (
  id: string,
): {
  readonly model: ModelShape;
  readonly name: string;
  readonly library: boolean;
} | null => {
  if (isOrigamiModelId(id)) {
    const model = ORIGAMI_MODELS.find((m) => m.id === id);
    const entry = ORIGAMI_CATALOG.find((e) => e.id === id);
    if (!model || !entry)
      throw new Error(`Origami model ${id} is missing from the library.`);
    return { model, name: entry.name, library: true };
  }
  const design = parseDesignId(id);
  return design
    ? {
        model: designShape(
          design,
          "A design shaped for this subject from one of the model families, folded from one square and checked at every step.",
        ),
        name: FAMILY_NAMES[design.family],
        library: false,
      }
    : null;
};

const build = (id: string): Built | null => {
  const cached = cache.get(id);
  if (cached) return cached;
  const resolved = resolve(id);
  if (!resolved) return null;
  const { model } = resolved;
  const derived = deriveSequence(model.sequence);
  if (!derived.ok) {
    if (!resolved.library) return null;
    throw new Error(
      `Origami model ${id} does not derive: ${derived.error.kind} at step ${derived.error.step}.`,
    );
  }
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
      name: resolved.name,
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
        formed: animation.formed,
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
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(id, built);
  return built;
};

/** The payload for a library or design id, or null if it names nothing that folds. */
export const origamiPayload = (id: string): OrigamiPayload | null =>
  build(id)?.payload ?? null;

export type OrigamiExportFormat = "svg" | "fold" | "instructions";

/**
 * A download for a library or design id, or null if the id names nothing.
 * `title` (already cleaned by the route) names a generated design after its
 * subject, such as "Giraffe", on the sheet and in the file name.
 */
export const origamiExport = (
  id: string,
  format: OrigamiExportFormat,
  paperMm: number,
  title: string | null,
): {
  readonly body: string;
  readonly contentType: string;
  readonly filename: string;
} | null => {
  const built = build(id);
  const resolved = resolve(id);
  if (!built || !resolved) return null;
  const { payload, instructions } = built;
  const { pattern } = payload;
  const name = resolved.library ? payload.name : (title ?? payload.name);
  const file = name.toLowerCase().replace(/[^a-z0-9]+/gu, "-");
  switch (format) {
    case "svg":
      return {
        body: creasePatternSvg(pattern, name, paperMm),
        contentType: "image/svg+xml",
        filename: `${file}-crease-pattern.svg`,
      };
    case "fold": {
      const transforms =
        foldedTransforms(pattern, resolved.model.sequence.anchor) ?? [];
      return {
        body: foldFile(pattern, name, transforms),
        contentType: "application/json",
        filename: `${file}.fold`,
      };
    }
    case "instructions":
      return {
        body: instructionsSvg(
          pattern,
          name,
          instructions,
          payload.animation.formed && payload.animation.collapse
            ? formDiagram(pattern.faces, payload.animation.collapse.at(-1)!)
            : stepDiagram(
                pattern,
                payload.animation.keyframes.at(-1)!,
                null,
                payload.viewDeg,
              ),
          payload.viewDeg,
          paperMm,
        ),
        contentType: "image/svg+xml",
        filename: `${file}-instructions.svg`,
      };
  }
};
