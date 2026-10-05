import { describe, expect, it } from "vitest";

import { compileFabricationProgram } from "@/core/fabrication/compiler";
import { FabricationDesignSpecV3Schema } from "@/core/fabrication/design-spec";
import { normalizeFabricationIntentFeasibility } from "@/core/fabrication/feasibility-normalization";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import {
  programProposalFromDesignSpec,
  templateFallback,
} from "@/server/fabrication-ai/plan-response";

import { liveCorpus } from "../fixtures/live-corpus";

// Guardrail for the flagship prompts: each captured model intent and design
// spec must produce a real verified design through the same path the app runs
// (intent normalization -> program proposal -> compile -> verify). If a change
// reintroduces bounded_search_exhausted for the box, duck, or flower, this
// fails loudly instead of silently shipping the old error.
describe("model corpus reliability guard", () => {
  for (const testCase of liveCorpus()) {
    it(`produces a verified design for: ${testCase.name}`, () => {
      const requested = normalizeFabricationIntentFeasibility(testCase.intent);
      // Same order as /api/programs: the model's own design, then a template.
      let intent = requested;
      let proposal;
      try {
        proposal = programProposalFromDesignSpec({
          proposal: {
            diversityClaim: "Decompose the object and let code synthesize it.",
            designSpec: FabricationDesignSpecV3Schema.parse(
              testCase.designSpec,
            ),
          },
          intent,
          candidateOrdinal: 1,
          modelId: "corpus-model",
          responseId: `resp-${intent.intentId}`,
        });
      } catch {
        const fallback = templateFallback(requested, 1);
        expect(fallback).not.toBeNull();
        if (!fallback) return;
        ({ intent, proposal } = fallback);
      }

      const compiled = compileFabricationProgram(intent, proposal.program);
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) return;
      const report = verifyFabricationIr(
        compiled.value,
        `corpus-${intent.intentId}`,
      );
      expect(report.valid).toBe(true);
      expect(proposal.program.blueprint.panels.length).toBeGreaterThan(0);
      expect(["synthesis", "template"]).toContain(
        proposal.provenance.generationSource,
      );
    }, 120_000);
  }
});
