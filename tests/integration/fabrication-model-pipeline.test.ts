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
              baseProposal: {
                diversityClaim: "Use one compact cross-net enclosure.",
                plan: fixtureLiveAcceptancePlan(),
              },
              structuralAlternatives: [],
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
    expect(proposal.provenance).toMatchObject({
      proposalCount: 1,
      selectedProposalIndex: 0,
    });
    expect(await response.json()).toMatchObject({
      status: "passed",
      candidateId: "candidate-sanitized-card-box",
      report: { valid: true, failures: [] },
      score: { eligible: true },
    });
  });

  it("selects a later valid plan from one multi-proposal model response", async () => {
    const intent = cardBoxIntent();
    const validPlan = fixtureLiveAcceptancePlan();
    const disconnectedPlan = {
      ...validPlan,
      topologyKey: "disconnected-box",
      joints: [],
    };
    const proposal = fabricationProgramProposalFromResponse({
      response: {
        id: "resp-multi-proposal-card-box",
        status: "completed",
        output: [
          {
            type: "function_call",
            name: "submit_fabrication_plan",
            arguments: JSON.stringify({
              proposals: [
                {
                  diversityClaim: "Use a disconnected invalid mock topology.",
                  plan: disconnectedPlan,
                },
                {
                  diversityClaim: "Use one connected cross-net enclosure.",
                  plan: validPlan,
                },
              ],
            }),
          },
        ],
      },
      intent,
      candidateOrdinal: 1,
      modelId: "gpt-5.6-sol",
    });

    expect(proposal.diversityClaim).toBe(
      "Use one connected cross-net enclosure.",
    );
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
          candidateId: "candidate-selected-from-batch",
        }),
      }),
    );

    expect(await response.json()).toMatchObject({
      status: "passed",
      report: { valid: true, failures: [] },
    });
  });

  it("expands a compact model-authored structural alternative and skips equivalent plans", () => {
    const intent = cardBoxIntent();
    const validPlan = fixtureLiveAcceptancePlan();
    const invalidBase = {
      ...validPlan,
      topologyKey: "misattached-lid-base",
      joints: validPlan.joints.map((joint) =>
        joint.key === "lid"
          ? {
              ...joint,
              childAttachment: {
                ...joint.childAttachment,
                edgeIndex: 9,
              },
            }
          : joint,
      ),
    };
    const proposal = fabricationProgramProposalFromResponse({
      response: {
        id: "resp-compact-alternative-card-box",
        status: "completed",
        output: [
          {
            type: "function_call",
            name: "submit_fabrication_plan",
            arguments: JSON.stringify({
              baseProposal: {
                diversityClaim: "Attach the lid to its opposite long edge.",
                plan: invalidBase,
              },
              structuralAlternatives: [
                {
                  diversityClaim:
                    "Attach the same model-authored lid to the matching back edge.",
                  topologyKey: "corrected-lid-edge",
                  groundedBodyKey: null,
                  jointEdits: [
                    {
                      jointKey: "lid",
                      parentBodyKey: null,
                      childBodyKey: null,
                      parentAttachment: null,
                      childAttachment: { panelKey: "lid", edgeIndex: 0 },
                      foldDirection: null,
                      homeValue: null,
                      minimumValue: null,
                      maximumValue: null,
                    },
                  ],
                  connectorEdits: [],
                },
                {
                  diversityClaim: "Rename the corrected topology only.",
                  topologyKey: "renamed-corrected-lid-edge",
                  groundedBodyKey: null,
                  jointEdits: [
                    {
                      jointKey: "lid",
                      parentBodyKey: null,
                      childBodyKey: null,
                      parentAttachment: null,
                      childAttachment: { panelKey: "lid", edgeIndex: 0 },
                      foldDirection: null,
                      homeValue: null,
                      minimumValue: null,
                      maximumValue: null,
                    },
                  ],
                  connectorEdits: [],
                },
              ],
            }),
          },
        ],
      },
      intent,
      candidateOrdinal: 1,
      modelId: "gpt-5.6-sol",
    });

    expect(proposal).toMatchObject({
      diversityClaim:
        "Attach the same model-authored lid to the matching back edge.",
      provenance: {
        proposalCount: 3,
        selectedProposalIndex: 1,
        terminalFailureCodes: expect.arrayContaining([
          "duplicate_structural_fingerprint",
        ]),
      },
    });
  }, 20_000);

  it("rejects malformed compact alternatives before deterministic expansion", () => {
    expect(() =>
      fabricationProgramProposalFromResponse({
        response: {
          id: "resp-invalid-compact-alternative",
          status: "completed",
          output: [
            {
              type: "function_call",
              name: "submit_fabrication_plan",
              arguments: JSON.stringify({
                baseProposal: {
                  diversityClaim: "Use one complete base plan.",
                  plan: fixtureLiveAcceptancePlan(),
                },
                structuralAlternatives: [
                  {
                    diversityClaim:
                      "Reference an unknown model-authored joint.",
                    topologyKey: "unknown-reference-alternative",
                    groundedBodyKey: null,
                    jointEdits: [
                      {
                        jointKey: "unknown-joint",
                        parentBodyKey: null,
                        childBodyKey: null,
                        parentAttachment: null,
                        childAttachment: null,
                        foldDirection: null,
                        homeValue: null,
                        minimumValue: null,
                        maximumValue: null,
                      },
                    ],
                    connectorEdits: [],
                  },
                ],
              }),
            },
          ],
        },
        intent: cardBoxIntent(),
        candidateOrdinal: 1,
        modelId: "gpt-5.6-sol",
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "invalid_plan",
        safeDetail: expect.objectContaining({
          code: "alternative_reference",
        }),
      }),
    );
  });
});
