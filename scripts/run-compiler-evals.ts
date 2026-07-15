import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { canonicalSerialize } from "../src/core/canonical";
import { FabricationIntentV1Schema } from "../src/core/fabrication/schemas";
import type { FabricationIntentV1 } from "../src/core/fabrication/types";
import { sha256Hex } from "../src/core/sha256";
import { FOLDFORGE_MODEL } from "../src/server/fabrication-ai/models";
import {
  ALL_FABRICATION_INTENT_CASES,
  BOUNDARY_FABRICATION_INTENT_CASES,
  SUPPORTED_FABRICATION_INTENT_CASES,
  type FabricationIntentEvalCase,
} from "../tests/fixtures/fabrication-intent-evals";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
};

const liveEnabled = process.env.ENABLE_LIVE_OPENAI_EVALS === "true";
const integerArgument = (name: string, fallback: number): number => {
  const value = Number(argument(name) ?? fallback);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer.`);
  }
  return value;
};
const requestedCases = Math.max(
  1,
  Math.min(
    SUPPORTED_FABRICATION_INTENT_CASES.length,
    integerArgument("--cases", liveEnabled ? 5 : 100),
  ),
);
const requestedBoundaryCases = Math.max(
  0,
  Math.min(
    BOUNDARY_FABRICATION_INTENT_CASES.length,
    integerArgument("--boundary-cases", liveEnabled ? 5 : 40),
  ),
);
const requestedModel = argument("--model") ?? FOLDFORGE_MODEL;
if (requestedModel !== FOLDFORGE_MODEL) {
  throw new Error(
    `FoldForge live evaluations are pinned to ${FOLDFORGE_MODEL}.`,
  );
}
const selected = [
  ...SUPPORTED_FABRICATION_INTENT_CASES.slice(0, requestedCases),
  ...BOUNDARY_FABRICATION_INTENT_CASES.slice(0, requestedBoundaryCases),
];

interface CaseResult {
  readonly caseId: string;
  readonly schemaValid: boolean;
  readonly expectedStatus: FabricationIntentV1["scopeStatus"];
  readonly actualStatus: FabricationIntentV1["scopeStatus"] | "invalid";
  readonly statusCorrect: boolean;
  readonly recalledFields: number;
  readonly expectedFields: number;
  readonly normalizedUnitFields: number;
  readonly expectedUnitFields: number;
}

const evaluateIntent = (
  evalCase: FabricationIntentEvalCase,
  value: unknown,
): CaseResult => {
  const parsed = FabricationIntentV1Schema.safeParse(value);
  if (!parsed.success) {
    return {
      caseId: evalCase.caseId,
      schemaValid: false,
      expectedStatus: evalCase.expectedStatus,
      actualStatus: "invalid",
      statusCorrect: false,
      recalledFields: 0,
      expectedFields: evalCase.expectedStatus === "supported" ? 7 : 1,
      normalizedUnitFields: 0,
      expectedUnitFields: evalCase.expectedStatus === "supported" ? 3 : 0,
    };
  }
  const intent = parsed.data;
  if (evalCase.expectedStatus !== "supported") {
    return {
      caseId: evalCase.caseId,
      schemaValid: true,
      expectedStatus: evalCase.expectedStatus,
      actualStatus: intent.scopeStatus,
      statusCorrect: intent.scopeStatus === evalCase.expectedStatus,
      recalledFields: intent.scopeStatus === evalCase.expectedStatus ? 1 : 0,
      expectedFields: 1,
      normalizedUnitFields: 0,
      expectedUnitFields: 0,
    };
  }
  const expected = evalCase.expected;
  const sizeMatches = [
    Math.abs(intent.requestedSize.widthMm - expected.widthMm) <= 0.01,
    Math.abs(intent.requestedSize.heightMm - expected.heightMm) <= 0.01,
    intent.requestedSize.depthMm !== null &&
      Math.abs(intent.requestedSize.depthMm - expected.depthMm) <= 0.01,
  ];
  const recall = [
    ...sizeMatches,
    intent.behavior === expected.behavior,
    intent.fabricationBudget.maximumSheets === expected.maximumSheets,
    intent.fabricationBudget.glueAllowed === expected.glueAllowed,
    intent.fabricationBudget.cutsAllowed === expected.cutsAllowed,
  ];
  return {
    caseId: evalCase.caseId,
    schemaValid: true,
    expectedStatus: evalCase.expectedStatus,
    actualStatus: intent.scopeStatus,
    statusCorrect: intent.scopeStatus === evalCase.expectedStatus,
    recalledFields: recall.filter(Boolean).length,
    expectedFields: recall.length,
    normalizedUnitFields: sizeMatches.filter(Boolean).length,
    expectedUnitFields: sizeMatches.length,
  };
};

const summarize = (results: readonly CaseResult[]) => {
  const supported = results.filter(
    (result) => result.expectedStatus === "supported",
  );
  const boundary = results.filter(
    (result) => result.expectedStatus !== "supported",
  );
  const recalled = results.reduce(
    (total, result) => total + result.recalledFields,
    0,
  );
  const expected = results.reduce(
    (total, result) => total + result.expectedFields,
    0,
  );
  const normalized = supported.reduce(
    (total, result) => total + result.normalizedUnitFields,
    0,
  );
  const expectedUnits = supported.reduce(
    (total, result) => total + result.expectedUnitFields,
    0,
  );
  return {
    caseCount: results.length,
    supportedCaseCount: supported.length,
    boundaryCaseCount: boundary.length,
    schemaValidityRate:
      results.filter((result) => result.schemaValid).length / results.length,
    explicitConstraintRecallRate: expected === 0 ? 1 : recalled / expected,
    unitNormalizationAccuracyRate:
      expectedUnits === 0 ? 1 : normalized / expectedUnits,
    correctStatusRate:
      results.filter((result) => result.statusCorrect).length / results.length,
    correctRefusalOrClarificationRate:
      boundary.filter((result) => result.statusCorrect).length /
      boundary.length,
  };
};

const offlineResults = selected.map((evalCase) =>
  evaluateIntent(evalCase, evalCase.mockedIntent),
);
const offline = summarize(offlineResults);
const offlineGates = {
  strictSchema: offline.schemaValidityRate === 1,
  explicitRecall: offline.explicitConstraintRecallRate >= 0.98,
  unitNormalization: offline.unitNormalizationAccuracyRate >= 0.99,
  refusalAndClarification: offline.correctRefusalOrClarificationRate >= 0.95,
};

let liveResults: readonly CaseResult[] | null = null;
if (liveEnabled) {
  const { OpenAIFabricationIntentModel } =
    await import("../src/server/fabrication-ai/models");
  const model = new OpenAIFabricationIntentModel();
  const collected: CaseResult[] = [];
  for (const evalCase of selected) {
    try {
      const intent = await model.compileIntent(
        evalCase.prompt,
        `ff_eval_${sha256Hex(evalCase.caseId).slice(0, 32)}`,
      );
      collected.push(evaluateIntent(evalCase, intent));
    } catch {
      collected.push(evaluateIntent(evalCase, null));
    }
  }
  liveResults = collected;
}
const live = liveResults ? summarize(liveResults) : null;
const liveGates = live
  ? {
      strictSchema: live.schemaValidityRate === 1,
      explicitRecall: live.explicitConstraintRecallRate >= 0.95,
      unitNormalization: live.unitNormalizationAccuracyRate >= 0.95,
      refusalAndClarification: live.correctRefusalOrClarificationRate >= 0.95,
    }
  : null;

const report = {
  reportVersion: 1,
  mode: "fabrication-intent-contract",
  model: requestedModel,
  datasetCaseCount: ALL_FABRICATION_INTENT_CASES.length,
  datasetHash: sha256Hex(canonicalSerialize(ALL_FABRICATION_INTENT_CASES)),
  evaluationCaseCount: selected.length,
  offlineEvidenceType: "mocked-contract-validation",
  offline,
  offlineGates,
  liveStatus: liveEnabled ? "run" : "blocked-user-enable-required",
  live,
  liveGates,
  results: liveResults ?? offlineResults,
};
const passed =
  Object.values(offlineGates).every(Boolean) &&
  (liveGates === null || Object.values(liveGates).every(Boolean));

await mkdir(path.resolve("artifacts/evals"), { recursive: true });
await writeFile(
  path.resolve("artifacts/evals/compiler.json"),
  `${JSON.stringify({ ...report, passed }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify({ ...report, passed })}\n`);
if (!passed) process.exitCode = 1;
