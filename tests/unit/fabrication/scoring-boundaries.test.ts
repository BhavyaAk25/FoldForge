import { describe, expect, it } from "vitest";

import {
  compileFabricationProgram,
  fabricationIrHash,
} from "@/core/fabrication/compiler";
import {
  rankFabricationCandidates,
  scoreFabricationCandidate,
  topologyDiversityRatio,
} from "@/core/fabrication/scoring";
import type { FabricationIRV1 } from "@/core/fabrication/types";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

const evaluated = (candidateId: string) => {
  const intent = fixtureIntent();
  const compiled = compileFabricationProgram(intent, fixtureProgram());
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
  const report = verifyFabricationIr(compiled.value, candidateId);
  if (!report.valid) throw new Error(JSON.stringify(report.failures));
  const score = scoreFabricationCandidate(compiled.value, report, intent);
  return { intent, ir: compiled.value, report, score };
};

describe("fabrication scoring boundary behavior", () => {
  it("scores zero-area, zero-printable-area, dynamic, and millimetre outputs", () => {
    const base = evaluated("candidate-score-boundaries");
    const emptyGeometry: FabricationIRV1 = {
      ...base.ir,
      panels: [],
      sheets: base.ir.sheets.map((sheet) => ({
        ...sheet,
        widthMm: sheet.printableMarginMm * 2,
        heightMm: sheet.printableMarginMm * 2,
      })),
      behavior: "open_close",
      outputs: [],
    };
    const emptyReport = {
      ...base.report,
      candidateId: "candidate-empty-score",
      programId: emptyGeometry.programId,
      irId: emptyGeometry.irId,
      irHash: fabricationIrHash(emptyGeometry),
    };
    const emptyScore = scoreFabricationCandidate(
      emptyGeometry,
      emptyReport,
      base.intent,
    );
    expect(emptyScore.eligible).toBe(true);
    expect(emptyScore.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentId: "fabrication_efficiency",
          normalizedScore: 0,
        }),
        expect.objectContaining({
          componentId: "compactness",
          normalizedScore: 0,
        }),
        expect.objectContaining({
          componentId: "stability",
          normalizedScore: 0,
        }),
        expect.objectContaining({
          componentId: "motion_range",
          normalizedScore: 0,
        }),
      ]),
    );

    const millimetreOutputIr: FabricationIRV1 = {
      ...base.ir,
      behavior: "slide",
      outputs: base.ir.outputs.map((output) => ({
        ...output,
        minimumValue: 0,
        maximumValue: 250,
        unit: "mm" as const,
      })),
    };
    const dynamicReport = {
      ...base.report,
      candidateId: "candidate-dynamic-score",
      programId: millimetreOutputIr.programId,
      irId: millimetreOutputIr.irId,
      irHash: fabricationIrHash(millimetreOutputIr),
    };
    const dynamicScore = scoreFabricationCandidate(
      millimetreOutputIr,
      dynamicReport,
      { ...base.intent, behavior: "slide" },
    );
    expect(dynamicScore.components).toContainEqual(
      expect.objectContaining({
        componentId: "motion_range",
        normalizedScore: 100,
      }),
    );
  });

  it("filters borrowed IDs and ineligible scores before ranking", () => {
    const first = evaluated("candidate-filter-a");
    const second = evaluated("candidate-filter-b");
    const candidates = [
      {
        candidateId: "candidate-filter-a",
        topologyId: "z-topology",
        ir: first.ir,
        report: first.report,
        score: { ...first.score, totalScore: 80 },
      },
      {
        candidateId: "candidate-filter-b",
        topologyId: "a-topology",
        ir: second.ir,
        report: second.report,
        score: { ...second.score, totalScore: 80 },
      },
      {
        candidateId: "borrowed-id",
        topologyId: "invalid-topology",
        ir: first.ir,
        report: first.report,
        score: first.score,
      },
      {
        candidateId: "candidate-ineligible",
        topologyId: "invalid-score",
        ir: first.ir,
        report: { ...first.report, candidateId: "candidate-ineligible" },
        score: { ...first.score, eligible: false, totalScore: null },
      },
    ];
    const ranked = rankFabricationCandidates(candidates);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]).toMatchObject({
      candidateId: "candidate-filter-a",
      recommended: true,
    });
    expect(ranked[1]).toMatchObject({
      candidateId: "candidate-filter-b",
      recommended: false,
    });
    expect(topologyDiversityRatio([])).toBe(1);
    expect(topologyDiversityRatio(candidates)).toBe(1);
  });
});
