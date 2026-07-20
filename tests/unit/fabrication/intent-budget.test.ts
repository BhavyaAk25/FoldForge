import { describe, expect, it } from "vitest";

import {
  explicitPromptResourceLimits,
  normalizeFabricationIntentBudget,
} from "@/core/fabrication/intent-budget";
import { FABRICATION_LIMITS } from "@/core/fabrication/limits";
import { fixtureIntent } from "../../fixtures/fabrication";

describe("fabrication intent budget ownership", () => {
  it("replaces model-invented internal ceilings with compiler capacity", () => {
    const intent = fixtureIntent();
    const prompt =
      "Make a small playing-card box from one sheet with a tabbed lid.";
    const normalized = normalizeFabricationIntentBudget(
      {
        ...intent,
        fabricationBudget: {
          ...intent.fabricationBudget,
          maximumPanels: 6,
          maximumJointAndConnectorCount: 7,
        },
      },
      prompt,
    );

    expect(normalized.sourcePrompt).toBe(prompt);
    expect(normalized.fabricationBudget).toMatchObject({
      maximumPanels: FABRICATION_LIMITS.maximumPanelCount,
      maximumJointAndConnectorCount:
        FABRICATION_LIMITS.maximumJointAndConnectorCount,
    });
  });

  it("preserves genuine numerical resource limits from the user", () => {
    const prompt =
      "Use no more than six panels and at most 9 joints and connectors.";
    expect(explicitPromptResourceLimits(prompt)).toEqual({
      maximumPanels: 6,
      maximumJointAndConnectorCount: 9,
    });

    expect(
      normalizeFabricationIntentBudget(fixtureIntent(), prompt)
        .fabricationBudget,
    ).toMatchObject({
      maximumPanels: 6,
      maximumJointAndConnectorCount: 9,
    });
  });

  it("recognizes an exact compound panel count", () => {
    expect(
      explicitPromptResourceLimits("Make a six-panel folding box."),
    ).toEqual({
      maximumPanels: 6,
      maximumJointAndConnectorCount: null,
    });
  });
});
