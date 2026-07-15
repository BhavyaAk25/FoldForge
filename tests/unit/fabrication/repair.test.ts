import { describe, expect, it } from "vitest";

import {
  compileFabricationProgram,
  fabricationProgramHash,
} from "@/core/fabrication/compiler";
import { applyProgramPatch, repairInputHash } from "@/core/fabrication/repair";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import type {
  ProgramPatchV1,
  VerificationReportV2,
} from "@/core/fabrication/types";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

const groundedReport = (path: string): VerificationReportV2 => {
  const compiled = compileFabricationProgram(fixtureIntent(), fixtureProgram());
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
  const report = verifyFabricationIr(compiled.value, "candidate-repair");
  return {
    ...report,
    valid: false,
    completedStage: "sheet_packing",
    failedAtStage: "sheet_packing",
    failures: [
      {
        failureId: "packing.sheet_bounds#panel-base",
        category: "manufacturability",
        stage: "sheet_packing",
        severity: "hard",
        message: "Panel exceeds the printable area.",
        actual: { value: -2, unit: "mm" },
        expected: { value: 5, unit: "mm" },
        geometryRefs: [{ kind: "panel", id: "panel-base" }],
        repairableProgramPaths: [path],
      },
    ],
  };
};

const patchFor = (path: string, value: number): ProgramPatchV1 => {
  const program = fixtureProgram();
  return {
    version: "1",
    patchId: "patch-panel",
    programId: program.programId,
    baseProgramHash: fabricationProgramHash(program),
    repairCycle: 1,
    diagnosis: "The panel starts outside the printable margin.",
    operations: [
      {
        operationId: "operation-panel",
        operation: "set_number",
        path,
        value,
        expectedCurrentValue: 80,
        unit: "mm",
        failureIds: ["packing.sheet_bounds#panel-base"],
        reason: "Reduce the panel width.",
        expectedEffect: "The panel should fit inside the printable area.",
      },
    ],
    authoredBy: "ai",
    changesIntent: false,
  };
};

const firstNumberOperation = (
  patch: ProgramPatchV1,
): Extract<
  ProgramPatchV1["operations"][number],
  { operation: "set_number" }
> => {
  const operation = patch.operations[0];
  if (!operation || operation.operation !== "set_number") {
    throw new Error(
      "Expected the fixture patch to contain a number operation.",
    );
  }
  return operation;
};

describe("bounded fabrication program patches", () => {
  it("applies an allowlisted, report-grounded immutable patch", () => {
    const path = "/blueprint/panels/panel-base/widthMm";
    const program = fixtureProgram();
    const patch = patchFor(path, 75);
    const applied = applyProgramPatch(program, patch, groundedReport(path));
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.blueprint.panels[0]?.widthMm).toBe(75);
    expect(program.blueprint.panels[0]?.widthMm).toBe(80);
    expect(repairInputHash(program, groundedReport(path))).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it.each([
    {
      label: "wrong program",
      mutate: (patch: ProgramPatchV1): ProgramPatchV1 => ({
        ...patch,
        programId: "program-other",
      }),
      errorId: "patch.program",
    },
    {
      label: "stale hash",
      mutate: (patch: ProgramPatchV1): ProgramPatchV1 => ({
        ...patch,
        baseProgramHash: "0".repeat(64),
      }),
      errorId: "patch.hash",
    },
    {
      label: "wrong expected value",
      mutate: (patch: ProgramPatchV1): ProgramPatchV1 => ({
        ...patch,
        operations: [
          { ...firstNumberOperation(patch), expectedCurrentValue: 79 },
        ],
      }),
      errorId: "patch.expected_value",
    },
    {
      label: "unknown failure",
      mutate: (patch: ProgramPatchV1): ProgramPatchV1 => ({
        ...patch,
        operations: [
          {
            ...firstNumberOperation(patch),
            failureIds: ["packing.other#panel-base"],
          },
        ],
      }),
      errorId: "patch.failure_reference",
    },
    {
      label: "wrong unit",
      mutate: (patch: ProgramPatchV1): ProgramPatchV1 => ({
        ...patch,
        operations: [{ ...firstNumberOperation(patch), unit: "deg" }],
      }),
      errorId: "patch.unit",
    },
  ])("rejects $label", ({ mutate, errorId }) => {
    const path = "/blueprint/panels/panel-base/widthMm";
    const result = applyProgramPatch(
      fixtureProgram(),
      mutate(patchFor(path, 75)),
      groundedReport(path),
    );
    expect(result).toMatchObject({ ok: false, error: { id: errorId } });
  });

  it("rejects duplicate, ungrounded, unknown, and malformed operations", () => {
    const path = "/blueprint/panels/panel-base/widthMm";
    const patch = patchFor(path, 75);
    const duplicate = applyProgramPatch(
      fixtureProgram(),
      {
        ...patch,
        operations: [firstNumberOperation(patch), firstNumberOperation(patch)],
      },
      groundedReport(path),
    );
    expect(duplicate).toMatchObject({
      ok: false,
      error: { id: "patch.duplicate" },
    });

    const differentPath = "/blueprint/panels/panel-base/heightMm";
    const ungrounded = applyProgramPatch(
      fixtureProgram(),
      {
        ...patch,
        operations: [
          {
            ...firstNumberOperation(patch),
            path: differentPath,
            expectedCurrentValue: 60,
          },
        ],
      },
      groundedReport(path),
    );
    expect(ungrounded).toMatchObject({
      ok: false,
      error: { id: "patch.ungrounded" },
    });

    const unknownPath = "/blueprint/panels/missing/widthMm";
    const unknown = applyProgramPatch(
      fixtureProgram(),
      {
        ...patch,
        operations: [
          {
            ...firstNumberOperation(patch),
            path: unknownPath,
          },
        ],
      },
      groundedReport(unknownPath),
    );
    expect(unknown).toMatchObject({ ok: false, error: { id: "patch.path" } });

    expect(
      applyProgramPatch(
        fixtureProgram(),
        { ...patch, unexpected: true },
        groundedReport(path),
      ),
    ).toMatchObject({ ok: false, error: { id: "patch.schema" } });
  });

  it("updates one coupling without mutating an unrelated coupling", () => {
    const base = fixtureProgram();
    const first = base.blueprint.couplings[0];
    if (!first || first.kind !== "direct_ratio") {
      throw new Error("Direct coupling fixture missing.");
    }
    const program = {
      ...base,
      blueprint: {
        ...base.blueprint,
        couplings: [
          first,
          { ...first, couplingId: "coupling-unrelated", ratio: 0.5 },
        ],
      },
    };
    const path = "/blueprint/couplings/coupling-wing/ratio";
    const patch = patchFor(path, 0.9);
    const result = applyProgramPatch(
      program,
      {
        ...patch,
        baseProgramHash: fabricationProgramHash(program),
        operations: [
          {
            ...firstNumberOperation(patch),
            path,
            value: 0.9,
            expectedCurrentValue: 1,
            unit: "ratio",
          },
        ],
      },
      groundedReport(path),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.blueprint.couplings[1]).toMatchObject({
        couplingId: "coupling-unrelated",
        ratio: 0.5,
      });
    }
  });
});
