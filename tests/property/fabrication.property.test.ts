import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { canonicalSerialize } from "@/core/canonical";
import { compileFabricationProgram } from "@/core/fabrication/compiler";
import { createModularCableOrganizerShowcase } from "@/core/fabrication/examples";
import { verifyFabricationIr } from "@/core/fabrication/verification";

const runs = Number(process.env.FC_NUM_RUNS ?? 100);
const seed = Number(process.env.FC_SEED ?? 20_260_714);
const PROPERTY_TIMEOUT_MS = 60_000;
const showcase = createModularCableOrganizerShowcase();

describe("fabrication compiler properties", () => {
  it(
    "preserves validity and repeatability when verified sheet slack grows",
    () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
          (slackMm) => {
            const sheets = showcase.program.sheets.map((sheet) => ({
              ...sheet,
              widthMm: sheet.widthMm + slackMm,
              heightMm: sheet.heightMm + slackMm,
            }));
            const intent = { ...showcase.intent, stockOptions: sheets };
            const program = { ...showcase.program, sheets };
            const first = compileFabricationProgram(intent, program);
            const second = compileFabricationProgram(intent, program);
            expect(first.ok).toBe(true);
            expect(second.ok).toBe(true);
            if (!first.ok || !second.ok) return;
            expect(canonicalSerialize(first.value)).toBe(
              canonicalSerialize(second.value),
            );
            expect(
              verifyFabricationIr(first.value, "property-valid").valid,
            ).toBe(true);
          },
        ),
        { numRuns: runs, seed },
      );
    },
    PROPERTY_TIMEOUT_MS,
  );

  it(
    "never labels a panel outside a shrunken sheet as valid",
    () => {
      fc.assert(
        fc.property(
          fc.double({
            min: 40,
            max: 100,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          (sheetWidthMm) => {
            const sheets = showcase.program.sheets.map((sheet) => ({
              ...sheet,
              widthMm: sheetWidthMm,
            }));
            const compiled = compileFabricationProgram(
              { ...showcase.intent, stockOptions: sheets },
              { ...showcase.program, sheets },
            );
            expect(compiled.ok).toBe(true);
            if (!compiled.ok) return;
            const report = verifyFabricationIr(
              compiled.value,
              "property-invalid",
            );
            expect(report.valid).toBe(false);
            expect(report.failedAtStage).toBe("sheet_packing");
          },
        ),
        { numRuns: runs, seed: seed + 1 },
      );
    },
    PROPERTY_TIMEOUT_MS,
  );
});
