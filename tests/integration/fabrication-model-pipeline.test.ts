import { describe, expect, it } from "vitest";

import { POST as compilePost } from "@/app/api/compile/route";
import { FABRICATION_LIMITS } from "@/core/fabrication/limits";
import type { FabricationIntentV1 } from "@/core/fabrication/types";
import { fabricationProgramProposalFromResponse } from "@/server/fabrication-ai/plan-response";
import { fixtureIntent } from "../fixtures/fabrication";
import { fixtureLiveAcceptancePlan } from "../fixtures/semantic-plan";

const cardBoxIntent = (): FabricationIntentV1 => {
  const source = fixtureIntent();
  return {
    ...source,
    sourcePrompt:
      "Make a small box from one sheet of cardstock for a deck of cards.",
    behavior: "static",
    requestedSize: { widthMm: 70, heightMm: 95, depthMm: 25 },
    fabricationBudget: {
      ...source.fabricationBudget,
      maximumPanels: FABRICATION_LIMITS.maximumPanelCount,
      maximumJointAndConnectorCount:
        FABRICATION_LIMITS.maximumJointAndConnectorCount,
    },
    semanticConstraints: [],
    scopeStatus: "supported",
  };
};

describe("mocked model to real compile route", () => {
  it("preflights and verifies a semantic card-box plan without mocking compile", async () => {
    const intent = cardBoxIntent();
    const proposal = fabricationProgramProposalFromResponse({
      response: {
        id: "resp-sanitized-card-box",
        status: "completed",
        output: [
          {
            type: "function_call",
            name: "submit_fabrication_plan",
            arguments: JSON.stringify({
              diversityClaim: "Use one compact cross-net enclosure.",
              plan: fixtureLiveAcceptancePlan(),
            }),
          },
        ],
      },
      intent,
      candidateOrdinal: 1,
      modelId: "gpt-5.6-sol",
    });

    const response = await compilePost(
      new Request("https://foldforge.example/api/compile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://foldforge.example",
        },
        body: JSON.stringify({
          intent,
          program: proposal.program,
          candidateId: "candidate-sanitized-card-box",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "passed",
      candidateId: "candidate-sanitized-card-box",
      report: { valid: true, failures: [] },
      score: { eligible: true },
    });
  });
});
