import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { canonicalSerialize } from "@/core/canonical";
import type {
  Candidate,
  CandidateComparison,
  VerificationReport,
} from "@/core/types";
import type { DesignConstraint } from "@/core/schemas";
import type { FinalNarrative } from "@/server/instructions";

import { getOpenAIClient } from "./client";

const FinalNarrativeSchema = z
  .object({
    summary: z.string().min(1).max(600),
    tradeoffs: z.array(z.string().min(1).max(300)).min(1).max(5),
    foldingSteps: z.array(z.string().min(1).max(300)).min(4).max(12),
    limitations: z.array(z.string().min(1).max(300)).min(2).max(5),
  })
  .strict();

export const generateFinalNarrative = async (
  candidate: Candidate,
  constraint: DesignConstraint,
  report: VerificationReport,
  comparison: CandidateComparison,
  safetyId: string,
): Promise<FinalNarrative> => {
  const response = await getOpenAIClient().responses.parse({
    model: "gpt-5.6-sol",
    instructions:
      "Explain the deterministic FoldForge winner and write concise folding steps grounded only in the supplied parameters and report. Do not change the winner, measurements, validity, or scores. Explicitly preserve the physical-validation limitation. Do not expose chain-of-thought.",
    input: [
      {
        role: "user",
        content: canonicalSerialize({
          candidate,
          constraint,
          report,
          comparison,
        }),
      },
    ],
    reasoning: { effort: "medium" },
    text: {
      format: zodTextFormat(FinalNarrativeSchema, "foldforge_final_narrative"),
    },
    parallel_tool_calls: false,
    max_output_tokens: 2_000,
    safety_identifier: safetyId,
    store: false,
  });

  if (!response.output_parsed) {
    throw new Error("GPT-5.6 did not return a parsed final narrative.");
  }
  return FinalNarrativeSchema.parse(response.output_parsed);
};
