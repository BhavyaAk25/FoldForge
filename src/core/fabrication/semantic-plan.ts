import { z } from "zod";

import { FABRICATION_LIMITS } from "./limits";
import { semanticPlanResourceCounts } from "./resource-counts";

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,39}$/u;
const finite = z.number().finite();
const positiveMm = finite.positive().max(2_000);
const boundedText = (maximumLength: number) =>
  z.string().trim().min(1).max(maximumLength);
const key = z.string().regex(KEY_PATTERN);
const normalizedCoordinate = finite.min(0).max(1);

export interface SemanticPoint2V2 {
  readonly u: number;
  readonly v: number;
}

export type SemanticPanelOutlineV2 =
  | { readonly kind: "rectangle" }
  | {
      readonly kind: "triangle";
      readonly apexSide: "top" | "right" | "bottom" | "left";
    }
  | {
      readonly kind: "trapezoid";
      readonly shortSide: "top" | "right" | "bottom" | "left";
      readonly shortSideRatio: number;
    }
  | {
      readonly kind: "polygon";
      readonly vertices: readonly SemanticPoint2V2[];
    };

export interface SemanticPanelV2 {
  readonly key: string;
  readonly sheetIndex: number;
  readonly bodyKey: string;
  readonly label: string;
  readonly role:
    "structural" | "decorative" | "guide" | "slider" | "driver" | "output";
  readonly widthMm: number;
  readonly heightMm: number;
  readonly outline: SemanticPanelOutlineV2;
  readonly innerCutContours: readonly {
    readonly vertices: readonly SemanticPoint2V2[];
  }[];
}

export interface SemanticBodyV2 {
  readonly key: string;
  readonly label: string;
  readonly panelKeys: readonly string[];
  readonly grounded: boolean;
}

export interface SemanticEdgeAttachmentV2 {
  readonly panelKey: string;
  readonly edgeIndex: number;
}

interface SemanticAngularJointV2 {
  readonly key: string;
  readonly parentBodyKey: string;
  readonly childBodyKey: string;
  readonly parentAttachment: SemanticEdgeAttachmentV2;
  readonly childAttachment: SemanticEdgeAttachmentV2;
  readonly homeAngleDeg: number;
  readonly minimumAngleDeg: number;
  readonly maximumAngleDeg: number;
}

export interface SemanticFoldJointV2 extends SemanticAngularJointV2 {
  readonly kind: "fold";
  readonly foldDirection: "mountain" | "valley";
}

export interface SemanticRevoluteJointV2 extends SemanticAngularJointV2 {
  readonly kind: "revolute";
  readonly connectorRelationshipKeys: readonly string[];
}

export interface SemanticPrismaticJointV2 {
  readonly key: string;
  readonly kind: "prismatic";
  readonly parentBodyKey: string;
  readonly childBodyKey: string;
  readonly parentAttachment: SemanticEdgeAttachmentV2;
  readonly childAttachment: SemanticEdgeAttachmentV2;
  readonly travelDirection:
    | "edge_tangent"
    | "edge_normal_inward"
    | "edge_normal_outward"
    | "sheet_normal";
  readonly guideRelationshipKeys: readonly string[];
  readonly homeTravelMm: number;
  readonly minimumTravelMm: number;
  readonly maximumTravelMm: number;
}

export type SemanticJointV2 =
  SemanticFoldJointV2 | SemanticRevoluteJointV2 | SemanticPrismaticJointV2;

export interface SemanticTabSlotRelationshipV2 {
  readonly key: string;
  readonly tabAttachment: SemanticEdgeAttachmentV2;
  readonly slotAttachment: SemanticEdgeAttachmentV2;
  readonly spanMm: number;
  readonly tabDepthMm: number;
  readonly slotInsetMm: number;
  readonly clearanceMm: number;
}

export interface SemanticDriverV2 {
  readonly key: string;
  readonly jointKey: string;
  readonly label: string;
  readonly control: "pull_tab" | "fold" | "slide" | "rotate";
  readonly minimumValue: number;
  readonly maximumValue: number;
  readonly homeValue: number;
  readonly direction: -1 | 1;
}

export interface SemanticMotionOutputV2 {
  readonly key: string;
  readonly jointKey: string;
  readonly bodyKey: string;
  readonly label: string;
  readonly minimumValue: number;
  readonly maximumValue: number;
  readonly direction: -1 | 1;
}

export type SemanticCouplingV2 =
  | {
      readonly key: string;
      readonly kind: "direct_ratio";
      readonly inputJointKey: string;
      readonly outputJointKeys: readonly string[];
      readonly ratio: number;
      readonly offset: number;
      readonly offsetUnit: "mm" | "deg";
    }
  | {
      readonly key: string;
      readonly kind: "mirrored_pair";
      readonly inputJointKey: string;
      readonly leftOutputJointKey: string;
      readonly rightOutputJointKey: string;
      readonly ratio: number;
      readonly phaseOffsetDeg: number;
    }
  | {
      readonly key: string;
      readonly kind: "pull_tab";
      readonly driverKey: string;
      readonly sliderJointKey: string;
      readonly outputJointKeys: readonly string[];
      readonly ratio: number;
    }
  | {
      readonly key: string;
      readonly kind: "cam_slot";
      readonly driverKey: string;
      readonly connectorRelationshipKey: string;
      readonly outputJointKey: string;
      readonly branch: "positive" | "negative";
      readonly phaseOffsetMm: number;
    };

export interface SemanticLandmarkV2 {
  readonly key: string;
  readonly label: string;
  readonly role: string;
  readonly geometryRefs: readonly (
    | { readonly kind: "panel"; readonly key: string }
    | { readonly kind: "body"; readonly key: string }
    | { readonly kind: "joint"; readonly key: string }
    | { readonly kind: "connector_relationship"; readonly key: string }
    | { readonly kind: "driver"; readonly key: string }
    | { readonly kind: "output"; readonly key: string }
  )[];
}

/**
 * The model-facing contract contains only semantic and panel-local design
 * choices. Global layout, transforms, axes, reciprocal connectors, canonical
 * identifiers, and export geometry are deliberately absent.
 */
export interface FabricationPlanV2 {
  readonly version: "2";
  readonly candidateLabel: string;
  readonly topologyKey: string;
  readonly panels: readonly SemanticPanelV2[];
  readonly bodies: readonly SemanticBodyV2[];
  readonly joints: readonly SemanticJointV2[];
  readonly connectorRelationships: readonly SemanticTabSlotRelationshipV2[];
  readonly driver: SemanticDriverV2 | null;
  readonly outputs: readonly SemanticMotionOutputV2[];
  readonly couplings: readonly SemanticCouplingV2[];
  readonly landmarks: readonly SemanticLandmarkV2[];
  readonly assemblyStrategy: "fold_only" | "tab_slot" | "articulated_tab_slot";
  readonly designSummary: string;
}

const SemanticPoint2V2Schema = z
  .object({ u: normalizedCoordinate, v: normalizedCoordinate })
  .strict();

const polygonVertices = z
  .array(SemanticPoint2V2Schema)
  .min(3)
  .max(FABRICATION_LIMITS.maximumVerticesPerPanel);

export const SemanticPanelOutlineV2Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rectangle") }).strict(),
  z
    .object({
      kind: z.literal("triangle"),
      apexSide: z.enum(["top", "right", "bottom", "left"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("trapezoid"),
      shortSide: z.enum(["top", "right", "bottom", "left"]),
      shortSideRatio: finite.min(0.1).max(1),
    })
    .strict(),
  z.object({ kind: z.literal("polygon"), vertices: polygonVertices }).strict(),
]) satisfies z.ZodType<SemanticPanelOutlineV2>;

const SemanticPanelV2Schema = z
  .object({
    key,
    sheetIndex: z
      .number()
      .int()
      .min(0)
      .max(FABRICATION_LIMITS.maximumSheetCount - 1),
    bodyKey: key,
    label: boundedText(120),
    role: z.enum([
      "structural",
      "decorative",
      "guide",
      "slider",
      "driver",
      "output",
    ]),
    widthMm: positiveMm,
    heightMm: positiveMm,
    outline: SemanticPanelOutlineV2Schema,
    innerCutContours: z
      .array(z.object({ vertices: polygonVertices }).strict())
      .max(24),
  })
  .strict() satisfies z.ZodType<SemanticPanelV2>;

const SemanticBodyV2Schema = z
  .object({
    key,
    label: boundedText(120),
    panelKeys: z.array(key).min(1).max(FABRICATION_LIMITS.maximumPanelCount),
    grounded: z.boolean(),
  })
  .strict() satisfies z.ZodType<SemanticBodyV2>;

export const SemanticEdgeAttachmentV2Schema = z
  .object({
    panelKey: key,
    edgeIndex: z.number().int().min(0).max(63),
  })
  .strict() satisfies z.ZodType<SemanticEdgeAttachmentV2>;

const angularJointFields = {
  key,
  parentBodyKey: key,
  childBodyKey: key,
  parentAttachment: SemanticEdgeAttachmentV2Schema,
  childAttachment: SemanticEdgeAttachmentV2Schema,
  homeAngleDeg: finite.min(-180).max(180),
  minimumAngleDeg: finite.min(-360).max(360),
  maximumAngleDeg: finite.min(-360).max(360),
} as const;

export const SemanticJointV2Schema = z.discriminatedUnion("kind", [
  z
    .object({
      ...angularJointFields,
      kind: z.literal("fold"),
      foldDirection: z.enum(["mountain", "valley"]),
    })
    .strict(),
  z
    .object({
      ...angularJointFields,
      kind: z.literal("revolute"),
      connectorRelationshipKeys: z.array(key).min(1).max(4),
    })
    .strict(),
  z
    .object({
      key,
      kind: z.literal("prismatic"),
      parentBodyKey: key,
      childBodyKey: key,
      parentAttachment: SemanticEdgeAttachmentV2Schema,
      childAttachment: SemanticEdgeAttachmentV2Schema,
      travelDirection: z.enum([
        "edge_tangent",
        "edge_normal_inward",
        "edge_normal_outward",
        "sheet_normal",
      ]),
      guideRelationshipKeys: z.array(key).min(1).max(4),
      homeTravelMm: finite,
      minimumTravelMm: finite,
      maximumTravelMm: finite,
    })
    .strict(),
]) satisfies z.ZodType<SemanticJointV2>;

const SemanticTabSlotRelationshipV2Schema = z
  .object({
    key,
    tabAttachment: SemanticEdgeAttachmentV2Schema,
    slotAttachment: SemanticEdgeAttachmentV2Schema,
    spanMm: positiveMm,
    tabDepthMm: positiveMm,
    slotInsetMm: positiveMm,
    clearanceMm: finite.min(0).max(10),
  })
  .strict() satisfies z.ZodType<SemanticTabSlotRelationshipV2>;

const SemanticDriverV2Schema = z
  .object({
    key,
    jointKey: key,
    label: boundedText(120),
    control: z.enum(["pull_tab", "fold", "slide", "rotate"]),
    minimumValue: finite,
    maximumValue: finite,
    homeValue: finite,
    direction: z.union([z.literal(-1), z.literal(1)]),
  })
  .strict() satisfies z.ZodType<SemanticDriverV2>;

const SemanticMotionOutputV2Schema = z
  .object({
    key,
    jointKey: key,
    bodyKey: key,
    label: boundedText(120),
    minimumValue: finite,
    maximumValue: finite,
    direction: z.union([z.literal(-1), z.literal(1)]),
  })
  .strict() satisfies z.ZodType<SemanticMotionOutputV2>;

const SemanticCouplingV2Schema = z.discriminatedUnion("kind", [
  z
    .object({
      key,
      kind: z.literal("direct_ratio"),
      inputJointKey: key,
      outputJointKeys: z
        .array(key)
        .min(1)
        .max(FABRICATION_LIMITS.maximumOutputCount),
      ratio: finite,
      offset: finite,
      offsetUnit: z.enum(["mm", "deg"]),
    })
    .strict(),
  z
    .object({
      key,
      kind: z.literal("mirrored_pair"),
      inputJointKey: key,
      leftOutputJointKey: key,
      rightOutputJointKey: key,
      ratio: finite,
      phaseOffsetDeg: finite,
    })
    .strict(),
  z
    .object({
      key,
      kind: z.literal("pull_tab"),
      driverKey: key,
      sliderJointKey: key,
      outputJointKeys: z
        .array(key)
        .min(1)
        .max(FABRICATION_LIMITS.maximumOutputCount),
      ratio: finite,
    })
    .strict(),
  z
    .object({
      key,
      kind: z.literal("cam_slot"),
      driverKey: key,
      connectorRelationshipKey: key,
      outputJointKey: key,
      branch: z.enum(["positive", "negative"]),
      phaseOffsetMm: finite,
    })
    .strict(),
]) satisfies z.ZodType<SemanticCouplingV2>;

const SemanticLandmarkReferenceV2Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("panel"), key }).strict(),
  z.object({ kind: z.literal("body"), key }).strict(),
  z.object({ kind: z.literal("joint"), key }).strict(),
  z.object({ kind: z.literal("connector_relationship"), key }).strict(),
  z.object({ kind: z.literal("driver"), key }).strict(),
  z.object({ kind: z.literal("output"), key }).strict(),
]);

const SemanticLandmarkV2Schema = z
  .object({
    key,
    label: boundedText(120),
    role: boundedText(120),
    geometryRefs: z.array(SemanticLandmarkReferenceV2Schema).min(1).max(32),
  })
  .strict() satisfies z.ZodType<SemanticLandmarkV2>;

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

export const FabricationPlanV2Schema = z
  .object({
    version: z.literal("2"),
    candidateLabel: boundedText(120),
    topologyKey: key,
    panels: z
      .array(SemanticPanelV2Schema)
      .min(1)
      .max(FABRICATION_LIMITS.maximumPanelCount),
    bodies: z
      .array(SemanticBodyV2Schema)
      .min(1)
      .max(FABRICATION_LIMITS.maximumPanelCount),
    joints: z
      .array(SemanticJointV2Schema)
      .max(FABRICATION_LIMITS.maximumJointCount),
    connectorRelationships: z
      .array(SemanticTabSlotRelationshipV2Schema)
      .max(Math.floor(FABRICATION_LIMITS.maximumConnectorCount / 2)),
    driver: SemanticDriverV2Schema.nullable(),
    outputs: z
      .array(SemanticMotionOutputV2Schema)
      .max(FABRICATION_LIMITS.maximumOutputCount),
    couplings: z
      .array(SemanticCouplingV2Schema)
      .max(FABRICATION_LIMITS.maximumJointAndConnectorCount),
    landmarks: z.array(SemanticLandmarkV2Schema).max(40),
    assemblyStrategy: z.enum(["fold_only", "tab_slot", "articulated_tab_slot"]),
    designSummary: boundedText(1_000),
  })
  .strict()
  .superRefine((plan, context) => {
    const resourceCounts = semanticPlanResourceCounts(plan);
    addDuplicateKeyIssues(plan.panels, "panels", context);
    addDuplicateKeyIssues(plan.bodies, "bodies", context);
    addDuplicateKeyIssues(plan.joints, "joints", context);
    addDuplicateKeyIssues(
      plan.connectorRelationships,
      "connectorRelationships",
      context,
    );
    addDuplicateKeyIssues(plan.outputs, "outputs", context);
    addDuplicateKeyIssues(plan.couplings, "couplings", context);
    addDuplicateKeyIssues(plan.landmarks, "landmarks", context);
    if (
      resourceCounts.mechanismFeatureCount >
      FABRICATION_LIMITS.maximumJointAndConnectorCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["connectorRelationships"],
        message: `Joints plus derived tab and slot connectors may not exceed ${FABRICATION_LIMITS.maximumJointAndConnectorCount}.`,
      });
    }
  }) satisfies z.ZodType<FabricationPlanV2>;
