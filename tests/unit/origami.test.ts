import { describe, expect, it } from "vitest";

import { GET as exportGet } from "@/app/api/origami/[id]/[format]/route";
import { GET as modelGet } from "@/app/api/origami/[id]/route";
import { animateSequence } from "@/core/origami/animate";
import { difficultyOf } from "@/core/origami/difficulty";
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
  designSheets,
  foldableDesign,
  parseDesignId,
} from "@/core/origami/generate";
import { ORIGAMI_MODELS } from "@/core/origami/models";
import { SUBJECTS } from "@/core/origami/subjects";
import { poseAt, stepCount, tuckedDepths } from "@/core/origami/pose";
import {
  deriveSequence,
  faceAt,
  foldedTransforms,
  type FoldStep,
} from "@/core/origami/sequence";
import { simulateFolding } from "@/core/origami/simulate";
import { curlCollisions } from "@/core/origami/curl";
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

describe("difficulty", () => {
  it.each([
    ["paper-plane", "beginner"],
    ["cookie", "beginner"],
    ["crane", "intermediate"],
    ["butterfly", "intermediate"],
    ["frog", "advanced"],
    ["lily", "advanced"],
  ] as const)("rates %s %s", (id, level) => {
    const model = ORIGAMI_MODELS.find((m) => m.id === id)!;
    expect(difficultyOf(model.sequence.steps)).toBe(level);
  });
});

describe("collapse steps", () => {
  it("teach the bird base as a square base and two petal folds, the paper moving as one sheet", () => {
    const bird = ORIGAMI_MODELS.find((m) => m.id === "bird-base")!;
    const derived = deriveSequence(bird.sequence);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.value.map((s) => s.step.kind)).toEqual([
      "creases",
      "collapse",
      "collapse",
    ]);
    const animation = animateSequence(derived.value, bird.sequence.anchor);
    // Each petal fold turns faces over their own lines (and the model with them).
    expect(animation.moves.every((m) => m.axes !== null)).toBe(true);
    const input = {
      vertices: derived.value.at(-1)!.pattern.vertices,
      faces: animation.faces,
      collapse: animation.collapse,
      keyframes: animation.keyframes,
      moves: animation.moves,
    };
    // Mid-fold poses are finite, and each fold ends exactly on its keyframe.
    for (const at of [1.5, 2, 2.5, 3]) {
      expect(poseAt(input, at).every(Number.isFinite)).toBe(true);
    }
  });

  it("rejects a collapse that breaks the fold rules", () => {
    const result = deriveSequence({
      anchor: p(0.5, 0.05),
      steps: [
        {
          kind: "creases",
          instruction: "",
          segments: [{ from: p(0, 0.5), to: p(1, 0.5), assignment: "V" }],
        },
        {
          kind: "collapse",
          instruction: "",
          add: [{ from: p(0.5, 0), to: p(0.5, 0.5), assignment: "M" }],
        },
      ],
    });
    expect(result.ok ? null : result.error.kind).toBe("not_flat_foldable");
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
        ...frog.sequence.steps,
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
    expect(animation.moves.at(-1)!.moving.some(Boolean)).toBe(true);
    expect(animation.moves.at(-1)!.moving.every(Boolean)).toBe(false);
  });

  it("opens the lily's petals to different angles, so all four show", () => {
    const lily = ORIGAMI_MODELS.find((m) => m.id === "lily")!;
    const derived = deriveSequence(lily.sequence);
    if (!derived.ok) throw new Error(derived.error.kind);
    const petals = animateSequence(derived.value, lily.sequence.anchor)
      .moves.filter((move) => !move.bends)
      .slice(-4)
      .map((move) => move.endDeg * move.swing);
    expect(new Set(petals).size).toBe(4);
  });

  // The lily's petals curl outward: flat lines in the proof, checked in 3D.
  // Curled inward they pass through each other; a bend line that stops
  // partway across a petal would tear it; nothing folds after a curl.
  const lily = ORIGAMI_MODELS.find((m) => m.id === "lily")!;
  const curls = lily.sequence.steps.filter((s) => s.kind === "curl");
  const recurled = (sign: number, extra: readonly FoldStep[] = []) => ({
    ...lily.sequence,
    steps: [
      ...lily.sequence.steps.map((s) =>
        s.kind === "curl" ? { ...s, degrees: sign * s.degrees * 1.6 } : s,
      ),
      ...extra,
    ],
  });
  it.each([
    ["outward", lily.sequence, "ok", 0],
    ["inward", recurled(-1), "ok", "some"],
    [
      "along a short line",
      recurled(1, [
        {
          ...curls[0]!,
          line: { from: p(0.49, 0.1), to: p(0.51, 0.1) },
        } as FoldStep,
      ]),
      "curl_tears",
      null,
    ],
    [
      "then folded",
      recurled(1, [
        {
          kind: "valley",
          instruction: "",
          line: { from: p(0, 0.3), to: p(1, 0.3) },
          toward: p(0.5, 0.4),
        },
      ]),
      "curl_not_last",
      null,
    ],
  ] as const)(
    "curls the lily's petals %s",
    (_, sequence, outcome, crossings) => {
      const derived = deriveSequence(sequence);
      expect(derived.ok ? "ok" : derived.error.kind).toBe(outcome);
      if (!derived.ok) return;
      const pattern = derived.value.at(-1)!.pattern;
      const animation = animateSequence(derived.value, sequence.anchor);
      expect(pattern.edges.some((e) => e.assignment === "F")).toBe(true);
      const count = curlCollisions({
        ...animation,
        vertices: pattern.vertices,
      });
      if (crossings === 0) expect(count).toBe(0);
      else expect(count).toBeGreaterThan(0);
    },
  );

  it("teaches the frog base as a square base, four squashes, and four petal folds", () => {
    expect(frog.sequence.steps.map((s) => s.kind)).toEqual([
      "creases",
      ...Array<string>(8).fill("collapse"),
    ]);
    const derived = deriveSequence(frog.sequence);
    if (!derived.ok) throw new Error(derived.error.kind);
    // The classic frog base: 25 mountains and 15 valleys, with the squash
    // lines below each petal's hinge opened flat again.
    const senses = derived.value.at(-1)!.pattern.edges.map((e) => e.assignment);
    expect(
      ["M", "V", "F"].map((a) => senses.filter((s) => s === a).length),
    ).toEqual([25, 15, 8]);
  });

  // Every base folded all at once settles in the simulator: the ones it
  // could not (the frog base, the standing animal's body) are taught fold
  // by fold instead, so none is animated face by face.
  it("simulates every base collapse instead of placing it face by face", () => {
    const standing = parseDesignId("standing_0.55_10_0.8_-30")!;
    const sequences = [
      ...ORIGAMI_MODELS.map((m) => m.sequence),
      ...designSheets(standing, "").map((s) => s.model.sequence),
    ].filter((q) => q.steps[0]?.kind === "creases" && !q.steps[0].form);
    const faceByFace = sequences.filter((q) => {
      const derived = deriveSequence({ ...q, steps: q.steps.slice(0, 1) });
      if (!derived.ok) throw new Error(derived.error.kind);
      return animateSequence(derived.value, q.anchor).collapseStrain === null;
    });
    expect(faceByFace).toHaveLength(0);
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
    // A standing animal is five squares: "~2" to "~5" name the others.
    ["standing_0.55_10_0.8_-30~2", 200],
    ["standing_0.55_10_0.8_-30~5", 200],
    ["standing_0.55_10_0.8_-30~6", 404],
    ["standing_0.55_10_0.8_-30~03", 404],
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
    expect(payload.steps[0]!.howTo).toHaveLength(3);
    // The bird base is then taught as two petal folds, each its own step.
    expect(payload.steps[1]!.instruction).toMatch(/^Petal-fold/u);
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

  it("serves a standing animal: the body names the neck in front, the tail behind, and two pairs of legs", async () => {
    const id = "standing_0.55_10_0.8_-30";
    const get = async (sheet: string) =>
      OrigamiPayloadSchema.parse(
        await (
          await modelGet(new Request("http://localhost"), params({ id: sheet }))
        ).json(),
      );
    const body = await get(id);
    const [neck, tail, fore, hind] = body.assembly!.parts;
    expect(neck).toMatchObject({ id: `${id}~2`, scale: 0.6 });
    expect(tail).toMatchObject({ id: `${id}~3`, label: "Tail", scale: 0.26 });
    expect(fore).toMatchObject({ id: `${id}~4`, label: "Front legs" });
    expect(hind).toMatchObject({ id: `${id}~5`, label: "Hind legs" });
    expect((await get(neck!.id)).assembly).toBeNull();
    expect((await get(hind!.id)).assembly).toBeNull();
    // From the front of the body (left) to its rear: the neck, the front
    // legs, the hind legs, then the tail.
    const x = [neck, fore, hind, tail].map((part) => part!.dx);
    expect(x).toEqual([...x].sort((a, b) => a - b));
    // A tucked sheet's stack, however deep, sits thinly at the median of
    // the body's depths, not pulled forward by a few deep wrapped layers.
    expect(
      tuckedDepths([0, 0.004, 0.008, 0.012, 0.03], [0, 0.009, 0.018]).map(
        (z) => Math.round(z * 1e6) / 1e6,
      ),
    ).toEqual([0.005, 0.008, 0.011]);
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
