import { describe, expect, it, vi } from "vitest";

import { POST as choosePost } from "@/app/api/choose/route";
import { POST as papercraftPost } from "@/app/api/papercraft/route";
import { FIGURE_PRESETS, figureFromPreset } from "@/core/mesh/presets";
import {
  PapercraftPayloadSchema,
  RouteResponseSchema,
} from "@/lib/papercraft-contract";
import { RouteChoiceSchema, routePrompt } from "@/server/fabrication-ai/router";
import { buildFigure } from "@/server/papercraft";

import { papercraftPageSvg } from "@/core/mesh/export";
import {
  buildPapercraft,
  type PapercraftModel,
  type PapercraftSpec,
  type Shape,
} from "@/core/mesh/model";
import { verifyPapercraft } from "@/core/mesh/verify";

const part = (
  shape: Shape,
  size: [number, number, number],
): PapercraftSpec => ({
  title: "test",
  parts: [
    {
      id: "p",
      name: "Part",
      shape,
      size,
      position: [0, 0, 0],
      rotation: [10, 20, 30],
      color: "#f2c230",
    },
  ],
});

const build = (spec: PapercraftSpec): PapercraftModel => {
  const built = buildPapercraft(spec);
  if (!built.ok) throw new Error(built.error.kind);
  return built.value;
};

const DUCK: PapercraftSpec = {
  title: "Duck",
  parts: [
    {
      id: "body",
      name: "Body",
      shape: { kind: "ellipsoid" },
      size: [120, 85, 72],
      position: [0, 0, 36],
      color: "#f2c230",
    },
    {
      id: "head",
      name: "Head",
      shape: { kind: "ellipsoid" },
      size: [56, 52, 54],
      position: [42, 0, 88],
      color: "#f2c230",
    },
    {
      id: "beak",
      name: "Beak",
      shape: { kind: "taper", sides: 4, top: 0.35 },
      size: [26, 30, 26],
      position: [74, 0, 86],
      rotation: [45, 90, 0],
      color: "#f07a2b",
    },
  ],
  decals: [
    {
      part: "head",
      direction: [0.55, 0.75, 0.35],
      radiusMm: 4.5,
      color: "#1d1d1d",
    },
  ],
};

describe("3D papercraft", () => {
  it.each([
    ["a box", part({ kind: "box" }, [60, 40, 30])],
    [
      "a hexagonal prism",
      part({ kind: "taper", sides: 6, top: 1 }, [50, 50, 80]),
    ],
    ["a cone", part({ kind: "taper", sides: 8, top: 0 }, [60, 60, 70])],
    [
      "a faceted egg",
      part({ kind: "ellipsoid", segments: 10, rings: 6 }, [70, 60, 90]),
    ],
    ["a duck with a printed eye", DUCK],
  ])(
    "unfolds %s into a net that refolds exactly, every seam tabbed",
    (_, spec) => {
      const model = build(spec);
      expect(verifyPapercraft(model)).toEqual([]);
      expect(papercraftPageSvg(model, 0)).toContain("Glue each grey tab");
    },
  );

  it("prints decals where the ray from the part centre leaves the part", () => {
    const model = build(DUCK);
    expect(model.decals).toHaveLength(1);
    expect(model.pages.flat().flatMap((island) => island.decals)).toHaveLength(
      1,
    );
  });

  it.each([
    [
      "a part the sheet cannot hold",
      part({ kind: "box" }, [400, 400, 20]),
      "too_large",
    ],
    [
      "a decal on a missing part",
      {
        ...DUCK,
        decals: [
          { part: "wing", direction: [0, 1, 0], radiusMm: 3, color: "#000" },
        ],
      },
      "unknown_part",
    ],
  ] as const)("rejects %s", (_, spec, kind) => {
    const built = buildPapercraft(spec);
    expect(built.ok ? null : built.error.kind).toBe(kind);
  });

  // The checker trusts nothing the builder did: each tampering is caught.
  it.each([
    [
      "a stretched face",
      (m: PapercraftModel): PapercraftModel => ({
        ...m,
        pages: m.pages.map((page, p) =>
          page.map((island, i) =>
            p === 0 && i === 0
              ? {
                  ...island,
                  faces: island.faces.map((f, k) =>
                    k === 0
                      ? {
                          ...f,
                          points: f.points.map(([x, y], j) =>
                            j === 0 ? [x + 3, y] : [x, y],
                          ),
                        }
                      : f,
                  ),
                }
              : island,
          ),
        ),
      }),
      "refold",
    ],
    [
      "a missing glue tab",
      (m: PapercraftModel) => ({
        ...m,
        pages: m.pages.map((page) =>
          page.map((island) => ({
            ...island,
            cuts: island.cuts.map((c) => ({ ...c, tab: null })),
          })),
        ),
      }),
      "untabbed_cut",
    ],
    [
      "islands stacked on each other",
      (m: PapercraftModel) => ({
        ...m,
        pages: [m.pages.flat(), ...m.pages.flat().map(() => [])]
          .slice(0, 1)
          .map((page) => [...page, page[0]!]),
      }),
      "overlap",
    ],
    [
      "a piece off the page",
      (m: PapercraftModel) => ({ ...m, sheet: { widthMm: 20, heightMm: 20 } }),
      "off_page",
    ],
  ])("catches %s", (_, tamper, check) => {
    const failures = verifyPapercraft(tamper(build(DUCK)));
    expect(failures.map((f) => f.check)).toContain(check);
  });
});

describe("figures", () => {
  it.each(FIGURE_PRESETS.map((p) => [p.id, p] as const))(
    "the %s preset builds a checked model",
    (_, preset) => {
      const built = buildFigure(figureFromPreset(preset));
      expect(
        built.ok ? built.payload.pages.length : built.reason,
      ).toBeGreaterThan(0);
    },
  );

  it.each([
    ["fold a paper crane", { engine: "origami", modelId: "crane" }],
    ["a red fox", { engine: "figure", preset: "Fox", primary: "#d6403a" }],
    // A subject with a fold gets origami first and the figure beside it.
    [
      "a yellow duck with an orange beak",
      {
        engine: "origami",
        modelId: "neck_0.45_8_0.65_0",
        preset: "Duck",
        primary: "#f2c230",
      },
    ],
    [
      "a 20 cm cat",
      { engine: "origami", modelId: "cat-face", preset: "Cat", sizeMm: 200 },
    ],
    // A recoloured figure's tail and snout take a lighter shade, not cream.
    [
      "a black cat",
      {
        engine: "origami",
        modelId: "cat-face",
        preset: "Cat",
        primary: "#2b2b2b",
        secondary: "#5a5a5a",
      },
    ],
    ["a giraffe", { engine: "origami", modelId: "neck_0.55_10_0.86_-15" }],
    // A subject's natural colour, unless the prompt names one.
    [
      "a flamingo",
      { engine: "origami", modelId: "neck_0.53_-10_0.8_-55", paper: "#f08aa8" },
    ],
    ["a faceted paper duck", { engine: "figure", preset: "Duck" }],
    ["an origami swan", { engine: "origami", modelId: "swan" }],
    ["fold a dog", { engine: "origami", modelId: "dog-face" }],
    ["an origami cat", { engine: "origami", modelId: "cat-face" }],
    ["fold a heart", { engine: "origami", modelId: "heart" }],
    ["an origami flower", { engine: "origami", modelId: "tulip" }],
    ["a pop-up heart card", { engine: "popup" }],
    ["a swan", { engine: "origami", modelId: "swan", preset: "Swan" }],
    // A box is folded first; its base (0.6 of the square) fits 120 mm.
    [
      "a gift box 120 x 80 x 40 mm",
      { engine: "origami", modelId: "box", paperMm: 200 },
    ],
    ["a phone stand", { engine: "mechanism" }],
    // The sliding sleeve-and-tray design is papercraft by name.
    [
      "a deck of cards box with a slide-out tray",
      { engine: "figure", preset: "Playing-card box" },
    ],
    ["a duck bookmark", { engine: "mechanism" }],
    // With no AI, an origami request still folds: a general bird or the
    // crane, with a note saying why.
    [
      "an origami seagull",
      { engine: "origami", modelId: "bird_65_65_0.8_-105_120", noted: true },
    ],
    ["an origami teapot", { engine: "origami", modelId: "crane", noted: true }],
    ["a teapot", { engine: "mechanism" }],
    ["a paper mechanism nobody listed", { engine: "mechanism" }],
  ] as const)("routes %j without AI", async (prompt, expected) => {
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    const route = await routePrompt(prompt);
    vi.unstubAllEnvs();
    expect(route.engine).toBe(expected.engine);
    if (route.engine === "origami" && "modelId" in expected) {
      expect(route.modelId).toBe(expected.modelId);
      expect(route.paperColor).toMatch(/^#[0-9a-f]{6}$/u);
      if ("paper" in expected) expect(route.paperColor).toBe(expected.paper);
      if ("paperMm" in expected)
        expect(route.paperSizeMm).toBe(expected.paperMm);
      expect(route.note !== null).toBe("noted" in expected);
    }
    // The figure is the answer, or the alternative beside the origami.
    const figure =
      route.engine === "figure"
        ? route.figure
        : route.engine === "origami" && route.alternative?.engine === "figure"
          ? route.alternative.figure
          : null;
    if ("preset" in expected) {
      expect(figure?.title).toBe(expected.preset);
      if ("primary" in expected)
        expect(figure?.colors.primary).toBe(expected.primary);
      if ("secondary" in expected)
        expect(figure?.colors.secondary).toBe(expected.secondary);
      if ("sizeMm" in expected) expect(figure?.sizeMm).toBe(expected.sizeMm);
    }
  });

  it("lets the AI name only presets, library models, and family parameters", () => {
    const base = {
      engine: "figure",
      cardDesign: null,
      origamiId: null,
      colors: null,
      sizeMm: null,
      paperSizeMm: null,
      neckDesign: null,
      birdDesign: null,
      title: null,
      reason: "A giraffe is closest to the horse.",
    };
    expect(
      RouteChoiceSchema.safeParse({ ...base, presetId: "horse" }).success,
    ).toBe(true);
    expect(
      RouteChoiceSchema.safeParse({ ...base, presetId: "giraffe" }).success,
    ).toBe(false);
  });

  it("serves the route and the build over HTTP", async () => {
    const origin = "http://localhost:3000";
    const post = (path: string, body: unknown) =>
      new Request(`${origin}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify(body),
      });
    const route = RouteResponseSchema.parse(
      await (
        await choosePost(post("/api/choose", { prompt: "a penguin" }))
      ).json(),
    );
    expect(route.engine).toBe("figure");
    if (route.engine !== "figure") return;
    const built = await papercraftPost(
      post("/api/papercraft", { figure: route.figure }),
    );
    expect(PapercraftPayloadSchema.parse(await built.json()).title).toBe(
      "Penguin",
    );
    const rejected = await papercraftPost(
      post("/api/papercraft", { figure: { ...route.figure, sizeMm: 5000 } }),
    );
    expect(rejected.status).toBe(400);
  });
});
