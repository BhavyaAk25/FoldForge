import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { stableHash } from "@/core/canonical";
import { DEMO_CONSTRAINT } from "@/core/constraints";
import { exportFold } from "@/core/export/fold";
import { exportSvg } from "@/core/export/svg";
import { buildStandGeometry } from "@/core/geometry";
import type { CandidateParameters } from "@/core/schemas";
import type { Candidate } from "@/core/types";
import { verifyCandidate } from "@/core/verification";

const runs = Number(process.env.FC_NUM_RUNS ?? 300);
const seed = Number(process.env.FC_SEED ?? 20260714);

const parametersArbitrary: fc.Arbitrary<CandidateParameters> = fc.record({
  baseDepthMm: fc.double({ min: 45, max: 130, noNaN: true }),
  standWidthMm: fc.double({ min: 60, max: 160, noNaN: true }),
  backrestRiseMm: fc.double({ min: 35, max: 90, noNaN: true }),
  backrestAngleDeg: fc.double({ min: 50, max: 75, noNaN: true }),
  frontToeDepthMm: fc.double({ min: 7, max: 22, noNaN: true }),
  lipHeightMm: fc.double({ min: 8, max: 18, noNaN: true }),
  tabDepthMm: fc.double({ min: 8, max: 12, noNaN: true }),
  tabWidthMm: fc.double({ min: 16, max: 28, noNaN: true }),
  slotClearanceMm: fc.double({ min: 0.4, max: 1.2, noNaN: true }),
  panelClearanceMm: fc.double({ min: 0.4, max: 1.5, noNaN: true }),
  lockingStyle: fc.constant("dual_tabs" as const),
});

describe("geometry properties", () => {
  it("is finite, deterministic, serializable, and exception-free in range", () => {
    fc.assert(
      fc.property(parametersArbitrary, (parameters) => {
        const geometry = buildStandGeometry(parameters);
        const candidate: Candidate = {
          id: `property-${stableHash(parameters)}`,
          strategy: "balanced",
          variant: 0,
          seed,
          parameters,
          geometry,
        };
        const repeat = buildStandGeometry(parameters);
        const report = verifyCandidate(candidate, DEMO_CONSTRAINT);
        const svg = exportSvg(candidate, DEMO_CONSTRAINT);
        const fold = exportFold(candidate);

        expect(geometry).toEqual(repeat);
        expect(svg).toBe(exportSvg(candidate, DEMO_CONSTRAINT));
        expect(fold).toBe(exportFold(candidate));
        expect(Number.isFinite(geometry.derived.flatLengthMm)).toBe(true);
        expect(geometry.flat.outline.points.length).toBeGreaterThan(3);
        expect(geometry.flat.creases).toHaveLength(5);
        expect(geometry.flat.slots).toHaveLength(2);
        expect(report.scoreBreakdown.total).toBeGreaterThanOrEqual(0);
        expect(report.scoreBreakdown.total).toBeLessThanOrEqual(100);
      }),
      { numRuns: runs, seed },
    );
  });
});
