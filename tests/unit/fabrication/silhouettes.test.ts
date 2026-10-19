import { describe, expect, it } from "vitest";

import { compileFabricationProgram } from "@/core/fabrication/compiler";
import { synthesizeFabricationDesign } from "@/core/fabrication/design-synthesis";
import { templateSpecForIntent } from "@/core/fabrication/design-templates";
import { intentFromPromptKeywords } from "@/core/fabrication/prompt-intent";
import {
  PANEL_SILHOUETTES,
  applyPanelSilhouettes,
  canonicalSilhouette,
  cutoutShapeForText,
} from "@/core/fabrication/silhouettes";
import { verifyFabricationIr } from "@/core/fabrication/verification";

import { fixtureProgram } from "../../fixtures/fabrication";

describe("canonical silhouettes", () => {
  it.each(PANEL_SILHOUETTES)(
    "%s keeps the full hinge edge and fills the panel envelope",
    (silhouette) => {
      const outline = canonicalSilhouette(silhouette, 120, 90);
      expect(outline.slice(0, 2)).toEqual([
        { s: 0, t: 0 },
        { s: 1, t: 0 },
      ]);
      const ts = outline.map((p) => p.t);
      const ss = outline.map((p) => p.s);
      // Touching the far edge keeps the assembled size equal to the request.
      expect(Math.max(...ts)).toBeCloseTo(1, 6);
      expect(Math.min(...ss)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...ss)).toBeLessThanOrEqual(1);
      expect(outline.length).toBeLessThanOrEqual(64);
    },
  );
});

describe("cutoutShapeForText", () => {
  it.each([
    ["a paper swan", null],
    ["Christmas trees for the table", "tree"],
    ["a tiny cottage", "house"],
    ["a gold star", "star"],
    ["start a box", null],
    ["a robot", null],
  ])("maps %j to %s", (text, expected) => {
    expect(cutoutShapeForText(text)).toBe(expected);
  });
});

describe("applyPanelSilhouettes", () => {
  it("only redraws plain rectangles that carry exactly one hinge", () => {
    const program = fixtureProgram();
    const requested = new Map(
      program.blueprint.panels.map((panel) => [panel.panelId, "star" as const]),
    );
    const result = applyPanelSilhouettes(program, requested);
    result.blueprint.panels.forEach((panel, index) => {
      const original = program.blueprint.panels[index]!;
      const isPlainRectangle =
        original.contour.vertices.length === 4 &&
        original.innerCutContours.length === 0 &&
        !program.blueprint.connectors.some(
          (connector) => connector.panelId === original.panelId,
        );
      if (!isPlainRectangle) expect(panel).toEqual(original);
    });
    expect(applyPanelSilhouettes(program, new Map())).toBe(program);
  });

  it("draws a real flower on the pop-up card and keeps it verified", () => {
    const intent = intentFromPromptKeywords(
      "a birthday card where a flower pops up, A6",
    )!;
    const result = synthesizeFabricationDesign(
      intent,
      templateSpecForIntent(intent)!,
      1,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const flower = result.value.blueprint.panels.find(
      (panel) => panel.panelId === "panel-flower",
    );
    expect(flower?.contour.vertices.length).toBeGreaterThan(20);
    const compiled = compileFabricationProgram(intent, result.value);
    expect(compiled.ok).toBe(true);
    if (compiled.ok) {
      expect(verifyFabricationIr(compiled.value, "flower").valid).toBe(true);
    }
  }, 120_000);
});

describe("cut-out and stand templates", () => {
  it.each([
    ["a bookmark shaped like a star", "star cut-out", 1],
    ["a heart gift tag 60 x 80 mm", "heart cut-out", 1],
    ["a phone stand for my desk", "Desk stand", 0],
  ])("%s -> verified %s", (prompt, label, shapedPanels) => {
    const intent = intentFromPromptKeywords(prompt)!;
    const result = synthesizeFabricationDesign(
      intent,
      templateSpecForIntent(intent)!,
      1,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.valid).toBe(true);
    expect(result.value.candidateLabel).toContain(label.split(" ")[0]!);
    expect(
      result.value.blueprint.panels.filter(
        (panel) => panel.contour.vertices.length !== 4,
      ),
    ).toHaveLength(shapedPanels);
  });

  it("matches stand and cut-out keywords as whole words only", () => {
    expect(
      intentFromPromptKeywords("a box for a standard deck of cards")?.title,
    ).toBe("Folded box");
  });
});
