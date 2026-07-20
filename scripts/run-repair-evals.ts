import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { canonicalSerialize } from "../src/core/canonical";
import {
  compileFabricationProgram,
  fabricationProgramHash,
} from "../src/core/fabrication/compiler";
import { createOfflineFabricationShowcases } from "../src/core/fabrication/examples";
import { applyProgramPatch } from "../src/core/fabrication/repair";
import type {
  FabricationIntentV1,
  FabricationProgramV1,
  ProgramPatchV1,
  VerificationReportV2,
} from "../src/core/fabrication/types";
import { verifyFabricationIr } from "../src/core/fabrication/verification";
import type { FabricationRepairModel } from "../src/server/fabrication-ai/models";
import { runFabricationRepairLoop } from "../src/server/fabrication-ai/orchestration";

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
};

const requestedFixtures = Math.max(
  1,
  Math.trunc(Number(argument("--fixtures") ?? 40)),
);
const maximumCycles = Math.max(
  1,
  Math.min(5, Math.trunc(Number(argument("--max-iterations") ?? 5))),
);

interface RepairFixture {
  readonly fixtureId: string;
  readonly category: "connections" | "motion" | "sheet_packing";
  readonly intent: FabricationIntentV1;
  readonly program: FabricationProgramV1;
  readonly path: string;
  readonly currentValue: number;
  readonly targetValue: number;
  readonly unit: "mm";
}

const [duck, organizer, flower] = createOfflineFabricationShowcases();
if (!duck || !organizer || !flower) {
  throw new Error("Offline fabrication controls are unavailable.");
}

const repairFixtures: RepairFixture[] = [];
for (let index = 0; index < requestedFixtures; index += 1) {
  const fixtureNumber = index + 1;
  if (index % 3 === 0) {
    const currentValue = -(fixtureNumber % 12) - 1;
    const panelId = "panel-organizer-module";
    repairFixtures.push({
      fixtureId: `packing-${fixtureNumber}`,
      category: "sheet_packing",
      intent: organizer.intent,
      program: {
        ...organizer.program,
        blueprint: {
          ...organizer.program.blueprint,
          panels: organizer.program.blueprint.panels.map((panel) =>
            panel.panelId === panelId
              ? {
                  ...panel,
                  flatTransform: {
                    ...panel.flatTransform,
                    translationMm: {
                      ...panel.flatTransform.translationMm,
                      xMm: currentValue,
                    },
                  },
                }
              : panel,
          ),
        },
      },
      path: `/blueprint/panels/${panelId}/flatTransform/translationMm/xMm`,
      currentValue,
      targetValue: 30,
      unit: "mm",
    });
  } else if (index % 3 === 1) {
    const currentValue = 0.05 + (fixtureNumber % 10) * 0.01;
    const connectorId = "connector-organizer-tab";
    repairFixtures.push({
      fixtureId: `clearance-${fixtureNumber}`,
      category: "connections",
      intent: organizer.intent,
      program: {
        ...organizer.program,
        blueprint: {
          ...organizer.program.blueprint,
          connectors: organizer.program.blueprint.connectors.map((connector) =>
            connector.connectorId === connectorId
              ? { ...connector, clearanceMm: currentValue }
              : connector,
          ),
        },
      },
      path: `/blueprint/connectors/${connectorId}/clearanceMm`,
      currentValue,
      targetValue: 0.4,
      unit: "mm",
    });
  } else {
    const currentValue = 31 + (fixtureNumber % 12) * 0.5;
    const driver = flower.program.blueprint.driver;
    if (!driver) throw new Error("Flower control requires a motion driver.");
    repairFixtures.push({
      fixtureId: `motion-${fixtureNumber}`,
      category: "motion",
      intent: flower.intent,
      program: {
        ...flower.program,
        blueprint: {
          ...flower.program.blueprint,
          driver: { ...driver, maximumValue: currentValue },
        },
      },
      path: `/blueprint/driver/${driver.driverId}/maximumValue`,
      currentValue,
      targetValue: 30,
      unit: "mm",
    });
  }
}

const groundedFailure = (report: VerificationReportV2, path: string) =>
  report.failures.find((failure) =>
    failure.repairableProgramPaths.includes(path),
  );

const patchFor = (
  fixture: RepairFixture,
  program: FabricationProgramV1,
  report: VerificationReportV2,
  repairCycle: number,
  value = fixture.targetValue,
): ProgramPatchV1 => {
  const failure = groundedFailure(report, fixture.path);
  if (!failure) {
    throw new Error(
      `${fixture.fixtureId} exposes no grounded path for ${fixture.path}.`,
    );
  }
  return {
    version: "1",
    patchId: `patch-${fixture.fixtureId}-${repairCycle}`,
    programId: program.programId,
    baseProgramHash: fabricationProgramHash(program),
    repairCycle,
    diagnosis: `${failure.failureId} measured a repairable ${fixture.category} violation.`,
    operations: [
      {
        operationId: `operation-${fixture.fixtureId}-${repairCycle}`,
        operation: "set_number",
        path: fixture.path,
        value,
        expectedCurrentValue: fixture.currentValue,
        unit: fixture.unit,
        failureIds: [failure.failureId],
        reason: "Restore the verified bounded control value.",
        expectedEffect: `Re-run ${fixture.category} verification with the corrected value.`,
      },
    ],
    authoredBy: "ai",
    changesIntent: false,
  };
};

interface RepairResult {
  readonly fixtureId: string;
  readonly category: RepairFixture["category"];
  readonly status: "passed" | "infeasible";
  readonly cycles: number;
  readonly finalValid: boolean;
  readonly traceSources: readonly ("AI" | "CODE")[];
}

const results: RepairResult[] = [];
for (const fixture of repairFixtures) {
  const model: FabricationRepairModel = {
    diagnoseRepair: (program, report, repairCycle) =>
      Promise.resolve(patchFor(fixture, program, report, repairCycle)),
  };
  const outcome = await runFabricationRepairLoop(
    fixture.intent,
    fixture.program,
    `candidate-${fixture.fixtureId}`,
    `ff_eval_${fixture.fixtureId}`,
    model,
    maximumCycles,
  );
  results.push({
    fixtureId: fixture.fixtureId,
    category: fixture.category,
    status: outcome.status,
    cycles: outcome.cycles.length,
    finalValid: outcome.report?.valid ?? false,
    traceSources: [...new Set(outcome.trace.map((event) => event.source))],
  });
}

const nonRepairableResults: {
  readonly fixtureId: string;
  readonly status: "passed" | "infeasible";
  readonly cycles: number;
  readonly reason: string | null;
}[] = [];
for (let index = 0; index < 20; index += 1) {
  const fixture = repairFixtures[index % repairFixtures.length]!;
  const model: FabricationRepairModel = {
    diagnoseRepair: (program, report, repairCycle) =>
      Promise.resolve(
        patchFor(fixture, program, report, repairCycle, fixture.currentValue),
      ),
  };
  const outcome = await runFabricationRepairLoop(
    fixture.intent,
    fixture.program,
    `candidate-nonrepairable-${index + 1}`,
    `ff_eval_nonrepairable_${index + 1}`,
    model,
    maximumCycles,
  );
  nonRepairableResults.push({
    fixtureId: `nonrepairable-${index + 1}`,
    status: outcome.status,
    cycles: outcome.cycles.length,
    reason: outcome.status === "infeasible" ? outcome.reason : null,
  });
}

const adversarialBase = repairFixtures[0]!;
const compiled = compileFabricationProgram(
  adversarialBase.intent,
  adversarialBase.program,
);
if (!compiled.ok) throw new Error(canonicalSerialize(compiled.error));
const adversarialReport = verifyFabricationIr(
  compiled.value,
  "candidate-adversarial-patches",
);
const basePatch = patchFor(
  adversarialBase,
  adversarialBase.program,
  adversarialReport,
  1,
);
const baseOperation = basePatch.operations[0]!;
let acceptedAdversarialPatchCount = 0;
const adversarialErrorCounts: Record<string, number> = {};
for (let index = 0; index < 120; index += 1) {
  const variant = index % 6;
  const patch: unknown = (() => {
    switch (variant) {
      case 0:
        return { ...basePatch, unexpectedField: `attack-${index}` };
      case 1:
        return { ...basePatch, baseProgramHash: "0".repeat(64) };
      case 2:
        return {
          ...basePatch,
          operations: [
            { ...baseOperation, failureIds: [`unknown.failure#${index}`] },
          ],
        };
      case 3:
        return {
          ...basePatch,
          operations: [
            {
              ...baseOperation,
              path: `/blueprint/panels/unknown-${index}/widthMm`,
            },
          ],
        };
      case 4:
        return {
          ...basePatch,
          operations: [{ ...baseOperation, unit: "deg" }],
        };
      case 5:
        return {
          ...basePatch,
          operations: [baseOperation, baseOperation],
        };
    }
  })();
  const applied = applyProgramPatch(
    adversarialBase.program,
    patch,
    adversarialReport,
  );
  if (applied.ok) acceptedAdversarialPatchCount += 1;
  else {
    adversarialErrorCounts[applied.error.id] =
      (adversarialErrorCounts[applied.error.id] ?? 0) + 1;
  }
}

const repairedWithinThree = results.filter(
  (result) =>
    result.status === "passed" && result.finalValid && result.cycles <= 3,
).length;
const report = {
  reportVersion: 2,
  mode: "fabrication-bounded-repair-offline",
  fixtureCount: results.length,
  categoryCounts: Object.fromEntries(
    [...new Set(results.map((result) => result.category))].map((category) => [
      category,
      results.filter((result) => result.category === category).length,
    ]),
  ),
  repairedWithinThree,
  repairedWithinThreeRate: repairedWithinThree / results.length,
  maximumObservedCycles: Math.max(...results.map((result) => result.cycles)),
  nonRepairableFixtureCount: nonRepairableResults.length,
  correctInfeasibleCount: nonRepairableResults.filter(
    (result) => result.status === "infeasible",
  ).length,
  adversarialPatchCount: 120,
  acceptedAdversarialPatchCount,
  adversarialErrorCounts,
  results,
  nonRepairableResults,
  gates: {
    repairedWithinThree: repairedWithinThree / results.length >= 0.85,
    boundedTermination: results.every(
      (result) => result.cycles <= maximumCycles,
    ),
    groundedAiAndCodeTrace: results.every(
      (result) =>
        result.traceSources.includes("AI") &&
        result.traceSources.includes("CODE"),
    ),
    adversarialPatchesRejected: acceptedAdversarialPatchCount === 0,
    infeasibleOnNoProgressState: nonRepairableResults.every(
      (result) =>
        result.status === "infeasible" &&
        (result.reason === "Duplicate canonical repair input was blocked." ||
          result.reason === "Deterministic patch rejection: patch.noop."),
    ),
  },
};
const passed = Object.values(report.gates).every(Boolean);

await mkdir(path.resolve("artifacts/evals"), { recursive: true });
await writeFile(
  path.resolve("artifacts/evals/repair.json"),
  `${JSON.stringify({ ...report, passed }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify({ ...report, passed })}\n`);
if (!passed) process.exitCode = 1;
