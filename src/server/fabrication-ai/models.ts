import { zodResponsesFunction, zodTextFormat } from "openai/helpers/zod";

import { canonicalSerialize } from "@/core/canonical";
import {
  FabricationIntentV1Schema,
  ProgramPatchV1Schema,
} from "@/core/fabrication/schemas";
import type {
  CandidateV2,
  FabricationIntentV1,
  FabricationProgramV1,
  ProgramPatchV1,
  VerificationReportV2,
} from "@/core/fabrication/types";
import { getOpenAIClient } from "@/server/ai/client";

import {
  FabricationNarrativeV1Schema,
  ProgramProposalV1Schema,
  type FabricationNarrativeV1,
  type ProgramProposalV1,
} from "./contracts";
import {
  FABRICATION_INTENT_PROMPT,
  FABRICATION_NARRATIVE_PROMPT,
  FABRICATION_PROGRAM_PROMPT,
  FABRICATION_REPAIR_PROMPT,
} from "./prompts";

export const FOLDFORGE_MODEL = "gpt-5.6-sol";

export interface FabricationIntentModel {
  compileIntent(
    prompt: string,
    safetyIdentifier: string,
  ): Promise<FabricationIntentV1>;
}

export interface FabricationProgramModel {
  generateProgram(
    intent: FabricationIntentV1,
    candidateOrdinal: number,
    usedTopologyIds: readonly string[],
    safetyIdentifier: string,
  ): Promise<ProgramProposalV1>;
}

export interface FabricationRepairModel {
  diagnoseRepair(
    program: FabricationProgramV1,
    report: VerificationReportV2,
    repairCycle: number,
    safetyIdentifier: string,
  ): Promise<ProgramPatchV1 | null>;
}

export interface FabricationNarrativeModel {
  generateNarrative(
    candidate: CandidateV2,
    safetyIdentifier: string,
  ): Promise<FabricationNarrativeV1>;
}

export class OpenAIFabricationIntentModel implements FabricationIntentModel {
  async compileIntent(
    prompt: string,
    safetyIdentifier: string,
  ): Promise<FabricationIntentV1> {
    const response = await getOpenAIClient().responses.parse({
      model: FOLDFORGE_MODEL,
      instructions: FABRICATION_INTENT_PROMPT,
      input: [{ role: "user", content: prompt }],
      reasoning: { effort: "high" },
      text: {
        format: zodTextFormat(
          FabricationIntentV1Schema,
          "fabrication_intent_v1",
        ),
      },
      max_output_tokens: 3_000,
      parallel_tool_calls: false,
      safety_identifier: safetyIdentifier,
      store: false,
    });
    if (!response.output_parsed) {
      throw new Error("GPT-5.6 Sol returned no parsed fabrication intent.");
    }
    return FabricationIntentV1Schema.parse(response.output_parsed);
  }
}

export class OpenAIFabricationProgramModel implements FabricationProgramModel {
  async generateProgram(
    intent: FabricationIntentV1,
    candidateOrdinal: number,
    usedTopologyIds: readonly string[],
    safetyIdentifier: string,
  ): Promise<ProgramProposalV1> {
    const response = await getOpenAIClient().responses.parse({
      model: FOLDFORGE_MODEL,
      instructions: FABRICATION_PROGRAM_PROMPT,
      input: [
        {
          role: "user",
          content: canonicalSerialize({
            intent,
            candidateOrdinal,
            usedTopologyIds,
          }),
        },
      ],
      reasoning: { effort: "high" },
      text: {
        format: zodTextFormat(
          ProgramProposalV1Schema,
          "fabrication_program_proposal_v1",
        ),
      },
      max_output_tokens: 8_000,
      parallel_tool_calls: false,
      safety_identifier: safetyIdentifier,
      store: false,
    });
    if (!response.output_parsed) {
      throw new Error("GPT-5.6 Sol returned no parsed fabrication program.");
    }
    return ProgramProposalV1Schema.parse(response.output_parsed);
  }
}

export class OpenAIFabricationRepairModel implements FabricationRepairModel {
  async diagnoseRepair(
    program: FabricationProgramV1,
    report: VerificationReportV2,
    repairCycle: number,
    safetyIdentifier: string,
  ): Promise<ProgramPatchV1 | null> {
    const response = await getOpenAIClient().responses.parse({
      model: FOLDFORGE_MODEL,
      instructions: FABRICATION_REPAIR_PROMPT,
      input: [
        {
          role: "user",
          content: canonicalSerialize({ program, report, repairCycle }),
        },
      ],
      reasoning: { effort: "high" },
      tools: [
        zodResponsesFunction({
          name: "apply_parameter_patch",
          description:
            "Propose one bounded patch grounded in deterministic failure fields.",
          parameters: ProgramPatchV1Schema,
        }),
      ],
      tool_choice: { type: "function", name: "apply_parameter_patch" },
      max_output_tokens: 2_000,
      parallel_tool_calls: false,
      safety_identifier: safetyIdentifier,
      store: false,
    });
    const toolCall = response.output.find(
      (item) =>
        item.type === "function_call" && item.name === "apply_parameter_patch",
    );
    if (!toolCall || toolCall.type !== "function_call") return null;
    return ProgramPatchV1Schema.parse(JSON.parse(toolCall.arguments));
  }
}

export class OpenAIFabricationNarrativeModel implements FabricationNarrativeModel {
  async generateNarrative(
    candidate: CandidateV2,
    safetyIdentifier: string,
  ): Promise<FabricationNarrativeV1> {
    const response = await getOpenAIClient().responses.parse({
      model: FOLDFORGE_MODEL,
      instructions: FABRICATION_NARRATIVE_PROMPT,
      input: [{ role: "user", content: canonicalSerialize(candidate) }],
      reasoning: { effort: "medium" },
      text: {
        format: zodTextFormat(
          FabricationNarrativeV1Schema,
          "fabrication_narrative_v1",
        ),
      },
      max_output_tokens: 2_000,
      parallel_tool_calls: false,
      safety_identifier: safetyIdentifier,
      store: false,
    });
    if (!response.output_parsed) {
      throw new Error("GPT-5.6 Sol returned no parsed fabrication narrative.");
    }
    return FabricationNarrativeV1Schema.parse(response.output_parsed);
  }
}
