import { describe, expect, it } from "vitest";

import { buildFabricationCandidate } from "@/core/fabrication/candidate";
import { FABRICATION_PLAN_EXPANDER_VERSION } from "@/core/fabrication/planning";
import { evaluateLiveAcceptance } from "@/server/evals/live-acceptance-evidence";
import {
  LIVE_SOL_ACCEPTANCE_CASE,
  LIVE_SOL_MOTION_ACCEPTANCE_CASE,
} from "@/server/evals/live-readiness-cases";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

describe("live Sol acceptance evidence", () => {
  it("rejects a deterministically valid two-panel L design as the six-panel box", () => {
    const built = buildFabricationCandidate({
      candidateId: "candidate-two-panel-l",
      intent: fixtureIntent(),
      program: fixtureProgram(),
      selectionStatus: "selected",
      provenance: {
        compilerVersion: "live-acceptance-regression",
        generatedAtIso: "2026-07-18T00:00:00.000Z",
        deterministicSeed: 20_260_718,
        modelId: null,
        modelResponseId: null,
        modelPlanHash: null,
        planExpanderVersion: FABRICATION_PLAN_EXPANDER_VERSION,
        parentCandidateId: null,
        appliedPatchIds: [],
        repairCycle: 0,
      },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.verification.valid).toBe(true);
    const contract = LIVE_SOL_ACCEPTANCE_CASE.acceptanceContract;
    if (!contract) throw new Error("Static acceptance contract is missing.");

    const evidence = evaluateLiveAcceptance({
      candidate: built.value,
      consumerValidation: null,
      contract,
    });

    expect(evidence.passed).toBe(false);
    expect(evidence.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "blueprint.panels.length",
          expected: 6,
          observed: 2,
          passed: false,
        }),
        expect.objectContaining({
          field: "blueprint.joints.fold.length",
          expected: 5,
          observed: 1,
          passed: false,
        }),
        expect.objectContaining({
          field: "blueprint.connectors.reciprocalPairs",
          expected: 1,
          observed: 0,
          passed: false,
        }),
        expect.objectContaining({
          field: "semanticParts.lid.panelReference",
          passed: false,
        }),
      ]),
    );
  });

  it("keeps the articulated proof opt-in and structurally exact", () => {
    expect(LIVE_SOL_ACCEPTANCE_CASE.requiredCandidateCount).toBe(1);
    expect(LIVE_SOL_ACCEPTANCE_CASE.acceptanceContract).toMatchObject({
      behavior: "static",
      panels: { length: 6 },
      foldJointCount: 5,
      requiredFoldConnections: { length: 0 },
      connectorPairs: { length: 1 },
      sheet: {
        widthMm: 210,
        heightMm: 297,
        printableMarginMm: 5,
        stockThicknessMm: 0.4,
      },
      homeEnvelopeSpansMm: [70, 95, 25],
    });
    expect(LIVE_SOL_MOTION_ACCEPTANCE_CASE).toMatchObject({
      requiredCandidateCount: 1,
      acceptanceContract: {
        behavior: "flap",
        panels: { length: 2 },
        foldJointCount: 1,
        requiredFoldConnections: { length: 1 },
        connectorPairs: { length: 0 },
        motion: {
          control: "fold",
          minimumValue: 0,
          maximumValue: 90,
          homeValue: 0,
          outputCount: 1,
          baseSampleCount: 201,
        },
        exports: {
          foldExpected: true,
          glbAnimationCount: 1,
          glbMotionSampleCount: 11,
        },
      },
    });
  });
});
