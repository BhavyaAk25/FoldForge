import { describe, expect, it } from "vitest";

import { compileFabricationProgram } from "@/core/fabrication/compiler";
import { normalizeFabricationIntentFeasibility } from "@/core/fabrication/feasibility-normalization";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import { fabricationProgramProposalFromResponse } from "@/server/fabrication-ai/plan-response";

import { liveCorpus } from "../fixtures/live-corpus";

const responseFor = (designSpec: unknown, id: string) => ({
  id,
  status: "completed" as const,
  output: [
    {
      type: "function_call" as const,
      name: "submit_fabrication_design_spec" as const,
      arguments: JSON.stringify({
        diversityClaim: "Decompose the object and let code synthesize it.",
        designSpec,
      }),
    },
  ],
});

// Guardrail for the flagship prompts: each captured/representative case must
// produce a real verified design through the same path the live app runs
// (intent normalization -> program proposal -> compile -> verify). If a change
// reintroduces bounded_search_exhausted for the box, duck, or flower, this
// fails loudly instead of silently shipping the old error.
describe("live corpus reliability guard", () => {
  for (const testCase of liveCorpus()) {
    it(`produces a verified design for: ${testCase.name}`, () => {
      // The /api/intent stage normalizes the model intent before it flows on.
      const intent = normalizeFabricationIntentFeasibility(testCase.intent);

      // The /api/programs stage: model spec, then parametric-template fallback.
      const proposal = fabricationProgramProposalFromResponse({
        response: responseFor(testCase.designSpec, `resp-${intent.intentId}`),
        intent,
        candidateOrdinal: 1,
        modelId: "gpt-5.6-sol",
      });

      // The /api/compile stage: recompile + fully verify against the same intent.
      const compiled = compileFabricationProgram(intent, proposal.program);
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) return;
      const report = verifyFabricationIr(
        compiled.value,
        `corpus-${intent.intentId}`,
      );

      expect(report.valid).toBe(true);
      expect(proposal.program.blueprint.panels.length).toBeGreaterThan(0);
      // Every design is transparently attributed to the model or the template.
      expect(["synthesis", "template"]).toContain(
        proposal.provenance.generationSource,
      );
    }, 45_000);
  }
});
