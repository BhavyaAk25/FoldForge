import { describe, expect, it } from "vitest";

import { compileFabricationProgram } from "@/core/fabrication/compiler";
import { createModularCableOrganizerShowcase } from "@/core/fabrication/examples";
import {
  rankFabricationCandidates,
  scoreFabricationCandidate,
  topologyDiversityRatio,
} from "@/core/fabrication/scoring";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

const evaluatedFixture = (candidateId: string) => {
  const intent = fixtureIntent();
  const compiled = compileFabricationProgram(intent, fixtureProgram());
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
  const report = verifyFabricationIr(compiled.value, candidateId);
  const score = scoreFabricationCandidate(compiled.value, report, intent);
  return { intent, ir: compiled.value, report, score };
};

describe("fabrication scoring and ranking", () => {
  it("scores only fully verified candidates with normalized weights", () => {
    const result = evaluatedFixture("candidate-score");
    expect(result.report.valid).toBe(true);
    expect(result.score.eligible).toBe(true);
    expect(result.score.totalScore).toBeGreaterThan(0);
    expect(result.score.components).toHaveLength(6);
    expect(
      result.score.components.reduce(
        (sum, component) => sum + component.weight,
        0,
      ),
    ).toBeCloseTo(1);
    expect(
      result.score.components.every(
        (component) =>
          component.normalizedScore >= 0 && component.normalizedScore <= 100,
      ),
    ).toBe(true);
  });

  it("makes hard-invalid candidates ineligible", () => {
    const result = evaluatedFixture("candidate-invalid");
    const score = scoreFabricationCandidate(
      result.ir,
      { ...result.report, valid: false, failedAtStage: "collision" },
      result.intent,
    );
    expect(score).toEqual({
      eligible: false,
      totalScore: null,
      components: [],
      rankingReason: null,
    });
  });

  it("scores actual remaining material instead of the outer shell area", () => {
    const showcase = createModularCableOrganizerShowcase();
    const withCutouts = compileFabricationProgram(
      showcase.intent,
      showcase.program,
    );
    const solidProgram = {
      ...showcase.program,
      blueprint: {
        ...showcase.program.blueprint,
        panels: showcase.program.blueprint.panels.map((panel) => ({
          ...panel,
          innerCutContours: [],
        })),
        semanticParts: showcase.program.blueprint.semanticParts.map((part) => {
          const geometryRefs = part.geometryRefs.filter(
            (ref) =>
              ref.kind !== "path" ||
              !ref.id.startsWith("panel-organizer-module.cut.inner-"),
          );
          return {
            ...part,
            geometryRefs:
              geometryRefs.length > 0
                ? geometryRefs
                : [
                    {
                      kind: "panel" as const,
                      id: "panel-organizer-module",
                    },
                  ],
          };
        }),
      },
    };
    const solid = compileFabricationProgram(showcase.intent, solidProgram);
    if (!withCutouts.ok || !solid.ok) {
      throw new Error("Organizer scoring fixtures must compile.");
    }
    const cutoutReport = verifyFabricationIr(
      withCutouts.value,
      "candidate-material-cutouts",
    );
    const solidReport = verifyFabricationIr(
      solid.value,
      "candidate-material-solid",
    );
    const cutoutScore = scoreFabricationCandidate(
      withCutouts.value,
      cutoutReport,
      showcase.intent,
    );
    const solidScore = scoreFabricationCandidate(
      solid.value,
      solidReport,
      showcase.intent,
    );
    const efficiency = (score: typeof cutoutScore): number | undefined =>
      score.components.find(
        (component) => component.componentId === "fabrication_efficiency",
      )?.normalizedScore;
    expect(cutoutReport.valid).toBe(true);
    expect(solidReport.valid).toBe(true);
    expect(efficiency(cutoutScore)).not.toBe(efficiency(solidScore));
  });

  it("rejects a valid report borrowed from a different IR", () => {
    const result = evaluatedFixture("candidate-borrowed-report");
    const basePanel = result.ir.panels[0];
    if (!basePanel) throw new Error("Fixture panel missing.");
    const alteredIr = {
      ...result.ir,
      panels: [
        {
          ...basePanel,
          contour: {
            vertices: [
              { xMm: 0, yMm: 0 },
              { xMm: 80, yMm: 60 },
              { xMm: 0, yMm: 60 },
              { xMm: 80, yMm: 0 },
            ],
          },
        },
        ...result.ir.panels.slice(1),
      ],
    };
    const score = scoreFabricationCandidate(
      alteredIr,
      result.report,
      result.intent,
    );
    expect(score).toEqual({
      eligible: false,
      totalScore: null,
      components: [],
      rankingReason: null,
    });
  });

  it("ranks deterministically and reports topology diversity", () => {
    const first = evaluatedFixture("candidate-a");
    const second = evaluatedFixture("candidate-b");
    const candidates = [
      {
        candidateId: "candidate-b",
        topologyId: "topology-b",
        ir: second.ir,
        report: second.report,
        score: { ...second.score, totalScore: 70 },
      },
      {
        candidateId: "candidate-a",
        topologyId: "topology-a",
        ir: first.ir,
        report: first.report,
        score: { ...first.score, totalScore: 90 },
      },
    ];
    expect(rankFabricationCandidates(candidates)).toEqual([
      {
        candidateId: "candidate-a",
        rank: 1,
        recommended: true,
        totalScore: 90,
      },
      {
        candidateId: "candidate-b",
        rank: 2,
        recommended: false,
        totalScore: 70,
      },
    ]);
    expect(topologyDiversityRatio(candidates)).toBe(1);
    expect(
      topologyDiversityRatio(
        candidates.map((candidate) => ({
          ...candidate,
          topologyId: "same-topology",
        })),
      ),
    ).toBe(0.5);
  });
});
