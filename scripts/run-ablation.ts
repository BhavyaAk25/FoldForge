import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { fabricationProgramHash } from "../src/core/fabrication/compiler";
import { createModularCableOrganizerShowcase } from "../src/core/fabrication/examples";
import type {
  FabricationProgramV1,
  ProgramPatchV1,
  VerificationReportV2,
} from "../src/core/fabrication/types";
import type { FabricationRepairModel } from "../src/server/fabrication-ai/models";
import { runFabricationRepairLoop } from "../src/server/fabrication-ai/orchestration";

const showcase = createModularCableOrganizerShowcase();
const panelId = "panel-organizer-module";
const pathToX =
  `/blueprint/panels/${panelId}/flatTransform/translationMm/xMm` as const;

const invalidProgram = (index: number): FabricationProgramV1 => ({
  ...showcase.program,
  programId: `program-ablation-${index + 1}`,
  blueprint: {
    ...showcase.program.blueprint,
    panels: showcase.program.blueprint.panels.map((panel) =>
      panel.panelId === panelId
        ? {
            ...panel,
            flatTransform: {
              ...panel.flatTransform,
              translationMm: {
                ...panel.flatTransform.translationMm,
                xMm: -(index + 1),
              },
            },
          }
        : panel,
    ),
  },
});

const patch = (
  program: FabricationProgramV1,
  report: VerificationReportV2,
  repairCycle: number,
  grounded: boolean,
): ProgramPatchV1 => {
  const panel = program.blueprint.panels.find(
    (candidate) => candidate.panelId === panelId,
  )!;
  const failure = report.failures.find((candidate) =>
    candidate.repairableProgramPaths.includes(pathToX),
  );
  return {
    version: "1",
    patchId: `patch-ablation-${program.programId}-${repairCycle}-${grounded ? "full" : "binary"}`,
    programId: program.programId,
    baseProgramHash: fabricationProgramHash(program),
    repairCycle,
    diagnosis: grounded
      ? `${failure?.failureId ?? "packing.failure"} identifies the panel offset.`
      : "The binary result says only that the candidate failed.",
    operations: [
      {
        operationId: `operation-ablation-${repairCycle}`,
        operation: "set_number",
        path: grounded ? pathToX : `/blueprint/panels/${panelId}/widthMm`,
        value: grounded ? 30 : 125,
        expectedCurrentValue: grounded
          ? panel.flatTransform.translationMm.xMm
          : panel.widthMm,
        unit: "mm",
        failureIds: [
          grounded ? (failure?.failureId ?? "packing.failure") : "binary.fail",
        ],
        reason: grounded
          ? "Move the panel inside the printable margin."
          : "Try a generic size change without geometric evidence.",
        expectedEffect: grounded
          ? "The panel and derived paths should fit the sheet."
          : "The binary failure might change.",
      },
    ],
    authoredBy: "ai",
    changesIntent: false,
  };
};

class FullReportModel implements FabricationRepairModel {
  diagnoseRepair(
    program: FabricationProgramV1,
    report: VerificationReportV2,
    repairCycle: number,
  ): Promise<ProgramPatchV1> {
    return Promise.resolve(patch(program, report, repairCycle, true));
  }
}

class PassFailOnlyModel implements FabricationRepairModel {
  diagnoseRepair(
    program: FabricationProgramV1,
    report: VerificationReportV2,
    repairCycle: number,
  ): Promise<ProgramPatchV1> {
    return Promise.resolve(patch(program, report, repairCycle, false));
  }
}

class NoFeedbackModel implements FabricationRepairModel {
  diagnoseRepair(): Promise<null> {
    return Promise.resolve(null);
  }
}

const evaluate = async (
  label: string,
  model: FabricationRepairModel,
): Promise<{
  readonly label: string;
  readonly successRate: number;
  readonly successes: number;
}> => {
  let successes = 0;
  for (let index = 0; index < 40; index += 1) {
    const outcome = await runFabricationRepairLoop(
      {
        ...showcase.intent,
        intentId: showcase.intent.intentId,
      },
      invalidProgram(index),
      `candidate-ablation-${label}-${index + 1}`,
      `ff_ablation_${label}_${index + 1}`,
      model,
      3,
    );
    if (outcome.status === "passed") successes += 1;
  }
  return { label, successes, successRate: successes / 40 };
};

const variants = await Promise.all([
  evaluate("full_verifier_feedback", new FullReportModel()),
  evaluate("pass_fail_only", new PassFailOnlyModel()),
  evaluate("no_feedback", new NoFeedbackModel()),
]);
const full = variants[0]?.successRate ?? 0;
const strongestBaseline = Math.max(
  variants[1]?.successRate ?? 0,
  variants[2]?.successRate ?? 0,
);
const report = {
  reportVersion: 1,
  mode: "fabrication-repair-ablation-offline",
  fixtureCount: 40,
  variants,
  absoluteImprovement: full - strongestBaseline,
  materiallyOutperforms: full - strongestBaseline >= 0.2,
};

await mkdir(path.resolve("artifacts/evals"), { recursive: true });
await writeFile(
  path.resolve("artifacts/evals/ablation.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(report)}\n`);
if (!report.materiallyOutperforms) process.exitCode = 1;
