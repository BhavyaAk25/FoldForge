import { describe, expect, it } from "vitest";

import {
  buildFabricationCandidate,
  finalizeFabricationCandidate,
  validateFabricationCandidateBinding,
  type CandidateProvenanceInput,
} from "@/core/fabrication/candidate";
import { fabricationIrHash } from "@/core/fabrication/compiler";
import type {
  CandidateV2,
  ExportFormat,
  FabricationProgramV1,
} from "@/core/fabrication/types";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

const provenance = {
  compilerVersion: " foldforge-core-1 ",
  generatedAtIso: "2026-07-14T12:00:00.000Z",
  deterministicSeed: 7,
  modelId: null,
  modelResponseId: null,
  parentCandidateId: null,
  appliedPatchIds: [],
  repairCycle: 0,
} as const satisfies CandidateProvenanceInput;

const buildSelected = (): CandidateV2 => {
  const result = buildFabricationCandidate({
    candidateId: "candidate-boundary",
    intent: fixtureIntent(),
    program: fixtureProgram(),
    selectionStatus: "selected",
    provenance,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

describe("fabrication candidate boundary behavior", () => {
  it("rejects malformed intent and program contracts before compilation", () => {
    const malformedIntent = buildFabricationCandidate({
      candidateId: "candidate-bad-intent",
      intent: { ...fixtureIntent(), version: "99" },
      program: fixtureProgram(),
      provenance,
    });
    expect(malformedIntent).toMatchObject({
      ok: false,
      error: { kind: "contract_validation", contract: "FabricationIntentV1" },
    });

    const malformedProgram = buildFabricationCandidate({
      candidateId: "candidate-bad-program",
      intent: fixtureIntent(),
      program: { ...fixtureProgram(), surprise: true },
      provenance,
    });
    expect(malformedProgram).toMatchObject({
      ok: false,
      error: { kind: "contract_validation", contract: "FabricationProgramV1" },
    });
  });

  it("returns deterministic compiler errors and default selection metadata", () => {
    const mismatchedProgram: FabricationProgramV1 = {
      ...fixtureProgram(),
      intentId: "intent-other",
    };
    const mismatch = buildFabricationCandidate({
      candidateId: "candidate-mismatch",
      intent: fixtureIntent(),
      program: mismatchedProgram,
      provenance,
    });
    expect(mismatch).toMatchObject({
      ok: false,
      error: { kind: "invalid_reference" },
    });

    const eligible = buildFabricationCandidate({
      candidateId: "candidate-defaults",
      intent: fixtureIntent(),
      program: fixtureProgram(),
      provenance,
    });
    expect(eligible).toMatchObject({
      ok: true,
      value: {
        rank: null,
        selectionStatus: "eligible",
        provenance: {
          compilerVersion: "foldforge-core-1",
          modelId: null,
          modelResponseId: null,
        },
        exportMetadata: { selectedCandidateId: null },
      },
    });
  });

  it("rejects malformed candidates and every reproducible binding mismatch", () => {
    const candidate = buildSelected();
    const malformed = validateFabricationCandidateBinding({
      ...candidate,
      version: "invalid",
    } as unknown as CandidateV2);
    expect(malformed).toMatchObject({
      ok: false,
      error: { kind: "contract_validation", contract: "CandidateV2" },
    });

    const firstJoint = candidate.program.blueprint.joints[0];
    if (!firstJoint) throw new Error("Joint fixture missing.");
    const uncompileable: CandidateV2 = {
      ...candidate,
      program: {
        ...candidate.program,
        blueprint: {
          ...candidate.program.blueprint,
          joints: [{ ...firstJoint, parentBodyId: "body-missing" }],
        },
      },
    };
    expect(validateFabricationCandidateBinding(uncompileable)).toMatchObject({
      ok: false,
      error: { kind: "invalid_reference" },
    });

    const compiledIrMismatch = {
      ...candidate,
      ir: { ...candidate.ir, irId: "ir-mutated" },
      verification: {
        ...candidate.verification,
        irId: "ir-mutated",
        irHash: fabricationIrHash({ ...candidate.ir, irId: "ir-mutated" }),
      },
      provenance: {
        ...candidate.provenance,
        irHash: fabricationIrHash({ ...candidate.ir, irId: "ir-mutated" }),
      },
    } satisfies CandidateV2;
    expect(
      validateFabricationCandidateBinding(compiledIrMismatch),
    ).toMatchObject({
      ok: false,
      error: { kind: "candidate_binding", reason: "compiled_ir_mismatch" },
    });

    const provenanceMismatch: CandidateV2 = {
      ...candidate,
      provenance: {
        ...candidate.provenance,
        compilerVersion: "different-compiler",
      },
    };
    expect(
      validateFabricationCandidateBinding(provenanceMismatch),
    ).toMatchObject({
      ok: false,
      error: { kind: "candidate_binding", reason: "provenance_mismatch" },
    });

    const reportMismatch: CandidateV2 = {
      ...candidate,
      verification: {
        ...candidate.verification,
        reportId: "report-mutated",
      },
    };
    expect(validateFabricationCandidateBinding(reportMismatch)).toMatchObject({
      ok: false,
      error: {
        kind: "candidate_binding",
        reason: "verification_report_mismatch",
      },
    });

    const scoreMismatch: CandidateV2 = {
      ...candidate,
      score: {
        ...candidate.score,
        totalScore: Math.max(0, (candidate.score.totalScore ?? 1) - 1),
      },
    };
    expect(validateFabricationCandidateBinding(scoreMismatch)).toMatchObject({
      ok: false,
      error: { kind: "candidate_binding", reason: "score_mismatch" },
    });
  });

  it("rejects invalid selections and unsupported runtime export formats", () => {
    const candidate = buildSelected();
    const invalidCandidate: CandidateV2 = {
      ...candidate,
      selectionStatus: "invalid",
      verification: {
        ...candidate.verification,
        valid: false,
        completedStage: "schema",
        failedAtStage: "schema",
      },
      score: {
        eligible: false,
        totalScore: null,
        components: [],
        rankingReason: null,
      },
    };
    expect(
      finalizeFabricationCandidate({
        candidate: invalidCandidate,
        requestedFormats: [],
      }),
    ).toMatchObject({
      ok: false,
      error: { kind: "invalid_candidate_selection" },
    });

    expect(
      finalizeFabricationCandidate({
        candidate,
        requestedFormats: ["pdf" as ExportFormat],
      }),
    ).toMatchObject({
      ok: false,
      error: { kind: "invalid_export_request" },
    });
  });

  it("accepts an empty export pack and deterministic GLB export", () => {
    const candidate = buildSelected();
    const empty = finalizeFabricationCandidate({
      candidate,
      requestedFormats: [],
    });
    expect(empty).toMatchObject({
      ok: true,
      value: {
        artifacts: [],
        foldOmission: null,
        candidate: {
          exportMetadata: {
            status: "verified",
            requestedFormats: [],
            sourceEquivalent: true,
          },
        },
      },
    });

    const glb = finalizeFabricationCandidate({
      candidate,
      requestedFormats: ["glb"],
    });
    expect(glb).toMatchObject({
      ok: true,
      value: { artifacts: [{ format: "glb" }] },
    });
  });
});
