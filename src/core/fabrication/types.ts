export type FabricationBehavior =
  "static" | "open_close" | "flap" | "rotate" | "slide" | "expand_collapse";

export type FabricationPriority =
  | "fabrication_efficiency"
  | "mechanical_simplicity"
  | "visual_expression"
  | "compactness"
  | "stability"
  | "motion_range";

export type FabricationUnit =
  "mm" | "mm2" | "deg" | "ratio" | "count" | "percent";

export interface Point2Mm {
  readonly xMm: number;
  readonly yMm: number;
}

export interface Point3Mm {
  readonly xMm: number;
  readonly yMm: number;
  readonly zMm: number;
}

export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Quaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface Segment2Mm {
  readonly start: Point2Mm;
  readonly end: Point2Mm;
}

export interface Axis3Mm {
  readonly startMm: Point3Mm;
  readonly endMm: Point3Mm;
}

export interface PolygonContourV1 {
  readonly vertices: readonly Point2Mm[];
}

export interface NormalizedPoint2 {
  readonly u: number;
  readonly v: number;
}

export interface NormalizedPolygonContourV1 {
  readonly vertices: readonly NormalizedPoint2[];
}

export interface Transform2Mm {
  readonly translationMm: Point2Mm;
  readonly rotationDeg: number;
}

export interface Transform3Mm {
  readonly translationMm: Point3Mm;
  readonly rotation: Quaternion;
}

export interface MaterialSpecV1 {
  readonly materialId: string;
  readonly label: string;
  readonly thicknessMm: number;
  readonly grainDirection: "x" | "y" | "none";
}

export interface SheetV1 {
  readonly sheetId: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly printableMarginMm: number;
  readonly material: MaterialSpecV1;
}

export type GeometryRefKind =
  | "sheet"
  | "path"
  | "panel"
  | "body"
  | "joint"
  | "connector"
  | "driver"
  | "output"
  | "semantic_part"
  | "semantic_constraint"
  | "export";

export interface GeometryRefV1 {
  readonly kind: GeometryRefKind;
  readonly id: string;
}

export type SemanticConstraintSource = "user" | "inferred" | "program";

export interface DimensionConstraintV1 {
  readonly constraintId: string;
  readonly kind: "dimension";
  readonly hard: boolean;
  readonly source: SemanticConstraintSource;
  readonly geometryRef: GeometryRefV1;
  readonly dimension: "width" | "height" | "depth" | "length";
  readonly minimumMm: number | null;
  readonly maximumMm: number | null;
  readonly targetMm: number | null;
  readonly toleranceMm: number | null;
}

export interface ClearanceConstraintV1 {
  readonly constraintId: string;
  readonly kind: "clearance";
  readonly hard: boolean;
  readonly source: SemanticConstraintSource;
  readonly geometryRefs: readonly GeometryRefV1[];
  readonly minimumClearanceMm: number;
  readonly during: "rest" | "all_states" | "open" | "closed";
}

export interface SymmetryConstraintV1 {
  readonly constraintId: string;
  readonly kind: "symmetry";
  readonly hard: boolean;
  readonly source: SemanticConstraintSource;
  readonly bodyIds: readonly string[];
  readonly plane: "xy" | "xz" | "yz";
  readonly linearToleranceMm: number;
  readonly angularToleranceDeg: number;
}

export interface ContactConstraintV1 {
  readonly constraintId: string;
  readonly kind: "contact";
  readonly hard: boolean;
  readonly source: SemanticConstraintSource;
  readonly geometryRefs: readonly GeometryRefV1[];
  readonly minimumAreaMm2: number;
  readonly during: "rest" | "all_states" | "open" | "closed";
}

export interface MotionConstraintV1 {
  readonly constraintId: string;
  readonly kind: "motion";
  readonly hard: boolean;
  readonly source: SemanticConstraintSource;
  readonly outputId: string;
  readonly minimumValue: number;
  readonly maximumValue: number;
  readonly unit: "mm" | "deg";
}

export interface RecognizableFormConstraintV1 {
  readonly constraintId: string;
  readonly kind: "recognizable_form";
  readonly hard: boolean;
  readonly source: SemanticConstraintSource;
  readonly label: string;
  readonly semanticPartIds: readonly string[];
  readonly requiredLandmarks: readonly string[];
  readonly evaluation: "landmark_geometry" | "human_review";
}

export interface FoldFlatConstraintV1 {
  readonly constraintId: string;
  readonly kind: "fold_flat";
  readonly hard: boolean;
  readonly source: SemanticConstraintSource;
  readonly bodyIds: readonly string[];
  readonly maximumStackThicknessMm: number;
}

export type SemanticConstraintV1 =
  | DimensionConstraintV1
  | ClearanceConstraintV1
  | SymmetryConstraintV1
  | ContactConstraintV1
  | MotionConstraintV1
  | RecognizableFormConstraintV1
  | FoldFlatConstraintV1;

export interface RequestedSizeV1 {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly depthMm: number | null;
}

export interface FabricationBudgetV1 {
  readonly maximumSheets: number;
  readonly maximumPanels: number;
  readonly maximumJointAndConnectorCount: number;
  readonly cutsAllowed: boolean;
  readonly glueAllowed: boolean;
}

export interface FabricationIntentV1 {
  readonly version: "1";
  readonly intentId: string;
  readonly sourcePrompt: string;
  readonly title: string;
  readonly objectLabel: string;
  readonly functionalGoal: string;
  readonly visualDescription: string;
  readonly behavior: FabricationBehavior;
  readonly requestedSize: RequestedSizeV1;
  readonly stockOptions: readonly SheetV1[];
  readonly fabricationBudget: FabricationBudgetV1;
  readonly semanticConstraints: readonly SemanticConstraintV1[];
  readonly priorities: readonly FabricationPriority[];
  readonly scopeStatus: "supported" | "unsupported" | "needs_clarification";
  readonly clarificationQuestion: string | null;
  readonly unsupportedReason: string | null;
}

export interface NumberProgramParameterV1 {
  readonly parameterId: string;
  readonly kind: "number";
  readonly value: number;
  readonly unit: FabricationUnit | null;
  readonly minimum: number | null;
  readonly maximum: number | null;
}

export interface IntegerProgramParameterV1 {
  readonly parameterId: string;
  readonly kind: "integer";
  readonly value: number;
  readonly unit: "count";
  readonly minimum: number | null;
  readonly maximum: number | null;
}

export interface BooleanProgramParameterV1 {
  readonly parameterId: string;
  readonly kind: "boolean";
  readonly value: boolean;
  readonly unit: null;
  readonly minimum: null;
  readonly maximum: null;
}

export interface EnumProgramParameterV1 {
  readonly parameterId: string;
  readonly kind: "enum";
  readonly value: string;
  readonly allowedValues: readonly string[];
  readonly unit: null;
}

export type ProgramParameterV1 =
  | NumberProgramParameterV1
  | IntegerProgramParameterV1
  | BooleanProgramParameterV1
  | EnumProgramParameterV1;

export interface ProgramPortV1 {
  readonly portId: string;
  readonly kind: "body" | "joint" | "connector" | "driver" | "motion";
  readonly direction: "input" | "output" | "bidirectional";
}

export interface ProgramModuleV1 {
  readonly moduleId: string;
  readonly registryId: string;
  readonly registryVersion: number;
  readonly kind:
    | "panel_layout"
    | "form_profile"
    | "fold_structure"
    | "revolute_mechanism"
    | "prismatic_mechanism"
    | "tab_slot_connector"
    | "coupling";
  readonly label: string;
  readonly parameters: readonly ProgramParameterV1[];
  readonly ports: readonly ProgramPortV1[];
  readonly semanticPartIds: readonly string[];
}

export interface ProgramConnectionV1 {
  readonly connectionId: string;
  readonly fromModuleId: string;
  readonly fromPortId: string;
  readonly toModuleId: string;
  readonly toPortId: string;
}

export interface PanelBlueprintV1 {
  readonly panelId: string;
  readonly sheetId: string;
  readonly bodyId: string;
  readonly label: string;
  readonly role:
    "structural" | "decorative" | "guide" | "slider" | "driver" | "output";
  readonly widthMm: number;
  readonly heightMm: number;
  readonly contour: NormalizedPolygonContourV1;
  readonly innerCutContours: readonly NormalizedPolygonContourV1[];
  readonly flatTransform: Transform2Mm;
  readonly semanticPartIds: readonly string[];
}

export interface DirectRatioCouplingV1 {
  readonly couplingId: string;
  readonly kind: "direct_ratio";
  readonly inputJointId: string;
  readonly outputJointIds: readonly string[];
  readonly ratio: number;
  readonly offset: number;
  readonly offsetUnit: "mm" | "deg";
}

export interface MirroredPairCouplingV1 {
  readonly couplingId: string;
  readonly kind: "mirrored_pair";
  readonly inputJointId: string;
  readonly leftOutputJointId: string;
  readonly rightOutputJointId: string;
  readonly ratio: number;
  readonly phaseOffsetDeg: number;
}

export interface PullTabCouplingV1 {
  readonly couplingId: string;
  readonly kind: "pull_tab";
  readonly driverId: string;
  readonly sliderJointId: string;
  readonly outputJointIds: readonly string[];
  readonly ratio: number;
}

export interface CamSlotCouplingV1 {
  readonly couplingId: string;
  readonly kind: "cam_slot";
  readonly driverId: string;
  readonly slotConnectorId: string;
  readonly followerConnectorId: string;
  readonly outputJointId: string;
  readonly branch: "positive" | "negative";
  readonly phaseOffsetMm: number;
}

export type CouplingV1 =
  | DirectRatioCouplingV1
  | MirroredPairCouplingV1
  | PullTabCouplingV1
  | CamSlotCouplingV1;

export interface ProgramBlueprintV1 {
  readonly panels: readonly PanelBlueprintV1[];
  readonly bodies: readonly RigidBodyV1[];
  readonly joints: readonly JointV1[];
  readonly connectors: readonly ConnectorV1[];
  readonly driver: DriverV1 | null;
  readonly outputs: readonly MotionOutputV1[];
  readonly couplings: readonly CouplingV1[];
  readonly semanticParts: readonly SemanticPartV1[];
  readonly assemblyOperations: readonly AssemblyOperationV1[];
}

/**
 * The model authors this compact, geometric plan. Code supplies every field
 * that is copied from the intent or can be derived without design judgment.
 */
export interface PlannedPanelBlueprintV1 {
  readonly panelId: string;
  readonly sheetId: string;
  readonly bodyId: string;
  readonly label: string;
  readonly role:
    "structural" | "decorative" | "guide" | "slider" | "driver" | "output";
  readonly widthMm: number;
  readonly heightMm: number;
  readonly contour: NormalizedPolygonContourV1;
  readonly innerCutContours: readonly NormalizedPolygonContourV1[];
  readonly flatTransform: Transform2Mm;
  readonly semanticPartIds: readonly string[];
}

export interface PlannedRigidBodyV1 {
  readonly bodyId: string;
  readonly label: string;
  readonly panelIds: readonly string[];
  readonly initialTransform: Transform3Mm;
  readonly grounded: boolean;
  readonly semanticPartIds: readonly string[];
}

export interface FabricationPlanV1 {
  readonly version: "1";
  readonly candidateLabel: string;
  readonly topologyId: string;
  readonly panels: readonly PlannedPanelBlueprintV1[];
  readonly bodies: readonly PlannedRigidBodyV1[];
  readonly joints: readonly JointV1[];
  readonly connectors: readonly ConnectorV1[];
  readonly driver: DriverV1 | null;
  readonly outputs: readonly MotionOutputV1[];
  readonly couplings: readonly CouplingV1[];
  readonly semanticParts: readonly SemanticPartV1[];
  readonly assemblyStrategy: "fold_only" | "tab_slot" | "articulated_tab_slot";
  readonly designSummary: string;
}

export interface FabricationProgramV1 {
  readonly version: "1";
  readonly programId: string;
  readonly intentId: string;
  readonly candidateLabel: string;
  readonly topologyId: string;
  readonly topologyVersion: number;
  readonly behavior: FabricationBehavior;
  readonly sheets: readonly SheetV1[];
  readonly modules: readonly ProgramModuleV1[];
  readonly connections: readonly ProgramConnectionV1[];
  readonly blueprint: ProgramBlueprintV1;
  readonly semanticConstraints: readonly SemanticConstraintV1[];
  readonly assemblyStrategy: "fold_only" | "tab_slot" | "articulated_tab_slot";
  readonly designSummary: string;
}

export interface FabricationPathV1 {
  readonly pathId: string;
  readonly sheetId: string;
  readonly panelId: string | null;
  readonly kind: "cut" | "score" | "perforation" | "engrave";
  readonly points: readonly Point2Mm[];
  readonly closed: boolean;
  readonly strokeWidthMm: number;
}

export interface PanelV1 {
  readonly panelId: string;
  readonly sheetId: string;
  readonly bodyId: string;
  readonly label: string;
  readonly role:
    "structural" | "decorative" | "guide" | "slider" | "driver" | "output";
  readonly contour: PolygonContourV1;
  readonly innerCutContours: readonly PolygonContourV1[];
  readonly thicknessMm: number;
  readonly flatTransform: Transform2Mm;
  readonly semanticPartIds: readonly string[];
}

export interface RigidBodyV1 {
  readonly bodyId: string;
  readonly label: string;
  readonly panelIds: readonly string[];
  readonly initialTransform: Transform3Mm;
  readonly grounded: boolean;
  readonly semanticPartIds: readonly string[];
}

export interface FoldJointV1 {
  readonly jointId: string;
  readonly kind: "fold";
  readonly parentBodyId: string;
  readonly childBodyId: string;
  readonly axis: Axis3Mm;
  readonly creasePathId: string;
  readonly foldDirection: "mountain" | "valley";
  readonly homeAngleDeg: number;
  readonly minAngleDeg: number;
  readonly maxAngleDeg: number;
}

export interface RevoluteJointV1 {
  readonly jointId: string;
  readonly kind: "revolute";
  readonly parentBodyId: string;
  readonly childBodyId: string;
  readonly axis: Axis3Mm;
  readonly connectorIds: readonly string[];
  readonly homeAngleDeg: number;
  readonly minAngleDeg: number;
  readonly maxAngleDeg: number;
}

export interface PrismaticJointV1 {
  readonly jointId: string;
  readonly kind: "prismatic";
  readonly parentBodyId: string;
  readonly childBodyId: string;
  readonly originMm: Point3Mm;
  readonly axis: Vector3;
  readonly guideConnectorIds: readonly string[];
  readonly homeTravelMm: number;
  readonly minTravelMm: number;
  readonly maxTravelMm: number;
}

export type JointV1 = FoldJointV1 | RevoluteJointV1 | PrismaticJointV1;

export interface TabConnectorV1 {
  readonly connectorId: string;
  readonly kind: "tab";
  readonly panelId: string;
  readonly mateConnectorId: string;
  readonly contour: PolygonContourV1;
  readonly rootEdge: Segment2Mm;
  readonly insertionDirection: Vector3;
  readonly clearanceMm: number;
}

export interface SlotConnectorV1 {
  readonly connectorId: string;
  readonly kind: "slot";
  readonly panelId: string;
  readonly mateConnectorId: string;
  readonly centerline: Segment2Mm;
  readonly widthMm: number;
  readonly insertionDirection: Vector3;
  readonly clearanceMm: number;
}

export type ConnectorV1 = TabConnectorV1 | SlotConnectorV1;

export interface DriverV1 {
  readonly driverId: string;
  readonly jointId: string;
  readonly label: string;
  readonly control: "pull_tab" | "fold" | "slide" | "rotate";
  readonly minimumValue: number;
  readonly maximumValue: number;
  readonly homeValue: number;
  readonly unit: "mm" | "deg";
  readonly direction: -1 | 1;
}

export interface MotionOutputV1 {
  readonly outputId: string;
  readonly jointId: string;
  readonly bodyId: string;
  readonly label: string;
  readonly minimumValue: number;
  readonly maximumValue: number;
  readonly unit: "mm" | "deg";
  readonly direction: -1 | 1;
}

export interface SemanticPartV1 {
  readonly semanticPartId: string;
  readonly label: string;
  readonly role: string;
  readonly geometryRefs: readonly GeometryRefV1[];
}

export interface AssemblyOperationV1 {
  readonly operationId: string;
  readonly order: number;
  readonly kind:
    | "cut"
    | "score"
    | "fold"
    | "insert_tab"
    | "engage_slider"
    | "join_hinge"
    | "verify";
  readonly targetRefs: readonly GeometryRefV1[];
  readonly dependsOnOperationIds: readonly string[];
  readonly instruction: string;
}

export interface FabricationIRV1 {
  readonly version: "1";
  readonly irId: string;
  readonly programId: string;
  readonly unit: "mm";
  readonly behavior: FabricationBehavior;
  readonly requestedSize: RequestedSizeV1;
  readonly sheets: readonly SheetV1[];
  readonly paths: readonly FabricationPathV1[];
  readonly panels: readonly PanelV1[];
  readonly bodies: readonly RigidBodyV1[];
  readonly joints: readonly JointV1[];
  readonly connectors: readonly ConnectorV1[];
  readonly driver: DriverV1 | null;
  readonly outputs: readonly MotionOutputV1[];
  readonly couplings: readonly CouplingV1[];
  readonly semanticParts: readonly SemanticPartV1[];
  readonly semanticConstraints: readonly SemanticConstraintV1[];
  readonly assemblyOperations: readonly AssemblyOperationV1[];
}

export type VerificationStage =
  | "schema"
  | "topology"
  | "panel_geometry"
  | "connections"
  | "sheet_packing"
  | "rigid_transforms"
  | "motion"
  | "collision"
  | "semantics"
  | "export_equivalence"
  | "scoring";

export type CheckStatus = "pass" | "fail" | "warning" | "not_run";

export interface MeasuredValueV1 {
  readonly value: number | string | boolean | null;
  readonly unit: FabricationUnit | null;
}

export interface VerificationFailureV2 {
  readonly failureId: string;
  readonly category:
    | "schema"
    | "limit"
    | "reference"
    | "topology"
    | "geometry"
    | "manufacturability"
    | "kinematics"
    | "collision"
    | "semantic"
    | "export";
  readonly stage: VerificationStage;
  readonly severity: "hard" | "warning";
  readonly message: string;
  readonly actual: MeasuredValueV1;
  readonly expected: MeasuredValueV1;
  readonly geometryRefs: readonly GeometryRefV1[];
  readonly repairableProgramPaths: readonly string[];
}

export interface VerificationCheckV2 {
  readonly checkId: string;
  readonly stage: VerificationStage;
  readonly status: CheckStatus;
  readonly message: string;
  readonly actual: MeasuredValueV1;
  readonly expected: MeasuredValueV1;
  readonly geometryRefs: readonly GeometryRefV1[];
  readonly failureId: string | null;
}

export interface VerificationMetricV2 {
  readonly metricId: string;
  readonly value: number;
  readonly unit: FabricationUnit;
  readonly geometryRefs: readonly GeometryRefV1[];
}

export interface MotionVerificationSummaryV2 {
  readonly baseSampleCount: number;
  readonly adaptiveSampleCount: number;
  readonly maximumClosureResidualMm: number;
  readonly minimumClearanceMm: number;
  readonly maximumAngleErrorDeg: number;
  readonly maximumTravelErrorMm: number;
  readonly collisionFree: boolean;
  readonly branchContinuous: boolean;
  readonly driverReachable: boolean;
  readonly deadStateFree: boolean;
}

export interface ExportEquivalenceCheckV2 {
  readonly format: "svg" | "dxf" | "glb" | "json" | "fold";
  readonly status: CheckStatus;
  readonly sourceIrHash: string;
  readonly artifactHash: string | null;
  readonly message: string;
}

export interface VerificationReportV2 {
  readonly version: "2";
  readonly reportId: string;
  readonly candidateId: string;
  readonly programId: string;
  readonly irId: string;
  readonly irHash: string;
  readonly valid: boolean;
  readonly completedStage: VerificationStage;
  readonly failedAtStage: VerificationStage | null;
  readonly checks: readonly VerificationCheckV2[];
  readonly failures: readonly VerificationFailureV2[];
  readonly metrics: readonly VerificationMetricV2[];
  readonly motionSummary: MotionVerificationSummaryV2 | null;
  readonly exportEquivalence: readonly ExportEquivalenceCheckV2[];
}

interface ProgramPatchOperationBaseV1 {
  readonly operationId: string;
  readonly path: string;
  readonly failureIds: readonly string[];
  readonly reason: string;
  readonly expectedEffect: string;
}

export interface SetNumberPatchOperationV1 extends ProgramPatchOperationBaseV1 {
  readonly operation: "set_number";
  readonly value: number;
  readonly expectedCurrentValue: number | null;
  readonly unit: FabricationUnit | null;
}

export interface SetIntegerPatchOperationV1 extends ProgramPatchOperationBaseV1 {
  readonly operation: "set_integer";
  readonly value: number;
  readonly expectedCurrentValue: number | null;
  readonly unit: "count";
}

export interface SetBooleanPatchOperationV1 extends ProgramPatchOperationBaseV1 {
  readonly operation: "set_boolean";
  readonly value: boolean;
  readonly expectedCurrentValue: boolean | null;
  readonly unit: null;
}

export interface SetEnumPatchOperationV1 extends ProgramPatchOperationBaseV1 {
  readonly operation: "set_enum";
  readonly value: string;
  readonly expectedCurrentValue: string | null;
  readonly unit: null;
}

export type ProgramPatchOperationV1 =
  | SetNumberPatchOperationV1
  | SetIntegerPatchOperationV1
  | SetBooleanPatchOperationV1
  | SetEnumPatchOperationV1;

export interface ProgramPatchV1 {
  readonly version: "1";
  readonly patchId: string;
  readonly programId: string;
  readonly baseProgramHash: string;
  readonly repairCycle: number;
  readonly diagnosis: string;
  readonly operations: readonly ProgramPatchOperationV1[];
  readonly authoredBy: "ai" | "code" | "user";
  readonly changesIntent: false;
}

export interface ScoreComponentV2 {
  readonly componentId: string;
  readonly label: string;
  readonly normalizedScore: number;
  readonly weight: number;
  readonly weightedScore: number;
  readonly evidenceCheckIds: readonly string[];
}

export interface CandidateScoreV2 {
  readonly eligible: boolean;
  readonly totalScore: number | null;
  readonly components: readonly ScoreComponentV2[];
  readonly rankingReason: string | null;
}

export interface CandidateProvenanceV2 {
  readonly provenanceId: string;
  readonly compilerVersion: string;
  readonly inputHash: string;
  readonly intentHash: string;
  readonly programHash: string;
  readonly irHash: string;
  readonly modelId: string | null;
  readonly modelResponseId: string | null;
  readonly modelPlanHash: string | null;
  readonly planExpanderVersion: string | null;
  readonly generatedAtIso: string;
  readonly deterministicSeed: number;
  readonly parentCandidateId: string | null;
  readonly appliedPatchIds: readonly string[];
  readonly repairCycle: number;
}

export type ExportFormat = "svg" | "dxf" | "glb" | "json" | "fold";

export interface ExportArtifactMetadataV1 {
  readonly format: ExportFormat;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly sourceIrHash: string;
  readonly sourceCandidateId: string;
  readonly verified: boolean;
}

export interface ExportMetadataV1 {
  readonly status: "not_generated" | "generated" | "verified" | "failed";
  readonly requestedFormats: readonly ExportFormat[];
  readonly artifacts: readonly ExportArtifactMetadataV1[];
  readonly calibrationLengthMm: number;
  readonly selectedCandidateId: string | null;
  readonly sourceEquivalent: boolean;
  readonly foldOmissionReason: string | null;
}

export interface CandidateV2 {
  readonly version: "2";
  readonly candidateId: string;
  readonly label: string;
  readonly rank: number | null;
  readonly selectionStatus:
    "unranked" | "eligible" | "recommended" | "selected" | "invalid";
  readonly intent: FabricationIntentV1;
  readonly program: FabricationProgramV1;
  readonly ir: FabricationIRV1;
  readonly verification: VerificationReportV2;
  readonly score: CandidateScoreV2;
  readonly provenance: CandidateProvenanceV2;
  readonly exportMetadata: ExportMetadataV1;
}
