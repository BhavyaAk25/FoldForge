import { animateSequence, type FoldAnimation } from "@/core/origami/animate";
import { isOrigamiModelId, ORIGAMI_CATALOG } from "@/core/origami/catalog";
import type { CreasePatternV1 } from "@/core/origami/crease-pattern";
import {
  creasePatternSvg,
  foldFile,
  flatCreaseDiagram,
  formDiagram,
  instructionsSvg,
  type HowToDiagram,
  type StepDiagram,
  stepDiagram,
  type InstructionStep,
} from "@/core/origami/export";
import type { ModelShape } from "@/core/origami/families";
import { difficultyOf, type Difficulty } from "@/core/origami/difficulty";
import { applyIsometry } from "@/core/origami/fold-rules";
import {
  designSheets,
  parseDesignId,
  type Sheet,
} from "@/core/origami/generate";
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
    readonly howTo: readonly {
      readonly text: string;
      readonly diagram: HowToDiagram | null;
    }[];
  }[];
  readonly animation: Omit<FoldAnimation, "faces">;
  /**
   * For the first sheet of a model folded from several: this sheet's label
   * and each later sheet's id, label, and where its finished shape sits on
   * this one. A part's points (upright, in its own paper units) map to this
   * sheet's upright frame by scaling and then shifting by (dx, dy). Each
   * sheet is checked; the tucks are placed, not proven.
   */
  readonly assembly: {
    readonly label: string;
    readonly parts: readonly {
      readonly id: string;
      readonly label: string;
      readonly scale: number;
      readonly dx: number;
      readonly dy: number;
    }[];
  } | null;
  /** How hard it is to fold by hand, from its steps. */
  readonly difficulty: Difficulty;
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
  /** This sheet's label and the sheets after it, when it is the first of several. */
  readonly parts: {
    readonly label: string;
    readonly later: readonly Sheet[];
  } | null;
} | null => {
  if (isOrigamiModelId(id)) {
    const model = ORIGAMI_MODELS.find((m) => m.id === id);
    const entry = ORIGAMI_CATALOG.find((e) => e.id === id);
    if (!model || !entry)
      throw new Error(`Origami model ${id} is missing from the library.`);
    return { model, name: entry.name, library: true, parts: null };
  }
  const [designPart = "", sheetPart] = id.split(SHEET_MARK);
  const design = parseDesignId(designPart);
  if (!design) return null;
  const sheets = designSheets(
    design,
    "A design shaped for this subject from one of the model families, folded and checked at every step.",
  );
  // Only "~2", "~3", ... name a later sheet, so one sheet has one URL.
  const index = sheetPart === undefined ? 0 : Number(sheetPart) - 1;
  if (
    sheetPart !== undefined &&
    (!/^[2-9]$/u.test(sheetPart) || index >= sheets.length)
  )
    return null;
  const sheet = sheets[index]!;
  return {
    model: sheet.model,
    name: sheet.label
      ? `${FAMILY_NAMES[design.family]}: ${sheet.label.toLowerCase()}`
      : FAMILY_NAMES[design.family],
    library: false,
    parts:
      index === 0 && sheets.length > 1
        ? { label: sheet.label, later: sheets.slice(1) }
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

/** A folded state's diagram as a hand-folding picture (no creases to add). */
const picture = (diagram: StepDiagram): HowToDiagram => ({
  polygons: diagram.polygons,
  creases: [],
});

/** The square base, derived and checked like any library model, drawn once. */
let squareBase: HowToDiagram | null = null;
const squareBaseDiagram = (): HowToDiagram => {
  if (squareBase) return squareBase;
  const model = ORIGAMI_MODELS.find((m) => m.id === "square-base");
  const derived = model ? deriveSequence(model.sequence) : null;
  if (!model || !derived?.ok)
    throw new Error("The library square base does not derive.");
  const animation = animateSequence(derived.value, model.sequence.anchor);
  squareBase = picture(
    stepDiagram(
      derived.value.at(-1)!.pattern,
      animation.keyframes.at(-1)!,
      null,
      // Drawn as a diamond, open end down, as books show it.
      45,
    ),
  );
  return squareBase;
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
  if (resolved.parts) {
    const body = uprightBounds(pattern, animation, model.viewDeg);
    const [width, height] = [body.maxX - body.minX, body.maxY - body.minY];
    const parts = resolved.parts.later.map((sheet, i) => {
      const partId = `${id}${SHEET_MARK}${i + 2}`;
      const part = build(partId);
      if (!part) return null;
      const own = uprightBounds(
        part.payload.pattern,
        { ...part.payload.animation, faces: part.payload.pattern.faces },
        sheet.model.viewDeg,
      );
      const { scale } = sheet;
      // Each tuck, tuned by eye: a point on the body (its front is left),
      // then the part's point set on it, so its tucked end stays hidden.
      const { minX: l, maxX: r, minY: b, maxY: t } = body;
      const midX = (own.minX + own.maxX) / 2;
      const tucks = {
        front: [l - 0.16 * width, b + 0.22 * height, own.minX, own.minY],
        rear: [r - 0.1 * width, t - 0.13 * height, own.minX, own.maxY],
        "fore-legs": [l + 0.2 * width, b + 0.35 * height, midX, own.maxY],
        "hind-legs": [r - 0.2 * width, b + 0.35 * height, midX, own.maxY],
      } as const;
      const [bx, by, ox, oy] = tucks[sheet.tuck ?? "front"];
      const [dx, dy] = [bx - scale * ox, by - scale * oy];
      return { id: partId, label: sheet.label, scale, dx, dy };
    });
    if (parts.some((part) => part === null)) return null;
    assembly = {
      label: resolved.parts.label,
      parts: parts.filter((part) => part !== null),
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
        howTo:
          step.step.kind === "creases"
            ? (step.step.howTo ?? []).map((sub) => ({
                text: sub.text,
                diagram: !sub.show
                  ? null
                  : "creases" in sub.show
                    ? flatCreaseDiagram(sub.show.creases)
                    : sub.show.folded === "square-base"
                      ? squareBaseDiagram()
                      : picture(
                          stepDiagram(
                            pattern,
                            animation.keyframes[0]!,
                            null,
                            model.viewDeg,
                          ),
                        ),
              }))
            : [],
      })),
      animation: {
        collapse: animation.collapse,
        collapseStrain: animation.collapseStrain,
        keyframes: animation.keyframes,
        moves: animation.moves,
        formed: animation.formed,
      },
      assembly,
      difficulty: difficultyOf(model.sequence.steps),
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
