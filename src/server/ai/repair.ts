import { zodResponsesFunction } from "openai/helpers/zod";

import { canonicalSerialize } from "@/core/canonical";
import {
  ParameterPatchSchema,
  type CandidateParameters,
  type DesignConstraint,
  type ParameterPatch,
} from "@/core/schemas";
import type { VerificationReport } from "@/core/types";

import { getOpenAIClient } from "./client";
import { REPAIR_DIAGNOSIS_PROMPT } from "./prompts";

export interface RepairDiagnosisInput {
  readonly parameters: CandidateParameters;
  readonly constraint: DesignConstraint;
  readonly report: VerificationReport;
}

export interface RepairDiagnosisModel {
  diagnose(
    input: RepairDiagnosisInput,
    safetyId: string,
  ): Promise<ParameterPatch | null>;
}

export class OpenAIRepairDiagnosisModel implements RepairDiagnosisModel {
  async diagnose(
    input: RepairDiagnosisInput,
    safetyId: string,
  ): Promise<ParameterPatch | null> {
    const response = await getOpenAIClient().responses.parse({
      model: "gpt-5.6-sol",
      instructions: REPAIR_DIAGNOSIS_PROMPT,
      input: [
        {
          role: "user",
          content: canonicalSerialize({
            parameters: input.parameters,
            constraint: input.constraint,
            report: input.report,
          }),
        },
      ],
      reasoning: { effort: "high" },
      tools: [
        zodResponsesFunction({
          name: "diagnose_failure",
          description:
            "Return one report-grounded bounded parameter patch. The deterministic verifier will decide whether it works.",
          parameters: ParameterPatchSchema,
        }),
      ],
      tool_choice: { type: "function", name: "diagnose_failure" },
      parallel_tool_calls: false,
      max_output_tokens: 2_500,
      safety_identifier: safetyId,
      store: false,
    });

    const toolCall = response.output.find(
      (item) =>
        item.type === "function_call" && item.name === "diagnose_failure",
    );
    if (!toolCall || toolCall.type !== "function_call") return null;

    return ParameterPatchSchema.parse(JSON.parse(toolCall.arguments));
  }
}
