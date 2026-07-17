import { describe, expect, it } from "vitest";

import { fabricationProgramHash } from "@/core/fabrication/compiler";
import { createOfflineFabricationShowcases } from "@/core/fabrication/examples";
import type { ProgramPatchV1 } from "@/core/fabrication/types";
import {
  createRepairEvidence,
  evaluateFabricationProgramForEvidence,
} from "@/server/evals/live-repair-evidence";
import { createMotionRangeRepairProbe } from "@/server/evals/repair-probe";
import type { FabricationRepairModel } from "@/server/fabrication-ai/models";
import { runFabricationRepairLoop } from "@/server/fabrication-ai/orchestration";

describe("live repair evidence", () => {
  it("binds a typed repair to a measured failure and passing revalidation", async () => {
    const flower = createOfflineFabricationShowcases()[2];
    if (!flower) throw new Error("The moving showcase is unavailable.");
    const probe = createMotionRangeRepairProbe(flower.program);
    const candidateId = "live-repair-evidence";
    const initialReport = evaluateFabricationProgramForEvidence(
      flower.intent,
      probe.program,
      candidateId,
    );
    const failure = initialReport?.failures.find((item) =>
      item.repairableProgramPaths.includes(probe.mutation.path),
    );
    if (!initialReport || !failure) {
      throw new Error("The deliberate repair failure was not measured.");
    }

    const model: FabricationRepairModel = {
      diagnoseRepair: async (
        program,
        _report,
        repairCycle,
      ): Promise<ProgramPatchV1> => ({
        version: "1",
        patchId: "patch-live-motion-probe",
        programId: program.programId,
        baseProgramHash: fabricationProgramHash(program),
        repairCycle,
        diagnosis: `${failure.failureId} exceeds the joint motion range.`,
        operations: [
          {
            operationId: "operation-live-motion-probe",
            operation: "set_number",
            path: probe.mutation.path,
            value: probe.mutation.originalValue,
            expectedCurrentValue: probe.mutation.mutatedValue,
            unit: probe.mutation.unit,
            failureIds: [failure.failureId],
            reason: "Restore the driver maximum to its verified range.",
            expectedEffect: "Every sampled driver state becomes reachable.",
          },
        ],
        authoredBy: "ai",
        changesIntent: false,
      }),
    };
    const outcome = await runFabricationRepairLoop(
      flower.intent,
      probe.program,
      candidateId,
      "ff_test",
      model,
    );
    const evidence = createRepairEvidence(
      initialReport,
      outcome,
      probe.mutation,
      ["resp-repair-evidence"],
    );

    expect(evidence).toMatchObject({
      passed: true,
      evidenceType: "deliberate_evaluation_probe",
      finalStatus: "passed",
      finalValid: true,
      cycles: [
        {
          grounded: true,
          responseId: "resp-repair-evidence",
          citedFailures: [
            {
              failureId: failure.failureId,
              foundInBeforeReport: true,
            },
          ],
          operations: [{ path: probe.mutation.path, grounded: true }],
          deterministicRevalidation: { valid: true },
        },
      ],
    });
  });
});
