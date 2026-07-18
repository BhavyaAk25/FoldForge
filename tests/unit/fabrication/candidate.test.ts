import { describe, expect, it } from "vitest";
import { z } from "zod";

import { canonicalSerialize } from "@/core/canonical";
import {
  buildFabricationCandidate,
  finalizeFabricationCandidate,
  type CandidateProvenanceInput,
} from "@/core/fabrication/candidate";
import { CandidateV2Schema } from "@/core/fabrication/schemas";
import type {
  CandidateV2,
  FabricationPathV1,
  FabricationProgramV1,
} from "@/core/fabrication/types";
import { sha256Hex, sha256HexBytes } from "@/core/sha256";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

const provenanceInput = {
  compilerVersion: "foldforge-core-1",
  generatedAtIso: "2026-07-14T12:00:00.000Z",
  deterministicSeed: 2_026_071_4,
  modelId: "gpt-5.6-sol",
  modelResponseId: "response-candidate-fixture",
  modelPlanHash: "a".repeat(64),
  planExpanderVersion: "1",
  parentCandidateId: null,
  appliedPatchIds: [],
  repairCycle: 0,
} as const satisfies CandidateProvenanceInput;

const candidateFrom = (
  selectionStatus: "eligible" | "selected" = "selected",
): CandidateV2 => {
  const result = buildFabricationCandidate({
    candidateId: "candidate-finalization-fixture",
    intent: fixtureIntent(),
    program: fixtureProgram(),
    selectionStatus,
    provenance: provenanceInput,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

const required = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) throw new Error(message);
  return value;
};

const artifactText = (artifact: { readonly text?: string }): string => {
  if (artifact.text === undefined) throw new Error("Text artifact required.");
  return artifact.text;
};

describe("fabrication candidate finalization", () => {
  it("builds repeatable candidates with hashes bound to exact normalized inputs", () => {
    const first = candidateFrom();
    const second = candidateFrom();
    const intent = fixtureIntent();
    const program = fixtureProgram();

    expect(canonicalSerialize(first)).toBe(canonicalSerialize(second));
    expect(CandidateV2Schema.safeParse(first).success).toBe(true);
    expect(first.verification.valid).toBe(true);
    expect(first.score).toMatchObject({ eligible: true });
    expect(first.provenance).toMatchObject({
      inputHash: sha256Hex(canonicalSerialize({ intent, program })),
      intentHash: sha256Hex(canonicalSerialize(intent)),
      programHash: sha256Hex(canonicalSerialize(program)),
      irHash: first.verification.irHash,
      generatedAtIso: provenanceInput.generatedAtIso,
      deterministicSeed: provenanceInput.deterministicSeed,
    });
    expect(first.exportMetadata).toMatchObject({
      status: "not_generated",
      selectedCandidateId: first.candidateId,
      sourceEquivalent: false,
    });
  });

  it("rejects a compiled candidate that fails deterministic verification", () => {
    const program = fixtureProgram();
    const base = required(
      program.blueprint.panels[0],
      "Base panel fixture missing.",
    );
    const wing = required(
      program.blueprint.panels[1],
      "Wing panel fixture missing.",
    );
    const invalidProgram: FabricationProgramV1 = {
      ...program,
      blueprint: {
        ...program.blueprint,
        panels: [
          base,
          {
            ...wing,
            flatTransform: {
              ...wing.flatTransform,
              translationMm: { xMm: 100, yMm: 90 },
            },
          },
        ],
      },
    };
    const result = buildFabricationCandidate({
      candidateId: "candidate-invalid",
      intent: fixtureIntent(),
      program: invalidProgram,
      selectionStatus: "selected",
      provenance: provenanceInput,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("verification_failed");
      if (result.error.kind === "verification_failed") {
        expect(result.error.report.valid).toBe(false);
        expect(result.error.report.failedAtStage).not.toBeNull();
      }
    }
  });

  it("rejects a verification stamp copied across a mutated IR", () => {
    const candidate = candidateFrom();
    const firstPath = required(
      candidate.ir.paths[0],
      "Compiled path fixture missing.",
    );
    const firstPoint = required(firstPath.points[0], "Path point missing.");
    const mutatedPath: FabricationPathV1 = {
      ...firstPath,
      points: [
        { ...firstPoint, xMm: firstPoint.xMm + 0.25 },
        ...firstPath.points.slice(1),
      ],
    };
    const stampedForAnotherIr: CandidateV2 = {
      ...candidate,
      ir: {
        ...candidate.ir,
        paths: [mutatedPath, ...candidate.ir.paths.slice(1)],
      },
    };
    const result = finalizeFabricationCandidate({
      candidate: stampedForAnotherIr,
      requestedFormats: ["svg"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        kind: "candidate_binding",
        reason: "verification_ir_hash_mismatch",
      });
    }
  });

  it("refuses to export a valid candidate until it is explicitly selected", () => {
    const candidate = candidateFrom("eligible");
    const result = finalizeFabricationCandidate({
      candidate,
      requestedFormats: ["svg"],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "candidate_not_selected",
        candidateId: candidate.candidateId,
        selectionStatus: "eligible",
      },
    });
  });

  it("generates only requested core formats and records verified artifact hashes", () => {
    const candidate = candidateFrom();
    const requestedFormats = ["svg", "dxf", "glb", "json"] as const;
    const first = finalizeFabricationCandidate({
      candidate,
      requestedFormats,
    });
    const second = finalizeFabricationCandidate({
      candidate,
      requestedFormats,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.value.artifacts.map((artifact) => artifact.format)).toEqual(
      requestedFormats,
    );
    expect(first.value.artifacts.map((artifact) => artifact.bytes)).toEqual(
      second.value.artifacts.map((artifact) => artifact.bytes),
    );
    expect(canonicalSerialize(first.value.candidate)).toBe(
      canonicalSerialize(second.value.candidate),
    );
    expect(first.value.candidate.exportMetadata).toMatchObject({
      status: "verified",
      requestedFormats,
      selectedCandidateId: candidate.candidateId,
      sourceEquivalent: true,
      foldOmissionReason: null,
    });
    expect(
      first.value.artifacts.every(
        (artifact) =>
          artifact.metadata.sha256 === sha256HexBytes(artifact.bytes) &&
          artifact.metadata.sourceIrHash === candidate.verification.irHash &&
          artifact.metadata.sourceCandidateId === candidate.candidateId,
      ),
    ).toBe(true);
    expect(
      first.value.candidate.verification.exportEquivalence.map(
        (check) => check.format,
      ),
    ).toEqual(requestedFormats);
    expect(
      first.value.candidate.verification.exportEquivalence.every(
        (check) => check.status === "pass",
      ),
    ).toBe(true);

    const jsonArtifact = required(
      first.value.artifacts.find((artifact) => artifact.format === "json"),
      "JSON artifact missing.",
    );
    const jsonDocument: unknown = JSON.parse(artifactText(jsonArtifact));
    const parsedJson = z
      .object({
        payload: z.object({
          verification: z.unknown(),
          provenance: z.unknown(),
        }),
      })
      .parse(jsonDocument);
    expect(canonicalSerialize(parsedJson.payload.verification)).toBe(
      canonicalSerialize(first.value.candidate.verification),
    );
    expect(canonicalSerialize(parsedJson.payload.provenance)).toBe(
      canonicalSerialize(first.value.candidate.provenance),
    );
  });

  it("rejects duplicate requested formats instead of producing ambiguous metadata", () => {
    const result = finalizeFabricationCandidate({
      candidate: candidateFrom(),
      requestedFormats: ["svg", "svg"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_export_request");
    }
  });

  it("records an honest FOLD omission without failing the source-equivalent pack", () => {
    const result = finalizeFabricationCandidate({
      candidate: candidateFrom(),
      requestedFormats: ["svg", "fold"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.artifacts.map((artifact) => artifact.format)).toEqual([
      "svg",
    ]);
    expect(result.value.foldOmission).toMatchObject({
      code: "coupling_semantics",
      sourceCandidateId: result.value.candidate.candidateId,
      sourceIrHash: result.value.candidate.verification.irHash,
    });
    expect(result.value.candidate.exportMetadata).toMatchObject({
      status: "verified",
      requestedFormats: ["svg", "fold"],
      sourceEquivalent: true,
    });
    expect(result.value.candidate.exportMetadata.foldOmissionReason).toContain(
      "coupling",
    );
  });
});
