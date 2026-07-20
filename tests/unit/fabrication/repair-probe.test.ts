import { describe, expect, it } from "vitest";

import { compileFabricationProgram } from "@/core/fabrication/compiler";
import { createOfflineFabricationShowcases } from "@/core/fabrication/examples";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import { createMotionRangeRepairProbe } from "@/server/evals/repair-probe";

describe("paid repair evidence probe", () => {
  it("creates a real measured motion failure on an allowlisted repair path", () => {
    const flower = createOfflineFabricationShowcases()[2];
    if (!flower) throw new Error("The moving showcase is unavailable.");
    const probe = createMotionRangeRepairProbe(flower.program);
    const compiled = compileFabricationProgram(flower.intent, probe.program);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const report = verifyFabricationIr(compiled.value, "repair-probe");
    expect(report.valid).toBe(false);
    expect(report.failedAtStage).toBe("motion");
    expect(report.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          failureId: expect.stringMatching(/^motion\.sample#/u),
          repairableProgramPaths: expect.arrayContaining([probe.mutation.path]),
        }),
      ]),
    );
  });
});
