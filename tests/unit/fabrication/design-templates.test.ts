import { describe, expect, it } from "vitest";

import { synthesizeFabricationDesign } from "@/core/fabrication/design-synthesis";
import {
  enclosureTemplateSpec,
  figureTemplateSpec,
  popUpCardTemplateSpec,
  templateSpecForIntent,
} from "@/core/fabrication/design-templates";
import { normalizeFabricationIntentFeasibility } from "@/core/fabrication/feasibility-normalization";
import type { FabricationIntentV1 } from "@/core/fabrication/types";

const boxIntent = (
  label = "playing card box",
  size = { widthMm: 70, heightMm: 95, depthMm: 25 },
): FabricationIntentV1 => ({
  version: "1",
  intentId: "intent-x",
  sourcePrompt: `A cardstock ${label}.`,
  title: label,
  objectLabel: label,
  functionalGoal: `A ${label}.`,
  visualDescription: "A rectangular enclosure.",
  behavior: "open_close",
  requestedSize: size,
  stockOptions: [
    {
      sheetId: "sheet",
      widthMm: 210,
      heightMm: 297,
      printableMarginMm: 5,
      material: {
        materialId: "cardstock-050",
        label: "Cardstock",
        thicknessMm: 0.5,
        grainDirection: "none",
      },
    },
  ],
  fabricationBudget: {
    maximumSheets: 1,
    maximumPanels: 24,
    maximumJointAndConnectorCount: 24,
    cutsAllowed: true,
    glueAllowed: false,
  },
  semanticConstraints: [],
  priorities: ["mechanical_simplicity"],
  scopeStatus: "supported",
  clarificationQuestion: null,
  unsupportedReason: null,
});

describe("design templates", () => {
  it("verifies boxes with square or equal sides", () => {
    // Square walls, bases, or lids used to let the lid lock attach to a side
    // edge and every wall claim the full depth, so these sizes always failed.
    for (const size of [
      { widthMm: 50, heightMm: 50, depthMm: 40 },
      { widthMm: 70, heightMm: 50, depthMm: 70 },
      { widthMm: 80, heightMm: 80, depthMm: 80 },
    ]) {
      const intent = normalizeFabricationIntentFeasibility(
        boxIntent("ring box", size),
      );
      const result = synthesizeFabricationDesign(
        intent,
        enclosureTemplateSpec(size.widthMm, size.heightMm, size.depthMm),
        1,
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.report.valid).toBe(true);
    }
  }, 120_000);

  it("detects an enclosure request and declines a template-less one", () => {
    expect(templateSpecForIntent(boxIntent("playing card box"))).not.toBeNull();
    expect(templateSpecForIntent(boxIntent("card tray"))).not.toBeNull();
    // No matching template class -> keep the from-scratch failure (honest error).
    expect(
      templateSpecForIntent(boxIntent("abstract wavy sculpture")),
    ).toBeNull();
  });

  it("synthesizes a verified design from the enclosure template", () => {
    const intent = normalizeFabricationIntentFeasibility(boxIntent());
    const spec = templateSpecForIntent(intent);
    expect(spec).not.toBeNull();
    const result = synthesizeFabricationDesign(intent, spec!, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.valid).toBe(true);
      // a real box with the tab-slot lid lock (two reciprocal connectors)
      expect(result.value.blueprint.panels).toHaveLength(6);
      expect(result.value.blueprint.connectors).toHaveLength(2);
    }
  }, 30_000);

  it("produces a verified design across common enclosure sizes", () => {
    for (const size of [
      { widthMm: 70, heightMm: 95, depthMm: 25 },
      { widthMm: 60, heightMm: 90, depthMm: 20 },
      { widthMm: 120, heightMm: 80, depthMm: 40 },
    ]) {
      const intent = normalizeFabricationIntentFeasibility(
        boxIntent("box", size),
      );
      const result = synthesizeFabricationDesign(
        intent,
        enclosureTemplateSpec(size.widthMm, size.heightMm, size.depthMm),
        1,
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.report.valid).toBe(true);
    }
  }, 60_000);
});

const flowerIntent = (
  size = { widthMm: 105, heightMm: 148, depthMm: 30 },
): FabricationIntentV1 => ({
  ...boxIntent("pop-up flower card", size),
  behavior: "open_close",
  sourcePrompt:
    "A birthday card that opens so a flower rises from the center and folds flat when closed. Fits an A6 envelope.",
  functionalGoal:
    "A card that opens and a flower rises, then folds flat when closed.",
  semanticConstraints: [
    {
      constraintId: "constraint-flower-form",
      hard: true,
      source: "user",
      kind: "recognizable_form",
      label: "pop-up flower card",
      semanticPartIds: ["part-card", "part-flower"],
      requiredLandmarks: ["card", "flower"],
      evaluation: "landmark_geometry",
    },
  ],
});

describe("pop-up flower card template", () => {
  it("routes a pop-up/flower request to the pop-up card template", () => {
    const spec = templateSpecForIntent(flowerIntent());
    expect(spec).not.toBeNull();
    expect(spec?.driver).not.toBeNull();
    expect(spec?.parts.map((p) => p.key).sort()).toEqual(["card", "flower"]);
  });

  it("synthesizes a verified pop-up mechanism (with the form constraint)", () => {
    const intent = normalizeFabricationIntentFeasibility(flowerIntent());
    const spec = templateSpecForIntent(intent);
    expect(spec).not.toBeNull();
    const result = synthesizeFabricationDesign(intent, spec!, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.valid).toBe(true);
      // a real driven open/close mechanism (a card that raises a flower)
      expect(result.value.blueprint.driver).not.toBeNull();
      expect(result.value.blueprint.outputs.length).toBeGreaterThan(0);
    }
  }, 30_000);

  it("produces a verified pop-up across common card sizes", () => {
    for (const size of [
      { widthMm: 105, heightMm: 148, depthMm: 30 },
      { widthMm: 100, heightMm: 140, depthMm: 20 },
      { widthMm: 148, heightMm: 105, depthMm: 25 },
    ]) {
      const intent = normalizeFabricationIntentFeasibility(flowerIntent(size));
      const result = synthesizeFabricationDesign(
        intent,
        popUpCardTemplateSpec(size.widthMm, size.heightMm, size.depthMm),
        1,
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.report.valid).toBe(true);
    }
  }, 60_000);
});

const duckIntent = (
  size = { widthMm: 120, heightMm: 90, depthMm: 30 },
): FabricationIntentV1 => ({
  ...boxIntent("faceted duck crease pattern", size),
  behavior: "static",
  sourcePrompt:
    "Make a static, faceted duck crease pattern with a body, head, and beak. Fold-only, no glue.",
  functionalGoal: "A fold-only faceted duck with a body, head, and beak.",
  semanticConstraints: [
    {
      constraintId: "constraint-duck-form",
      hard: true,
      source: "user",
      kind: "recognizable_form",
      label: "faceted duck",
      semanticPartIds: ["part-body", "part-head", "part-beak"],
      requiredLandmarks: ["body", "head", "beak"],
      evaluation: "landmark_geometry",
    },
  ],
});

describe("figure (duck) template", () => {
  it("routes a static duck request to the figure template", () => {
    const spec = templateSpecForIntent(duckIntent());
    expect(spec).not.toBeNull();
    expect(spec?.parts.map((p) => p.key).sort()).toEqual([
      "back",
      "base",
      "body",
    ]);
    expect(
      spec?.parts.filter((p) => p.silhouette === "duck").map((p) => p.key),
    ).toEqual(["body", "back"]);
    // A lidded card box must not become a duck.
    expect(templateSpecForIntent(boxIntent("card box"))?.driver).not.toBeNull();
  });

  it("synthesizes a verified faceted-figure design (with the form constraint)", () => {
    const intent = normalizeFabricationIntentFeasibility(duckIntent());
    const spec = templateSpecForIntent(intent);
    expect(spec).not.toBeNull();
    const result = synthesizeFabricationDesign(intent, spec!, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.valid).toBe(true);
      const panels = result.value.blueprint.panels;
      expect(panels).toHaveLength(3);
      // Both sides carry the duck outline rather than a plain rectangle,
      // and they fold up from the base instead of hanging below it.
      expect(
        panels.filter((panel) => panel.contour.vertices.length > 4),
      ).toHaveLength(2);
      expect(
        result.value.blueprint.joints.every(
          (joint) =>
            joint.kind === "fold" && joint.foldDirection === "mountain",
        ),
      ).toBe(true);
    }
  }, 30_000);

  it("produces a verified figure across common sizes", () => {
    for (const size of [
      { widthMm: 120, heightMm: 90, depthMm: 30 },
      { widthMm: 80, heightMm: 60, depthMm: 20 },
      { widthMm: 150, heightMm: 120, depthMm: 40 },
    ]) {
      const intent = normalizeFabricationIntentFeasibility(duckIntent(size));
      const result = synthesizeFabricationDesign(
        intent,
        figureTemplateSpec(size.widthMm, size.heightMm, size.depthMm),
        1,
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.report.valid).toBe(true);
    }
  }, 60_000);
});
