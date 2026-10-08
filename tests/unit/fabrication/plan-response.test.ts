import { describe, expect, it } from "vitest";

import { intentFromPromptKeywords } from "@/core/fabrication/prompt-intent";
import {
  FabricationProgramModelError,
  TEMPLATE_MODEL_ID,
  programProposalFromDesignSpec,
  templateFallback,
} from "@/server/fabrication-ai/plan-response";
import { FabricationIntentV1Schema } from "@/core/fabrication/schemas";

import {
  fixtureHomepageCardBoxDesignSpec,
  fixtureStaticPanelDesignSpec,
} from "../../fixtures/design-spec";
import { fixtureIntent } from "../../fixtures/fabrication";
import { productionCardBoxIntent } from "../../fixtures/production-geometric-failures";

const modelInput = { modelId: "test-model", responseId: "response-1" };

describe("programProposalFromDesignSpec", () => {
  it("synthesizes the model's own spec when it is buildable", () => {
    const proposal = programProposalFromDesignSpec({
      ...modelInput,
      proposal: {
        diversityClaim: "Model-authored card box.",
        designSpec: fixtureHomepageCardBoxDesignSpec(),
      },
      intent: productionCardBoxIntent(),
      candidateOrdinal: 1,
    });
    expect(proposal.provenance).toMatchObject({
      modelId: "test-model",
      modelResponseId: "response-1",
      generationSource: "synthesis",
    });
    expect(proposal.diversityClaim).toBe("Model-authored card box.");
  }, 60_000);

  it("throws a typed error when the model spec cannot be built", () => {
    const intent = intentFromPromptKeywords("a box 120 x 80 x 40 mm")!;
    const spec = fixtureStaticPanelDesignSpec();
    expect(() =>
      programProposalFromDesignSpec({
        ...modelInput,
        proposal: {
          diversityClaim: "Oversized panel.",
          designSpec: {
            ...spec,
            parts: spec.parts.map((part) => ({
              ...part,
              width: { minimumMm: 900, preferredMm: 900, maximumMm: 900 },
            })),
          },
        },
        intent,
        candidateOrdinal: 1,
      }),
    ).toThrow(FabricationProgramModelError);
  }, 60_000);

  it("throws for an unbuildable spec on a request with no template", () => {
    const sourceIntent = fixtureIntent();
    const spec = fixtureStaticPanelDesignSpec();
    expect(() =>
      programProposalFromDesignSpec({
        ...modelInput,
        proposal: {
          diversityClaim: "Impossible.",
          designSpec: {
            ...spec,
            parts: spec.parts.map((part) => ({
              ...part,
              width: { minimumMm: 900, preferredMm: 900, maximumMm: 900 },
            })),
          },
        },
        intent: {
          ...sourceIntent,
          behavior: "static",
          requestedSize: { widthMm: 80, heightMm: 60, depthMm: 1 },
        },
        candidateOrdinal: 1,
      }),
    ).toThrow(FabricationProgramModelError);
  });
});

describe("templateFallback", () => {
  it("records that no model was used", () => {
    const fallback = templateFallback(
      intentFromPromptKeywords("a faceted duck 120 x 90 x 30 mm")!,
      1,
    );
    expect(fallback?.proposal.provenance).toMatchObject({
      modelId: TEMPLATE_MODEL_ID,
      generationSource: "template",
    });
  });

  it("returns null without a matching template or model hint", () => {
    expect(templateFallback(fixtureIntent(), 1)).toBeNull();
  });

  it.each([
    ["figure", "animal", 30, "Stand-up platypus"],
    ["figure", null, 30, "Stand-up platypus"],
    ["enclosure", null, 40, "Folded enclosure"],
    ["stand", null, 70, "Desk stand"],
    ["cutout", "star", 1, "star cut-out"],
    ["popup_card", "heart", 30, "Pop-up heart card"],
  ] as const)(
    "builds the model's %s/%s choice for an object no keyword knows",
    (archetype, silhouette, depthMm, label) => {
      // "a platypus" matches no keyword rule; the model's hint still yields a
      // verified, labelled template instead of an error.
      const intent = {
        ...intentFromPromptKeywords("a duck 120 x 90 x 30 mm")!,
        sourcePrompt: "a platypus",
        title: "Platypus",
        objectLabel: "platypus",
        functionalGoal: "A platypus.",
        visualDescription: "A platypus.",
        requestedSize: { widthMm: 120, heightMm: 90, depthMm },
        semanticConstraints: [],
      };
      expect(templateFallback(intent, 1)).toBeNull();
      const fallback = templateFallback(intent, 1, { archetype, silhouette });
      expect(fallback?.proposal.program.candidateLabel).toBe(label);
      expect(fallback?.proposal.provenance.generationSource).toBe("template");
    },
    120_000,
  );

  it("builds the captured Gemini ring-box request directly", () => {
    // Captured Gemini intent for "a small gift box for a ring" (50 x 50 x 40,
    // with model-invented fold-flat and lid-range constraints).
    const modelIntent = FabricationIntentV1Schema.parse(RING_BOX_MODEL_INTENT);
    const fallback = templateFallback(modelIntent, 1);
    expect(fallback?.intent).toBe(modelIntent);
  }, 60_000);

  it("relaxes behavior the template cannot have, keeping size and stock", () => {
    // A model sometimes calls a fixed phone stand "open_close".
    const stand = intentFromPromptKeywords("a phone stand 80 x 100 x 70 mm")!;
    const modelIntent = { ...stand, behavior: "open_close" as const };
    const fallback = templateFallback(modelIntent, 1);
    expect(fallback).not.toBeNull();
    expect(fallback?.intent.behavior).toBe("static");
    expect(fallback?.intent.requestedSize).toEqual(stand.requestedSize);
    expect(fallback?.intent.stockOptions).toEqual(stand.stockOptions);
    expect(fallback?.proposal.provenance.generationSource).toBe("template");
  }, 60_000);
});

const RING_BOX_MODEL_INTENT = {
  version: "1",
  intentId: "ring_gift_box",
  sourcePrompt: "a small gift box for a ring",
  title: "Small Ring Gift Box",
  objectLabel: "ring_gift_box",
  functionalGoal:
    "A compact, elegant gift box with an integrated lid and a secure closure to hold and present a ring.",
  visualDescription:
    "A small cubic or rectangular cardstock box with a hinged lid. The interior may contain a platform or slot to hold a ring upright.",
  behavior: "open_close",
  requestedSize: {
    widthMm: 50,
    heightMm: 50,
    depthMm: 40,
  },
  stockOptions: [
    {
      sheetId: "sheet-cardstock",
      widthMm: 300,
      heightMm: 300,
      printableMarginMm: 10,
      material: {
        materialId: "cardstock-0.3",
        label: "0.3mm Cardstock",
        thicknessMm: 0.3,
        grainDirection: "none",
      },
    },
  ],
  fabricationBudget: {
    maximumSheets: 1,
    maximumPanels: 24,
    maximumJointAndConnectorCount: 24,
    cutsAllowed: true,
    glueAllowed: true,
  },
  semanticConstraints: [
    {
      constraintId: "constraint-box-form",
      hard: true,
      source: "user",
      kind: "recognizable_form",
      label: "Ring Gift Box",
      semanticPartIds: ["part-base", "part-lid"],
      requiredLandmarks: ["base", "lid"],
      evaluation: "landmark_geometry",
    },
    {
      constraintId: "constraint-fold-flat",
      hard: true,
      source: "user",
      kind: "fold_flat",
      bodyIds: ["body-box"],
      maximumStackThicknessMm: 7.2,
    },
    {
      constraintId: "constraint-lid-rotation",
      hard: true,
      source: "user",
      kind: "motion",
      outputId: "output-lid",
      minimumValue: 0,
      maximumValue: 120,
      unit: "deg",
    },
  ],
  priorities: ["compactness", "visual_expression", "mechanical_simplicity"],
  scopeStatus: "supported",
  clarificationQuestion: null,
  unsupportedReason: null,
};
