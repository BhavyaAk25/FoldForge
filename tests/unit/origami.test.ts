import { describe, expect, it } from "vitest";

import { GET as exportGet } from "@/app/api/origami/[id]/[format]/route";
import { GET as modelGet } from "@/app/api/origami/[id]/route";
import { animateSequence } from "@/core/origami/animate";
import {
  ORIGAMI_CATALOG,
  asksForOrigami,
  matchOrigamiModel,
  paperSizeFromPrompt,
} from "@/core/origami/catalog";
import {
  buildCreasePattern,
  type CreaseSegment,
} from "@/core/origami/crease-pattern";
import type { Point2 } from "@/core/origami/crease-pattern";
import { applyIsometry, checkFoldRules } from "@/core/origami/fold-rules";
import {
  designId,
  foldableDesign,
  parseDesignId,
} from "@/core/origami/generate";
import { ORIGAMI_MODELS } from "@/core/origami/models";
import { SUBJECTS } from "@/core/origami/subjects";
import { poseAt, stepCount } from "@/core/origami/pose";
import {
  deriveSequence,
  faceAt,
  foldedTransforms,
  type FoldStep,
} from "@/core/origami/sequence";
import { simulateFolding } from "@/core/origami/simulate";
import { OrigamiPayloadSchema } from "@/lib/origami-contract";

const p = (x: number, y: number) => ({ x, y });
const s = (
  from: [number, number],
  to: [number, number],
  assignment: CreaseSegment["assignment"],
): CreaseSegment => ({
  from: p(...from),
  to: p(...to),
  assignment,
});
const pattern = (segments: CreaseSegment[]) => {
  const built = buildCreasePattern(segments);
  if (!built.ok) throw new Error(built.error.kind);
  return built.value;
};

describe("origami library", () => {
  it("has a fold sequence for every catalog entry", () => {
    expect(ORIGAMI_MODELS.map((m) => m.id).sort()).toEqual(
      ORIGAMI_CATALOG.map((e) => e.id).sort(),
    );
  });

  it.each(ORIGAMI_MODELS.map((m) => [m.id, m] as const))(
    "%s derives, checks every step, and animates",
    (_, model) => {
      const derived = deriveSequence(model.sequence);
      expect(derived.ok).toBe(true);
      if (!derived.ok) return;
      const animation = animateSequence(derived.value, model.sequence.anchor);
      // A flat model folds flat at every step; a 3D form (the box) is proven
      // by closing instead, and stands up off the sheet.
      for (const step of derived.value)
        expect(checkFoldRules(step.pattern).flatFoldable).toBe(
          !animation.formed,
        );
      expect(animation.keyframes).toHaveLength(animation.moves.length + 1);
      // A collapsed base lands within 1% of rigid paper.
      if (animation.collapseStrain !== null)
        expect(animation.collapseStrain).toBeLessThan(0.01);
      const final = derived.value.at(-1)!.pattern;
      const input = { ...animation, vertices: final.vertices };
      for (const at of [
        0,
        0.5,
        0.9,
        stepCount(input) - 0.5,
        stepCount(input) + 1,
      ]) {
        expect(poseAt(input, at).every(Number.isFinite)).toBe(true);
      }
    },
  );

  it("shows the swan upright: its neck rises well above the body", () => {
    const swan = ORIGAMI_MODELS.find((m) => m.id === "swan")!;
    const derived = deriveSequence(swan.sequence);
    if (!derived.ok) throw new Error(derived.error.kind);
    const final = derived.value.at(-1)!.pattern;
    const transforms = foldedTransforms(final, swan.sequence.anchor)!;
    const r = (swan.viewDeg * Math.PI) / 180;
    // Height on screen once the page turns the model by viewDeg.
    const height = (x: number, y: number) => {
      const q = applyIsometry(transforms[faceAt(final, p(x, y))]!, p(x, y));
      return q.x * Math.sin(r) + q.y * Math.cos(r);
    };
    const body = Math.max(
      height(0.97, 0.9),
      height(0.9, 0.2),
      height(0.2, 0.9),
    );
    expect(height(0.03, 0.01) - body).toBeGreaterThan(0.4);
  });
});

describe("matchOrigamiModel", () => {
  it.each([
    ["Fold a paper crane", "crane"],
    ["make a bird base", "bird-base"],
    ["a flapping bird please", "flapping-bird"],
    ["paper airplanes for a class", "paper-plane"],
    ["a preliminary base", "square-base"],
    ["two cups", "cup"],
    ["boxes shaped like cranes", null],
    ["make a duck", null],
    ["fold me a frog base", "frog-base"],
    ["a crane-shaped box", null],
    ["a birthday card with a paper plane", null],
  ])("%j -> %s", (prompt, expected) => {
    expect(matchOrigamiModel(prompt)).toBe(expected);
  });
});

describe("origami prompts the AI chooses for", () => {
  it.each([
    ["an origami swan", true],
    ["fold a dove", true],
    ["an origami box", false],
    ["make a rat", false],
    ["make a folding display", false],
  ])("%j asks for origami: %s", (prompt, expected) => {
    expect(asksForOrigami(prompt)).toBe(expected);
  });

  it.each([
    ["a crane from a 20 cm square", 200],
    ["6 inch paper", 152],
    ["a 1 mm crane", 50],
    ["a crane", null],
  ])("%j gives a %s mm sheet", (prompt, expected) => {
    expect(paperSizeFromPrompt(prompt)).toBe(expected);
  });
});

describe("crease patterns and fold rules", () => {
  it.each([
    ["outside the sheet", [s([0, 0], [1.2, 1], "M")], "outside_sheet"],
    [
      "a degenerate crease",
      [s([0.5, 0.5], [0.5, 0.5], "V")],
      "degenerate_segment",
    ],
    [
      "a mountain over a valley",
      [s([0, 0.5], [0.6, 0.5], "M"), s([0.4, 0.5], [1, 0.5], "V")],
      "conflicting_overlap",
    ],
  ])("rejects %s", (_, segments, kind) => {
    const built = buildCreasePattern(segments);
    expect(built.ok ? null : built.error.kind).toBe(kind);
  });

  it.each([
    ["one valley across the sheet", [s([0, 0.5], [1, 0.5], "V")], []],
    [
      "a crease that stops inside",
      [s([0, 0.5], [0.5, 0.5], "V")],
      ["maekawa", "kawasaki"],
    ],
    [
      "four creases with uneven angles",
      [s([0, 0.5], [1, 0.5], "M"), s([0.5, 0], [0.5, 1], "M")],
      ["maekawa"],
    ],
    [
      "three mountains and a valley off-angle",
      [
        s([0, 0.5], [1, 0.5], "M"),
        s([0.5, 0.5], [0.5, 1], "M"),
        s([0.5, 0.5], [0.8, 0], "V"),
      ],
      ["consistency", "kawasaki"],
    ],
  ])("%s", (_, segments, rules) => {
    const report = checkFoldRules(pattern(segments));
    expect([...new Set(report.failures.map((f) => f.rule))].sort()).toEqual(
      [...rules].sort(),
    );
  });

  it("simulates one valley fold without stretching the paper", () => {
    const result = simulateFolding(pattern([s([0, 0.5], [1, 0.5], "V")]), {
      frames: 8,
    });
    expect(result.finalStrain).toBeLessThan(1e-4);
    expect(result.finalCreaseErrorDeg).toBeLessThan(1);
  });
});

describe("deriveSequence", () => {
  const halfFold: FoldStep = {
    kind: "valley",
    instruction: "Fold in half.",
    line: { from: p(-0.1, -0.1), to: p(1.1, 1.1) },
    toward: p(0.1, 0.9),
  };
  const tip = (kind: "inside-reverse" | "outside-reverse"): FoldStep => ({
    kind,
    instruction: "Reverse-fold the tip.",
    line: { from: p(0.35, -0.05), to: p(0.15, 0.35) },
    toward: p(0, 0),
  });

  it("tucks a reverse-folded tip inside, with the spine's new creases as valleys", () => {
    const derived = deriveSequence({
      anchor: p(0.8, 0.2),
      steps: [halfFold, tip("inside-reverse")],
    });
    expect(
      derived.ok ? derived.value[1]!.added.map((c) => c.assignment) : null,
    ).toEqual(["V", "V"]);
  });

  it.each([
    [
      "a base after a fold",
      {
        anchor: p(0.8, 0.2),
        steps: [halfFold, { kind: "creases", instruction: "x", segments: [] }],
      },
      "base_not_first",
    ],
    [
      "an anchor off the sheet",
      { anchor: p(2, 2), steps: [halfFold] },
      "anchor_lost",
    ],
    [
      "a bad base",
      {
        anchor: p(0.8, 0.2),
        steps: [
          {
            kind: "creases",
            instruction: "x",
            segments: [s([0, 0], [2, 2], "M")],
          },
        ],
      },
      "pattern",
    ],
    [
      "a fold through one layer only",
      {
        anchor: p(0.8, 0.2),
        steps: [
          halfFold,
          {
            ...halfFold,
            line: { from: p(0.5, -0.1), to: p(0.5, 1.1) },
            toward: p(0.1, 0.05),
            layers: (f: { paper: { x: number; y: number } }) =>
              f.paper.y < f.paper.x,
          },
        ],
      },
      "not_flat_foldable",
    ],
    [
      "an outside reverse fold that would push paper through paper",
      { anchor: p(0.8, 0.2), steps: [halfFold, tip("outside-reverse")] },
      "layers_cross",
    ],
    [
      "a fold line off the paper",
      {
        anchor: p(0.8, 0.2),
        steps: [{ ...halfFold, line: { from: p(2, 2), to: p(3, 3) } }],
      },
      "fold_misses",
    ],
  ] as const)("reports %s", (_, sequence, kind) => {
    const derived = deriveSequence(
      sequence as Parameters<typeof deriveSequence>[0],
    );
    expect(derived.ok ? null : derived.error.kind).toBe(kind);
  });
});

describe("the origami box", () => {
  const model = ORIGAMI_MODELS.find((m) => m.id === "box")!;
  const first = model.sequence.steps[0]!;
  const form = first.kind === "creases" ? first.form! : () => 180;

  it("stands its walls up and closes every loop of faces", () => {
    const derived = deriveSequence(model.sequence);
    if (!derived.ok) throw new Error(derived.error.kind);
    const animation = animateSequence(derived.value, model.sequence.anchor);
    const heights = animation.collapse!.at(-1)!.filter((_, i) => i % 3 === 2);
    expect([Math.min(...heights), Math.max(...heights)]).toEqual([0, 0.2]);
  });

  it("refuses a form whose corners do not meet", () => {
    // Every corner edge at 90 degrees leaves the corner flaps apart.
    const open = {
      ...model.sequence,
      steps: [
        { ...first, form: (a: Point2, b: Point2) => Math.min(90, form(a, b)) },
      ],
    };
    const derived = deriveSequence(open as typeof model.sequence);
    expect(derived.ok ? null : derived.error.kind).toBe("form_open");
  });
});

describe("page turns", () => {
  const frog = ORIGAMI_MODELS.find((m) => m.id === "frog-base")!;
  const axis = { from: p(0.5, -0.5), to: p(0.5, 1) };
  // The front flap of the frog base: the paper round one edge's midpoint.
  const frontFlap = ({ paper }: { readonly paper: Point2 }) =>
    Math.abs(paper.x - 0.5) <= Math.abs(paper.y - 0.5) && paper.y < 0.5;
  const turn = (line: typeof axis) =>
    deriveSequence({
      anchor: frog.sequence.anchor,
      steps: [
        frog.sequence.steps[0]!,
        {
          kind: "turn",
          instruction: "Turn the front flap.",
          line,
          layers: frontFlap,
        },
      ],
    });

  it("swings a flap over the axis, checked like any fold", () => {
    const turned = turn(axis);
    if (!turned.ok) throw new Error(turned.error.kind);
    const animation = animateSequence(turned.value, frog.sequence.anchor);
    // The flap moved; the rest did not.
    expect(animation.moves[0]!.moving.some(Boolean)).toBe(true);
    expect(animation.moves[0]!.moving.every(Boolean)).toBe(false);
  });

  it("refuses a turn about a line with no hinge on it", () => {
    const missed = turn({ from: p(0.6, -0.5), to: p(0.6, 1) });
    expect(missed.ok ? null : missed.error.kind).toBe("fold_misses");
  });
});

describe("generated designs", () => {
  it.each(
    SUBJECTS.flatMap((s) =>
      "design" in s.answer ? [[s.title, s.answer.design] as const] : [],
    ),
  )("the %s design folds exactly as written", (_, design) => {
    const folded = foldableDesign(design);
    expect(folded && designId(folded)).toBe(designId(design));
  });

  it.each([
    ["neck_0.53_0_0.78_25", true],
    ["bird_67.5_67.5_0.8_-105_90", true],
    ["fish_0.3_80", true],
    // Out of bounds, not canonical, or not a family: no design.
    ["neck_0.9_0_0.78_25", false],
    ["neck_0.530_0_0.78_25", false],
    ["neck_0.53_0_0.78", false],
    ["fish_1_2_3_4", false],
  ] as const)("parses %s: %s", (id, valid) => {
    const design = parseDesignId(id);
    expect(design ? designId(design) : null).toBe(valid ? id : null);
  });

  it("moves a design that does not fold to the nearest one that does", () => {
    const leaning = foldableDesign({
      family: "neck",
      neckAt: 0.45,
      leanDeg: 14,
      headAt: 0.65,
      headDeg: 30,
    });
    expect(leaning && designId(leaning)).toBe("neck_0.45_14_0.65_21");
  });
});

describe("origami routes", () => {
  const params = <T>(value: T) => ({ params: Promise.resolve(value) });

  it.each([
    ["crane", 200],
    ["neck_0.55_10_0.86_-15", 200],
    ["neck_0.9_0_0.78_25", 404],
    // A standing animal is two squares; only "~2" names the second.
    ["standing_0.55_10_0.8_-30~2", 200],
    ["standing_0.55_10_0.8_-30~3", 404],
    ["neck_0.55_10_0.86_-15~2", 404],
  ] as const)("serves %s with status %i", async (id, status) => {
    const response = await modelGet(
      new Request(`http://localhost/api/origami/${id}`),
      params({ id }),
    );
    expect(response.status).toBe(status);
  });

  it("returns a checked model the page can parse", async () => {
    const response = await modelGet(
      new Request("http://localhost/api/origami/crane"),
      params({ id: "crane" }),
    );
    expect(response.status).toBe(200);
    const payload = OrigamiPayloadSchema.parse(await response.json());
    expect(payload.steps.length).toBe(payload.verification.stepsChecked);
    expect(payload.steps.every((step) => step.added.length > 0)).toBe(true);
    // A base comes with the classic hand sequence, on the page and the sheet.
    expect(payload.steps[0]!.howTo.length).toBeGreaterThanOrEqual(5);
    // Creasing steps show their lines; the square base is drawn folded.
    expect(payload.steps[0]!.howTo[0]!.diagram?.creases).toHaveLength(2);
    expect(
      payload.steps[0]!.howTo[2]!.diagram?.polygons.length,
    ).toBeGreaterThan(1);
    const sheet = await exportGet(
      new Request("http://localhost"),
      params({ id: "crane", format: "instructions" }),
    );
    expect(await sheet.text()).toContain("Folding the base by hand");
  });

  it("serves a two-square animal: the body names the neck sheet tucked in front", async () => {
    const id = "standing_0.55_10_0.8_-30";
    const body = OrigamiPayloadSchema.parse(
      await (
        await modelGet(new Request("http://localhost"), params({ id }))
      ).json(),
    );
    expect(body.assembly).toMatchObject({ secondId: `${id}~2`, scale: 0.6 });
    const neck = OrigamiPayloadSchema.parse(
      await (
        await modelGet(
          new Request("http://localhost"),
          params({ id: body.assembly!.secondId }),
        )
      ).json(),
    );
    expect(neck.assembly).toBeNull();
    // The neck's kite starts ahead of the body's front (its left edge).
    expect(body.assembly!.dx).toBeLessThan(0.3);
  });

  it.each([
    ["svg", "image/svg+xml", "<svg"],
    ["fold", "application/json", '"file_spec"'],
    ["instructions", "image/svg+xml", "folding instructions"],
  ])("downloads %s", async (format, type, marker) => {
    const response = await exportGet(
      new Request("http://localhost"),
      params({ id: "paper-plane", format }),
    );
    expect(response.headers.get("Content-Type")).toBe(type);
    expect(await response.text()).toContain(marker);
  });

  it.each([
    [
      "an unknown model",
      () => modelGet(new Request("http://localhost"), params({ id: "dragon" })),
    ],
    [
      "an unknown format",
      () =>
        exportGet(
          new Request("http://localhost"),
          params({ id: "crane", format: "pdf" }),
        ),
    ],
  ])("404s %s", async (_, call) => {
    expect((await call()).status).toBe(404);
  });
});
