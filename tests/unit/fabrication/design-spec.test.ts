import { describe, expect, it } from "vitest";

import { FabricationDesignSpecV3Schema } from "@/core/fabrication/design-spec";
import { fixtureHomepageCardBoxDesignSpec } from "../../fixtures/design-spec";

describe("FabricationDesignSpecV3 contract", () => {
  it("accepts the topology-free homepage card-box specification", () => {
    expect(
      FabricationDesignSpecV3Schema.safeParse(
        fixtureHomepageCardBoxDesignSpec(),
      ).success,
    ).toBe(true);
  });

  it.each([
    ["topologyKey", "model-topology"],
    ["groundedRoot", "base"],
    ["packing", { sheetIndex: 0 }],
    ["foldSign", "mountain"],
    ["connectorEdgeIndex", 2],
    ["globalTransform", { xMm: 0, yMm: 0, zMm: 0 }],
  ])("rejects model-authored %s", (field, value) => {
    const spec = { ...fixtureHomepageCardBoxDesignSpec(), [field]: value };
    expect(FabricationDesignSpecV3Schema.safeParse(spec).success).toBe(false);
  });

  it("rejects topology fields nested inside semantic parts", () => {
    const spec = fixtureHomepageCardBoxDesignSpec();
    expect(
      FabricationDesignSpecV3Schema.safeParse({
        ...spec,
        parts: [
          { ...spec.parts[0]!, bodyKey: "model-body" },
          ...spec.parts.slice(1),
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown part and relation references", () => {
    const spec = fixtureHomepageCardBoxDesignSpec();
    const badPartReference = {
      ...spec,
      relations: spec.relations.map((relation, index) =>
        index === 0 ? { ...relation, partBKey: "missing-part" } : relation,
      ),
    };
    const badDriverReference = {
      ...spec,
      driver: { ...spec.driver!, relationKey: "missing-relation" },
    };

    expect(
      FabricationDesignSpecV3Schema.safeParse(badPartReference).success,
    ).toBe(false);
    expect(
      FabricationDesignSpecV3Schema.safeParse(badDriverReference).success,
    ).toBe(false);
  });

  it("rejects inverted dimension, motion, and sheet ranges", () => {
    const spec = fixtureHomepageCardBoxDesignSpec();
    const invertedDimension = {
      ...spec,
      parts: [
        {
          ...spec.parts[0]!,
          width: { minimumMm: 80, preferredMm: 70, maximumMm: 90 },
        },
        ...spec.parts.slice(1),
      ],
    };
    const invertedMotion = {
      ...spec,
      relations: spec.relations.map((relation) =>
        relation.kind === "open_close"
          ? {
              ...relation,
              angleRangeDeg: { minimum: 90, home: 45, maximum: 90 },
            }
          : relation,
      ),
    };
    const invertedSheets = {
      ...spec,
      sheetConstraints: { minimumSheets: 2, maximumSheets: 1 },
    };

    expect(
      FabricationDesignSpecV3Schema.safeParse(invertedDimension).success,
    ).toBe(false);
    expect(
      FabricationDesignSpecV3Schema.safeParse(invertedMotion).success,
    ).toBe(false);
    expect(
      FabricationDesignSpecV3Schema.safeParse(invertedSheets).success,
    ).toBe(false);
  });

  it("rejects every duplicate key domain", () => {
    const spec = fixtureHomepageCardBoxDesignSpec();
    for (const field of [
      "parts",
      "relations",
      "outputs",
      "visibleLandmarks",
    ] as const) {
      const values = spec[field];
      expect(
        FabricationDesignSpecV3Schema.safeParse({
          ...spec,
          [field]: [...values, values[0]],
        }).success,
      ).toBe(false);
    }
  });

  it("rejects self-relations and every dangling semantic reference", () => {
    const spec = fixtureHomepageCardBoxDesignSpec();
    const firstRelation = spec.relations[0]!;
    const firstOutput = spec.outputs[0]!;
    const firstLandmark = spec.visibleLandmarks[0]!;
    const cases = [
      {
        ...spec,
        relations: [
          { ...firstRelation, partAKey: "missing-a" },
          ...spec.relations.slice(1),
        ],
      },
      {
        ...spec,
        relations: [
          { ...firstRelation, partBKey: firstRelation.partAKey },
          ...spec.relations.slice(1),
        ],
      },
      {
        ...spec,
        outputs: [{ ...firstOutput, relationKey: "missing-relation" }],
      },
      {
        ...spec,
        outputs: [{ ...firstOutput, partKey: "missing-part" }],
      },
      {
        ...spec,
        visibleLandmarks: [{ ...firstLandmark, partKeys: ["missing-part"] }],
      },
    ];

    cases.forEach((value) => {
      expect(FabricationDesignSpecV3Schema.safeParse(value).success).toBe(
        false,
      );
    });
  });

  it("rejects ranges inverted at either bound", () => {
    const spec = fixtureHomepageCardBoxDesignSpec();
    const slideRelation = {
      key: "slide-test",
      kind: "slide" as const,
      partAKey: "base",
      partBKey: "lid",
      travelRangeMm: { minimum: 0, home: 10, maximum: 5 },
    };
    expect(
      FabricationDesignSpecV3Schema.safeParse({
        ...spec,
        parts: spec.parts.map((part, index) =>
          index === 0
            ? {
                ...part,
                height: { minimumMm: 20, preferredMm: 30, maximumMm: 25 },
              }
            : part,
        ),
      }).success,
    ).toBe(false);
    expect(
      FabricationDesignSpecV3Schema.safeParse({
        ...spec,
        relations: [slideRelation],
        driver: null,
        outputs: [],
      }).success,
    ).toBe(false);
  });
});
