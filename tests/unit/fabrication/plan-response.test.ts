import { describe, expect, it } from "vitest";

import { intentFromPromptKeywords } from "@/core/fabrication/prompt-intent";
import {
  FabricationProgramModelError,
  TEMPLATE_MODEL_ID,
  programProposalFromDesignSpec,
  templateProgramProposal,
} from "@/server/fabrication-ai/plan-response";

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

  it("falls back to a labelled template when the model spec cannot be built", () => {
    const intent = intentFromPromptKeywords("a box 120 x 80 x 40 mm")!;
    const spec = fixtureStaticPanelDesignSpec();
    const proposal = programProposalFromDesignSpec({
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
    });
    expect(proposal.provenance.generationSource).toBe("template");
    expect(proposal.provenance.modelId).toBe("test-model");
  }, 60_000);

  it("throws a typed error when neither the spec nor a template works", () => {
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

describe("templateProgramProposal", () => {
  it("records that no model was used", () => {
    const proposal = templateProgramProposal(
      intentFromPromptKeywords("a faceted duck 120 x 90 x 30 mm")!,
      1,
    );
    expect(proposal?.provenance).toMatchObject({
      modelId: TEMPLATE_MODEL_ID,
      generationSource: "template",
    });
  });

  it("returns null without a matching template", () => {
    expect(templateProgramProposal(fixtureIntent(), 1)).toBeNull();
  });
});
