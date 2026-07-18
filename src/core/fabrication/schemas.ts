import { z } from "zod";

import { FABRICATION_CONTRACT_VERSIONS, FABRICATION_LIMITS } from "./limits";
import type * as Contracts from "./types";

const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,79}$/;
const STABLE_FAILURE_ID_PATTERN =
  /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+(?:#[A-Za-z0-9._:-]+)?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PROGRAM_PATH_PATTERN =
  /^\/(?:modules|connections|blueprint)\/[^/]+(?:\/[^/]+)+$/;

const boundedText = (maximumLength: number) =>
  z.string().trim().min(1).max(maximumLength);

const finiteNumber = z.number().finite();
const nonnegativeNumber = finiteNumber.min(0);
const positiveNumber = finiteNumber.positive();
const identifier = z.string().regex(IDENTIFIER_PATTERN);
const sha256 = z.string().regex(SHA256_PATTERN);

export const Point2MmSchema = z
  .object({
    xMm: finiteNumber,
    yMm: finiteNumber,
  })
  .strict() satisfies z.ZodType<Contracts.Point2Mm>;

export const Point3MmSchema = z
  .object({
    xMm: finiteNumber,
    yMm: finiteNumber,
    zMm: finiteNumber,
  })
  .strict() satisfies z.ZodType<Contracts.Point3Mm>;

export const Vector3Schema = z
  .object({
    x: finiteNumber,
    y: finiteNumber,
    z: finiteNumber,
  })
  .strict() satisfies z.ZodType<Contracts.Vector3>;

export const QuaternionSchema = z
  .object({
    x: finiteNumber,
    y: finiteNumber,
    z: finiteNumber,
    w: finiteNumber,
  })
  .strict() satisfies z.ZodType<Contracts.Quaternion>;

export const Segment2MmSchema = z
  .object({
    start: Point2MmSchema,
    end: Point2MmSchema,
  })
  .strict() satisfies z.ZodType<Contracts.Segment2Mm>;

export const Axis3MmSchema = z
  .object({
    startMm: Point3MmSchema,
    endMm: Point3MmSchema,
  })
  .strict() satisfies z.ZodType<Contracts.Axis3Mm>;

export const PolygonContourV1Schema = z
  .object({
    vertices: z
      .array(Point2MmSchema)
      .min(3)
      .max(FABRICATION_LIMITS.maximumVerticesPerPanel),
  })
  .strict() satisfies z.ZodType<Contracts.PolygonContourV1>;

export const NormalizedPoint2Schema = z
  .object({
    u: finiteNumber.min(0).max(1),
    v: finiteNumber.min(0).max(1),
  })
  .strict() satisfies z.ZodType<Contracts.NormalizedPoint2>;

export const NormalizedPolygonContourV1Schema = z
  .object({
    vertices: z
      .array(NormalizedPoint2Schema)
      .min(3)
      .max(FABRICATION_LIMITS.maximumVerticesPerPanel),
  })
  .strict() satisfies z.ZodType<Contracts.NormalizedPolygonContourV1>;

export const Transform2MmSchema = z
  .object({
    translationMm: Point2MmSchema,
    rotationDeg: finiteNumber,
  })
  .strict() satisfies z.ZodType<Contracts.Transform2Mm>;

export const Transform3MmSchema = z
  .object({
    translationMm: Point3MmSchema,
    rotation: QuaternionSchema,
  })
  .strict() satisfies z.ZodType<Contracts.Transform3Mm>;

export const MaterialSpecV1Schema = z
  .object({
    materialId: identifier,
    label: boundedText(80),
    thicknessMm: positiveNumber.max(25),
    grainDirection: z.enum(["x", "y", "none"]),
  })
  .strict() satisfies z.ZodType<Contracts.MaterialSpecV1>;

export const SheetV1Schema = z
  .object({
    sheetId: identifier,
    widthMm: positiveNumber.max(2_000),
    heightMm: positiveNumber.max(2_000),
    printableMarginMm: nonnegativeNumber.max(100),
    material: MaterialSpecV1Schema,
  })
  .strict() satisfies z.ZodType<Contracts.SheetV1>;

export const GeometryRefV1Schema = z
  .object({
    kind: z.enum([
      "sheet",
      "path",
      "panel",
      "body",
      "joint",
      "connector",
      "driver",
      "output",
      "semantic_part",
      "semantic_constraint",
      "export",
    ]),
    id: identifier,
  })
  .strict() satisfies z.ZodType<Contracts.GeometryRefV1>;

const semanticConstraintBase = {
  constraintId: identifier,
  hard: z.boolean(),
  source: z.enum(["user", "inferred", "program"]),
};

export const DimensionConstraintV1Schema = z
  .object({
    ...semanticConstraintBase,
    kind: z.literal("dimension"),
    geometryRef: GeometryRefV1Schema,
    dimension: z.enum(["width", "height", "depth", "length"]),
    minimumMm: nonnegativeNumber.nullable(),
    maximumMm: nonnegativeNumber.nullable(),
    targetMm: nonnegativeNumber.nullable(),
    toleranceMm: nonnegativeNumber.nullable(),
  })
  .strict() satisfies z.ZodType<Contracts.DimensionConstraintV1>;

export const ClearanceConstraintV1Schema = z
  .object({
    ...semanticConstraintBase,
    kind: z.literal("clearance"),
    geometryRefs: z.array(GeometryRefV1Schema).length(2),
    minimumClearanceMm: nonnegativeNumber,
    during: z.enum(["rest", "all_states", "open", "closed"]),
  })
  .strict() satisfies z.ZodType<Contracts.ClearanceConstraintV1>;

export const SymmetryConstraintV1Schema = z
  .object({
    ...semanticConstraintBase,
    kind: z.literal("symmetry"),
    bodyIds: z.array(identifier).length(2),
    plane: z.enum(["xy", "xz", "yz"]),
    linearToleranceMm: nonnegativeNumber,
    angularToleranceDeg: nonnegativeNumber.max(180),
  })
  .strict() satisfies z.ZodType<Contracts.SymmetryConstraintV1>;

export const ContactConstraintV1Schema = z
  .object({
    ...semanticConstraintBase,
    kind: z.literal("contact"),
    geometryRefs: z.array(GeometryRefV1Schema).min(2).max(8),
    minimumAreaMm2: nonnegativeNumber,
    during: z.enum(["rest", "all_states", "open", "closed"]),
  })
  .strict() satisfies z.ZodType<Contracts.ContactConstraintV1>;

export const MotionConstraintV1Schema = z
  .object({
    ...semanticConstraintBase,
    kind: z.literal("motion"),
    outputId: identifier,
    minimumValue: finiteNumber,
    maximumValue: finiteNumber,
    unit: z.enum(["mm", "deg"]),
  })
  .strict() satisfies z.ZodType<Contracts.MotionConstraintV1>;

export const RecognizableFormConstraintV1Schema = z
  .object({
    ...semanticConstraintBase,
    kind: z.literal("recognizable_form"),
    label: boundedText(80),
    semanticPartIds: z.array(identifier).min(1).max(24),
    requiredLandmarks: z.array(boundedText(80)).min(1).max(24),
    evaluation: z.enum(["landmark_geometry", "human_review"]),
  })
  .strict() satisfies z.ZodType<Contracts.RecognizableFormConstraintV1>;

export const FoldFlatConstraintV1Schema = z
  .object({
    ...semanticConstraintBase,
    kind: z.literal("fold_flat"),
    bodyIds: z
      .array(identifier)
      .min(1)
      .max(FABRICATION_LIMITS.maximumPanelCount),
    maximumStackThicknessMm: positiveNumber,
  })
  .strict() satisfies z.ZodType<Contracts.FoldFlatConstraintV1>;

export const SemanticConstraintV1Schema = z.discriminatedUnion("kind", [
  DimensionConstraintV1Schema,
  ClearanceConstraintV1Schema,
  SymmetryConstraintV1Schema,
  ContactConstraintV1Schema,
  MotionConstraintV1Schema,
  RecognizableFormConstraintV1Schema,
  FoldFlatConstraintV1Schema,
]) satisfies z.ZodType<Contracts.SemanticConstraintV1>;

export const RequestedSizeV1Schema = z
  .object({
    widthMm: positiveNumber.max(2_000),
    heightMm: positiveNumber.max(2_000),
    depthMm: positiveNumber.max(2_000).nullable(),
  })
  .strict() satisfies z.ZodType<Contracts.RequestedSizeV1>;

export const FabricationBudgetV1Schema = z
  .object({
    maximumSheets: z
      .number()
      .int()
      .min(FABRICATION_LIMITS.minimumSheetCount)
      .max(FABRICATION_LIMITS.maximumSheetCount),
    maximumPanels: z
      .number()
      .int()
      .min(1)
      .max(FABRICATION_LIMITS.maximumPanelCount),
    maximumJointAndConnectorCount: z
      .number()
      .int()
      .min(0)
      .max(FABRICATION_LIMITS.maximumJointAndConnectorCount),
    cutsAllowed: z.boolean(),
    glueAllowed: z.boolean(),
  })
  .strict() satisfies z.ZodType<Contracts.FabricationBudgetV1>;

export const FabricationIntentV1Schema = z
  .object({
    version: z.literal(FABRICATION_CONTRACT_VERSIONS.intent),
    intentId: identifier,
    sourcePrompt: boundedText(4_000),
    title: boundedText(120),
    objectLabel: boundedText(120),
    functionalGoal: boundedText(500),
    visualDescription: boundedText(1_000),
    behavior: z.enum([
      "static",
      "open_close",
      "flap",
      "rotate",
      "slide",
      "expand_collapse",
    ]),
    requestedSize: RequestedSizeV1Schema,
    stockOptions: z
      .array(SheetV1Schema)
      .min(FABRICATION_LIMITS.minimumSheetCount)
      .max(FABRICATION_LIMITS.maximumSheetCount),
    fabricationBudget: FabricationBudgetV1Schema,
    semanticConstraints: z.array(SemanticConstraintV1Schema).max(64),
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
      .min(1)
      .max(6),
    scopeStatus: z.enum(["supported", "unsupported", "needs_clarification"]),
    clarificationQuestion: boundedText(300).nullable(),
    unsupportedReason: boundedText(500).nullable(),
  })
  .strict()
  .superRefine((intent, context) => {
    if (
      intent.scopeStatus === "needs_clarification" &&
      intent.clarificationQuestion === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["clarificationQuestion"],
        message: "A clarification question is required for this scope status.",
      });
    }
    if (
      intent.scopeStatus === "unsupported" &&
      intent.unsupportedReason === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["unsupportedReason"],
        message: "An unsupported reason is required for this scope status.",
      });
    }
  }) satisfies z.ZodType<Contracts.FabricationIntentV1>;

const programParameterBase = {
  parameterId: identifier,
};

export const NumberProgramParameterV1Schema = z
  .object({
    ...programParameterBase,
    kind: z.literal("number"),
    value: finiteNumber,
    unit: z.enum(["mm", "mm2", "deg", "ratio", "count", "percent"]).nullable(),
    minimum: finiteNumber.nullable(),
    maximum: finiteNumber.nullable(),
  })
  .strict() satisfies z.ZodType<Contracts.NumberProgramParameterV1>;

export const IntegerProgramParameterV1Schema = z
  .object({
    ...programParameterBase,
    kind: z.literal("integer"),
    value: z.number().int(),
    unit: z.literal("count"),
    minimum: z.number().int().nullable(),
    maximum: z.number().int().nullable(),
  })
  .strict() satisfies z.ZodType<Contracts.IntegerProgramParameterV1>;

export const BooleanProgramParameterV1Schema = z
  .object({
    ...programParameterBase,
    kind: z.literal("boolean"),
    value: z.boolean(),
    unit: z.null(),
    minimum: z.null(),
    maximum: z.null(),
  })
  .strict() satisfies z.ZodType<Contracts.BooleanProgramParameterV1>;

export const EnumProgramParameterV1Schema = z
  .object({
    ...programParameterBase,
    kind: z.literal("enum"),
    value: boundedText(80),
    allowedValues: z.array(boundedText(80)).min(1).max(32),
    unit: z.null(),
  })
  .strict() satisfies z.ZodType<Contracts.EnumProgramParameterV1>;

export const ProgramParameterV1Schema = z.discriminatedUnion("kind", [
  NumberProgramParameterV1Schema,
  IntegerProgramParameterV1Schema,
  BooleanProgramParameterV1Schema,
  EnumProgramParameterV1Schema,
]) satisfies z.ZodType<Contracts.ProgramParameterV1>;

export const ProgramPortV1Schema = z
  .object({
    portId: identifier,
    kind: z.enum(["body", "joint", "connector", "driver", "motion"]),
    direction: z.enum(["input", "output", "bidirectional"]),
  })
  .strict() satisfies z.ZodType<Contracts.ProgramPortV1>;

export const ProgramModuleV1Schema = z
  .object({
    moduleId: identifier,
    registryId: identifier,
    registryVersion: z.number().int().positive(),
    kind: z.enum([
      "panel_layout",
      "form_profile",
      "fold_structure",
      "revolute_mechanism",
      "prismatic_mechanism",
      "tab_slot_connector",
      "coupling",
    ]),
    label: boundedText(120),
    parameters: z.array(ProgramParameterV1Schema).max(64),
    ports: z.array(ProgramPortV1Schema).max(32),
    semanticPartIds: z.array(identifier).max(24),
  })
  .strict() satisfies z.ZodType<Contracts.ProgramModuleV1>;

export const ProgramConnectionV1Schema = z
  .object({
    connectionId: identifier,
    fromModuleId: identifier,
    fromPortId: identifier,
    toModuleId: identifier,
    toPortId: identifier,
  })
  .strict() satisfies z.ZodType<Contracts.ProgramConnectionV1>;

export const DirectRatioCouplingV1Schema = z
  .object({
    couplingId: identifier,
    kind: z.literal("direct_ratio"),
    inputJointId: identifier,
    outputJointIds: z
      .array(identifier)
      .min(1)
      .max(FABRICATION_LIMITS.maximumOutputCount),
    ratio: finiteNumber,
    offset: finiteNumber,
    offsetUnit: z.enum(["mm", "deg"]),
  })
  .strict() satisfies z.ZodType<Contracts.DirectRatioCouplingV1>;

export const MirroredPairCouplingV1Schema = z
  .object({
    couplingId: identifier,
    kind: z.literal("mirrored_pair"),
    inputJointId: identifier,
    leftOutputJointId: identifier,
    rightOutputJointId: identifier,
    ratio: finiteNumber,
    phaseOffsetDeg: finiteNumber,
  })
  .strict() satisfies z.ZodType<Contracts.MirroredPairCouplingV1>;

export const PullTabCouplingV1Schema = z
  .object({
    couplingId: identifier,
    kind: z.literal("pull_tab"),
    driverId: identifier,
    sliderJointId: identifier,
    outputJointIds: z
      .array(identifier)
      .min(1)
      .max(FABRICATION_LIMITS.maximumOutputCount),
    ratio: finiteNumber,
  })
  .strict() satisfies z.ZodType<Contracts.PullTabCouplingV1>;

export const CamSlotCouplingV1Schema = z
  .object({
    couplingId: identifier,
    kind: z.literal("cam_slot"),
    driverId: identifier,
    slotConnectorId: identifier,
    followerConnectorId: identifier,
    outputJointId: identifier,
    branch: z.enum(["positive", "negative"]),
    phaseOffsetMm: finiteNumber,
  })
  .strict() satisfies z.ZodType<Contracts.CamSlotCouplingV1>;

export const CouplingV1Schema = z.discriminatedUnion("kind", [
  DirectRatioCouplingV1Schema,
  MirroredPairCouplingV1Schema,
  PullTabCouplingV1Schema,
  CamSlotCouplingV1Schema,
]) satisfies z.ZodType<Contracts.CouplingV1>;

export const PanelBlueprintV1Schema = z
  .object({
    panelId: identifier,
    sheetId: identifier,
    bodyId: identifier,
    label: boundedText(120),
    role: z.enum([
      "structural",
      "decorative",
      "guide",
      "slider",
      "driver",
      "output",
    ]),
    widthMm: positiveNumber.max(2_000),
    heightMm: positiveNumber.max(2_000),
    contour: NormalizedPolygonContourV1Schema,
    innerCutContours: z.array(NormalizedPolygonContourV1Schema).max(24),
    flatTransform: Transform2MmSchema,
    semanticPartIds: z.array(identifier).max(24),
  })
  .strict() satisfies z.ZodType<Contracts.PanelBlueprintV1>;

export const FabricationPathV1Schema = z
  .object({
    pathId: identifier,
    sheetId: identifier,
    panelId: identifier.nullable(),
    kind: z.enum(["cut", "score", "perforation", "engrave"]),
    points: z.array(Point2MmSchema).min(2).max(256),
    closed: z.boolean(),
    strokeWidthMm: nonnegativeNumber.max(10),
  })
  .strict() satisfies z.ZodType<Contracts.FabricationPathV1>;

export const PanelV1Schema = z
  .object({
    panelId: identifier,
    sheetId: identifier,
    bodyId: identifier,
    label: boundedText(120),
    role: z.enum([
      "structural",
      "decorative",
      "guide",
      "slider",
      "driver",
      "output",
    ]),
    contour: PolygonContourV1Schema,
    innerCutContours: z.array(PolygonContourV1Schema).max(24),
    thicknessMm: positiveNumber.max(25),
    flatTransform: Transform2MmSchema,
    semanticPartIds: z.array(identifier).max(24),
  })
  .strict() satisfies z.ZodType<Contracts.PanelV1>;

export const RigidBodyV1Schema = z
  .object({
    bodyId: identifier,
    label: boundedText(120),
    panelIds: z
      .array(identifier)
      .min(1)
      .max(FABRICATION_LIMITS.maximumPanelCount),
    initialTransform: Transform3MmSchema,
    grounded: z.boolean(),
    semanticPartIds: z.array(identifier).max(24),
  })
  .strict() satisfies z.ZodType<Contracts.RigidBodyV1>;

export const FoldJointV1Schema = z
  .object({
    jointId: identifier,
    kind: z.literal("fold"),
    parentBodyId: identifier,
    childBodyId: identifier,
    axis: Axis3MmSchema,
    creasePathId: identifier,
    foldDirection: z.enum(["mountain", "valley"]),
    homeAngleDeg: finiteNumber,
    minAngleDeg: finiteNumber,
    maxAngleDeg: finiteNumber,
  })
  .strict() satisfies z.ZodType<Contracts.FoldJointV1>;

export const RevoluteJointV1Schema = z
  .object({
    jointId: identifier,
    kind: z.literal("revolute"),
    parentBodyId: identifier,
    childBodyId: identifier,
    axis: Axis3MmSchema,
    connectorIds: z.array(identifier).min(1).max(4),
    homeAngleDeg: finiteNumber,
    minAngleDeg: finiteNumber,
    maxAngleDeg: finiteNumber,
  })
  .strict() satisfies z.ZodType<Contracts.RevoluteJointV1>;

export const PrismaticJointV1Schema = z
  .object({
    jointId: identifier,
    kind: z.literal("prismatic"),
    parentBodyId: identifier,
    childBodyId: identifier,
    originMm: Point3MmSchema,
    axis: Vector3Schema,
    guideConnectorIds: z.array(identifier).min(1).max(4),
    homeTravelMm: finiteNumber,
    minTravelMm: finiteNumber,
    maxTravelMm: finiteNumber,
  })
  .strict() satisfies z.ZodType<Contracts.PrismaticJointV1>;

export const JointV1Schema = z.discriminatedUnion("kind", [
  FoldJointV1Schema,
  RevoluteJointV1Schema,
  PrismaticJointV1Schema,
]) satisfies z.ZodType<Contracts.JointV1>;

export const TabConnectorV1Schema = z
  .object({
    connectorId: identifier,
    kind: z.literal("tab"),
    panelId: identifier,
    mateConnectorId: identifier,
    contour: PolygonContourV1Schema,
    rootEdge: Segment2MmSchema,
    insertionDirection: Vector3Schema,
    clearanceMm: nonnegativeNumber,
  })
  .strict() satisfies z.ZodType<Contracts.TabConnectorV1>;

export const SlotConnectorV1Schema = z
  .object({
    connectorId: identifier,
    kind: z.literal("slot"),
    panelId: identifier,
    mateConnectorId: identifier,
    centerline: Segment2MmSchema,
    widthMm: positiveNumber,
    insertionDirection: Vector3Schema,
    clearanceMm: nonnegativeNumber,
  })
  .strict() satisfies z.ZodType<Contracts.SlotConnectorV1>;

export const ConnectorV1Schema = z.discriminatedUnion("kind", [
  TabConnectorV1Schema,
  SlotConnectorV1Schema,
]) satisfies z.ZodType<Contracts.ConnectorV1>;

export const DriverV1Schema = z
  .object({
    driverId: identifier,
    jointId: identifier,
    label: boundedText(120),
    control: z.enum(["pull_tab", "fold", "slide", "rotate"]),
    minimumValue: finiteNumber,
    maximumValue: finiteNumber,
    homeValue: finiteNumber,
    unit: z.enum(["mm", "deg"]),
    direction: z.union([z.literal(-1), z.literal(1)]),
  })
  .strict() satisfies z.ZodType<Contracts.DriverV1>;

export const MotionOutputV1Schema = z
  .object({
    outputId: identifier,
    jointId: identifier,
    bodyId: identifier,
    label: boundedText(120),
    minimumValue: finiteNumber,
    maximumValue: finiteNumber,
    unit: z.enum(["mm", "deg"]),
    direction: z.union([z.literal(-1), z.literal(1)]),
  })
  .strict() satisfies z.ZodType<Contracts.MotionOutputV1>;

export const SemanticPartV1Schema = z
  .object({
    semanticPartId: identifier,
    label: boundedText(120),
    role: boundedText(120),
    geometryRefs: z.array(GeometryRefV1Schema).min(1).max(32),
  })
  .strict() satisfies z.ZodType<Contracts.SemanticPartV1>;

export const AssemblyOperationV1Schema = z
  .object({
    operationId: identifier,
    order: z.number().int().min(1).max(256),
    kind: z.enum([
      "cut",
      "score",
      "fold",
      "insert_tab",
      "engage_slider",
      "join_hinge",
      "verify",
    ]),
    targetRefs: z.array(GeometryRefV1Schema).min(1).max(32),
    dependsOnOperationIds: z.array(identifier).max(32),
    instruction: boundedText(500),
  })
  .strict() satisfies z.ZodType<Contracts.AssemblyOperationV1>;

export const ProgramBlueprintV1Schema = z
  .object({
    panels: z
      .array(PanelBlueprintV1Schema)
      .min(1)
      .max(FABRICATION_LIMITS.maximumPanelCount),
    bodies: z
      .array(RigidBodyV1Schema)
      .min(1)
      .max(FABRICATION_LIMITS.maximumPanelCount),
    joints: z.array(JointV1Schema).max(FABRICATION_LIMITS.maximumJointCount),
    connectors: z
      .array(ConnectorV1Schema)
      .max(FABRICATION_LIMITS.maximumConnectorCount),
    driver: DriverV1Schema.nullable(),
    outputs: z
      .array(MotionOutputV1Schema)
      .max(FABRICATION_LIMITS.maximumOutputCount),
    couplings: z
      .array(CouplingV1Schema)
      .max(FABRICATION_LIMITS.maximumJointAndConnectorCount),
    semanticParts: z.array(SemanticPartV1Schema).max(64),
    assemblyOperations: z.array(AssemblyOperationV1Schema).max(256),
  })
  .strict()
  .superRefine((blueprint, context) => {
    if (
      blueprint.joints.length + blueprint.connectors.length >
      FABRICATION_LIMITS.maximumJointAndConnectorCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["connectors"],
        message: `Joints and connectors together may not exceed ${FABRICATION_LIMITS.maximumJointAndConnectorCount}.`,
      });
    }
  }) satisfies z.ZodType<Contracts.ProgramBlueprintV1>;

export const PlannedPanelBlueprintV1Schema =
  PanelBlueprintV1Schema satisfies z.ZodType<Contracts.PlannedPanelBlueprintV1>;

export const PlannedRigidBodyV1Schema =
  RigidBodyV1Schema satisfies z.ZodType<Contracts.PlannedRigidBodyV1>;

export const FabricationPlanV1Schema = z
  .object({
    version: z.literal(FABRICATION_CONTRACT_VERSIONS.plan),
    candidateLabel: boundedText(120),
    topologyId: identifier,
    panels: z
      .array(PlannedPanelBlueprintV1Schema)
      .min(1)
      .max(FABRICATION_LIMITS.maximumPanelCount),
    bodies: z
      .array(PlannedRigidBodyV1Schema)
      .min(1)
      .max(FABRICATION_LIMITS.maximumPanelCount),
    joints: z.array(JointV1Schema).max(FABRICATION_LIMITS.maximumJointCount),
    connectors: z
      .array(ConnectorV1Schema)
      .max(FABRICATION_LIMITS.maximumConnectorCount),
    driver: DriverV1Schema.nullable(),
    outputs: z
      .array(MotionOutputV1Schema)
      .max(FABRICATION_LIMITS.maximumOutputCount),
    couplings: z
      .array(CouplingV1Schema)
      .max(FABRICATION_LIMITS.maximumJointAndConnectorCount),
    semanticParts: z.array(SemanticPartV1Schema).max(64),
    assemblyStrategy: z.enum(["fold_only", "tab_slot", "articulated_tab_slot"]),
    designSummary: boundedText(1_000),
  })
  .strict()
  .superRefine((plan, context) => {
    if (
      plan.joints.length + plan.connectors.length >
      FABRICATION_LIMITS.maximumJointAndConnectorCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["connectors"],
        message: `Joints and connectors together may not exceed ${FABRICATION_LIMITS.maximumJointAndConnectorCount}.`,
      });
    }
  }) satisfies z.ZodType<Contracts.FabricationPlanV1>;

export const FabricationProgramV1Schema = z
  .object({
    version: z.literal(FABRICATION_CONTRACT_VERSIONS.program),
    programId: identifier,
    intentId: identifier,
    candidateLabel: boundedText(120),
    topologyId: identifier,
    topologyVersion: z.number().int().positive(),
    behavior: z.enum([
      "static",
      "open_close",
      "flap",
      "rotate",
      "slide",
      "expand_collapse",
    ]),
    sheets: z
      .array(SheetV1Schema)
      .min(FABRICATION_LIMITS.minimumSheetCount)
      .max(FABRICATION_LIMITS.maximumSheetCount),
    modules: z.array(ProgramModuleV1Schema).max(64),
    connections: z.array(ProgramConnectionV1Schema).max(96),
    blueprint: ProgramBlueprintV1Schema,
    semanticConstraints: z.array(SemanticConstraintV1Schema).max(64),
    assemblyStrategy: z.enum(["fold_only", "tab_slot", "articulated_tab_slot"]),
    designSummary: boundedText(1_000),
  })
  .strict() satisfies z.ZodType<Contracts.FabricationProgramV1>;

export const FabricationIRV1Schema = z
  .object({
    version: z.literal(FABRICATION_CONTRACT_VERSIONS.ir),
    irId: identifier,
    programId: identifier,
    unit: z.literal("mm"),
    behavior: z.enum([
      "static",
      "open_close",
      "flap",
      "rotate",
      "slide",
      "expand_collapse",
    ]),
    requestedSize: RequestedSizeV1Schema,
    sheets: z
      .array(SheetV1Schema)
      .min(FABRICATION_LIMITS.minimumSheetCount)
      .max(FABRICATION_LIMITS.maximumSheetCount),
    paths: z.array(FabricationPathV1Schema).max(512),
    panels: z
      .array(PanelV1Schema)
      .min(1)
      .max(FABRICATION_LIMITS.maximumPanelCount),
    bodies: z
      .array(RigidBodyV1Schema)
      .min(1)
      .max(FABRICATION_LIMITS.maximumPanelCount),
    joints: z.array(JointV1Schema).max(FABRICATION_LIMITS.maximumJointCount),
    connectors: z
      .array(ConnectorV1Schema)
      .max(FABRICATION_LIMITS.maximumConnectorCount),
    driver: DriverV1Schema.nullable(),
    outputs: z
      .array(MotionOutputV1Schema)
      .max(FABRICATION_LIMITS.maximumOutputCount),
    couplings: z
      .array(CouplingV1Schema)
      .max(FABRICATION_LIMITS.maximumJointAndConnectorCount),
    semanticParts: z.array(SemanticPartV1Schema).max(64),
    semanticConstraints: z.array(SemanticConstraintV1Schema).max(64),
    assemblyOperations: z.array(AssemblyOperationV1Schema).max(256),
  })
  .strict()
  .superRefine((ir, context) => {
    if (
      ir.joints.length + ir.connectors.length >
      FABRICATION_LIMITS.maximumJointAndConnectorCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["connectors"],
        message: `Joints and connectors together may not exceed ${FABRICATION_LIMITS.maximumJointAndConnectorCount}.`,
      });
    }
  }) satisfies z.ZodType<Contracts.FabricationIRV1>;

export const MeasuredValueV1Schema = z
  .object({
    value: z.union([finiteNumber, z.string(), z.boolean(), z.null()]),
    unit: z.enum(["mm", "mm2", "deg", "ratio", "count", "percent"]).nullable(),
  })
  .strict() satisfies z.ZodType<Contracts.MeasuredValueV1>;

const verificationStage = z.enum([
  "schema",
  "topology",
  "panel_geometry",
  "connections",
  "sheet_packing",
  "rigid_transforms",
  "motion",
  "collision",
  "semantics",
  "export_equivalence",
  "scoring",
]);

export const VerificationFailureV2Schema = z
  .object({
    failureId: z.string().regex(STABLE_FAILURE_ID_PATTERN),
    category: z.enum([
      "schema",
      "limit",
      "reference",
      "topology",
      "geometry",
      "manufacturability",
      "kinematics",
      "collision",
      "semantic",
      "export",
    ]),
    stage: verificationStage,
    severity: z.enum(["hard", "warning"]),
    message: boundedText(500),
    actual: MeasuredValueV1Schema,
    expected: MeasuredValueV1Schema,
    geometryRefs: z.array(GeometryRefV1Schema).max(32),
    repairableProgramPaths: z
      .array(z.string().regex(PROGRAM_PATH_PATTERN))
      .max(16),
  })
  .strict() satisfies z.ZodType<Contracts.VerificationFailureV2>;

export const VerificationCheckV2Schema = z
  .object({
    checkId: z.string().regex(STABLE_FAILURE_ID_PATTERN),
    stage: verificationStage,
    status: z.enum(["pass", "fail", "warning", "not_run"]),
    message: boundedText(500),
    actual: MeasuredValueV1Schema,
    expected: MeasuredValueV1Schema,
    geometryRefs: z.array(GeometryRefV1Schema).max(32),
    failureId: z.string().regex(STABLE_FAILURE_ID_PATTERN).nullable(),
  })
  .strict() satisfies z.ZodType<Contracts.VerificationCheckV2>;

export const VerificationMetricV2Schema = z
  .object({
    metricId: identifier,
    value: finiteNumber,
    unit: z.enum(["mm", "mm2", "deg", "ratio", "count", "percent"]),
    geometryRefs: z.array(GeometryRefV1Schema).max(32),
  })
  .strict() satisfies z.ZodType<Contracts.VerificationMetricV2>;

export const MotionVerificationSummaryV2Schema = z
  .object({
    baseSampleCount: z.number().int().min(1),
    adaptiveSampleCount: z.number().int().min(0),
    maximumClosureResidualMm: nonnegativeNumber,
    minimumClearanceMm: nonnegativeNumber,
    maximumAngleErrorDeg: nonnegativeNumber,
    maximumTravelErrorMm: nonnegativeNumber,
    collisionFree: z.boolean(),
    branchContinuous: z.boolean(),
    driverReachable: z.boolean(),
    deadStateFree: z.boolean(),
  })
  .strict() satisfies z.ZodType<Contracts.MotionVerificationSummaryV2>;

export const ExportEquivalenceCheckV2Schema = z
  .object({
    format: z.enum(["svg", "dxf", "glb", "json", "fold"]),
    status: z.enum(["pass", "fail", "warning", "not_run"]),
    sourceIrHash: sha256,
    artifactHash: sha256.nullable(),
    message: boundedText(500),
  })
  .strict() satisfies z.ZodType<Contracts.ExportEquivalenceCheckV2>;

export const VerificationReportV2Schema = z
  .object({
    version: z.literal(FABRICATION_CONTRACT_VERSIONS.verificationReport),
    reportId: identifier,
    candidateId: identifier,
    programId: identifier,
    irId: identifier,
    irHash: sha256,
    valid: z.boolean(),
    completedStage: verificationStage,
    failedAtStage: verificationStage.nullable(),
    checks: z.array(VerificationCheckV2Schema).max(512),
    failures: z.array(VerificationFailureV2Schema).max(256),
    metrics: z.array(VerificationMetricV2Schema).max(256),
    motionSummary: MotionVerificationSummaryV2Schema.nullable(),
    exportEquivalence: z.array(ExportEquivalenceCheckV2Schema).max(5),
  })
  .strict()
  .superRefine((report, context) => {
    const hasHardFailure = report.failures.some(
      (failure) => failure.severity === "hard",
    );
    if (report.valid && hasHardFailure) {
      context.addIssue({
        code: "custom",
        path: ["valid"],
        message: "A valid report cannot contain a hard failure.",
      });
    }
    if (report.valid && report.failedAtStage !== null) {
      context.addIssue({
        code: "custom",
        path: ["failedAtStage"],
        message: "A valid report cannot have a failed stage.",
      });
    }
    if (!report.valid && report.failedAtStage === null) {
      context.addIssue({
        code: "custom",
        path: ["failedAtStage"],
        message: "An invalid report must identify its failed stage.",
      });
    }
  }) satisfies z.ZodType<Contracts.VerificationReportV2>;

const patchOperationBase = {
  operationId: identifier,
  path: z.string().regex(PROGRAM_PATH_PATTERN),
  failureIds: z
    .array(z.string().regex(STABLE_FAILURE_ID_PATTERN))
    .min(1)
    .max(16),
  reason: boundedText(500),
  expectedEffect: boundedText(500),
};

export const SetNumberPatchOperationV1Schema = z
  .object({
    ...patchOperationBase,
    operation: z.literal("set_number"),
    value: finiteNumber,
    expectedCurrentValue: finiteNumber.nullable(),
    unit: z.enum(["mm", "mm2", "deg", "ratio", "count", "percent"]).nullable(),
  })
  .strict() satisfies z.ZodType<Contracts.SetNumberPatchOperationV1>;

export const SetIntegerPatchOperationV1Schema = z
  .object({
    ...patchOperationBase,
    operation: z.literal("set_integer"),
    value: z.number().int(),
    expectedCurrentValue: z.number().int().nullable(),
    unit: z.literal("count"),
  })
  .strict() satisfies z.ZodType<Contracts.SetIntegerPatchOperationV1>;

export const SetBooleanPatchOperationV1Schema = z
  .object({
    ...patchOperationBase,
    operation: z.literal("set_boolean"),
    value: z.boolean(),
    expectedCurrentValue: z.boolean().nullable(),
    unit: z.null(),
  })
  .strict() satisfies z.ZodType<Contracts.SetBooleanPatchOperationV1>;

export const SetEnumPatchOperationV1Schema = z
  .object({
    ...patchOperationBase,
    operation: z.literal("set_enum"),
    value: boundedText(80),
    expectedCurrentValue: boundedText(80).nullable(),
    unit: z.null(),
  })
  .strict() satisfies z.ZodType<Contracts.SetEnumPatchOperationV1>;

export const ProgramPatchOperationV1Schema = z.discriminatedUnion("operation", [
  SetNumberPatchOperationV1Schema,
  SetIntegerPatchOperationV1Schema,
  SetBooleanPatchOperationV1Schema,
  SetEnumPatchOperationV1Schema,
]) satisfies z.ZodType<Contracts.ProgramPatchOperationV1>;

export const ProgramPatchV1Schema = z
  .object({
    version: z.literal(FABRICATION_CONTRACT_VERSIONS.programPatch),
    patchId: identifier,
    programId: identifier,
    baseProgramHash: sha256,
    repairCycle: z
      .number()
      .int()
      .min(1)
      .max(FABRICATION_LIMITS.maximumRepairCycles),
    diagnosis: boundedText(1_000),
    operations: z
      .array(ProgramPatchOperationV1Schema)
      .min(1)
      .max(FABRICATION_LIMITS.maximumPatchOperationsPerCycle),
    authoredBy: z.enum(["ai", "code", "user"]),
    changesIntent: z.literal(false),
  })
  .strict() satisfies z.ZodType<Contracts.ProgramPatchV1>;

export const ScoreComponentV2Schema = z
  .object({
    componentId: identifier,
    label: boundedText(120),
    normalizedScore: finiteNumber.min(0).max(100),
    weight: finiteNumber.min(0).max(1),
    weightedScore: finiteNumber.min(0).max(100),
    evidenceCheckIds: z
      .array(z.string().regex(STABLE_FAILURE_ID_PATTERN))
      .max(64),
  })
  .strict() satisfies z.ZodType<Contracts.ScoreComponentV2>;

export const CandidateScoreV2Schema = z
  .object({
    eligible: z.boolean(),
    totalScore: finiteNumber.min(0).max(100).nullable(),
    components: z.array(ScoreComponentV2Schema).max(32),
    rankingReason: boundedText(500).nullable(),
  })
  .strict()
  .superRefine((score, context) => {
    if (score.eligible && score.totalScore === null) {
      context.addIssue({
        code: "custom",
        path: ["totalScore"],
        message: "An eligible candidate requires a total score.",
      });
    }
    if (!score.eligible && score.totalScore !== null) {
      context.addIssue({
        code: "custom",
        path: ["totalScore"],
        message: "An ineligible candidate may not have a total score.",
      });
    }
  }) satisfies z.ZodType<Contracts.CandidateScoreV2>;

export const CandidateProvenanceV2Schema = z
  .object({
    provenanceId: identifier,
    compilerVersion: boundedText(80),
    inputHash: sha256,
    intentHash: sha256,
    programHash: sha256,
    irHash: sha256,
    modelId: boundedText(120).nullable(),
    modelResponseId: boundedText(200).nullable(),
    modelPlanHash: sha256.nullable(),
    planExpanderVersion: boundedText(40).nullable(),
    generatedAtIso: z.iso.datetime({ offset: true }),
    deterministicSeed: z.number().int().min(0).max(4_294_967_295),
    parentCandidateId: identifier.nullable(),
    appliedPatchIds: z
      .array(identifier)
      .max(FABRICATION_LIMITS.maximumRepairCycles),
    repairCycle: z
      .number()
      .int()
      .min(0)
      .max(FABRICATION_LIMITS.maximumRepairCycles),
  })
  .strict() satisfies z.ZodType<Contracts.CandidateProvenanceV2>;

const exportFormat = z.enum(["svg", "dxf", "glb", "json", "fold"]);

export const ExportArtifactMetadataV1Schema = z
  .object({
    format: exportFormat,
    fileName: boundedText(240),
    mimeType: boundedText(120),
    sha256,
    byteLength: z.number().int().min(0),
    sourceIrHash: sha256,
    sourceCandidateId: identifier,
    verified: z.boolean(),
  })
  .strict() satisfies z.ZodType<Contracts.ExportArtifactMetadataV1>;

export const ExportMetadataV1Schema = z
  .object({
    status: z.enum(["not_generated", "generated", "verified", "failed"]),
    requestedFormats: z.array(exportFormat).max(5),
    artifacts: z.array(ExportArtifactMetadataV1Schema).max(5),
    calibrationLengthMm: positiveNumber,
    selectedCandidateId: identifier.nullable(),
    sourceEquivalent: z.boolean(),
    foldOmissionReason: boundedText(500).nullable(),
  })
  .strict() satisfies z.ZodType<Contracts.ExportMetadataV1>;

export const CandidateV2Schema = z
  .object({
    version: z.literal(FABRICATION_CONTRACT_VERSIONS.candidate),
    candidateId: identifier,
    label: boundedText(120),
    rank: z
      .number()
      .int()
      .min(1)
      .max(FABRICATION_LIMITS.maximumCandidateCount)
      .nullable(),
    selectionStatus: z.enum([
      "unranked",
      "eligible",
      "recommended",
      "selected",
      "invalid",
    ]),
    intent: FabricationIntentV1Schema,
    program: FabricationProgramV1Schema,
    ir: FabricationIRV1Schema,
    verification: VerificationReportV2Schema,
    score: CandidateScoreV2Schema,
    provenance: CandidateProvenanceV2Schema,
    exportMetadata: ExportMetadataV1Schema,
  })
  .strict()
  .superRefine((candidate, context) => {
    const idChecks: readonly [string, string, readonly (string | number)[]][] =
      [
        [
          candidate.intent.intentId,
          candidate.program.intentId,
          ["program", "intentId"],
        ],
        [
          candidate.program.programId,
          candidate.ir.programId,
          ["ir", "programId"],
        ],
        [
          candidate.candidateId,
          candidate.verification.candidateId,
          ["verification", "candidateId"],
        ],
        [
          candidate.program.programId,
          candidate.verification.programId,
          ["verification", "programId"],
        ],
        [
          candidate.ir.irId,
          candidate.verification.irId,
          ["verification", "irId"],
        ],
        [
          candidate.provenance.irHash,
          candidate.verification.irHash,
          ["verification", "irHash"],
        ],
      ];

    for (const [expected, actual, path] of idChecks) {
      if (expected !== actual) {
        context.addIssue({
          code: "custom",
          path: [...path],
          message: "Candidate contract references must agree.",
        });
      }
    }

    if (candidate.verification.valid !== candidate.score.eligible) {
      context.addIssue({
        code: "custom",
        path: ["score", "eligible"],
        message: "Only a verified candidate is eligible for scoring.",
      });
    }
    if (
      !candidate.verification.valid &&
      candidate.selectionStatus !== "invalid"
    ) {
      context.addIssue({
        code: "custom",
        path: ["selectionStatus"],
        message: "A hard-invalid candidate must have invalid selection status.",
      });
    }
  }) satisfies z.ZodType<Contracts.CandidateV2>;
