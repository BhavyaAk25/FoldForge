import { describe, expect, it } from "vitest";

import {
  fabricationDesignDimensionVariants,
  MAXIMUM_DESIGN_DIMENSION_VARIANTS,
} from "@/core/fabrication/design-dimension-variants";
import type {
  FabricationDesignPartV3,
  FabricationDesignSpecV3,
} from "@/core/fabrication/design-spec";
import {
  fixtureNaturalCardBoxDesignSpec,
  fixtureSingleFoldDesignSpec,
} from "../../fixtures/design-spec";
import { productionCardBoxIntent } from "../../fixtures/production-geometric-failures";

const dimensionsFor = (
  variant: ReturnType<typeof fabricationDesignDimensionVariants>[number],
  partKey: string,
) => variant.parts.find((part) => part.partKey === partKey)!;

const rangedFoldSpec = (): FabricationDesignSpecV3 => {
  const source = fixtureSingleFoldDesignSpec();
  return {
    ...source,
    tolerances: { ...source.tolerances, dimensionMm: 0 },
    parts: source.parts.map((part) =>
      part.key === "base"
        ? {
            ...part,
            width: { minimumMm: 40, preferredMm: 50, maximumMm: 60 },
            height: { minimumMm: 20, preferredMm: 20, maximumMm: 20 },
          }
        : {
            ...part,
            width: { minimumMm: 30, preferredMm: 30, maximumMm: 30 },
            height: { minimumMm: 45, preferredMm: 52, maximumMm: 55 },
          },
    ),
  };
};

describe("fabrication design dimension variants", () => {
  it("keeps the all-preferred assignment first", () => {
    const spec = rangedFoldSpec();
    const first = fabricationDesignDimensionVariants(spec)[0]!;

    expect(first.parts).toEqual(
      spec.parts.map((part) => ({
        partKey: part.key,
        widthMm: part.width.preferredMm,
        heightMm: part.height.preferredMm,
      })),
    );
  });

  it("creates relation-aware assignments with a shared physical edge length", () => {
    const variants = fabricationDesignDimensionVariants(rangedFoldSpec());

    expect(
      variants.some((variant) => {
        const base = dimensionsFor(variant, "base");
        const wing = dimensionsFor(variant, "wing");
        return [base.widthMm, base.heightMm].some((left) =>
          [wing.widthMm, wing.heightMm].some(
            (right) => Math.abs(left - right) <= 0.1,
          ),
        );
      }),
    ).toBe(true);
  });

  it("preserves every declared dimension range", () => {
    const spec = rangedFoldSpec();
    const partsByKey = new Map(spec.parts.map((part) => [part.key, part]));

    for (const variant of fabricationDesignDimensionVariants(spec)) {
      for (const dimensions of variant.parts) {
        const part = partsByKey.get(dimensions.partKey)!;
        expect(dimensions.widthMm).toBeGreaterThanOrEqual(part.width.minimumMm);
        expect(dimensions.widthMm).toBeLessThanOrEqual(part.width.maximumMm);
        expect(dimensions.heightMm).toBeGreaterThanOrEqual(
          part.height.minimumMm,
        );
        expect(dimensions.heightMm).toBeLessThanOrEqual(part.height.maximumMm);
      }
    }
  });

  it("includes minimum and maximum boundary values when work remains", () => {
    const spec = rangedFoldSpec();
    const variants = fabricationDesignDimensionVariants(spec);
    const baseWidths = variants.map(
      (variant) => dimensionsFor(variant, "base").widthMm,
    );

    expect(baseWidths).toContain(40);
    expect(baseWidths).toContain(60);
  });

  it("samples tolerance around a fixed model-inferred dimension", () => {
    const source = rangedFoldSpec();
    const spec: FabricationDesignSpecV3 = {
      ...source,
      tolerances: { ...source.tolerances, dimensionMm: 1 },
      parts: source.parts.map((part) =>
        part.key === "base"
          ? {
              ...part,
              height: { minimumMm: 25, preferredMm: 25, maximumMm: 25 },
            }
          : part,
      ),
    };
    const baseHeights = fabricationDesignDimensionVariants(spec).map(
      (variant) => dimensionsFor(variant, "base").heightMm,
    );

    expect(baseHeights).toContain(24);
    expect(baseHeights).toContain(25);
    expect(baseHeights).toContain(26);
  });

  it("does not vary a fixed axis protected by an explicit user constraint", () => {
    const source = rangedFoldSpec();
    const spec: FabricationDesignSpecV3 = {
      ...source,
      tolerances: { ...source.tolerances, dimensionMm: 1 },
      parts: source.parts.map((part) =>
        part.key === "base"
          ? {
              ...part,
              height: { minimumMm: 25, preferredMm: 25, maximumMm: 25 },
            }
          : part,
      ),
    };
    const variants = fabricationDesignDimensionVariants(spec, {
      protectedPartAxes: [{ partKey: "base", axis: "heightMm" }],
    });

    expect(
      variants.every(
        (variant) => dimensionsFor(variant, "base").heightMm === 25,
      ),
    ).toBe(true);
  });

  it("maps a semantic shell onto the requested envelope without a stored topology", () => {
    const spec = fixtureNaturalCardBoxDesignSpec();
    const shell = fabricationDesignDimensionVariants(spec, {
      requestedEnvelope: productionCardBoxIntent().requestedSize,
    })[1];

    expect(shell?.parts).toEqual([
      { partKey: "base", widthMm: 70, heightMm: 95 },
      { partKey: "front", widthMm: 70, heightMm: 25 },
      { partKey: "back", widthMm: 70, heightMm: 25 },
      { partKey: "left", widthMm: 24, heightMm: 95 },
      { partKey: "right", widthMm: 24, heightMm: 95 },
      { partKey: "lid", widthMm: 70, heightMm: 95 },
    ]);
  });

  it("maps rotated semantic faces and orthogonal walls from the same roles", () => {
    const source = fixtureNaturalCardBoxDesignSpec();
    const rotated: FabricationDesignSpecV3 = {
      ...source,
      parts: source.parts.map((part) => {
        if (part.key === "base" || part.key === "lid") {
          return {
            ...part,
            width: { minimumMm: 95, preferredMm: 95, maximumMm: 95 },
            height: { minimumMm: 70, preferredMm: 70, maximumMm: 70 },
          };
        }
        if (part.key === "front" || part.key === "back") {
          return {
            ...part,
            width: { minimumMm: 95, preferredMm: 95, maximumMm: 95 },
            height: { minimumMm: 25, preferredMm: 25, maximumMm: 25 },
          };
        }
        return part;
      }),
    };
    const shell = fabricationDesignDimensionVariants(rotated, {
      requestedEnvelope: productionCardBoxIntent().requestedSize,
    })[1];

    expect(dimensionsFor(shell!, "base")).toMatchObject({
      widthMm: 95,
      heightMm: 70,
    });
    expect(dimensionsFor(shell!, "front")).toMatchObject({
      widthMm: 95,
      heightMm: 24,
    });
  });

  it.each([
    ["support", "structural"],
    ["closure", "moving"],
    ["wall", "structural"],
  ] as const)(
    "projects the requested envelope when a model calls %s parts %s",
    (sourceRole, replacementRole) => {
      const source = fixtureNaturalCardBoxDesignSpec();
      const renamedRoles: FabricationDesignSpecV3 = {
        ...source,
        parts: source.parts.map((part) =>
          part.role === sourceRole ? { ...part, role: replacementRole } : part,
        ),
      };
      const variants = fabricationDesignDimensionVariants(renamedRoles, {
        requestedEnvelope: productionCardBoxIntent().requestedSize,
      });

      expect(
        variants.some((variant) => {
          const dimensions = variant.parts.map(({ widthMm, heightMm }) =>
            [widthMm, heightMm].toSorted((left, right) => left - right),
          );
          return (
            dimensions.filter(([short, long]) => short === 70 && long === 95)
              .length >= 2 &&
            dimensions.filter(([short, long]) => short === 25 && long === 70)
              .length >= 2
          );
        }),
      ).toBe(true);
    },
  );

  it("does not invent an edge match when ranges do not overlap", () => {
    const spec = rangedFoldSpec();
    const separated: FabricationDesignSpecV3 = {
      ...spec,
      parts: spec.parts.map((part) =>
        part.key === "base"
          ? {
              ...part,
              width: { minimumMm: 70, preferredMm: 75, maximumMm: 80 },
              height: { minimumMm: 60, preferredMm: 65, maximumMm: 69 },
            }
          : {
              ...part,
              width: { minimumMm: 10, preferredMm: 15, maximumMm: 20 },
              height: { minimumMm: 21, preferredMm: 25, maximumMm: 30 },
            },
      ),
    };

    expect(
      fabricationDesignDimensionVariants(separated).some((variant) => {
        const base = dimensionsFor(variant, "base");
        const wing = dimensionsFor(variant, "wing");
        return [base.widthMm, base.heightMm].some((left) =>
          [wing.widthMm, wing.heightMm].some(
            (right) => Math.abs(left - right) <= 0.1,
          ),
        );
      }),
    ).toBe(false);
  });

  it("is byte-stable, bounded, and independent of labels", () => {
    const spec = rangedFoldSpec();
    const first = fabricationDesignDimensionVariants(spec);
    const repeated = fabricationDesignDimensionVariants({
      ...spec,
      label: "Different label",
      summary: "Different prose with identical fabrication constraints.",
      parts: spec.parts.map((part): FabricationDesignPartV3 => ({
        ...part,
        label: `Renamed ${part.key}`,
      })),
    });

    expect(repeated).toEqual(first);
    expect(first.length).toBeLessThanOrEqual(MAXIMUM_DESIGN_DIMENSION_VARIANTS);
    expect(new Set(first.map((variant) => JSON.stringify(variant))).size).toBe(
      first.length,
    );
  });
});
