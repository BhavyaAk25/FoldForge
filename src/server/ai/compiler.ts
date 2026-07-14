import { zodTextFormat } from "openai/helpers/zod";

import { PRODUCT_LIMITS } from "@/core/constants";
import { degreesToRadians } from "@/core/math";
import { DesignConstraintSchema, type DesignConstraint } from "@/core/schemas";
import { lengthToMm, massToG } from "@/core/units";

import { getOpenAIClient } from "./client";
import {
  RawConstraintCompilationSchema,
  type CompileOutcome,
  type RawConstraintCompilation,
} from "./contracts";
import { CONSTRAINT_COMPILER_PROMPT } from "./prompts";

export interface ConstraintCompilationModel {
  compile(prompt: string, safetyId: string): Promise<RawConstraintCompilation>;
}

const normalizedLength = (
  measurement: RawConstraintCompilation["objectWidth"],
): number | null => {
  if (measurement.value === null || measurement.unit === null) return null;
  const result = lengthToMm(measurement.value, measurement.unit);
  return result.ok ? result.value : null;
};

const normalizedMass = (
  measurement: RawConstraintCompilation["objectMass"],
): number | null => {
  if (measurement.value === null || measurement.unit === null) return null;
  const result = massToG(measurement.value, measurement.unit);
  return result.ok ? result.value : null;
};

const blockedOutcome = (
  status: "needs_clarification" | "unsupported" | "infeasible",
  raw: RawConstraintCompilation,
  question: string,
): CompileOutcome => ({
  status,
  constraint: null,
  clarifyingQuestion: question,
  interpretationSummary: raw.interpretationSummary,
});

export const normalizeCompilation = (
  rawInput: RawConstraintCompilation,
): CompileOutcome => {
  const raw = RawConstraintCompilationSchema.parse(rawInput);
  const objectWidthMm = normalizedLength(raw.objectWidth);
  const objectHeightMm = normalizedLength(raw.objectHeight);
  const objectDepthMm = normalizedLength(raw.objectDepth);
  const objectMassG = normalizedMass(raw.objectMass);

  if (raw.supportedScopeStatus === "unsupported") {
    return blockedOutcome("unsupported", raw, "");
  }

  if (
    raw.contradictoryRequirements.length > 0 ||
    raw.feasibilityStatus === "infeasible"
  ) {
    return blockedOutcome("infeasible", raw, "");
  }

  if (
    objectWidthMm === null ||
    objectHeightMm === null ||
    objectDepthMm === null ||
    objectMassG === null
  ) {
    return blockedOutcome(
      "needs_clarification",
      raw,
      raw.clarifyingQuestion ||
        "What are the device width × height × depth and mass, including units?",
    );
  }

  if (objectMassG > PRODUCT_LIMITS.maximumObjectMassG) {
    return blockedOutcome("unsupported", raw, "");
  }

  const inferredDefaults = [...raw.inferredDefaults];
  const withDefault = <T>(value: T | null, fallback: T, label: string): T => {
    if (value !== null) return value;
    inferredDefaults.push(label);
    return fallback;
  };
  const sheetWidthMm = normalizedLength(raw.sheetWidth);
  const sheetHeightMm = normalizedLength(raw.sheetHeight);
  const printableMarginMm = normalizedLength(raw.printableMargin);
  const cutsAllowed = withDefault(
    raw.cutsAllowed,
    true,
    "Cuts allowed: two internal slots",
  );

  const candidate: DesignConstraint = {
    objectWidthMm,
    objectHeightMm,
    objectDepthMm,
    objectMassG,
    orientation: withDefault(
      raw.orientation,
      "portrait",
      "Portrait orientation",
    ),
    targetViewingAngleDeg: withDefault(
      raw.targetViewingAngleDeg,
      65,
      "65 degree viewing angle",
    ),
    angleToleranceDeg: withDefault(
      raw.angleToleranceDeg,
      5,
      "5 degree angle tolerance",
    ),
    sheetWidthMm: withDefault(sheetWidthMm, 215.9, "US Letter sheet width"),
    sheetHeightMm: withDefault(sheetHeightMm, 279.4, "US Letter sheet height"),
    printableMarginMm: withDefault(
      printableMarginMm,
      6.35,
      "6.35 mm printable margin",
    ),
    materialProfile: withDefault(
      raw.materialProfile,
      "cover_110lb",
      "110 lb cover cardstock",
    ),
    maximumActiveCreaseCount: withDefault(
      raw.maximumActiveCreaseCount,
      5,
      "Maximum five active creases",
    ),
    cutsAllowed,
    maximumCutCount: withDefault(
      raw.maximumCutCount,
      cutsAllowed ? 2 : 0,
      cutsAllowed ? "Maximum two internal cuts" : "No internal cuts",
    ),
    glueAllowed: withDefault(raw.glueAllowed, false, "No glue"),
    mustFoldFlat: withDefault(
      raw.mustFoldFlat,
      true,
      "Unlocks to a flat sheet",
    ),
    priorities:
      raw.priorities.length > 0
        ? raw.priorities
        : ["stability", "simplicity", "compactness"],
    explicitRequirements: raw.explicitRequirements,
    inferredDefaults,
    unresolvedQuestions: raw.unresolvedQuestions,
    contradictoryRequirements: raw.contradictoryRequirements,
    supportedScopeStatus: "supported",
    feasibilityStatus:
      raw.feasibilityStatus === "unknown" ? "unknown" : "feasible",
  };
  const parsed = DesignConstraintSchema.safeParse(candidate);

  if (!parsed.success) {
    return {
      status: "infeasible",
      constraint: null,
      clarifyingQuestion: "",
      interpretationSummary: `${raw.interpretationSummary} Normalized values exceed the supported bounds.`,
    };
  }

  const requiredToeDepthMm =
    parsed.data.objectDepthMm *
      Math.sin(degreesToRadians(parsed.data.targetViewingAngleDeg)) +
    0.5;
  if (requiredToeDepthMm > 22) {
    return {
      status: "infeasible",
      constraint: null,
      clarifyingQuestion: "",
      interpretationSummary: `${raw.interpretationSummary} The device depth requires ${requiredToeDepthMm.toFixed(1)} mm of toe capture, above the 22 mm topology limit.`,
    };
  }

  return {
    status: "ready",
    constraint: parsed.data,
    clarifyingQuestion: "",
    interpretationSummary: raw.interpretationSummary,
  };
};

export class OpenAIConstraintCompilationModel implements ConstraintCompilationModel {
  async compile(
    prompt: string,
    safetyId: string,
  ): Promise<RawConstraintCompilation> {
    const response = await getOpenAIClient().responses.parse({
      model: "gpt-5.6-sol",
      instructions: CONSTRAINT_COMPILER_PROMPT,
      input: [{ role: "user", content: prompt }],
      reasoning: { effort: "high" },
      text: {
        format: zodTextFormat(
          RawConstraintCompilationSchema,
          "foldforge_constraints",
        ),
      },
      max_output_tokens: 3_000,
      parallel_tool_calls: false,
      safety_identifier: safetyId,
      store: false,
    });

    if (!response.output_parsed) {
      throw new Error(
        "GPT-5.6 did not return a parsed constraint compilation.",
      );
    }

    return RawConstraintCompilationSchema.parse(response.output_parsed);
  }
}

export const compileConstraints = async (
  prompt: string,
  safetyId: string,
  model: ConstraintCompilationModel,
): Promise<CompileOutcome> =>
  normalizeCompilation(await model.compile(prompt, safetyId));

export const compileProvidedConstraint = (
  constraint: DesignConstraint,
  summary: string,
): CompileOutcome => {
  const parsed = DesignConstraintSchema.parse(constraint);
  const requiredToeDepthMm =
    parsed.objectDepthMm *
      Math.sin(degreesToRadians(parsed.targetViewingAngleDeg)) +
    0.5;
  return requiredToeDepthMm > 22
    ? {
        status: "infeasible",
        constraint: null,
        clarifyingQuestion: "",
        interpretationSummary: `${summary} Device depth requires ${requiredToeDepthMm.toFixed(1)} mm of toe capture, above the 22 mm topology limit.`,
      }
    : {
        status: "ready",
        constraint: parsed,
        clarifyingQuestion: "",
        interpretationSummary: summary,
      };
};
