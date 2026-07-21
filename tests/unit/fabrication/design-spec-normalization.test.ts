import { describe, expect, it } from "vitest";

import { FabricationDesignSpecV3Schema } from "@/core/fabrication/design-spec";
import { normalizedFabricationDesignSpecVariants } from "@/core/fabrication/design-spec-normalization";
import { fixtureHomepageCardBoxDesignSpec } from "../../fixtures/design-spec";
import { productionCardBoxIntent } from "../../fixtures/production-geometric-failures";

const exactMm = (value: number) => ({
  minimumMm: value,
  preferredMm: value,
  maximumMm: value,
});

describe("fabrication design-spec normalization", () => {
  it("uses compiler-owned clearance unless the user explicitly requires more", () => {
    const spec = fixtureHomepageCardBoxDesignSpec();
    const invented = normalizedFabricationDesignSpecVariants(
      productionCardBoxIntent(),
      {
        ...spec,
        tolerances: { ...spec.tolerances, clearanceMm: 2 },
      },
    );
    expect(invented[0]?.spec.tolerances.clearanceMm).toBe(0.5);

    const intent = productionCardBoxIntent();
    const explicit = normalizedFabricationDesignSpecVariants(
      {
        ...intent,
        semanticConstraints: [
          {
            constraintId: "constraint-user-clearance",
            kind: "clearance",
            hard: true,
            source: "user",
            geometryRefs: [
              { kind: "body", id: "body-lid" },
              { kind: "body", id: "body-front" },
            ],
            minimumClearanceMm: 1.2,
            during: "closed",
          },
        ],
      },
      spec,
    );
    expect(explicit[0]?.spec.tolerances.clearanceMm).toBe(1.2);

    const unsupported = normalizedFabricationDesignSpecVariants(
      {
        ...intent,
        semanticConstraints: [
          {
            constraintId: "constraint-unsupported-clearance",
            kind: "clearance",
            hard: true,
            source: "user",
            geometryRefs: [
              { kind: "body", id: "body-lid" },
              { kind: "body", id: "body-front" },
            ],
            minimumClearanceMm: 6,
            during: "closed",
          },
        ],
      },
      spec,
    );
    expect(unsupported).toEqual([]);
  });

  it("lowers a small unactuated leaf lock panel into a connector feature", () => {
    const spec = fixtureHomepageCardBoxDesignSpec();
    const withSeparateTab = {
      ...spec,
      parts: [
        ...spec.parts,
        {
          key: "tuck-tab",
          label: "Tuck tab",
          role: "closure" as const,
          width: exactMm(30),
          height: exactMm(10),
          shapePreference: "trapezoid" as const,
        },
      ],
      relations: [
        ...spec.relations.filter((relation) => relation.kind !== "lock"),
        {
          key: "tab-fold",
          kind: "fold" as const,
          partAKey: "lid",
          partBKey: "tuck-tab",
          angleRangeDeg: { minimum: 90, home: 90, maximum: 90 },
        },
        {
          key: "lid-lock",
          kind: "lock" as const,
          partAKey: "tuck-tab",
          partBKey: "front",
          lockStyle: "tab_slot" as const,
        },
      ],
      visibleLandmarks: [
        ...spec.visibleLandmarks,
        {
          key: "tab-landmark",
          label: "Tuck tab",
          partKeys: ["tuck-tab"],
          importance: "preferred" as const,
        },
      ],
    };
    const variants = normalizedFabricationDesignSpecVariants(
      productionCardBoxIntent(),
      withSeparateTab,
    );
    const lowered = variants.find((variant) =>
      variant.normalizationKeys.includes("lock-feature:tuck-tab"),
    );

    expect(lowered).toBeDefined();
    expect(lowered?.spec.parts.some((part) => part.key === "tuck-tab")).toBe(
      false,
    );
    expect(
      lowered?.spec.relations.some((relation) => relation.key === "tab-fold"),
    ).toBe(false);
    expect(
      lowered?.spec.relations.find((relation) => relation.key === "lid-lock"),
    ).toMatchObject({ partAKey: "lid", partBKey: "front" });
    expect(
      lowered?.spec.visibleLandmarks.find(
        (landmark) => landmark.key === "tab-landmark",
      )?.partKeys,
    ).toEqual(["lid"]);
    expect(FabricationDesignSpecV3Schema.safeParse(lowered?.spec).success).toBe(
      true,
    );
  });

  it("tries declared, orthogonal, alternate, and code-owned open-close phases deterministically", () => {
    const spec = fixtureHomepageCardBoxDesignSpec();
    const homeZero = {
      ...spec,
      relations: spec.relations.map((relation) =>
        relation.kind === "open_close"
          ? {
              ...relation,
              angleRangeDeg: { minimum: 0, home: 0, maximum: 120 },
            }
          : relation,
      ),
    };
    const first = normalizedFabricationDesignSpecVariants(
      productionCardBoxIntent(),
      homeZero,
    );
    const repeated = normalizedFabricationDesignSpecVariants(
      productionCardBoxIntent(),
      homeZero,
    );
    const phases = first.map((variant) => {
      const relation = variant.spec.relations.find(
        (candidate) => candidate.kind === "open_close",
      );
      return relation?.kind === "open_close" ? relation.angleRangeDeg : null;
    });

    expect(phases).toEqual([
      { minimum: 0, home: 0, maximum: 120 },
      { minimum: 0, home: 90, maximum: 120 },
      { minimum: 0, home: 120, maximum: 120 },
      { minimum: 0, home: 90, maximum: 90 },
    ]);
    expect(repeated).toEqual(first);
    expect(
      first.every(
        (variant) =>
          FabricationDesignSpecV3Schema.safeParse(variant.spec).success,
      ),
    ).toBe(true);
  });

  it("keeps an explicit user motion range and omits the canonical narrowed phase", () => {
    const intent = productionCardBoxIntent();
    const spec = fixtureHomepageCardBoxDesignSpec();
    const range = { minimum: 0, home: 0, maximum: 120 };
    const variants = normalizedFabricationDesignSpecVariants(
      {
        ...intent,
        semanticConstraints: [
          {
            constraintId: "constraint-user-motion",
            kind: "motion",
            hard: true,
            source: "user",
            outputId: "output-lid-angle",
            minimumValue: 0,
            maximumValue: 120,
            unit: "deg",
          },
        ],
      },
      {
        ...spec,
        relations: spec.relations.map((relation) =>
          relation.kind === "open_close"
            ? { ...relation, angleRangeDeg: range }
            : relation,
        ),
      },
    );

    expect(
      variants.some((variant) =>
        variant.normalizationKeys.includes("open-close-range:canonical-0-90"),
      ),
    ).toBe(false);
    expect(
      variants.every((variant) => {
        const relation = variant.spec.relations.find(
          (candidate) => candidate.kind === "open_close",
        );
        return (
          relation?.kind === "open_close" &&
          relation.angleRangeDeg.minimum === 0 &&
          relation.angleRangeDeg.maximum === 120
        );
      }),
    ).toBe(true);
  });

  it("combines leaf-tab lowering, code clearance, and a canonical motion range", () => {
    const spec = fixtureHomepageCardBoxDesignSpec();
    const combined = {
      ...spec,
      tolerances: { ...spec.tolerances, clearanceMm: 2 },
      parts: [
        ...spec.parts,
        {
          key: "small-lock-feature",
          label: "Small lock feature",
          role: "closure" as const,
          width: exactMm(30),
          height: exactMm(10),
          shapePreference: "trapezoid" as const,
        },
      ],
      relations: [
        ...spec.relations
          .filter((relation) => relation.kind !== "lock")
          .map((relation) =>
            relation.kind === "open_close"
              ? {
                  ...relation,
                  angleRangeDeg: { minimum: 0, home: 0, maximum: 120 },
                }
              : relation,
          ),
        {
          key: "feature-fold",
          kind: "fold" as const,
          partAKey: "lid",
          partBKey: "small-lock-feature",
          angleRangeDeg: { minimum: 90, home: 90, maximum: 90 },
        },
        {
          key: "lid-lock",
          kind: "lock" as const,
          partAKey: "small-lock-feature",
          partBKey: "front",
          lockStyle: "tab_slot" as const,
        },
      ],
    };
    const variant = normalizedFabricationDesignSpecVariants(
      productionCardBoxIntent(),
      combined,
    ).find(
      (candidate) =>
        candidate.normalizationKeys.includes(
          "lock-feature:small-lock-feature",
        ) &&
        candidate.normalizationKeys.includes("open-close-range:canonical-0-90"),
    );

    expect(variant).toBeDefined();
    expect(variant?.spec.tolerances.clearanceMm).toBe(0.5);
    expect(
      variant?.spec.parts.some((part) => part.key === "small-lock-feature"),
    ).toBe(false);
    expect(
      variant?.spec.relations.find(
        (relation) => relation.kind === "open_close",
      ),
    ).toMatchObject({
      angleRangeDeg: { minimum: 0, home: 90, maximum: 90 },
    });
    expect(FabricationDesignSpecV3Schema.safeParse(variant?.spec).success).toBe(
      true,
    );
  });

  it("repairs a schema-valid but incompatible driver and output mapping", () => {
    const source = fixtureHomepageCardBoxDesignSpec();
    const variants = normalizedFabricationDesignSpecVariants(
      productionCardBoxIntent(),
      {
        ...source,
        driver: {
          relationKey: "lid-lock",
          label: "Open the lid",
          control: "slide",
        },
        outputs: [
          {
            key: "lid-angle",
            relationKey: "lid-lock",
            partKey: "front",
            label: "Lid angle",
          },
        ],
      },
    );

    expect(variants[0]?.spec.driver).toMatchObject({
      relationKey: "lid-motion",
      control: "fold",
    });
    expect(variants[0]?.spec.outputs).toEqual([
      {
        key: "lid-angle",
        relationKey: "lid-motion",
        partKey: "lid",
        label: "Lid angle",
      },
    ]);
  });

  it("removes accidental motion controls from a static design", () => {
    const source = fixtureHomepageCardBoxDesignSpec();
    const variants = normalizedFabricationDesignSpecVariants(
      { ...productionCardBoxIntent(), behavior: "static" },
      source,
    );

    expect(variants[0]?.spec.driver).toBeNull();
    expect(variants[0]?.spec.outputs).toEqual([]);
  });

  it("creates a compatible rotate driver and output when the model omits them", () => {
    const source = fixtureHomepageCardBoxDesignSpec();
    const variants = normalizedFabricationDesignSpecVariants(
      { ...productionCardBoxIntent(), behavior: "rotate" },
      { ...source, driver: null, outputs: [] },
    );

    expect(variants[0]?.spec.driver).toEqual({
      relationKey: "lid-motion",
      label: "Move the design",
      control: "rotate",
    });
    expect(variants[0]?.spec.outputs).toEqual([
      {
        key: "drivenOutput",
        relationKey: "lid-motion",
        partKey: "lid",
        label: "Driven output",
      },
    ]);
  });

  it("prefers a behavior-specific open-close driver over a declared fixed fold", () => {
    const source = fixtureHomepageCardBoxDesignSpec();
    const variants = normalizedFabricationDesignSpecVariants(
      productionCardBoxIntent(),
      {
        ...source,
        driver: {
          relationKey: "front-fold",
          label: "Open the lid",
          control: "fold",
        },
        outputs: [
          {
            key: "lid-angle",
            relationKey: "front-fold",
            partKey: "front",
            label: "Lid angle",
          },
        ],
      },
    );

    expect(variants[0]?.spec.driver).toMatchObject({
      relationKey: "lid-motion",
      control: "fold",
    });
    expect(variants[0]?.spec.outputs).toEqual([
      {
        key: "lid-angle",
        relationKey: "lid-motion",
        partKey: "lid",
        label: "Lid angle",
      },
    ]);
  });

  it("preserves same-driver outputs and remaps outputs without a coupling path", () => {
    const source = fixtureHomepageCardBoxDesignSpec();
    const variants = normalizedFabricationDesignSpecVariants(
      productionCardBoxIntent(),
      {
        ...source,
        outputs: [
          ...source.outputs,
          {
            key: "secondary-lid-angle",
            relationKey: "lid-motion",
            partKey: "back",
            label: "Back reference angle",
          },
        ],
      },
    );

    expect(variants[0]?.spec.outputs).toEqual([
      ...source.outputs,
      {
        key: "secondary-lid-angle",
        relationKey: "lid-motion",
        partKey: "lid",
        label: "Back reference angle",
      },
    ]);
  });

  it("lowers a connector feature regardless of relation endpoint order", () => {
    const source = fixtureHomepageCardBoxDesignSpec();
    const withReversedFeature = {
      ...source,
      parts: [
        ...source.parts,
        {
          key: "small-lock-feature",
          label: "Small lock feature",
          role: "closure" as const,
          width: exactMm(40),
          height: exactMm(15),
          shapePreference: "trapezoid" as const,
        },
      ],
      relations: [
        ...source.relations.filter((relation) => relation.kind !== "lock"),
        {
          key: "feature-fold",
          kind: "fold" as const,
          partAKey: "small-lock-feature",
          partBKey: "lid",
          angleRangeDeg: { minimum: 90, home: 90, maximum: 90 },
        },
        {
          key: "feature-lock",
          kind: "lock" as const,
          partAKey: "front",
          partBKey: "small-lock-feature",
          lockStyle: "tab_slot" as const,
        },
      ],
    };
    const lowered = normalizedFabricationDesignSpecVariants(
      productionCardBoxIntent(),
      withReversedFeature,
    ).find((variant) =>
      variant.normalizationKeys.includes("lock-feature:small-lock-feature"),
    );

    expect(
      lowered?.spec.relations.find(
        (relation) => relation.key === "feature-lock",
      ),
    ).toMatchObject({ partAKey: "front", partBKey: "lid" });
  });

  it("preserves a required visible locking leaf as a real panel", () => {
    const source = fixtureHomepageCardBoxDesignSpec();
    const requiredLeaf = {
      ...source,
      parts: [
        ...source.parts,
        {
          key: "required-flap",
          label: "Required flap",
          role: "closure" as const,
          width: exactMm(30),
          height: exactMm(15),
          shapePreference: "trapezoid" as const,
        },
      ],
      relations: [
        ...source.relations.filter((relation) => relation.kind !== "lock"),
        {
          key: "required-flap-fold",
          kind: "fold" as const,
          partAKey: "lid",
          partBKey: "required-flap",
          angleRangeDeg: { minimum: 90, home: 90, maximum: 90 },
        },
        {
          key: "required-flap-lock",
          kind: "lock" as const,
          partAKey: "required-flap",
          partBKey: "front",
          lockStyle: "tab_slot" as const,
        },
      ],
      visibleLandmarks: [
        ...source.visibleLandmarks,
        {
          key: "required-flap-landmark",
          label: "Required flap",
          partKeys: ["required-flap"],
          importance: "required" as const,
        },
      ],
    };
    const variants = normalizedFabricationDesignSpecVariants(
      productionCardBoxIntent(),
      requiredLeaf,
    );

    expect(
      variants.every((variant) =>
        variant.spec.parts.some((part) => part.key === "required-flap"),
      ),
    ).toBe(true);
  });

  it("handles an open-close range that does not include an orthogonal pose", () => {
    const source = fixtureHomepageCardBoxDesignSpec();
    const variants = normalizedFabricationDesignSpecVariants(
      productionCardBoxIntent(),
      {
        ...source,
        relations: source.relations.map((relation) =>
          relation.kind === "open_close"
            ? {
                ...relation,
                angleRangeDeg: { minimum: 0, home: 0, maximum: 60 },
              }
            : relation,
        ),
      },
    );

    expect(
      variants.some((variant) =>
        variant.normalizationKeys.includes("open-close-home:60"),
      ),
    ).toBe(true);
  });

  it("does not collapse a driven, output, or full-sized closure panel", () => {
    const variants = normalizedFabricationDesignSpecVariants(
      productionCardBoxIntent(),
      fixtureHomepageCardBoxDesignSpec(),
    );
    expect(
      variants.some((variant) =>
        variant.normalizationKeys.some((key) =>
          key.startsWith("lock-feature:"),
        ),
      ),
    ).toBe(false);
    expect(variants.every((variant) => variant.spec.parts.length === 6)).toBe(
      true,
    );
  });
});
