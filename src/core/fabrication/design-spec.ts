import { z } from "zod";

import { FABRICATION_LIMITS } from "./limits";
import type { FabricationPriority } from "./types";

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,39}$/u;
const key = z.string().regex(KEY_PATTERN);
const text = (maximumLength: number) =>
  z.string().trim().min(1).max(maximumLength);
const finite = z.number().finite();
const positiveMm = finite.positive().max(2_000);

export interface FabricationDimensionRangeV3 {
  readonly minimumMm: number;
  readonly preferredMm: number;
  readonly maximumMm: number;
}

export type FabricationDesignPartRoleV3 =
  | "support"
  | "structural"
  | "wall"
  | "closure"
  | "moving"
  | "slider"
  | "guide"
  | "decorative"
  | "driver"
  | "output";

export interface FabricationDesignPartV3 {
  readonly key: string;
  readonly label: string;
  readonly role: FabricationDesignPartRoleV3;
  readonly width: FabricationDimensionRangeV3;
  readonly height: FabricationDimensionRangeV3;
  readonly shapePreference: "rectangle" | "triangle" | "trapezoid";
}

interface FabricationPartRelationBaseV3 {
  readonly key: string;
  readonly partAKey: string;
  readonly partBKey: string;
}

export type FabricationPartRelationV3 =
  | (FabricationPartRelationBaseV3 & {
      readonly kind: "touch";
    })
  | (FabricationPartRelationBaseV3 & {
      readonly kind: "contain";
      readonly minimumClearanceMm: number;
    })
  | (FabricationPartRelationBaseV3 & {
      readonly kind: "fold";
      readonly angleRangeDeg: {
        readonly minimum: number;
        readonly home: number;
        readonly maximum: number;
      };
    })
  | (FabricationPartRelationBaseV3 & {
      readonly kind: "open_close";
      readonly angleRangeDeg: {
        readonly minimum: number;
        readonly home: number;
        readonly maximum: number;
      };
    })
  | (FabricationPartRelationBaseV3 & {
      readonly kind: "slide";
      readonly travelRangeMm: {
        readonly minimum: number;
        readonly home: number;
        readonly maximum: number;
      };
    })
  | (FabricationPartRelationBaseV3 & {
      readonly kind: "lock";
      readonly lockStyle: "tab_slot";
    });

export interface FabricationDriverIntentV3 {
  readonly relationKey: string;
  readonly label: string;
  readonly control: "fold" | "slide" | "rotate" | "pull_tab";
}

export interface FabricationOutputIntentV3 {
  readonly key: string;
  readonly relationKey: string;
  readonly partKey: string;
  readonly label: string;
}

export interface FabricationVisibleLandmarkV3 {
  readonly key: string;
  readonly label: string;
  readonly partKeys: readonly string[];
  readonly importance: "required" | "preferred";
}

/**
 * GPT describes what the object must contain and how named parts relate. It
 * deliberately cannot express a body graph, root, hinge edge, fold sign,
 * packing transform, or connector geometry; those are synthesis variables.
 */
export interface FabricationDesignSpecV3 {
  readonly version: "3";
  readonly label: string;
  readonly summary: string;
  readonly parts: readonly FabricationDesignPartV3[];
  readonly relations: readonly FabricationPartRelationV3[];
  readonly materialConstraints: {
    readonly materialLabel: string;
    readonly thickness: FabricationDimensionRangeV3;
  };
  readonly sheetConstraints: {
    readonly minimumSheets: number;
    readonly maximumSheets: number;
  };
  readonly glueAllowed: boolean;
  readonly driver: FabricationDriverIntentV3 | null;
  readonly outputs: readonly FabricationOutputIntentV3[];
  readonly visibleLandmarks: readonly FabricationVisibleLandmarkV3[];
  readonly aestheticPreferences: readonly string[];
  readonly priorities: readonly FabricationPriority[];
  readonly tolerances: {
    readonly dimensionMm: number;
    readonly clearanceMm: number;
    readonly angleDeg: number;
  };
}

const DimensionRangeSchema = z
  .object({
    minimumMm: positiveMm,
    preferredMm: positiveMm,
    maximumMm: positiveMm,
  })
  .strict()
  .superRefine((range, context) => {
    if (
      range.minimumMm > range.preferredMm ||
      range.preferredMm > range.maximumMm
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Dimension ranges must satisfy minimum <= preferred <= maximum.",
      });
    }
  }) satisfies z.ZodType<FabricationDimensionRangeV3>;

const angleRange = z
  .object({
    minimum: finite.min(0).max(180),
    home: finite.min(0).max(180),
    maximum: finite.min(0).max(180),
  })
  .strict()
  .superRefine((range, context) => {
    if (range.minimum > range.home || range.home > range.maximum) {
      context.addIssue({
        code: "custom",
        message: "Angle ranges must satisfy minimum <= home <= maximum.",
      });
    }
  });

const travelRange = z
  .object({
    minimum: finite,
    home: finite,
    maximum: finite,
  })
  .strict()
  .superRefine((range, context) => {
    if (range.minimum > range.home || range.home > range.maximum) {
      context.addIssue({
        code: "custom",
        message: "Travel ranges must satisfy minimum <= home <= maximum.",
      });
    }
  });

const relationBase = { key, partAKey: key, partBKey: key } as const;

const PartRelationSchema = z.discriminatedUnion("kind", [
  z.object({ ...relationBase, kind: z.literal("touch") }).strict(),
  z
    .object({
      ...relationBase,
      kind: z.literal("contain"),
      minimumClearanceMm: finite.min(0).max(20),
    })
    .strict(),
  z
    .object({
      ...relationBase,
      kind: z.literal("fold"),
      angleRangeDeg: angleRange,
    })
    .strict(),
  z
    .object({
      ...relationBase,
      kind: z.literal("open_close"),
      angleRangeDeg: angleRange,
    })
    .strict(),
  z
    .object({
      ...relationBase,
      kind: z.literal("slide"),
      travelRangeMm: travelRange,
    })
    .strict(),
  z
    .object({
      ...relationBase,
      kind: z.literal("lock"),
      lockStyle: z.literal("tab_slot"),
    })
    .strict(),
]) satisfies z.ZodType<FabricationPartRelationV3>;

const addDuplicateKeyIssues = (
  values: readonly { readonly key: string }[],
  path: string,
  context: z.RefinementCtx,
): void => {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value.key)) {
      context.addIssue({
        code: "custom",
        path: [path, index, "key"],
        message: `Duplicate ${path} key ${value.key}.`,
      });
    }
    seen.add(value.key);
  });
};

export const FabricationDesignSpecV3Schema = z
  .object({
    version: z.literal("3"),
    label: text(120),
    summary: text(1_000),
    parts: z
      .array(
        z
          .object({
            key,
            label: text(120),
            role: z.enum([
              "support",
              "structural",
              "wall",
              "closure",
              "moving",
              "slider",
              "guide",
              "decorative",
              "driver",
              "output",
            ]),
            width: DimensionRangeSchema,
            height: DimensionRangeSchema,
            shapePreference: z.enum(["rectangle", "triangle", "trapezoid"]),
          })
          .strict(),
      )
      .min(1)
      .max(FABRICATION_LIMITS.maximumPanelCount),
    relations: z
      .array(PartRelationSchema)
      .max(FABRICATION_LIMITS.maximumJointAndConnectorCount),
    materialConstraints: z
      .object({
        materialLabel: text(120),
        thickness: DimensionRangeSchema,
      })
      .strict(),
    sheetConstraints: z
      .object({
        minimumSheets: z
          .number()
          .int()
          .min(FABRICATION_LIMITS.minimumSheetCount)
          .max(FABRICATION_LIMITS.maximumSheetCount),
        maximumSheets: z
          .number()
          .int()
          .min(FABRICATION_LIMITS.minimumSheetCount)
          .max(FABRICATION_LIMITS.maximumSheetCount),
      })
      .strict(),
    glueAllowed: z.boolean(),
    driver: z
      .object({
        relationKey: key,
        label: text(120),
        control: z.enum(["fold", "slide", "rotate", "pull_tab"]),
      })
      .strict()
      .nullable(),
    outputs: z
      .array(
        z
          .object({
            key,
            relationKey: key,
            partKey: key,
            label: text(120),
          })
          .strict(),
      )
      .max(FABRICATION_LIMITS.maximumOutputCount),
    visibleLandmarks: z
      .array(
        z
          .object({
            key,
            label: text(120),
            partKeys: z
              .array(key)
              .min(1)
              .max(FABRICATION_LIMITS.maximumPanelCount),
            importance: z.enum(["required", "preferred"]),
          })
          .strict(),
      )
      .max(40),
    aestheticPreferences: z.array(text(160)).max(16),
    priorities: z
      .array(
        z.enum([
          "fabrication_efficiency",
          "mechanical_simplicity",
          "visual_expression",
          "compactness",
          "stability",
          "motion_range",
        ]),
      )
      .max(6),
    tolerances: z
      .object({
        dimensionMm: finite.min(0).max(20),
        clearanceMm: finite.min(0.4).max(5),
        angleDeg: finite.min(0).max(15),
      })
      .strict(),
  })
  .strict()
  .superRefine((spec, context) => {
    addDuplicateKeyIssues(spec.parts, "parts", context);
    addDuplicateKeyIssues(spec.relations, "relations", context);
    addDuplicateKeyIssues(spec.outputs, "outputs", context);
    addDuplicateKeyIssues(spec.visibleLandmarks, "visibleLandmarks", context);
    if (
      spec.sheetConstraints.minimumSheets > spec.sheetConstraints.maximumSheets
    ) {
      context.addIssue({
        code: "custom",
        path: ["sheetConstraints"],
        message: "Sheet limits must satisfy minimumSheets <= maximumSheets.",
      });
    }
    const partKeys = new Set(spec.parts.map((part) => part.key));
    const relationKeys = new Set(
      spec.relations.map((relation) => relation.key),
    );
    spec.relations.forEach((relation, index) => {
      if (!partKeys.has(relation.partAKey)) {
        context.addIssue({
          code: "custom",
          path: ["relations", index, "partAKey"],
          message: `Unknown part ${relation.partAKey}.`,
        });
      }
      if (!partKeys.has(relation.partBKey)) {
        context.addIssue({
          code: "custom",
          path: ["relations", index, "partBKey"],
          message: `Unknown part ${relation.partBKey}.`,
        });
      }
      if (relation.partAKey === relation.partBKey) {
        context.addIssue({
          code: "custom",
          path: ["relations", index],
          message: "A relation must connect two different parts.",
        });
      }
    });
    if (spec.driver && !relationKeys.has(spec.driver.relationKey)) {
      context.addIssue({
        code: "custom",
        path: ["driver", "relationKey"],
        message: `Unknown relation ${spec.driver.relationKey}.`,
      });
    }
    spec.outputs.forEach((output, index) => {
      if (!relationKeys.has(output.relationKey)) {
        context.addIssue({
          code: "custom",
          path: ["outputs", index, "relationKey"],
          message: `Unknown relation ${output.relationKey}.`,
        });
      }
      if (!partKeys.has(output.partKey)) {
        context.addIssue({
          code: "custom",
          path: ["outputs", index, "partKey"],
          message: `Unknown part ${output.partKey}.`,
        });
      }
    });
    spec.visibleLandmarks.forEach((landmark, landmarkIndex) => {
      landmark.partKeys.forEach((partKey, partIndex) => {
        if (!partKeys.has(partKey)) {
          context.addIssue({
            code: "custom",
            path: ["visibleLandmarks", landmarkIndex, "partKeys", partIndex],
            message: `Unknown part ${partKey}.`,
          });
        }
      });
    });
  }) satisfies z.ZodType<FabricationDesignSpecV3>;
