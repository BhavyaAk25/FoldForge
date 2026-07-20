import { describe, expect, it } from "vitest";

import {
  fabricationProgramResourceCounts,
  semanticPlanResourceCounts,
} from "@/core/fabrication/resource-counts";
import { fixtureProgram } from "../../fixtures/fabrication";
import { fixtureLiveAcceptancePlan } from "../../fixtures/semantic-plan";

describe("fabrication resource counts", () => {
  it("counts two compiled connectors for every semantic relationship", () => {
    const source = fixtureLiveAcceptancePlan();
    const plan = {
      ...source,
      connectorRelationships: Array.from({ length: 3 }, (_, index) => ({
        ...source.connectorRelationships[0]!,
        key: `closure-${index + 1}`,
      })),
    };

    expect(semanticPlanResourceCounts(plan)).toEqual({
      panelCount: 6,
      jointCount: 5,
      connectorRelationshipCount: 3,
      expandedConnectorCount: 6,
      mechanismFeatureCount: 11,
    });
  });

  it("uses the same combined mechanism definition for compiled programs", () => {
    const counts = fabricationProgramResourceCounts(fixtureProgram());
    expect(counts.mechanismFeatureCount).toBe(
      counts.jointCount + counts.connectorCount,
    );
  });
});
