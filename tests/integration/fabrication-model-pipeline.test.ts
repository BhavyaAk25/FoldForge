import { describe, expect, it } from "vitest";

import { POST as compilePost } from "@/app/api/compile/route";
import { canonicalSerialize } from "@/core/canonical";
import { FABRICATION_SYNTHESIZER_VERSION } from "@/core/fabrication/design-synthesis";
import { normalizeFabricationIntentFeasibility } from "@/core/fabrication/feasibility-normalization";
import { fabricationProgramProposalFromResponse } from "@/server/fabrication-ai/plan-response";
import {
  fixtureHomepageCardBoxDesignSpec,
  fixtureModelShapedCardBoxDesignSpec,
} from "../fixtures/design-spec";
import {
  productionCardBoxIntent,
  productionCardBoxIntentWithRecognizableForm,
} from "../fixtures/production-geometric-failures";

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

const overConstrainedEnclosureSpec = () => ({
  version: "3",
  label: "Over-constrained card box",
  summary: "A closed box locked on every seam.",
  parts: ["front", "back", "leftSide", "rightSide", "base", "lid"].map(
    (key, index) => ({
      key,
      label: key,
      role: index < 4 ? "wall" : index === 4 ? "support" : "moving",
      width: {
        minimumMm: 20,
        preferredMm: index < 2 ? 70 : index < 4 ? 25 : 70,
        maximumMm: 80,
      },
      height: {
        minimumMm: 20,
        preferredMm: index < 4 ? 95 : 25,
        maximumMm: 100,
      },
      shapePreference: "rectangle" as const,
    }),
  ),
  relations: [
    { key: "a1", partAKey: "base", partBKey: "front", kind: "touch" },
    { key: "a2", partAKey: "base", partBKey: "back", kind: "touch" },
    { key: "a3", partAKey: "base", partBKey: "leftSide", kind: "touch" },
    { key: "a4", partAKey: "base", partBKey: "rightSide", kind: "touch" },
    { key: "a5", partAKey: "front", partBKey: "leftSide", kind: "touch" },
    { key: "a6", partAKey: "front", partBKey: "rightSide", kind: "touch" },
    { key: "a7", partAKey: "back", partBKey: "leftSide", kind: "touch" },
    { key: "a8", partAKey: "back", partBKey: "rightSide", kind: "touch" },
    {
      key: "lidMotion",
      partAKey: "back",
      partBKey: "lid",
      kind: "open_close",
      angleRangeDeg: { minimum: 0, home: 90, maximum: 90 },
    },
    {
      key: "L1",
      partAKey: "lid",
      partBKey: "front",
      kind: "lock",
      lockStyle: "tab_slot",
    },
    {
      key: "L2",
      partAKey: "front",
      partBKey: "leftSide",
      kind: "lock",
      lockStyle: "tab_slot",
    },
    {
      key: "L3",
      partAKey: "base",
      partBKey: "front",
      kind: "lock",
      lockStyle: "tab_slot",
    },
  ],
  materialConstraints: {
    materialLabel: "Cardstock",
    thickness: { minimumMm: 0.5, preferredMm: 0.5, maximumMm: 0.5 },
  },
  sheetConstraints: { minimumSheets: 1, maximumSheets: 1 },
  glueAllowed: false,
  driver: { relationKey: "lidMotion", label: "lid", control: "fold" },
  outputs: [
    { key: "o", relationKey: "lidMotion", partKey: "lid", label: "lid" },
  ],
  visibleLandmarks: [
    { key: "b", label: "base", partKeys: ["base"], importance: "required" },
    { key: "l", label: "lid", partKeys: ["lid"], importance: "required" },
  ],
  aestheticPreferences: ["box"],
  priorities: ["mechanical_simplicity"],
  tolerances: { dimensionMm: 1, clearanceMm: 0.6, angleDeg: 3 },
});

describe("mocked V3 model specification to real compile route", () => {
  it("yields a verified enclosure design for a messy over-constrained spec", async () => {
    const intent = normalizeFabricationIntentFeasibility(
      productionCardBoxIntent(),
    );
    const proposal = fabricationProgramProposalFromResponse({
      response: responseFor(overConstrainedEnclosureSpec(), "resp-messy-box"),
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
          candidateId: "candidate-messy-box",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "passed",
      report: { valid: true, failures: [] },
      score: { eligible: true },
    });
  }, 30_000);

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
      synthesizerVersion: FABRICATION_SYNTHESIZER_VERSION,
      proposalCount: 1,
      evaluatedProposalCount: 1,
      selectedProposalIndex: 0,
      synthesisEvaluationCount: expect.any(Number),
      // The model's own spec built successfully: transparently marked.
      generationSource: "synthesis",
    });
    expect(await response.json()).toMatchObject({
      status: "passed",
      candidateId: "candidate-v3-card-box",
      report: { valid: true, failures: [] },
      score: { eligible: true },
    });
  }, 30_000);

  it("normalizes a realistic Sol-shaped specification before the real compile route", async () => {
    const intent = productionCardBoxIntentWithRecognizableForm();
    const proposal = fabricationProgramProposalFromResponse({
      response: responseFor(
        fixtureModelShapedCardBoxDesignSpec(),
        "resp-v3-model-shaped-card-box",
      ),
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
          candidateId: "candidate-v3-model-shaped-card-box",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "passed",
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

  it("returns a typed deterministic failure for an impossible non-template spec", () => {
    const spec = fixtureHomepageCardBoxDesignSpec();
    // A request with no matching parametric template still surfaces a typed
    // deterministic failure when its spec is genuinely infeasible.
    const nonTemplateIntent = {
      ...productionCardBoxIntent(),
      objectLabel: "flat display panel",
      functionalGoal: "A decorative flat display panel.",
      title: "Display panel",
    };
    expect(() =>
      fabricationProgramProposalFromResponse({
        response: responseFor({
          ...spec,
          parts: spec.parts.map((part) => ({
            ...part,
            width: { minimumMm: 500, preferredMm: 500, maximumMm: 500 },
          })),
        }),
        intent: nonTemplateIntent,
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

  it("rescues an impossible enclosure spec with the parametric template", () => {
    const spec = fixtureHomepageCardBoxDesignSpec();
    const intent = normalizeFabricationIntentFeasibility(
      productionCardBoxIntent(),
    );
    // Even an infeasible enclosure spec yields a real verified design because
    // the box template, fit to the requested envelope, is the fallback.
    const proposal = fabricationProgramProposalFromResponse({
      response: responseFor(
        {
          ...spec,
          parts: spec.parts.map((part) => ({
            ...part,
            width: { minimumMm: 500, preferredMm: 500, maximumMm: 500 },
          })),
        },
        "resp-impossible-enclosure",
      ),
      intent,
      candidateOrdinal: 1,
      modelId: "gpt-5.6-sol",
    });
    expect(proposal.program.blueprint.panels.length).toBeGreaterThan(0);
    expect(proposal.program.blueprint.connectors.length).toBeGreaterThan(0);
    // Transparently marked as template-built, never mistaken for the model's spec.
    expect(proposal.provenance.generationSource).toBe("template");
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
