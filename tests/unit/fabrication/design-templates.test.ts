import { describe, expect, it } from "vitest";

import { synthesizeFabricationDesign } from "@/core/fabrication/design-synthesis";
import {
  enclosureTemplateSpec,
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
  it("detects an enclosure request and declines a non-enclosure one", () => {
    expect(templateSpecForIntent(boxIntent("playing card box"))).not.toBeNull();
    expect(templateSpecForIntent(boxIntent("card tray"))).not.toBeNull();
    expect(templateSpecForIntent(boxIntent("faceted duck"))).toBeNull();
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
