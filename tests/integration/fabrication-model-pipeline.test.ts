import { describe, expect, it } from "vitest";

import { POST as compilePost } from "@/app/api/compile/route";
import { canonicalSerialize } from "@/core/canonical";
import { fabricationProgramProposalFromResponse } from "@/server/fabrication-ai/plan-response";
import { fixtureHomepageCardBoxDesignSpec } from "../fixtures/design-spec";
import { productionCardBoxIntent } from "../fixtures/production-geometric-failures";

const responseFor = (designSpec: unknown, id = "resp-v3-card-box") => ({
  id,
  status: "completed",
  output: [
    {
      type: "function_call",
      name: "submit_fabrication_design_spec",
      arguments: JSON.stringify({
        diversityClaim:
          "Decompose the enclosure semantically and let code synthesize it.",
        designSpec,
      }),
    },
  ],
});

describe("mocked V3 model specification to real compile route", () => {
  it("synthesizes and verifies the homepage card-box without a prepared topology", async () => {
    const intent = productionCardBoxIntent();
    const proposal = fabricationProgramProposalFromResponse({
      response: responseFor(fixtureHomepageCardBoxDesignSpec()),
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
          candidateId: "candidate-v3-card-box",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(proposal.provenance).toMatchObject({
      synthesizerVersion: "3.0.0",
      proposalCount: 1,
      evaluatedProposalCount: 1,
      selectedProposalIndex: 0,
      synthesisEvaluationCount: expect.any(Number),
    });
    expect(await response.json()).toMatchObject({
      status: "passed",
      candidateId: "candidate-v3-card-box",
      report: { valid: true, failures: [] },
      score: { eligible: true },
    });
  }, 30_000);

  it("is byte-stable for the same semantic specification", () => {
    const intent = productionCardBoxIntent();
    const input = {
      response: responseFor(fixtureHomepageCardBoxDesignSpec()),
      intent,
      candidateOrdinal: 1,
      modelId: "gpt-5.6-sol",
    } as const;
    const first = fabricationProgramProposalFromResponse(input);
    const repeated = fabricationProgramProposalFromResponse(input);

    expect(canonicalSerialize(first)).toBe(canonicalSerialize(repeated));
  }, 30_000);

  it("rejects low-level topology fields at the model boundary", () => {
    expect(() =>
      fabricationProgramProposalFromResponse({
        response: responseFor({
          ...fixtureHomepageCardBoxDesignSpec(),
          groundedRoot: "base",
        }),
        intent: productionCardBoxIntent(),
        candidateOrdinal: 1,
        modelId: "gpt-5.6-sol",
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "invalid_plan",
        safeDetail: expect.objectContaining({ phase: "schema" }),
      }),
    );
  });

  it("returns a typed deterministic failure for an impossible specification", () => {
    const spec = fixtureHomepageCardBoxDesignSpec();
    expect(() =>
      fabricationProgramProposalFromResponse({
        response: responseFor({
          ...spec,
          parts: spec.parts.map((part) => ({
            ...part,
            width: { minimumMm: 500, preferredMm: 500, maximumMm: 500 },
          })),
        }),
        intent: productionCardBoxIntent(),
        candidateOrdinal: 1,
        modelId: "gpt-5.6-sol",
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "invalid_plan",
        safeDetail: expect.objectContaining({
          phase: "expansion",
          code: "part_sheet_fit",
        }),
      }),
    );
  });

  it("rejects malformed and duplicate V3 calls before synthesis", () => {
    const intent = productionCardBoxIntent();
    expect(() =>
      fabricationProgramProposalFromResponse({
        response: {
          id: "resp-malformed-v3",
          status: "completed",
          output: [
            {
              type: "function_call",
              name: "submit_fabrication_design_spec",
              arguments: "not-json",
            },
          ],
        },
        intent,
        candidateOrdinal: 1,
        modelId: "gpt-5.6-sol",
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_plan" }));

    const call = responseFor(fixtureHomepageCardBoxDesignSpec()).output[0]!;
    expect(() =>
      fabricationProgramProposalFromResponse({
        response: {
          id: "resp-duplicate-v3",
          status: "completed",
          output: [call, call],
        },
        intent,
        candidateOrdinal: 1,
        modelId: "gpt-5.6-sol",
      }),
    ).toThrowError(expect.objectContaining({ code: "duplicate_plan_call" }));
  });
});
