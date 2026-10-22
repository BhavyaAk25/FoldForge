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
import { applyIsometry } from "@/core/origami/fold-rules";
import { designSheets, parseDesignId } from "@/core/origami/generate";
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
    /** For a base: how to fold it by hand, step by step. */
    readonly howTo: readonly string[];
  }[];
  readonly animation: Omit<FoldAnimation, "faces">;
  /**
   * For the first sheet of a two-sheet model: the second sheet's id and
   * where its finished shape sits on this one. Its points (upright, in its
   * own paper units) map to this sheet's upright frame by scaling and then
   * shifting by (dx, dy). Each sheet is checked; the tuck is placed, not
   * proven.
   */
  readonly assembly: {
    readonly secondId: string;
    readonly label: string;
    readonly secondLabel: string;
    readonly scale: number;
    readonly dx: number;
    readonly dy: number;
  } | null;
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
  fish: "Fish",
  legs: "Four-legged animal",
  standing: "Standing animal",
} as const;

/** A sheet past the first is named by a suffix that no design id contains. */
const SHEET_MARK = "~";

/** The model an id names: a library entry or a design sheet, with its display name. */
const resolve = (
  id: string,
): {
  readonly model: ModelShape;
  readonly name: string;
  readonly library: boolean;
  /** The design's other sheet, when this is the first of two. */
  readonly partner: {
    readonly label: string;
    readonly scale: number;
    readonly ownLabel: string;
  } | null;
} | null => {
  if (isOrigamiModelId(id)) {
    const model = ORIGAMI_MODELS.find((m) => m.id === id);
    const entry = ORIGAMI_CATALOG.find((e) => e.id === id);
    if (!model || !entry)
      throw new Error(`Origami model ${id} is missing from the library.`);
    return { model, name: entry.name, library: true, partner: null };
  }
  const [designPart = "", sheetPart] = id.split(SHEET_MARK);
  const design = parseDesignId(designPart);
  if (!design) return null;
  const sheets = designSheets(
    design,
    "A design shaped for this subject from one of the model families, folded and checked at every step.",
  );
  const index = sheetPart === undefined ? 0 : Number(sheetPart) - 1;
  // Only "~2" names a second sheet, so one sheet has one URL.
  if (sheetPart !== undefined && (sheetPart !== "2" || sheets.length < 2))
    return null;
  const sheet = sheets[index]!;
  const second = index === 0 ? sheets[1] : undefined;
  return {
    model: sheet.model,
    name: sheet.label
      ? `${FAMILY_NAMES[design.family]}: ${sheet.label.toLowerCase()}`
      : FAMILY_NAMES[design.family],
    library: false,
    partner: second
      ? { label: second.label, scale: second.scale, ownLabel: sheet.label }
      : null,
  };
};

/** A finished shape's outline, upright: its final faces turned by the view. */
const uprightBounds = (
  pattern: CreasePatternV1,
  animation: FoldAnimation,
  viewDeg: number,
) => {
  const turn = (viewDeg * Math.PI) / 180;
  const last = animation.keyframes.at(-1)!;
  const points = pattern.faces.flatMap((face, f) =>
    face.map((v) => {
      const q = applyIsometry(last.transforms[f]!, pattern.vertices[v]!);
      return {
        x: q.x * Math.cos(turn) - q.y * Math.sin(turn),
        y: q.x * Math.sin(turn) + q.y * Math.cos(turn),
      };
    }),
  );
  const xs = points.map((q) => q.x);
  const ys = points.map((q) => q.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
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
  let assembly: OrigamiPayload["assembly"] = null;
  if (resolved.partner) {
    const secondId = `${id}${SHEET_MARK}2`;
    const second = build(secondId);
    const partner = resolve(secondId);
    if (!second || !partner) return null;
    const body = uprightBounds(pattern, animation, model.viewDeg);
    const neck = uprightBounds(
      second.payload.pattern,
      { ...second.payload.animation, faces: second.payload.pattern.faces },
      partner.model.viewDeg,
    );
    const { scale } = resolved.partner;
    // The neck sheet's kite sits inside the body's front (its left), with
    // the neck rising from the front of the back: tuned on the giraffe-like
    // designs, the kite's left edge just ahead of the body and its foot a
    // half body-height up, so it stays hidden between the body's layers.
    assembly = {
      secondId,
      label: resolved.partner.ownLabel,
      secondLabel: resolved.partner.label,
      scale,
      dx: body.minX - 0.16 * (body.maxX - body.minX) - scale * neck.minX,
      dy: body.minY + 0.52 * (body.maxY - body.minY) - scale * neck.minY,
    };
  }
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
        howTo: step.step.kind === "creases" ? (step.step.howTo ?? []) : [],
      })),
      animation: {
        collapse: animation.collapse,
        collapseStrain: animation.collapseStrain,
        keyframes: animation.keyframes,
        moves: animation.moves,
        formed: animation.formed,
      },
      assembly,
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
          payload.steps.flatMap((step) => step.howTo),
        ),
        contentType: "image/svg+xml",
        filename: `${file}-instructions.svg`,
      };
  }
};
