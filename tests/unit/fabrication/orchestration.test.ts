import { describe, expect, it, vi } from "vitest";

import { FABRICATION_PLAN_EXPANDER_VERSION } from "@/core/fabrication/planning";
import type {
  FabricationIntentModel,
  FabricationProgramModel,
  FabricationRepairModel,
} from "@/server/fabrication-ai/models";
import {
  compileFabricationIntent,
  generateDistinctFabricationPrograms,
  programStructureFingerprint,
  runFabricationRepairLoop,
} from "@/server/fabrication-ai/orchestration";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

describe("fabrication AI orchestration", () => {
  const proposalProvenance = {
    modelId: "gpt-5.6-sol",
    modelResponseId: "resp-orchestration",
    planHash: "a".repeat(64),
    expanderVersion: FABRICATION_PLAN_EXPANDER_VERSION,
  } as const;

  it("validates and traces strict prompt compilation", async () => {
    const model: FabricationIntentModel = {
      compileIntent: vi.fn().mockResolvedValue(fixtureIntent()),
    };
    const result = await compileFabricationIntent(
      "Make a winged display.",
      "ff_test_subject",
      model,
    );

    expect(result.intent.intentId).toBe("intent-winged-display");
    expect(result.trace).toMatchObject([
      {
        sequence: 0,
        source: "AI",
        operation: "compile_intent",
        outputId: "intent-winged-display",
      },
    ]);
    expect(model.compileIntent).toHaveBeenCalledWith(
      "Make a winged display.",
      "ff_test_subject",
    );
    await expect(
      compileFabricationIntent("  ", "ff_test_subject", model),
    ).rejects.toThrow();
  });

  it("detects structural duplicates even when identifiers are renamed", () => {
    const first = fixtureProgram();
    const renamed = {
      ...first,
      programId: "program-renamed",
      topologyId: "topology-renamed",
      candidateLabel: "Renamed only",
    };
    expect(programStructureFingerprint(renamed)).toBe(
      programStructureFingerprint(first),
    );
  });

  it("keeps only genuinely distinct generated structures", async () => {
    const base = fixtureProgram();
    const withoutCoupling = {
      ...base,
      programId: "program-without-coupling",
      topologyId: "two-panel-direct-driver",
      blueprint: { ...base.blueprint, couplings: [] },
    };
    const repeated = {
      ...base,
      programId: "program-renamed",
      topologyId: "renamed-but-identical",
    };
    const proposals = [base, withoutCoupling, repeated];
    const model: FabricationProgramModel = {
      generateProgram: vi.fn().mockImplementation((_intent, ordinal: number) =>
        Promise.resolve({
          diversityClaim: `Candidate ${ordinal}`,
          program: proposals[ordinal - 1],
          provenance: proposalProvenance,
        }),
      ),
    };

    const outcomes = await generateDistinctFabricationPrograms(
      fixtureIntent(),
      "ff_test_subject",
      model,
    );

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "generated",
      "generated",
      "rejected",
    ]);
    expect(outcomes[2]).toMatchObject({
      status: "rejected",
      reason: "The model repeated the same normalized structure.",
    });
  });

  it("publishes each completed proposal before a later request fails", async () => {
    const completed: string[] = [];
    const model: FabricationProgramModel = {
      generateProgram: vi
        .fn()
        .mockResolvedValueOnce({
          diversityClaim: "First",
          program: fixtureProgram(),
          provenance: proposalProvenance,
        })
        .mockRejectedValueOnce(new Error("provider failure")),
    };

    await expect(
      generateDistinctFabricationPrograms(
        fixtureIntent(),
        "ff_test_subject",
        model,
        3,
        (outcome) => completed.push(outcome.structureFingerprint),
      ),
    ).rejects.toThrow("provider failure");
    expect(completed).toHaveLength(1);
  });

  it("returns immediately when deterministic verification already passes", async () => {
    const model: FabricationRepairModel = {
      diagnoseRepair: vi.fn().mockRejectedValue(new Error("must not run")),
    };
    const result = await runFabricationRepairLoop(
      fixtureIntent(),
      fixtureProgram(),
      "candidate-wing",
      "ff_test_subject",
      model,
    );

    expect(result.status).toBe("passed");
    expect(result.cycles).toHaveLength(0);
    expect(model.diagnoseRepair).not.toHaveBeenCalled();
    expect(result.trace.map((event) => event.operation)).toEqual([
      "compile_program",
      "verify_candidate",
    ]);
  });

  it("fails closed when a generated program does not belong to the intent", async () => {
    const model: FabricationRepairModel = {
      diagnoseRepair: vi.fn().mockResolvedValue(null),
    };
    const program = { ...fixtureProgram(), intentId: "intent-other" };
    const result = await runFabricationRepairLoop(
      fixtureIntent(),
      program,
      "candidate-invalid",
      "ff_test_subject",
      model,
    );

    expect(result).toMatchObject({
      status: "infeasible",
      ir: null,
      report: null,
    });
    expect(model.diagnoseRepair).not.toHaveBeenCalled();
  });

  it("does not spend a model call on failures with no bounded repair path", async () => {
    const model: FabricationRepairModel = {
      diagnoseRepair: vi.fn().mockRejectedValue(new Error("must not run")),
    };
    const source = fixtureProgram();
    const program = {
      ...source,
      blueprint: {
        ...source.blueprint,
        driver: source.blueprint.driver
          ? { ...source.blueprint.driver, control: "rotate" as const }
          : null,
      },
    };
    const result = await runFabricationRepairLoop(
      fixtureIntent(),
      program,
      "candidate-nonrepairable",
      "ff_test_subject",
      model,
    );

    expect(result).toMatchObject({
      status: "infeasible",
      reason: "No hard verifier failure exposes a bounded repair path.",
    });
    expect(model.diagnoseRepair).not.toHaveBeenCalled();
  });
});
