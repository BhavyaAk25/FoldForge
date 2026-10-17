import { describe, expect, it, vi } from "vitest";

import { GET as exportGet } from "@/app/api/origami/[id]/[format]/route";
import { GET as modelGet } from "@/app/api/origami/[id]/route";
import { POST as choosePost } from "@/app/api/origami/choose/route";
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
import { checkFoldRules } from "@/core/origami/fold-rules";
import { ORIGAMI_MODELS } from "@/core/origami/models";
import { poseAt, stepCount } from "@/core/origami/pose";
import { deriveSequence, type FoldStep } from "@/core/origami/sequence";
import { simulateFolding } from "@/core/origami/simulate";
import { OrigamiPayloadSchema } from "@/lib/origami-contract";
import { OrigamiChoiceSchema } from "@/server/fabrication-ai/origami-choice";

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
    "%s derives, checks flat-foldable at every step, and animates",
    (_, model) => {
      const derived = deriveSequence(model.sequence);
      expect(derived.ok).toBe(true);
      if (!derived.ok) return;
      for (const step of derived.value)
        expect(checkFoldRules(step.pattern).flatFoldable).toBe(true);
      const animation = animateSequence(derived.value, model.sequence.anchor);
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

  it("returns no choice when no AI provider is configured", async () => {
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    const response = await choosePost(
      new Request("http://localhost:3000/api/origami/choose", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({ prompt: "an origami swan" }),
      }),
    );
    vi.unstubAllEnvs();
    expect(await response.json()).toEqual({
      modelId: null,
      paperSizeMm: null,
      reason: null,
    });
  });

  it("only lets the AI name a library model", () => {
    expect(
      OrigamiChoiceSchema.safeParse({
        modelId: "dragon",
        paperSizeMm: 150,
        reason: "x",
      }).success,
    ).toBe(false);
    expect(
      OrigamiChoiceSchema.safeParse({
        modelId: "crane",
        paperSizeMm: 150,
        reason: "A swan is closest to the crane.",
      }).success,
    ).toBe(true);
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

describe("origami routes", () => {
  const params = <T>(value: T) => ({ params: Promise.resolve(value) });

  it("returns a checked model the page can parse", async () => {
    const response = await modelGet(
      new Request("http://localhost/api/origami/crane"),
      params({ id: "crane" }),
    );
    expect(response.status).toBe(200);
    const payload = OrigamiPayloadSchema.parse(await response.json());
    expect(payload.steps.length).toBe(payload.verification.stepsChecked);
    expect(payload.steps.every((step) => step.added.length > 0)).toBe(true);
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
