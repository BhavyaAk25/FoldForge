import { canonicalSerialize } from "@/core/canonical";
import { sha256Hex } from "@/core/sha256";

import { fabricationIrHash } from "./compiler";
import {
  classifyTabAttachment,
  connectorInsertionAlignment,
  connectorInsertionDirectionsCompatible,
  connectorPairFit,
  connectorReferencePoint2,
  panelMaterialHoles,
  panelNetMaterialAreaMm2,
} from "./connector-geometry";
import {
  evaluateMotionState,
  homeMotionState,
  type EvaluatedMotionState,
} from "./kinematics";
import { FABRICATION_KINEMATIC_LIMITS, FABRICATION_LIMITS } from "./limits";
import { transformPoint3 } from "./matrix";
import {
  deriveConnectorCutPaths,
  derivePanelBoundaryCutPaths,
  PATH_EQUIVALENCE_TOLERANCE_MM,
} from "./path-topology";
import {
  collinearSegmentOverlapLengthMm,
  isSimplePolygon,
  minimumContourBoundaryClearanceMm,
  minimumEdgeLengthMm,
  pointInPolygon,
  polygonBounds,
  polygonsInteriorOverlap,
  segmentsEquivalent,
  segmentProperlyIntersects,
  signedPolygonAreaMm2,
  transformPoint2,
  triangulatePolygonWithHoles,
} from "./polygon";
import { pointTriangleDistanceMm } from "./spatial";
import {
  ExportEquivalenceCheckV2Schema,
  FabricationIRV1Schema,
  VerificationReportV2Schema,
} from "./schemas";
import { buildDirectedBodyTopology } from "./topology";
import {
  boundsForPoints,
  dimensionValue,
  mirroredBodyGeometryError,
  panelIdsForRef,
  panelPairContactAreaMm2,
  panelPairDistanceMm,
  pointsForRefs,
  statesForDuring,
  unorderedPairKey,
} from "./verification-geometry";
import type {
  CheckStatus,
  ExportEquivalenceCheckV2,
  FabricationIRV1,
  FabricationUnit,
  GeometryRefV1,
  JointV1,
  MeasuredValueV1,
  PanelV1,
  Point2Mm,
  Point3Mm,
  SemanticConstraintV1,
  VerificationCheckV2,
  VerificationFailureV2,
  VerificationMetricV2,
  VerificationReportV2,
  VerificationStage,
} from "./types";

const MINIMUM_PANEL_AREA_MM2 = FABRICATION_LIMITS.minimumPanelAreaMm2;
const MINIMUM_FEATURE_MM = FABRICATION_LIMITS.minimumFeatureMm;
const MINIMUM_CONNECTOR_CLEARANCE_MM = 0.2;
const CONNECTION_TOLERANCE_MM = 0.1;
const JOINT_ANCHOR_TOLERANCE_MM = 1;
const CONNECTOR_ALIGNMENT_COSINE_TOLERANCE = 1e-6;
const CONTACT_LOCUS_TOLERANCE_MM = 1e-5;
const REQUESTED_SIZE_TOLERANCE_MM = 2;
const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,79}$/u;
const MAXIMUM_REPORT_CHECKS = 512;
const MAXIMUM_REPORT_FAILURES = 256;

const connectorPairMetricId = (
  prefix: "axis" | "fit_l" | "fit_w" | "reach" | "span",
  firstConnectorId: string,
  secondConnectorId: string,
): string =>
  `${prefix}:${sha256Hex(
    canonicalSerialize([firstConnectorId, secondConnectorId]),
  ).slice(0, 16)}`;

const minimumPanelLigamentMm = (panel: PanelV1): number =>
  Math.max(FABRICATION_LIMITS.minimumInnerCutLigamentMm, panel.thicknessMm * 2);

const STAGES: readonly VerificationStage[] = [
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
];

export interface VerificationOptions {
  readonly exportEquivalence?: readonly ExportEquivalenceCheckV2[];
}

interface VerificationState {
  readonly checks: VerificationCheckV2[];
  readonly failures: VerificationFailureV2[];
  readonly metrics: VerificationMetricV2[];
}

interface MotionEvaluation {
  readonly baseStates: readonly EvaluatedMotionState[];
  readonly allStates: readonly EvaluatedMotionState[];
  readonly adaptiveSampleCount: number;
  readonly maximumAngleErrorDeg: number;
  readonly maximumTravelErrorMm: number;
  readonly maximumClosureResidualMm: number;
  readonly minimumClearanceMm: number;
  readonly collisionFree: boolean;
  readonly branchContinuous: boolean;
  readonly driverReachable: boolean;
  readonly deadStateFree: boolean;
  readonly collisionRefs: readonly GeometryRefV1[];
}

const motionRepairPaths = (ir: FabricationIRV1): readonly string[] => [
  ...(ir.driver
    ? [
        `/blueprint/driver/${ir.driver.driverId}/minimumValue`,
        `/blueprint/driver/${ir.driver.driverId}/maximumValue`,
        `/blueprint/driver/${ir.driver.driverId}/homeValue`,
      ]
    : []),
  ...ir.joints.flatMap((joint) =>
    joint.kind === "prismatic"
      ? [
          `/blueprint/joints/${joint.jointId}/minTravelMm`,
          `/blueprint/joints/${joint.jointId}/maxTravelMm`,
          `/blueprint/joints/${joint.jointId}/homeTravelMm`,
        ]
      : [
          `/blueprint/joints/${joint.jointId}/minAngleDeg`,
          `/blueprint/joints/${joint.jointId}/maxAngleDeg`,
          `/blueprint/joints/${joint.jointId}/homeAngleDeg`,
        ],
  ),
  ...ir.outputs.flatMap((output) => [
    `/blueprint/outputs/${output.outputId}/minimumValue`,
    `/blueprint/outputs/${output.outputId}/maximumValue`,
  ]),
  ...ir.couplings.flatMap((coupling) => {
    switch (coupling.kind) {
      case "direct_ratio":
        return [
          `/blueprint/couplings/${coupling.couplingId}/ratio`,
          `/blueprint/couplings/${coupling.couplingId}/offset`,
        ];
      case "mirrored_pair":
        return [
          `/blueprint/couplings/${coupling.couplingId}/ratio`,
          `/blueprint/couplings/${coupling.couplingId}/phaseOffsetDeg`,
        ];
      case "pull_tab":
        return [`/blueprint/couplings/${coupling.couplingId}/ratio`];
      case "cam_slot":
        return [`/blueprint/couplings/${coupling.couplingId}/phaseOffsetMm`];
    }
  }),
];

const measured = (
  value: MeasuredValueV1["value"],
  unit: FabricationUnit | null = null,
): MeasuredValueV1 => ({ value, unit });

const geometryRef = (
  kind: GeometryRefV1["kind"],
  id: string,
): GeometryRefV1 => ({ kind, id });

const addCheck = (
  state: VerificationState,
  checkId: string,
  stage: VerificationStage,
  status: CheckStatus,
  message: string,
  actual: MeasuredValueV1,
  expected: MeasuredValueV1,
  geometryRefs: readonly GeometryRefV1[] = [],
  failureId: string | null = null,
): void => {
  if (state.checks.length >= MAXIMUM_REPORT_CHECKS) return;
  state.checks.push({
    checkId,
    stage,
    status,
    message,
    actual,
    expected,
    geometryRefs,
    failureId,
  });
};

const addFailure = (
  state: VerificationState,
  failure: VerificationFailureV2,
): void => {
  if (state.failures.length >= MAXIMUM_REPORT_FAILURES) return;
  state.failures.push(failure);
  addCheck(
    state,
    failure.failureId,
    failure.stage,
    "fail",
    failure.message,
    failure.actual,
    failure.expected,
    failure.geometryRefs,
    failure.failureId,
  );
};

const hardFailureCount = (state: VerificationState): number =>
  state.failures.filter((failure) => failure.severity === "hard").length;

export const estimateFabricationVerificationWork = (
  ir: FabricationIRV1,
): number => {
  const triangleCounts = ir.panels.map((panel) => {
    const holes = panelMaterialHoles(panel, ir.connectors);
    return Math.max(
      1,
      panel.contour.vertices.length +
        holes.reduce((total, contour) => total + contour.vertices.length, 0) +
        holes.length * 2 -
        2,
    );
  });
  let pairTriangleProducts = 0;
  for (
    let firstIndex = 0;
    firstIndex < triangleCounts.length;
    firstIndex += 1
  ) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < triangleCounts.length;
      secondIndex += 1
    ) {
      pairTriangleProducts +=
        triangleCounts[firstIndex]! * triangleCounts[secondIndex]!;
    }
  }
  const motionStates = ir.driver
    ? FABRICATION_LIMITS.requiredMotionSampleCount
    : 1;
  return motionStates * pairTriangleProducts;
};

const validateWorkBudget = (
  ir: FabricationIRV1,
  state: VerificationState,
): void => {
  const workUnits = estimateFabricationVerificationWork(ir);
  state.metrics.push({
    metricId: "verification_work_units",
    value: workUnits,
    unit: "count",
    geometryRefs: [],
  });
  if (workUnits > FABRICATION_LIMITS.maximumVerificationWorkUnits) {
    addFailure(state, {
      failureId: "topology.work_budget",
      category: "topology",
      stage: "topology",
      severity: "hard",
      message:
        "Candidate complexity exceeds the bounded deterministic verification budget.",
      actual: measured(workUnits, "count"),
      expected: measured(
        FABRICATION_LIMITS.maximumVerificationWorkUnits,
        "count",
      ),
      geometryRefs: ir.panels.map((panel) =>
        geometryRef("panel", panel.panelId),
      ),
      repairableProgramPaths: [],
    });
  }
};

const duplicate = (values: readonly string[]): string | null => {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
};

const reportId = (
  candidateId: string,
  irHash: string,
  failedAtStage: VerificationStage | null,
): string =>
  `report:${sha256Hex(canonicalSerialize({ candidateId, irHash, failedAtStage })).slice(0, 32)}`;

const buildReport = (
  candidateId: string,
  programId: string,
  irId: string,
  irHash: string,
  state: VerificationState,
  failedAtStage: VerificationStage | null,
  motion: MotionEvaluation | null,
  exportEquivalence: readonly ExportEquivalenceCheckV2[],
): VerificationReportV2 => {
  const valid = failedAtStage === null && hardFailureCount(state) === 0;
  const report: VerificationReportV2 = {
    version: "2",
    reportId: reportId(candidateId, irHash, failedAtStage),
    candidateId,
    programId,
    irId,
    irHash,
    valid,
    completedStage: failedAtStage ?? "scoring",
    failedAtStage,
    checks: state.checks,
    failures: state.failures,
    metrics: state.metrics,
    motionSummary: motion
      ? {
          baseSampleCount: motion.baseStates.length,
          adaptiveSampleCount: motion.adaptiveSampleCount,
          maximumClosureResidualMm: motion.maximumClosureResidualMm,
          minimumClearanceMm: motion.minimumClearanceMm,
          maximumAngleErrorDeg: motion.maximumAngleErrorDeg,
          maximumTravelErrorMm: motion.maximumTravelErrorMm,
          collisionFree: motion.collisionFree,
          branchContinuous: motion.branchContinuous,
          driverReachable: motion.driverReachable,
          deadStateFree: motion.deadStateFree,
        }
      : null,
    exportEquivalence,
  };
  return VerificationReportV2Schema.parse(report);
};

const schemaFailureReport = (
  input: unknown,
  candidateId: string,
): VerificationReportV2 => {
  const state: VerificationState = { checks: [], failures: [], metrics: [] };
  const parsed = FabricationIRV1Schema.safeParse(input);
  const message = parsed.success
    ? "The fabrication IR schema is valid."
    : parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; ");
  if (parsed.success) {
    addCheck(
      state,
      "schema.contract",
      "schema",
      "pass",
      message,
      measured(true),
      measured(true),
    );
  } else {
    addFailure(state, {
      failureId: "schema.contract",
      category: "schema",
      stage: "schema",
      severity: "hard",
      message,
      actual: measured(false),
      expected: measured(true),
      geometryRefs: [],
      repairableProgramPaths: [],
    });
  }
  const irHash = sha256Hex(canonicalSerialize(input));
  return buildReport(
    candidateId,
    "program:unknown",
    "ir:unknown",
    irHash,
    state,
    parsed.success ? null : "schema",
    null,
    [],
  );
};

const invalidCandidateIdReport = (
  input: unknown,
  candidateId: unknown,
  normalizedCandidateId: string,
): VerificationReportV2 => {
  const state: VerificationState = { checks: [], failures: [], metrics: [] };
  addFailure(state, {
    failureId: "schema.candidate_id",
    category: "schema",
    stage: "schema",
    severity: "hard",
    message:
      "Candidate identifier does not satisfy the stable identifier contract.",
    actual: measured(
      typeof candidateId === "string" ? candidateId : typeof candidateId,
    ),
    expected: measured("1-80 character stable identifier"),
    geometryRefs: [],
    repairableProgramPaths: [],
  });
  const parsed = FabricationIRV1Schema.safeParse(input);
  const irHash = parsed.success
    ? fabricationIrHash(parsed.data)
    : sha256Hex(
        canonicalSerialize({
          invalidFabricationIr: true,
          inputType: input === null ? "null" : typeof input,
        }),
      );
  return buildReport(
    normalizedCandidateId,
    parsed.success ? parsed.data.programId : "program:unknown",
    parsed.success ? parsed.data.irId : "ir:unknown",
    irHash,
    state,
    "schema",
    null,
    [],
  );
};

const validateUniqueIds = (
  ir: FabricationIRV1,
  state: VerificationState,
): void => {
  const groups: readonly (readonly [
    string,
    readonly string[],
    GeometryRefV1["kind"] | null,
  ])[] = [
    ["sheet", ir.sheets.map((item) => item.sheetId), "sheet"],
    ["path", ir.paths.map((item) => item.pathId), "path"],
    ["panel", ir.panels.map((item) => item.panelId), "panel"],
    ["body", ir.bodies.map((item) => item.bodyId), "body"],
    ["joint", ir.joints.map((item) => item.jointId), "joint"],
    ["connector", ir.connectors.map((item) => item.connectorId), "connector"],
    ["output", ir.outputs.map((item) => item.outputId), "output"],
    [
      "semantic_part",
      ir.semanticParts.map((item) => item.semanticPartId),
      "semantic_part",
    ],
    [
      "semantic_constraint",
      ir.semanticConstraints.map((item) => item.constraintId),
      "semantic_constraint",
    ],
    ["coupling", ir.couplings.map((item) => item.couplingId), null],
    [
      "assembly_operation",
      ir.assemblyOperations.map((item) => item.operationId),
      null,
    ],
  ];
  for (const [label, ids, kind] of groups) {
    const duplicateId = duplicate(ids);
    if (duplicateId) {
      addFailure(state, {
        failureId: `topology.duplicate_${label}#${duplicateId}`,
        category: "reference",
        stage: "topology",
        severity: "hard",
        message: `${label} identifier ${duplicateId} is duplicated.`,
        actual: measured(duplicateId),
        expected: measured("unique identifier"),
        geometryRefs: kind ? [geometryRef(kind, duplicateId)] : [],
        repairableProgramPaths: [],
      });
    }
  }
};

const knownGeometryIds = (
  ir: FabricationIRV1,
): ReadonlyMap<string, ReadonlySet<string>> =>
  new Map([
    ["sheet", new Set(ir.sheets.map((item) => item.sheetId))],
    ["path", new Set(ir.paths.map((item) => item.pathId))],
    ["panel", new Set(ir.panels.map((item) => item.panelId))],
    ["body", new Set(ir.bodies.map((item) => item.bodyId))],
    ["joint", new Set(ir.joints.map((item) => item.jointId))],
    ["connector", new Set(ir.connectors.map((item) => item.connectorId))],
    ["driver", new Set(ir.driver ? [ir.driver.driverId] : [])],
    ["output", new Set(ir.outputs.map((item) => item.outputId))],
    [
      "semantic_part",
      new Set(ir.semanticParts.map((item) => item.semanticPartId)),
    ],
    [
      "semantic_constraint",
      new Set(ir.semanticConstraints.map((item) => item.constraintId)),
    ],
    ["export", new Set(["svg", "dxf", "glb", "json"])],
  ]);

const addReferenceFailure = (
  state: VerificationState,
  ownerId: string,
  ref: GeometryRefV1,
): void =>
  addFailure(state, {
    failureId: `topology.reference#${ownerId}:${ref.kind}:${ref.id}`,
    category: "reference",
    stage: "topology",
    severity: "hard",
    message: `${ownerId} references unknown ${ref.kind} ${ref.id}.`,
    actual: measured(ref.id),
    expected: measured(`existing ${ref.kind}`),
    geometryRefs: [ref],
    repairableProgramPaths: [],
  });

const validateTopology = (
  ir: FabricationIRV1,
  state: VerificationState,
): void => {
  validateUniqueIds(ir, state);
  const sheets = new Set(ir.sheets.map((sheet) => sheet.sheetId));
  const panels = new Map(ir.panels.map((panel) => [panel.panelId, panel]));
  const bodies = new Map(ir.bodies.map((body) => [body.bodyId, body]));
  const joints = new Map(ir.joints.map((joint) => [joint.jointId, joint]));
  const connectors = new Map(
    ir.connectors.map((connector) => [connector.connectorId, connector]),
  );
  const paths = new Map(ir.paths.map((path) => [path.pathId, path]));
  const outputs = new Map(
    ir.outputs.map((output) => [output.outputId, output]),
  );
  const semanticParts = new Map(
    ir.semanticParts.map((part) => [part.semanticPartId, part]),
  );
  const expectedPathIds = new Set<string>();
  const boundaryPathsByPanelId = new Map(
    ir.panels.map((panel) => [
      panel.panelId,
      derivePanelBoundaryCutPaths(panel, ir.joints),
    ]),
  );
  for (const panel of ir.panels) {
    for (const path of boundaryPathsByPanelId.get(panel.panelId) ?? []) {
      expectedPathIds.add(path.pathId);
    }
    panel.innerCutContours.forEach((_, index) =>
      expectedPathIds.add(`${panel.panelId}.cut.inner-${index + 1}`),
    );
  }
  for (const joint of ir.joints) {
    if (joint.kind === "fold") expectedPathIds.add(joint.creasePathId);
  }
  for (const connector of ir.connectors) {
    const panel = panels.get(connector.panelId);
    if (!panel) continue;
    for (const path of deriveConnectorCutPaths(
      connector,
      panel,
      boundaryPathsByPanelId.get(panel.panelId) ?? [],
    )) {
      expectedPathIds.add(path.pathId);
    }
  }

  for (const path of ir.paths) {
    if (!expectedPathIds.has(path.pathId)) {
      addFailure(state, {
        failureId: `topology.unexpected_path#${path.pathId}`,
        category: "reference",
        stage: "topology",
        severity: "hard",
        message: `${path.pathId} is not derived from a panel, fold, or connector in this IR.`,
        actual: measured(path.pathId),
        expected: measured("source-derived fabrication path"),
        geometryRefs: [geometryRef("path", path.pathId)],
        repairableProgramPaths: [],
      });
    }
    if (!sheets.has(path.sheetId)) {
      addReferenceFailure(
        state,
        path.pathId,
        geometryRef("sheet", path.sheetId),
      );
    }
    if (path.panelId !== null) {
      const panel = panels.get(path.panelId);
      if (!panel || panel.sheetId !== path.sheetId) {
        addReferenceFailure(
          state,
          path.pathId,
          geometryRef("panel", path.panelId),
        );
      }
    }
  }

  for (const panel of ir.panels) {
    if (!sheets.has(panel.sheetId)) {
      addReferenceFailure(
        state,
        panel.panelId,
        geometryRef("sheet", panel.sheetId),
      );
    }
    if (!bodies.has(panel.bodyId)) {
      addReferenceFailure(
        state,
        panel.panelId,
        geometryRef("body", panel.bodyId),
      );
    } else if (!bodies.get(panel.bodyId)?.panelIds.includes(panel.panelId)) {
      addReferenceFailure(
        state,
        panel.panelId,
        geometryRef("body", panel.bodyId),
      );
    }
    for (const semanticPartId of panel.semanticPartIds) {
      if (!semanticParts.has(semanticPartId)) {
        addReferenceFailure(
          state,
          panel.panelId,
          geometryRef("semantic_part", semanticPartId),
        );
      }
    }
  }
  for (const body of ir.bodies) {
    for (const panelId of body.panelIds) {
      const panel = panels.get(panelId);
      if (!panel || panel.bodyId !== body.bodyId) {
        addReferenceFailure(state, body.bodyId, geometryRef("panel", panelId));
      }
    }
    for (const semanticPartId of body.semanticPartIds) {
      if (!semanticParts.has(semanticPartId)) {
        addReferenceFailure(
          state,
          body.bodyId,
          geometryRef("semantic_part", semanticPartId),
        );
      }
    }
  }
  const topology = buildDirectedBodyTopology(
    ir.bodies.map((body) => body.bodyId),
    ir.joints,
  );
  if (!topology.ok) {
    addFailure(state, {
      failureId: "topology.body_graph",
      category: "topology",
      stage: "topology",
      severity: "hard",
      message: `Rigid-body graph is not one connected acyclic tree: ${topology.error.id}.`,
      actual: measured(topology.error.id),
      expected: measured("connected acyclic tree"),
      geometryRefs: [],
      repairableProgramPaths: [],
    });
  } else {
    const grounded = ir.bodies.filter((body) => body.grounded);
    if (
      grounded.length !== 1 ||
      grounded[0]?.bodyId !== topology.value.rootBodyId
    ) {
      addFailure(state, {
        failureId: "topology.grounded_root",
        category: "topology",
        stage: "topology",
        severity: "hard",
        message: "Exactly the graph root must be grounded.",
        actual: measured(grounded.map((body) => body.bodyId).join(",")),
        expected: measured(topology.value.rootBodyId),
        geometryRefs: grounded.map((body) => geometryRef("body", body.bodyId)),
        repairableProgramPaths: [],
      });
    }
  }

  if (ir.behavior === "static" && ir.driver !== null) {
    addReferenceFailure(
      state,
      ir.driver.driverId,
      geometryRef("driver", "none"),
    );
  }
  if (ir.behavior !== "static" && ir.driver === null) {
    addFailure(state, {
      failureId: "topology.missing_driver",
      category: "reference",
      stage: "topology",
      severity: "hard",
      message: "A non-static program requires one motion driver.",
      actual: measured(0, "count"),
      expected: measured(1, "count"),
      geometryRefs: [],
      repairableProgramPaths: [],
    });
  }
  if (ir.driver && !joints.has(ir.driver.jointId)) {
    addReferenceFailure(
      state,
      ir.driver.driverId,
      geometryRef("joint", ir.driver.jointId),
    );
  }
  if (ir.driver) {
    const drivenJoint = joints.get(ir.driver.jointId);
    if (drivenJoint) {
      const expectedUnit = drivenJoint.kind === "prismatic" ? "mm" : "deg";
      const compatibleControl =
        (drivenJoint.kind === "fold" && ir.driver.control === "fold") ||
        (drivenJoint.kind === "revolute" && ir.driver.control === "rotate") ||
        (drivenJoint.kind === "prismatic" &&
          (ir.driver.control === "slide" || ir.driver.control === "pull_tab"));
      if (ir.driver.unit !== expectedUnit || !compatibleControl) {
        addFailure(state, {
          failureId: `topology.driver_compatibility#${ir.driver.driverId}`,
          category: "reference",
          stage: "topology",
          severity: "hard",
          message: "Driver unit and control must match its referenced joint.",
          actual: measured(`${ir.driver.control}:${ir.driver.unit}`),
          expected: measured(`${drivenJoint.kind}:${expectedUnit}`),
          geometryRefs: [geometryRef("driver", ir.driver.driverId)],
          repairableProgramPaths: [],
        });
      }
    }
  }
  for (const joint of ir.joints) {
    if (joint.kind === "fold" && !paths.has(joint.creasePathId)) {
      addReferenceFailure(
        state,
        joint.jointId,
        geometryRef("path", joint.creasePathId),
      );
    }
    const connectorIds =
      joint.kind === "revolute"
        ? joint.connectorIds
        : joint.kind === "prismatic"
          ? joint.guideConnectorIds
          : [];
    for (const connectorId of connectorIds) {
      if (!connectors.has(connectorId)) {
        addReferenceFailure(
          state,
          joint.jointId,
          geometryRef("connector", connectorId),
        );
      }
    }
  }
  for (const output of ir.outputs) {
    const outputJoint = joints.get(output.jointId);
    if (!outputJoint) {
      addReferenceFailure(
        state,
        output.outputId,
        geometryRef("joint", output.jointId),
      );
    } else {
      const expectedUnit = outputJoint.kind === "prismatic" ? "mm" : "deg";
      if (output.unit !== expectedUnit) {
        addFailure(state, {
          failureId: `topology.output_compatibility#${output.outputId}`,
          category: "reference",
          stage: "topology",
          severity: "hard",
          message: "Motion output unit must match its referenced joint.",
          actual: measured(output.unit),
          expected: measured(expectedUnit),
          geometryRefs: [geometryRef("output", output.outputId)],
          repairableProgramPaths: [],
        });
      }
    }
    if (!bodies.has(output.bodyId)) {
      addReferenceFailure(
        state,
        output.outputId,
        geometryRef("body", output.bodyId),
      );
    } else if (outputJoint && output.bodyId !== outputJoint.childBodyId) {
      addFailure(state, {
        failureId: `topology.output_body#${output.outputId}`,
        category: "reference",
        stage: "topology",
        severity: "hard",
        message: "Motion output body must be the child body of its joint.",
        actual: measured(output.bodyId),
        expected: measured(outputJoint.childBodyId),
        geometryRefs: [
          geometryRef("output", output.outputId),
          geometryRef("body", output.bodyId),
        ],
        repairableProgramPaths: [],
      });
    }
  }
  for (const connector of ir.connectors) {
    if (!panels.has(connector.panelId)) {
      addReferenceFailure(
        state,
        connector.connectorId,
        geometryRef("panel", connector.panelId),
      );
    }
    const mate = connectors.get(connector.mateConnectorId);
    if (
      !mate ||
      mate.connectorId === connector.connectorId ||
      mate.mateConnectorId !== connector.connectorId ||
      mate.kind === connector.kind
    ) {
      addReferenceFailure(
        state,
        connector.connectorId,
        geometryRef("connector", connector.mateConnectorId),
      );
    }
  }
  for (const coupling of ir.couplings) {
    const requireJoint = (jointId: string): void => {
      if (!joints.has(jointId)) {
        addReferenceFailure(
          state,
          coupling.couplingId,
          geometryRef("joint", jointId),
        );
      }
    };
    const requireConnector = (connectorId: string): void => {
      if (!connectors.has(connectorId)) {
        addReferenceFailure(
          state,
          coupling.couplingId,
          geometryRef("connector", connectorId),
        );
      }
    };
    switch (coupling.kind) {
      case "direct_ratio":
        requireJoint(coupling.inputJointId);
        coupling.outputJointIds.forEach(requireJoint);
        {
          const coupledJoints = [
            coupling.inputJointId,
            ...coupling.outputJointIds,
          ]
            .map((jointId) => joints.get(jointId))
            .filter((joint): joint is JointV1 => joint !== undefined);
          const expectedUnit = coupling.offsetUnit;
          if (
            coupledJoints.some(
              (joint) =>
                (joint.kind === "prismatic" ? "mm" : "deg") !== expectedUnit,
            )
          ) {
            addFailure(state, {
              failureId: `topology.coupling_unit#${coupling.couplingId}`,
              category: "reference",
              stage: "topology",
              severity: "hard",
              message:
                "Direct-ratio offset unit must match every coupled joint.",
              actual: measured(coupling.offsetUnit),
              expected: measured("coupled joint unit"),
              geometryRefs: [],
              repairableProgramPaths: [],
            });
          }
        }
        break;
      case "mirrored_pair":
        requireJoint(coupling.inputJointId);
        requireJoint(coupling.leftOutputJointId);
        requireJoint(coupling.rightOutputJointId);
        if (
          [
            coupling.inputJointId,
            coupling.leftOutputJointId,
            coupling.rightOutputJointId,
          ].some((jointId) => joints.get(jointId)?.kind === "prismatic")
        ) {
          addFailure(state, {
            failureId: `topology.coupling_unit#${coupling.couplingId}`,
            category: "reference",
            stage: "topology",
            severity: "hard",
            message: "Mirrored-pair couplings require rotational joints.",
            actual: measured("prismatic joint"),
            expected: measured("rotational joints"),
            geometryRefs: [],
            repairableProgramPaths: [],
          });
        }
        break;
      case "pull_tab":
        if (!ir.driver || coupling.driverId !== ir.driver.driverId) {
          addReferenceFailure(
            state,
            coupling.couplingId,
            geometryRef("driver", coupling.driverId),
          );
        }
        requireJoint(coupling.sliderJointId);
        coupling.outputJointIds.forEach(requireJoint);
        break;
      case "cam_slot": {
        if (!ir.driver || coupling.driverId !== ir.driver.driverId) {
          addReferenceFailure(
            state,
            coupling.couplingId,
            geometryRef("driver", coupling.driverId),
          );
        }
        requireConnector(coupling.slotConnectorId);
        requireConnector(coupling.followerConnectorId);
        requireJoint(coupling.outputJointId);
        const slot = connectors.get(coupling.slotConnectorId);
        const follower = connectors.get(coupling.followerConnectorId);
        if (
          (slot && slot.kind !== "slot") ||
          (follower && follower.kind !== "tab")
        ) {
          addFailure(state, {
            failureId: `topology.cam_connector_kinds#${coupling.couplingId}`,
            category: "reference",
            stage: "topology",
            severity: "hard",
            message: "Cam-slot couplings require a slot and tab follower.",
            actual: measured(
              `${slot?.kind ?? "missing"}:${follower?.kind ?? "missing"}`,
            ),
            expected: measured("slot:tab"),
            geometryRefs: [],
            repairableProgramPaths: [],
          });
        }
        const outputJoint = joints.get(coupling.outputJointId);
        if (slot && follower && outputJoint) {
          const slotPanel = panels.get(slot.panelId);
          const followerPanel = panels.get(follower.panelId);
          const connectorBodyIds = new Set(
            [slotPanel?.bodyId, followerPanel?.bodyId].filter(
              (bodyId): bodyId is string => bodyId !== undefined,
            ),
          );
          if (
            !sameBodyPair(
              connectorBodyIds,
              outputJoint.parentBodyId,
              outputJoint.childBodyId,
            )
          ) {
            addFailure(state, {
              failureId: `topology.cam_connector_bodies#${coupling.couplingId}`,
              category: "topology",
              stage: "topology",
              severity: "hard",
              message:
                "Cam-slot connectors must span the parent and child bodies of the output joint.",
              actual: measured([...connectorBodyIds].sort().join(",")),
              expected: measured(
                [outputJoint.parentBodyId, outputJoint.childBodyId]
                  .sort()
                  .join(","),
              ),
              geometryRefs: [
                geometryRef("connector", slot.connectorId),
                geometryRef("connector", follower.connectorId),
                geometryRef("joint", outputJoint.jointId),
              ],
              repairableProgramPaths: [],
            });
          }
        }
        break;
      }
    }
  }
  const known = knownGeometryIds(ir);
  for (const part of ir.semanticParts) {
    for (const ref of part.geometryRefs) {
      if (!known.get(ref.kind)?.has(ref.id)) {
        addReferenceFailure(state, part.semanticPartId, ref);
      }
    }
  }
  const semanticPartVisitState = new Map<string, "visiting" | "visited">();
  const visitSemanticPart = (partId: string): boolean => {
    const visitState = semanticPartVisitState.get(partId);
    if (visitState === "visiting") return false;
    if (visitState === "visited") return true;
    semanticPartVisitState.set(partId, "visiting");
    const part = semanticParts.get(partId);
    for (const ref of part?.geometryRefs ?? []) {
      if (
        ref.kind === "semantic_part" &&
        semanticParts.has(ref.id) &&
        !visitSemanticPart(ref.id)
      ) {
        return false;
      }
    }
    semanticPartVisitState.set(partId, "visited");
    return true;
  };
  for (const part of ir.semanticParts) {
    if (!visitSemanticPart(part.semanticPartId)) {
      addFailure(state, {
        failureId: `topology.semantic_part_cycle#${part.semanticPartId}`,
        category: "topology",
        stage: "topology",
        severity: "hard",
        message: "Semantic-part references must be acyclic.",
        actual: measured(part.semanticPartId),
        expected: measured("acyclic semantic-part graph"),
        geometryRefs: [geometryRef("semantic_part", part.semanticPartId)],
        repairableProgramPaths: [],
      });
      break;
    }
  }
  for (const constraint of ir.semanticConstraints) {
    const refs: readonly GeometryRefV1[] =
      constraint.kind === "dimension"
        ? [constraint.geometryRef]
        : constraint.kind === "clearance" || constraint.kind === "contact"
          ? constraint.geometryRefs
          : [];
    for (const ref of refs) {
      if (!known.get(ref.kind)?.has(ref.id)) {
        addReferenceFailure(state, constraint.constraintId, ref);
      }
    }
    if (constraint.kind === "clearance" || constraint.kind === "contact") {
      if (
        new Set(constraint.geometryRefs.map((ref) => `${ref.kind}:${ref.id}`))
          .size < 2
      ) {
        addFailure(state, {
          failureId: `topology.constraint_distinct_refs#${constraint.constraintId}`,
          category: "reference",
          stage: "topology",
          severity: "hard",
          message:
            "Pairwise constraints require two distinct geometry references.",
          actual: measured(false),
          expected: measured(true),
          geometryRefs: constraint.geometryRefs,
          repairableProgramPaths: [],
        });
      }
    } else if (
      constraint.kind === "symmetry" ||
      constraint.kind === "fold_flat"
    ) {
      for (const bodyId of constraint.bodyIds) {
        if (!bodies.has(bodyId)) {
          addReferenceFailure(
            state,
            constraint.constraintId,
            geometryRef("body", bodyId),
          );
        }
      }
      if (new Set(constraint.bodyIds).size !== constraint.bodyIds.length) {
        addFailure(state, {
          failureId: `topology.constraint_distinct_bodies#${constraint.constraintId}`,
          category: "reference",
          stage: "topology",
          severity: "hard",
          message: "Body-based constraints require distinct body references.",
          actual: measured(new Set(constraint.bodyIds).size, "count"),
          expected: measured(constraint.bodyIds.length, "count"),
          geometryRefs: constraint.bodyIds.map((bodyId) =>
            geometryRef("body", bodyId),
          ),
          repairableProgramPaths: [],
        });
      }
    } else if (constraint.kind === "motion") {
      const output = outputs.get(constraint.outputId);
      if (!output) {
        addReferenceFailure(
          state,
          constraint.constraintId,
          geometryRef("output", constraint.outputId),
        );
      } else if (output.unit !== constraint.unit) {
        addFailure(state, {
          failureId: `topology.constraint_unit#${constraint.constraintId}`,
          category: "reference",
          stage: "topology",
          severity: "hard",
          message: "Motion constraint unit must match its referenced output.",
          actual: measured(constraint.unit),
          expected: measured(output.unit),
          geometryRefs: [geometryRef("output", constraint.outputId)],
          repairableProgramPaths: [],
        });
      }
    } else if (constraint.kind === "recognizable_form") {
      for (const semanticPartId of constraint.semanticPartIds) {
        if (!semanticParts.has(semanticPartId)) {
          addReferenceFailure(
            state,
            constraint.constraintId,
            geometryRef("semantic_part", semanticPartId),
          );
        }
      }
    }
  }
  const operationById = new Map(
    ir.assemblyOperations.map((operation) => [
      operation.operationId,
      operation,
    ]),
  );
  for (const operation of ir.assemblyOperations) {
    for (const ref of operation.targetRefs) {
      if (!known.get(ref.kind)?.has(ref.id)) {
        addReferenceFailure(state, operation.operationId, ref);
      }
    }
    for (const dependencyId of operation.dependsOnOperationIds) {
      const dependency = operationById.get(dependencyId);
      if (!dependency || dependencyId === operation.operationId) {
        addFailure(state, {
          failureId: `topology.assembly_dependency#${operation.operationId}:${dependencyId}`,
          category: "reference",
          stage: "topology",
          severity: "hard",
          message: `${operation.operationId} references an invalid assembly dependency.`,
          actual: measured(dependencyId),
          expected: measured("earlier existing operation"),
          geometryRefs: [],
          repairableProgramPaths: [],
        });
      } else if (dependency.order >= operation.order) {
        addFailure(state, {
          failureId: `topology.assembly_order#${operation.operationId}:${dependencyId}`,
          category: "topology",
          stage: "topology",
          severity: "hard",
          message: "Assembly dependencies must precede dependent operations.",
          actual: measured(dependency.order),
          expected: measured(`< ${operation.order}`),
          geometryRefs: [],
          repairableProgramPaths: [],
        });
      }
    }
  }

  addCheck(
    state,
    "topology.references",
    "topology",
    hardFailureCount(state) === 0 ? "pass" : "fail",
    "Identifiers, references, connectivity, and grounded root were checked.",
    measured(ir.bodies.length, "count"),
    measured(`1-${FABRICATION_LIMITS.maximumPanelCount} connected bodies`),
  );
};

const pointsMatchCyclically = (
  actual: readonly { readonly xMm: number; readonly yMm: number }[],
  expected: readonly { readonly xMm: number; readonly yMm: number }[],
): boolean => {
  if (actual.length !== expected.length || actual.length === 0) return false;
  const close = (
    first: { readonly xMm: number; readonly yMm: number },
    second: { readonly xMm: number; readonly yMm: number },
  ): boolean =>
    Math.hypot(first.xMm - second.xMm, first.yMm - second.yMm) <= 1e-6;
  for (let offset = 0; offset < actual.length; offset += 1) {
    const forward = expected.every((point, index) =>
      close(actual[(offset + index) % actual.length]!, point),
    );
    const reverse = expected.every((point, index) =>
      close(
        actual[(offset - index + actual.length * 2) % actual.length]!,
        point,
      ),
    );
    if (forward || reverse) return true;
  }
  return false;
};

const validatePanelGeometry = (
  ir: FabricationIRV1,
  state: VerificationState,
): void => {
  const pathById = new Map(ir.paths.map((path) => [path.pathId, path]));
  for (const panel of ir.panels) {
    const refs = [geometryRef("panel", panel.panelId)];
    const areaMm2 = Math.abs(signedPolygonAreaMm2(panel.contour.vertices));
    const netAreaMm2 = panelNetMaterialAreaMm2(panel, ir.connectors);
    const netMaterialRatio = areaMm2 > 0 ? netAreaMm2 / areaMm2 : 0;
    const minimumLigamentMm = minimumPanelLigamentMm(panel);
    const minimumEdgeMm = minimumEdgeLengthMm(panel.contour.vertices);
    if (
      !isSimplePolygon(panel.contour.vertices) ||
      areaMm2 < MINIMUM_PANEL_AREA_MM2
    ) {
      addFailure(state, {
        failureId: `geometry.simple_panel#${panel.panelId}`,
        category: "geometry",
        stage: "panel_geometry",
        severity: "hard",
        message: `${panel.label} must be a nondegenerate simple polygon.`,
        actual: measured(areaMm2, "mm2"),
        expected: measured(
          `simple polygon with area >= ${MINIMUM_PANEL_AREA_MM2} mm2`,
        ),
        geometryRefs: refs,
        repairableProgramPaths: [
          `/blueprint/panels/${panel.panelId}/widthMm`,
          `/blueprint/panels/${panel.panelId}/heightMm`,
        ],
      });
      continue;
    }
    if (minimumEdgeMm < MINIMUM_FEATURE_MM) {
      addFailure(state, {
        failureId: `geometry.minimum_feature#${panel.panelId}`,
        category: "manufacturability",
        stage: "panel_geometry",
        severity: "hard",
        message: `${panel.label} contains an edge below the minimum feature size.`,
        actual: measured(minimumEdgeMm, "mm"),
        expected: measured(MINIMUM_FEATURE_MM, "mm"),
        geometryRefs: refs,
        repairableProgramPaths: [
          `/blueprint/panels/${panel.panelId}/widthMm`,
          `/blueprint/panels/${panel.panelId}/heightMm`,
        ],
      });
    }
    for (const [index, inner] of panel.innerCutContours.entries()) {
      const innerId = `${panel.panelId}.inner-${index + 1}`;
      const simpleAndContained =
        isSimplePolygon(inner.vertices) &&
        inner.vertices.every((point) =>
          pointInPolygon(point, panel.contour.vertices, false),
        );
      if (!simpleAndContained) {
        addFailure(state, {
          failureId: `geometry.inner_cut#${innerId}`,
          category: "geometry",
          stage: "panel_geometry",
          severity: "hard",
          message: "An inner cut must be simple and strictly inside its panel.",
          actual: measured(false),
          expected: measured(true),
          geometryRefs: refs,
          repairableProgramPaths: [],
        });
        continue;
      }
      const innerMinimumEdgeMm = minimumEdgeLengthMm(inner.vertices);
      if (innerMinimumEdgeMm < MINIMUM_FEATURE_MM) {
        addFailure(state, {
          failureId: `geometry.inner_minimum_feature#${innerId}`,
          category: "manufacturability",
          stage: "panel_geometry",
          severity: "hard",
          message:
            "An inner cut contains an edge below the minimum feature size.",
          actual: measured(innerMinimumEdgeMm, "mm"),
          expected: measured(MINIMUM_FEATURE_MM, "mm"),
          geometryRefs: refs,
          repairableProgramPaths: [
            `/blueprint/panels/${panel.panelId}/widthMm`,
            `/blueprint/panels/${panel.panelId}/heightMm`,
          ],
        });
      }
      const boundaryClearanceMm = minimumContourBoundaryClearanceMm(
        panel.contour.vertices,
        inner.vertices,
      );
      if (boundaryClearanceMm < minimumLigamentMm) {
        addFailure(state, {
          failureId: `geometry.inner_ligament#${innerId}`,
          category: "manufacturability",
          stage: "panel_geometry",
          severity: "hard",
          message:
            "An inner cut leaves less material than the minimum panel ligament.",
          actual: measured(boundaryClearanceMm, "mm"),
          expected: measured(minimumLigamentMm, "mm"),
          geometryRefs: refs,
          repairableProgramPaths: [
            `/blueprint/panels/${panel.panelId}/widthMm`,
            `/blueprint/panels/${panel.panelId}/heightMm`,
          ],
        });
      }
    }
    for (
      let firstIndex = 0;
      firstIndex < panel.innerCutContours.length;
      firstIndex += 1
    ) {
      const first = panel.innerCutContours[firstIndex]!;
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < panel.innerCutContours.length;
        secondIndex += 1
      ) {
        const second = panel.innerCutContours[secondIndex]!;
        const clearanceMm = polygonsInteriorOverlap(
          first.vertices,
          second.vertices,
        )
          ? 0
          : minimumContourBoundaryClearanceMm(first.vertices, second.vertices);
        if (clearanceMm < minimumLigamentMm) {
          addFailure(state, {
            failureId: `geometry.inner_clearance#${panel.panelId}.inner-${firstIndex + 1}:${panel.panelId}.inner-${secondIndex + 1}`,
            category: "manufacturability",
            stage: "panel_geometry",
            severity: "hard",
            message:
              "Inner cuts overlap or leave less than the minimum material ligament between them.",
            actual: measured(clearanceMm, "mm"),
            expected: measured(minimumLigamentMm, "mm"),
            geometryRefs: refs,
            repairableProgramPaths: [],
          });
        }
      }
    }
    if (
      netAreaMm2 < MINIMUM_PANEL_AREA_MM2 ||
      netMaterialRatio < FABRICATION_LIMITS.minimumNetMaterialRatio
    ) {
      addFailure(state, {
        failureId: `geometry.net_material#${panel.panelId}`,
        category: "manufacturability",
        stage: "panel_geometry",
        severity: "hard",
        message:
          "Panel cutouts leave too little connected source material for this fabrication profile.",
        actual: measured(
          `${netAreaMm2.toFixed(6)} mm2 (${(netMaterialRatio * 100).toFixed(3)}%)`,
        ),
        expected: measured(
          `>= ${MINIMUM_PANEL_AREA_MM2} mm2 and >= ${FABRICATION_LIMITS.minimumNetMaterialRatio * 100}%`,
        ),
        geometryRefs: refs,
        repairableProgramPaths: [],
      });
    }
    for (const expectedPath of derivePanelBoundaryCutPaths(panel, ir.joints)) {
      const path = pathById.get(expectedPath.pathId);
      if (
        !path ||
        path.kind !== "cut" ||
        path.closed ||
        path.panelId !== panel.panelId ||
        path.sheetId !== panel.sheetId ||
        path.points.length !== 2 ||
        !segmentsEquivalent(
          path.points[0]!,
          path.points[1]!,
          expectedPath.points[0]!,
          expectedPath.points[1]!,
          PATH_EQUIVALENCE_TOLERANCE_MM,
        )
      ) {
        addFailure(state, {
          failureId: `geometry.source_path#${expectedPath.pathId}`,
          category: "geometry",
          stage: "panel_geometry",
          severity: "hard",
          message:
            "Panel perimeter cut segment must match a non-crease source edge.",
          actual: measured(false),
          expected: measured(true),
          geometryRefs: [
            geometryRef("panel", panel.panelId),
            geometryRef("path", expectedPath.pathId),
          ],
          repairableProgramPaths: [],
        });
      }
    }
    for (const [index, contour] of panel.innerCutContours.entries()) {
      const pathId = `${panel.panelId}.cut.inner-${index + 1}`;
      const path = pathById.get(pathId);
      const expectedPoints = contour.vertices.map((point) =>
        transformPoint2(point, panel.flatTransform),
      );
      if (
        !path ||
        path.kind !== "cut" ||
        !path.closed ||
        path.panelId !== panel.panelId ||
        path.sheetId !== panel.sheetId ||
        !pointsMatchCyclically(path.points, expectedPoints)
      ) {
        addFailure(state, {
          failureId: `geometry.source_path#${pathId}`,
          category: "geometry",
          stage: "panel_geometry",
          severity: "hard",
          message:
            "Panel inner cut path must be source-equivalent to its transformed contour.",
          actual: measured(false),
          expected: measured(true),
          geometryRefs: [
            geometryRef("panel", panel.panelId),
            geometryRef("path", pathId),
          ],
          repairableProgramPaths: [],
        });
      }
    }
    state.metrics.push({
      metricId: `panel_area:${panel.panelId}`,
      value: areaMm2,
      unit: "mm2",
      geometryRefs: refs,
    });
    state.metrics.push({
      metricId: `panel_net_area:${panel.panelId}`,
      value: netAreaMm2,
      unit: "mm2",
      geometryRefs: refs,
    });
    state.metrics.push({
      metricId: `panel_net_material_ratio:${panel.panelId}`,
      value: netMaterialRatio,
      unit: "ratio",
      geometryRefs: refs,
    });
  }
  addCheck(
    state,
    "geometry.panels",
    "panel_geometry",
    hardFailureCount(state) === 0 ? "pass" : "fail",
    "Panel simplicity, area, edge length, and inner cuts were checked.",
    measured(ir.panels.length, "count"),
    measured(`<= ${FABRICATION_LIMITS.maximumPanelCount}`, "count"),
  );
};

const jointRangeValid = (joint: JointV1): boolean =>
  joint.kind === "prismatic"
    ? joint.minTravelMm <= joint.homeTravelMm &&
      joint.homeTravelMm <= joint.maxTravelMm
    : joint.minAngleDeg <= joint.homeAngleDeg &&
      joint.homeAngleDeg <= joint.maxAngleDeg;

const transformedPanelEdges = (
  panel: PanelV1,
): readonly (readonly [
  ReturnType<typeof transformPoint2>,
  ReturnType<typeof transformPoint2>,
])[] =>
  panel.contour.vertices.map((point, index) => [
    transformPoint2(point, panel.flatTransform),
    transformPoint2(
      panel.contour.vertices[(index + 1) % panel.contour.vertices.length]!,
      panel.flatTransform,
    ),
  ]);

const fabricationPathSegments = (
  path: FabricationIRV1["paths"][number],
): readonly (readonly [Point2Mm, Point2Mm])[] => {
  const segmentCount = path.closed
    ? path.points.length
    : Math.max(0, path.points.length - 1);
  return Array.from(
    { length: segmentCount },
    (_, index) =>
      [
        path.points[index]!,
        path.points[(index + 1) % path.points.length]!,
      ] as const,
  );
};

const connectorWorldAnchor = (
  connector: FabricationIRV1["connectors"][number],
  panel: PanelV1,
  home: EvaluatedMotionState,
): Point3Mm | null => {
  const bodyMatrix = home.bodyMatrices[panel.bodyId];
  if (!bodyMatrix) return null;
  const placed = transformPoint2(
    connectorReferencePoint2(connector),
    panel.flatTransform,
  );
  return transformPoint3(bodyMatrix, { ...placed, zMm: 0 });
};

const connectorWorldPoint = (
  point: Point2Mm,
  panel: PanelV1,
  home: EvaluatedMotionState,
): Point3Mm | null => {
  const bodyMatrix = home.bodyMatrices[panel.bodyId];
  if (!bodyMatrix) return null;
  const placed = transformPoint2(point, panel.flatTransform);
  return transformPoint3(bodyMatrix, { ...placed, zMm: 0 });
};

const segmentAlignment3 = (
  firstStart: Point3Mm,
  firstEnd: Point3Mm,
  secondStart: Point3Mm,
  secondEnd: Point3Mm,
): number | null => {
  const first = {
    x: firstEnd.xMm - firstStart.xMm,
    y: firstEnd.yMm - firstStart.yMm,
    z: firstEnd.zMm - firstStart.zMm,
  };
  const second = {
    x: secondEnd.xMm - secondStart.xMm,
    y: secondEnd.yMm - secondStart.yMm,
    z: secondEnd.zMm - secondStart.zMm,
  };
  const firstLength = Math.hypot(first.x, first.y, first.z);
  const secondLength = Math.hypot(second.x, second.y, second.z);
  if (firstLength <= 0 || secondLength <= 0) return null;
  const dot = first.x * second.x + first.y * second.y + first.z * second.z;
  return Math.min(1, Math.abs(dot / (firstLength * secondLength)));
};

const connectorSpanAlignment = (
  tab: Extract<FabricationIRV1["connectors"][number], { readonly kind: "tab" }>,
  slot: Extract<
    FabricationIRV1["connectors"][number],
    { readonly kind: "slot" }
  >,
  tabPanel: PanelV1,
  slotPanel: PanelV1,
  home: EvaluatedMotionState,
): number | null => {
  const tabStart = connectorWorldPoint(tab.rootEdge.start, tabPanel, home);
  const tabEnd = connectorWorldPoint(tab.rootEdge.end, tabPanel, home);
  const slotStart = connectorWorldPoint(slot.centerline.start, slotPanel, home);
  const slotEnd = connectorWorldPoint(slot.centerline.end, slotPanel, home);
  return tabStart && tabEnd && slotStart && slotEnd
    ? segmentAlignment3(tabStart, tabEnd, slotStart, slotEnd)
    : null;
};

const tabInsertionReachMm = (
  tab: Extract<FabricationIRV1["connectors"][number], { readonly kind: "tab" }>,
): number => {
  const deltaXmm = tab.rootEdge.end.xMm - tab.rootEdge.start.xMm;
  const deltaYmm = tab.rootEdge.end.yMm - tab.rootEdge.start.yMm;
  const rootLengthMm = Math.hypot(deltaXmm, deltaYmm);
  if (rootLengthMm <= 1e-12) return 0;
  return Math.max(
    ...tab.contour.vertices.map(
      (point) =>
        Math.abs(
          deltaXmm * (tab.rootEdge.start.yMm - point.yMm) -
            (tab.rootEdge.start.xMm - point.xMm) * deltaYmm,
        ) / rootLengthMm,
    ),
  );
};

const distancePointToSegment3Mm = (
  point: Point3Mm,
  start: Point3Mm,
  end: Point3Mm,
): number => {
  const delta = {
    x: end.xMm - start.xMm,
    y: end.yMm - start.yMm,
    z: end.zMm - start.zMm,
  };
  const lengthSquared = delta.x ** 2 + delta.y ** 2 + delta.z ** 2;
  const projection =
    lengthSquared <= 1e-12
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.xMm - start.xMm) * delta.x +
              (point.yMm - start.yMm) * delta.y +
              (point.zMm - start.zMm) * delta.z) /
              lengthSquared,
          ),
        );
  return Math.hypot(
    point.xMm - (start.xMm + projection * delta.x),
    point.yMm - (start.yMm + projection * delta.y),
    point.zMm - (start.zMm + projection * delta.z),
  );
};

const distancePointToLine3Mm = (
  point: Point3Mm,
  origin: Point3Mm,
  direction: { readonly x: number; readonly y: number; readonly z: number },
): number => {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length <= 1e-12) return Number.POSITIVE_INFINITY;
  const relative = {
    x: point.xMm - origin.xMm,
    y: point.yMm - origin.yMm,
    z: point.zMm - origin.zMm,
  };
  const cross = {
    x: relative.y * direction.z - relative.z * direction.y,
    y: relative.z * direction.x - relative.x * direction.z,
    z: relative.x * direction.y - relative.y * direction.x,
  };
  return Math.hypot(cross.x, cross.y, cross.z) / length;
};

const sameBodyPair = (
  actual: ReadonlySet<string>,
  parentBodyId: string,
  childBodyId: string,
): boolean =>
  actual.size === 2 && actual.has(parentBodyId) && actual.has(childBodyId);

const validateConnections = (
  ir: FabricationIRV1,
  state: VerificationState,
): void => {
  const pathById = new Map(ir.paths.map((path) => [path.pathId, path]));
  const panelById = new Map(ir.panels.map((panel) => [panel.panelId, panel]));
  const bodyById = new Map(ir.bodies.map((body) => [body.bodyId, body]));
  const connectorById = new Map(
    ir.connectors.map((connector) => [connector.connectorId, connector]),
  );
  const home = homeMotionState(ir);

  for (const tab of ir.connectors) {
    if (tab.kind !== "tab") continue;
    const mate = connectorById.get(tab.mateConnectorId);
    if (mate?.kind !== "slot" || mate.mateConnectorId !== tab.connectorId) {
      continue;
    }
    const tabPanel = panelById.get(tab.panelId);
    if (!tabPanel) continue;
    const slotPanel = panelById.get(mate.panelId);
    const fit = connectorPairFit(tab, mate, tabPanel.thicknessMm);
    const insertionAlignment = connectorInsertionAlignment(tab, mate);
    state.metrics.push({
      metricId: connectorPairMetricId(
        "fit_w",
        tab.connectorId,
        mate.connectorId,
      ),
      value: fit.slotWidthMm - fit.requiredSlotWidthMm,
      unit: "mm",
      geometryRefs: [
        geometryRef("connector", tab.connectorId),
        geometryRef("connector", mate.connectorId),
      ],
    });
    if (insertionAlignment !== null) {
      state.metrics.push({
        metricId: connectorPairMetricId(
          "axis",
          tab.connectorId,
          mate.connectorId,
        ),
        value: insertionAlignment,
        unit: "ratio",
        geometryRefs: [
          geometryRef("connector", tab.connectorId),
          geometryRef("connector", mate.connectorId),
        ],
      });
    }
    state.metrics.push({
      metricId: connectorPairMetricId(
        "fit_l",
        tab.connectorId,
        mate.connectorId,
      ),
      value: fit.slotLengthMm - fit.requiredSlotLengthMm,
      unit: "mm",
      geometryRefs: [
        geometryRef("connector", tab.connectorId),
        geometryRef("connector", mate.connectorId),
      ],
    });
    if (!fit.fits) {
      addFailure(state, {
        failureId: `connections.connector_fit#${tab.connectorId}:${mate.connectorId}`,
        category: "manufacturability",
        stage: "connections",
        severity: "hard",
        message:
          "A reciprocal tab and slot must clear both stock thickness and the tab span.",
        actual: measured(
          `width ${fit.slotWidthMm.toFixed(3)} mm; length ${fit.slotLengthMm.toFixed(3)} mm`,
        ),
        expected: measured(
          `width >= ${fit.requiredSlotWidthMm.toFixed(3)} mm; length >= ${fit.requiredSlotLengthMm.toFixed(3)} mm`,
        ),
        geometryRefs: [
          geometryRef("connector", tab.connectorId),
          geometryRef("connector", mate.connectorId),
          geometryRef("panel", tabPanel.panelId),
        ],
        repairableProgramPaths: [],
      });
    }
    if (!connectorInsertionDirectionsCompatible(tab, mate)) {
      addFailure(state, {
        failureId: `connections.connector_direction#${tab.connectorId}:${mate.connectorId}`,
        category: "manufacturability",
        stage: "connections",
        severity: "hard",
        message:
          "Reciprocal connector insertion axes must be parallel or antiparallel.",
        actual: measured(insertionAlignment ?? "nonzero finite axes", "ratio"),
        expected: measured(1, "ratio"),
        geometryRefs: [
          geometryRef("connector", tab.connectorId),
          geometryRef("connector", mate.connectorId),
        ],
        repairableProgramPaths: [],
      });
    }
    if (home.ok && slotPanel) {
      const spanAlignment = connectorSpanAlignment(
        tab,
        mate,
        tabPanel,
        slotPanel,
        home.value,
      );
      if (spanAlignment !== null) {
        state.metrics.push({
          metricId: connectorPairMetricId(
            "span",
            tab.connectorId,
            mate.connectorId,
          ),
          value: spanAlignment,
          unit: "ratio",
          geometryRefs: [
            geometryRef("connector", tab.connectorId),
            geometryRef("connector", mate.connectorId),
          ],
        });
      }
      if (
        spanAlignment === null ||
        1 - spanAlignment > CONNECTOR_ALIGNMENT_COSINE_TOLERANCE
      ) {
        addFailure(state, {
          failureId: `connections.connector_span_alignment#${tab.connectorId}:${mate.connectorId}`,
          category: "manufacturability",
          stage: "connections",
          severity: "hard",
          message:
            "The tab span and slot centerline must align in the assembled frame.",
          actual: measured(spanAlignment ?? "unresolved", "ratio"),
          expected: measured(1, "ratio"),
          geometryRefs: [
            geometryRef("connector", tab.connectorId),
            geometryRef("connector", mate.connectorId),
            geometryRef("panel", tabPanel.panelId),
            geometryRef("panel", slotPanel.panelId),
          ],
          repairableProgramPaths: [],
        });
      }
      // A reciprocal pair on one panel is a repeatable external module port:
      // each exported copy supplies one half to the next copy. Distinct-panel
      // pairs belong to this assembly and must be reachable in its home pose.
      if (tabPanel.panelId !== slotPanel.panelId) {
        const tabAnchor = connectorWorldAnchor(tab, tabPanel, home.value);
        const slotAnchor = connectorWorldAnchor(mate, slotPanel, home.value);
        const mateDistanceMm =
          tabAnchor && slotAnchor
            ? Math.hypot(
                tabAnchor.xMm - slotAnchor.xMm,
                tabAnchor.yMm - slotAnchor.yMm,
                tabAnchor.zMm - slotAnchor.zMm,
              )
            : Number.POSITIVE_INFINITY;
        const maximumMateDistanceMm =
          tabInsertionReachMm(tab) +
          mate.widthMm / 2 +
          Math.max(tab.clearanceMm, mate.clearanceMm);
        state.metrics.push({
          metricId: connectorPairMetricId(
            "reach",
            tab.connectorId,
            mate.connectorId,
          ),
          value: mateDistanceMm,
          unit: "mm",
          geometryRefs: [
            geometryRef("connector", tab.connectorId),
            geometryRef("connector", mate.connectorId),
          ],
        });
        if (mateDistanceMm > maximumMateDistanceMm) {
          addFailure(state, {
            failureId: `connections.connector_mate_reach#${tab.connectorId}:${mate.connectorId}`,
            category: "manufacturability",
            stage: "connections",
            severity: "hard",
            message:
              "The assembled slot lies beyond the tab's available insertion reach.",
            actual: measured(mateDistanceMm, "mm"),
            expected: measured(maximumMateDistanceMm, "mm"),
            geometryRefs: [
              geometryRef("connector", tab.connectorId),
              geometryRef("connector", mate.connectorId),
              geometryRef("panel", tabPanel.panelId),
              geometryRef("panel", slotPanel.panelId),
            ],
            repairableProgramPaths: [],
          });
        }
      }
    }
  }

  for (const joint of ir.joints) {
    const refs = [geometryRef("joint", joint.jointId)];
    if (!jointRangeValid(joint)) {
      addFailure(state, {
        failureId: `connections.joint_range#${joint.jointId}`,
        category: "kinematics",
        stage: "connections",
        severity: "hard",
        message: "Joint home value must lie inside its closed range.",
        actual: measured(false),
        expected: measured(true),
        geometryRefs: refs,
        repairableProgramPaths: [],
      });
    }
    const connectorIds =
      joint.kind === "prismatic"
        ? joint.guideConnectorIds
        : joint.kind === "revolute"
          ? joint.connectorIds
          : [];
    if (connectorIds.length > 0) {
      const resolvedConnectors = connectorIds.flatMap((connectorId) => {
        const connector = connectorById.get(connectorId);
        return connector ? [connector] : [];
      });
      const connectorBodyIds = new Set(
        resolvedConnectors.flatMap((connector) => {
          const panel = panelById.get(connector.panelId);
          return panel ? [panel.bodyId] : [];
        }),
      );
      if (
        resolvedConnectors.length !== connectorIds.length ||
        !sameBodyPair(connectorBodyIds, joint.parentBodyId, joint.childBodyId)
      ) {
        addFailure(state, {
          failureId: `connections.joint_connector_bodies#${joint.jointId}`,
          category: "topology",
          stage: "connections",
          severity: "hard",
          message:
            "Joint connectors must physically span exactly the parent and child bodies.",
          actual: measured([...connectorBodyIds].sort().join(",")),
          expected: measured(
            [joint.parentBodyId, joint.childBodyId].sort().join(","),
          ),
          geometryRefs: [
            geometryRef("joint", joint.jointId),
            ...resolvedConnectors.map((connector) =>
              geometryRef("connector", connector.connectorId),
            ),
          ],
          repairableProgramPaths: [],
        });
      } else if (home.ok) {
        for (const connector of resolvedConnectors) {
          const panel = panelById.get(connector.panelId)!;
          const anchor = connectorWorldAnchor(connector, panel, home.value);
          const distanceMm =
            anchor === null
              ? Number.POSITIVE_INFINITY
              : joint.kind === "prismatic"
                ? distancePointToLine3Mm(anchor, joint.originMm, joint.axis)
                : distancePointToSegment3Mm(
                    anchor,
                    joint.axis.startMm,
                    joint.axis.endMm,
                  );
          if (distanceMm > JOINT_ANCHOR_TOLERANCE_MM) {
            addFailure(state, {
              failureId: `connections.joint_anchor#${joint.jointId}:${connector.connectorId}`,
              category: "kinematics",
              stage: "connections",
              severity: "hard",
              message:
                "A joint connector anchor must coincide with its declared axis or origin.",
              actual: measured(distanceMm, "mm"),
              expected: measured(JOINT_ANCHOR_TOLERANCE_MM, "mm"),
              geometryRefs: [
                geometryRef("joint", joint.jointId),
                geometryRef("connector", connector.connectorId),
              ],
              repairableProgramPaths: [],
            });
          }
        }
      }
      const selectedConnectorIds = new Set(connectorIds);
      const selectedConnectorsAreMatePairs =
        resolvedConnectors.length === connectorIds.length &&
        resolvedConnectors.every((connector) => {
          const mate = connectorById.get(connector.mateConnectorId);
          return (
            mate !== undefined &&
            mate.mateConnectorId === connector.connectorId &&
            selectedConnectorIds.has(mate.connectorId)
          );
        });
      if (!selectedConnectorsAreMatePairs) {
        addFailure(state, {
          failureId: `connections.joint_connector_mates#${joint.jointId}`,
          category: "topology",
          stage: "connections",
          severity: "hard",
          message:
            "Joint connector references must contain complete reciprocal mate pairs.",
          actual: measured([...selectedConnectorIds].sort().join(",")),
          expected: measured("complete reciprocal connector pairs"),
          geometryRefs: [
            geometryRef("joint", joint.jointId),
            ...resolvedConnectors.map((connector) =>
              geometryRef("connector", connector.connectorId),
            ),
          ],
          repairableProgramPaths: [],
        });
      }
    }
    if (joint.kind === "prismatic") {
      if (Math.hypot(joint.axis.x, joint.axis.y, joint.axis.z) <= 1e-9) {
        addFailure(state, {
          failureId: `connections.axis#${joint.jointId}`,
          category: "kinematics",
          stage: "connections",
          severity: "hard",
          message: "Prismatic axis must be nonzero.",
          actual: measured(0),
          expected: measured("nonzero vector"),
          geometryRefs: refs,
          repairableProgramPaths: [],
        });
      }
      for (const connectorId of joint.guideConnectorIds) {
        if (!connectorById.has(connectorId)) {
          addReferenceFailure(
            state,
            joint.jointId,
            geometryRef("connector", connectorId),
          );
        }
      }
      continue;
    }
    const axisLengthMm = Math.hypot(
      joint.axis.endMm.xMm - joint.axis.startMm.xMm,
      joint.axis.endMm.yMm - joint.axis.startMm.yMm,
      joint.axis.endMm.zMm - joint.axis.startMm.zMm,
    );
    if (axisLengthMm < MINIMUM_FEATURE_MM) {
      addFailure(state, {
        failureId: `connections.axis#${joint.jointId}`,
        category: "kinematics",
        stage: "connections",
        severity: "hard",
        message: "Rotational joint axis is degenerate.",
        actual: measured(axisLengthMm, "mm"),
        expected: measured(MINIMUM_FEATURE_MM, "mm"),
        geometryRefs: refs,
        repairableProgramPaths: [],
      });
    }
    if (joint.kind === "fold") {
      const crease = pathById.get(joint.creasePathId);
      const axisStart = {
        xMm: joint.axis.startMm.xMm,
        yMm: joint.axis.startMm.yMm,
      };
      const axisEnd = {
        xMm: joint.axis.endMm.xMm,
        yMm: joint.axis.endMm.yMm,
      };
      const parentBody = bodyById.get(joint.parentBodyId);
      const childBody = bodyById.get(joint.childBodyId);
      const parentPanel = parentBody?.panelIds[0]
        ? panelById.get(parentBody.panelIds[0])
        : undefined;
      const childPanel = childBody?.panelIds[0]
        ? panelById.get(childBody.panelIds[0])
        : undefined;
      const creaseMatches =
        crease?.kind === "score" &&
        crease.sheetId === parentPanel?.sheetId &&
        parentPanel?.sheetId === childPanel?.sheetId &&
        crease.points.length === 2 &&
        crease.points[0] !== undefined &&
        crease.points[1] !== undefined &&
        segmentsEquivalent(
          crease.points[0],
          crease.points[1],
          axisStart,
          axisEnd,
          CONNECTION_TOLERANCE_MM,
        );
      const panelUsesAxis = (panel: PanelV1 | undefined): boolean =>
        panel !== undefined &&
        transformedPanelEdges(panel).some(([start, end]) =>
          segmentsEquivalent(
            start,
            end,
            axisStart,
            axisEnd,
            CONNECTION_TOLERANCE_MM,
          ),
        );
      if (
        !creaseMatches ||
        !panelUsesAxis(parentPanel) ||
        !panelUsesAxis(childPanel)
      ) {
        addFailure(state, {
          failureId: `connections.fold_edge#${joint.jointId}`,
          category: "manufacturability",
          stage: "connections",
          severity: "hard",
          message:
            "Fold axis must equal the score path and one edge on each joined panel.",
          actual: measured(false),
          expected: measured(true),
          geometryRefs: [...refs, geometryRef("path", joint.creasePathId)],
          repairableProgramPaths: [],
        });
      }
    } else {
      for (const connectorId of joint.connectorIds) {
        if (!connectorById.has(connectorId)) {
          addReferenceFailure(
            state,
            joint.jointId,
            geometryRef("connector", connectorId),
          );
        }
      }
    }
  }
  const scorePaths = ir.paths.filter((path) => path.kind === "score");
  for (const cutPath of ir.paths.filter((path) => path.kind === "cut")) {
    for (const scorePath of scorePaths) {
      const overlapsCrease = fabricationPathSegments(cutPath).some(
        ([cutStart, cutEnd]) =>
          fabricationPathSegments(scorePath).some(
            ([scoreStart, scoreEnd]) =>
              segmentProperlyIntersects(
                cutStart,
                cutEnd,
                scoreStart,
                scoreEnd,
              ) ||
              collinearSegmentOverlapLengthMm(
                cutStart,
                cutEnd,
                scoreStart,
                scoreEnd,
              ) > PATH_EQUIVALENCE_TOLERANCE_MM,
          ),
      );
      if (overlapsCrease) {
        addFailure(state, {
          failureId: `connections.cut_on_crease#${cutPath.pathId}:${scorePath.pathId}`,
          category: "manufacturability",
          stage: "connections",
          severity: "hard",
          message:
            "A CUT segment may not overlap an active SCORE crease because that would detach the joint.",
          actual: measured(true),
          expected: measured(false),
          geometryRefs: [
            geometryRef("path", cutPath.pathId),
            geometryRef("path", scorePath.pathId),
          ],
          repairableProgramPaths: [],
        });
      }
    }
  }
  for (const connector of ir.connectors) {
    const connectorPanel = panelById.get(connector.panelId);
    const connectorFeatureMm =
      connector.kind === "tab"
        ? Math.min(
            minimumEdgeLengthMm(connector.contour.vertices),
            Math.hypot(
              connector.rootEdge.end.xMm - connector.rootEdge.start.xMm,
              connector.rootEdge.end.yMm - connector.rootEdge.start.yMm,
            ),
          )
        : Math.min(
            connector.widthMm,
            Math.hypot(
              connector.centerline.end.xMm - connector.centerline.start.xMm,
              connector.centerline.end.yMm - connector.centerline.start.yMm,
            ),
          );
    if (
      connectorFeatureMm < MINIMUM_FEATURE_MM ||
      (connector.kind === "tab" && !isSimplePolygon(connector.contour.vertices))
    ) {
      addFailure(state, {
        failureId: `connections.connector_feature#${connector.connectorId}`,
        category: "manufacturability",
        stage: "connections",
        severity: "hard",
        message:
          "Connector contour, root, slot length, and width must meet the minimum feature size.",
        actual: measured(connectorFeatureMm, "mm"),
        expected: measured(MINIMUM_FEATURE_MM, "mm"),
        geometryRefs: [geometryRef("connector", connector.connectorId)],
        repairableProgramPaths: [],
      });
    }
    if (connectorPanel) {
      if (
        connector.kind === "tab" &&
        classifyTabAttachment(connector, connectorPanel) === null
      ) {
        addFailure(state, {
          failureId: `connections.tab_attachment#${connector.connectorId}`,
          category: "manufacturability",
          stage: "connections",
          severity: "hard",
          message:
            "A tab root must be one contour edge and must leave the tab attached to its panel.",
          actual: measured(false),
          expected: measured(true),
          geometryRefs: [
            geometryRef("connector", connector.connectorId),
            geometryRef("panel", connectorPanel.panelId),
          ],
          repairableProgramPaths: [],
        });
      }
      const boundaryPaths = derivePanelBoundaryCutPaths(
        connectorPanel,
        ir.joints,
      );
      for (const expectedPath of deriveConnectorCutPaths(
        connector,
        connectorPanel,
        boundaryPaths,
      )) {
        const connectorPath = pathById.get(expectedPath.pathId);
        const sourceEquivalent =
          connectorPath?.kind === "cut" &&
          connectorPath.panelId === connector.panelId &&
          connectorPath.sheetId === connectorPanel.sheetId &&
          connectorPath.closed === expectedPath.closed &&
          (expectedPath.closed
            ? pointsMatchCyclically(connectorPath.points, expectedPath.points)
            : connectorPath.points.length === 2 &&
              segmentsEquivalent(
                connectorPath.points[0]!,
                connectorPath.points[1]!,
                expectedPath.points[0]!,
                expectedPath.points[1]!,
                PATH_EQUIVALENCE_TOLERANCE_MM,
              ));
        if (!sourceEquivalent) {
          addFailure(state, {
            failureId: `connections.connector_path#${expectedPath.pathId}`,
            category: "manufacturability",
            stage: "connections",
            severity: "hard",
            message:
              "Every connector cut edge must match its source geometry while leaving tab roots attached.",
            actual: measured(false),
            expected: measured(true),
            geometryRefs: [
              geometryRef("connector", connector.connectorId),
              geometryRef("path", expectedPath.pathId),
            ],
            repairableProgramPaths: [],
          });
        }
      }
    }
    if (connector.clearanceMm < MINIMUM_CONNECTOR_CLEARANCE_MM) {
      addFailure(state, {
        failureId: `connections.clearance#${connector.connectorId}`,
        category: "manufacturability",
        stage: "connections",
        severity: "hard",
        message: "Connector clearance is below the fabrication minimum.",
        actual: measured(connector.clearanceMm, "mm"),
        expected: measured(MINIMUM_CONNECTOR_CLEARANCE_MM, "mm"),
        geometryRefs: [geometryRef("connector", connector.connectorId)],
        repairableProgramPaths: [
          `/blueprint/connectors/${connector.connectorId}/clearanceMm`,
        ],
      });
    }
    if (
      Math.hypot(
        connector.insertionDirection.x,
        connector.insertionDirection.y,
        connector.insertionDirection.z,
      ) <= 1e-9
    ) {
      addFailure(state, {
        failureId: `connections.insertion_direction#${connector.connectorId}`,
        category: "manufacturability",
        stage: "connections",
        severity: "hard",
        message: "Connector insertion direction must be nonzero.",
        actual: measured(0),
        expected: measured("nonzero vector"),
        geometryRefs: [geometryRef("connector", connector.connectorId)],
        repairableProgramPaths: [],
      });
    }
  }
  for (const panel of ir.panels) {
    const minimumLigamentMm = minimumPanelLigamentMm(panel);
    const holes = panelMaterialHoles(panel, ir.connectors);
    const slotHoles = holes.filter(
      (
        hole,
      ): hole is Extract<(typeof holes)[number], { readonly source: "slot" }> =>
        hole.source === "slot",
    );
    for (const slotHole of slotHoles) {
      const connectorId = slotHole.connectorId;
      const connectorRefs = [
        geometryRef("connector", connectorId),
        geometryRef("panel", panel.panelId),
      ];
      const simpleAndContained =
        isSimplePolygon(slotHole.vertices) &&
        slotHole.vertices.every((point) =>
          pointInPolygon(point, panel.contour.vertices, false),
        );
      if (!simpleAndContained) {
        addFailure(state, {
          failureId: `connections.slot_panel#${connectorId}`,
          category: "geometry",
          stage: "connections",
          severity: "hard",
          message: "A slot cut must be simple and strictly inside its panel.",
          actual: measured(false),
          expected: measured(true),
          geometryRefs: connectorRefs,
          repairableProgramPaths: [],
        });
        continue;
      }
      const boundaryClearanceMm = minimumContourBoundaryClearanceMm(
        panel.contour.vertices,
        slotHole.vertices,
      );
      if (boundaryClearanceMm < minimumLigamentMm) {
        addFailure(state, {
          failureId: `connections.slot_ligament#${connectorId}`,
          category: "manufacturability",
          stage: "connections",
          severity: "hard",
          message:
            "A slot cut leaves less than the minimum material ligament at the panel boundary.",
          actual: measured(boundaryClearanceMm, "mm"),
          expected: measured(minimumLigamentMm, "mm"),
          geometryRefs: connectorRefs,
          repairableProgramPaths: [],
        });
      }
      for (const otherHole of holes) {
        if (
          otherHole.holeId === slotHole.holeId ||
          (otherHole.source === "slot" &&
            otherHole.holeId.localeCompare(slotHole.holeId) < 0)
        ) {
          continue;
        }
        const clearanceMm = polygonsInteriorOverlap(
          slotHole.vertices,
          otherHole.vertices,
        )
          ? 0
          : minimumContourBoundaryClearanceMm(
              slotHole.vertices,
              otherHole.vertices,
            );
        if (clearanceMm < minimumLigamentMm) {
          addFailure(state, {
            failureId: `connections.slot_clearance#${connectorId}:${otherHole.holeId}`,
            category: "manufacturability",
            stage: "connections",
            severity: "hard",
            message:
              "A slot overlaps another cut or leaves less than the minimum material ligament.",
            actual: measured(clearanceMm, "mm"),
            expected: measured(minimumLigamentMm, "mm"),
            geometryRefs: [
              ...connectorRefs,
              ...(otherHole.connectorId
                ? [geometryRef("connector", otherHole.connectorId)]
                : []),
            ],
            repairableProgramPaths: [],
          });
        }
      }
    }
  }
  addCheck(
    state,
    "connections.features",
    "connections",
    hardFailureCount(state) === 0 ? "pass" : "fail",
    "Joint axes, reciprocal mates, tab roots, slot material, paths, and connector clearances were checked.",
    measured(ir.joints.length + ir.connectors.length, "count"),
    measured(`<= ${FABRICATION_LIMITS.maximumJointAndConnectorCount}`, "count"),
  );
};

const validateSheetPacking = (
  ir: FabricationIRV1,
  state: VerificationState,
): void => {
  const sheetById = new Map(ir.sheets.map((sheet) => [sheet.sheetId, sheet]));
  const flatPanelVertices = new Map(
    ir.panels.map((panel) => [
      panel.panelId,
      panel.contour.vertices.map((point) =>
        transformPoint2(point, panel.flatTransform),
      ),
    ]),
  );
  for (const panel of ir.panels) {
    const sheet = sheetById.get(panel.sheetId)!;
    const vertices = flatPanelVertices.get(panel.panelId)!;
    const bounds = polygonBounds(vertices);
    if (
      bounds.minimumXmm < sheet.printableMarginMm ||
      bounds.minimumYmm < sheet.printableMarginMm ||
      bounds.maximumXmm > sheet.widthMm - sheet.printableMarginMm ||
      bounds.maximumYmm > sheet.heightMm - sheet.printableMarginMm
    ) {
      addFailure(state, {
        failureId: `packing.sheet_bounds#${panel.panelId}`,
        category: "manufacturability",
        stage: "sheet_packing",
        severity: "hard",
        message: `${panel.label} exceeds the printable sheet bounds.`,
        actual: measured(
          `${bounds.minimumXmm.toFixed(2)},${bounds.minimumYmm.toFixed(2)} to ${bounds.maximumXmm.toFixed(2)},${bounds.maximumYmm.toFixed(2)}`,
        ),
        expected: measured(
          `${sheet.printableMarginMm} to ${sheet.widthMm - sheet.printableMarginMm},${sheet.heightMm - sheet.printableMarginMm} mm`,
        ),
        geometryRefs: [
          geometryRef("panel", panel.panelId),
          geometryRef("sheet", sheet.sheetId),
        ],
        repairableProgramPaths: [
          `/blueprint/panels/${panel.panelId}/flatTransform/translationMm/xMm`,
          `/blueprint/panels/${panel.panelId}/flatTransform/translationMm/yMm`,
        ],
      });
    }
  }
  for (const path of ir.paths) {
    const sheet = sheetById.get(path.sheetId)!;
    const bounds = polygonBounds(path.points);
    if (
      bounds.minimumXmm < sheet.printableMarginMm ||
      bounds.minimumYmm < sheet.printableMarginMm ||
      bounds.maximumXmm > sheet.widthMm - sheet.printableMarginMm ||
      bounds.maximumYmm > sheet.heightMm - sheet.printableMarginMm
    ) {
      addFailure(state, {
        failureId: `packing.path_bounds#${path.pathId}`,
        category: "manufacturability",
        stage: "sheet_packing",
        severity: "hard",
        message: "Fabrication path exceeds the printable sheet bounds.",
        actual: measured(
          `${bounds.minimumXmm.toFixed(2)},${bounds.minimumYmm.toFixed(2)} to ${bounds.maximumXmm.toFixed(2)},${bounds.maximumYmm.toFixed(2)}`,
        ),
        expected: measured(
          `${sheet.printableMarginMm} to ${sheet.widthMm - sheet.printableMarginMm},${sheet.heightMm - sheet.printableMarginMm} mm`,
        ),
        geometryRefs: [
          geometryRef("path", path.pathId),
          geometryRef("sheet", sheet.sheetId),
        ],
        repairableProgramPaths: [],
      });
    }
  }
  for (let firstIndex = 0; firstIndex < ir.panels.length; firstIndex += 1) {
    const first = ir.panels[firstIndex]!;
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < ir.panels.length;
      secondIndex += 1
    ) {
      const second = ir.panels[secondIndex]!;
      if (first.sheetId !== second.sheetId) continue;
      const firstVertices = flatPanelVertices.get(first.panelId)!;
      const secondVertices = flatPanelVertices.get(second.panelId)!;
      if (polygonsInteriorOverlap(firstVertices, secondVertices)) {
        addFailure(state, {
          failureId: `packing.panel_overlap#${first.panelId}:${second.panelId}`,
          category: "manufacturability",
          stage: "sheet_packing",
          severity: "hard",
          message: "Flat panel interiors overlap on the source sheet.",
          actual: measured(true),
          expected: measured(false),
          geometryRefs: [
            geometryRef("panel", first.panelId),
            geometryRef("panel", second.panelId),
          ],
          repairableProgramPaths: [
            `/blueprint/panels/${second.panelId}/flatTransform/translationMm/xMm`,
            `/blueprint/panels/${second.panelId}/flatTransform/translationMm/yMm`,
          ],
        });
      }
    }
  }
  addCheck(
    state,
    "packing.sheets",
    "sheet_packing",
    hardFailureCount(state) === 0 ? "pass" : "fail",
    "Printable margins and flat panel overlap were checked.",
    measured(ir.sheets.length, "count"),
    measured(`<= ${FABRICATION_LIMITS.maximumSheetCount}`, "count"),
  );
};

const edgeLengths = (vertices: readonly Point3Mm[]): readonly number[] =>
  vertices.map((point, index) => {
    const next = vertices[(index + 1) % vertices.length]!;
    return Math.hypot(
      next.xMm - point.xMm,
      next.yMm - point.yMm,
      next.zMm - point.zMm,
    );
  });

const validateRigidTransforms = (
  ir: FabricationIRV1,
  state: VerificationState,
): EvaluatedMotionState | null => {
  const home = homeMotionState(ir);
  if (!home.ok) {
    addFailure(state, {
      failureId: "rigid_transforms.home_state",
      category: "kinematics",
      stage: "rigid_transforms",
      severity: "hard",
      message: `Home transform evaluation failed: ${home.error.id}.`,
      actual: measured(home.error.id),
      expected: measured("finite rigid transforms"),
      geometryRefs: [],
      repairableProgramPaths: [],
    });
    return null;
  }
  if (
    home.value.maximumClosureResidualMm >
    FABRICATION_KINEMATIC_LIMITS.maximumClosureResidualMm
  ) {
    addFailure(state, {
      failureId: "rigid_transforms.closure",
      category: "kinematics",
      stage: "rigid_transforms",
      severity: "hard",
      message: "Joint closure residual exceeds the hard tolerance.",
      actual: measured(home.value.maximumClosureResidualMm, "mm"),
      expected: measured(
        FABRICATION_KINEMATIC_LIMITS.maximumClosureResidualMm,
        "mm",
      ),
      geometryRefs: ir.joints.map((joint) =>
        geometryRef("joint", joint.jointId),
      ),
      repairableProgramPaths: [],
    });
  }
  for (const panel of ir.panels) {
    const sourceLengths = panel.contour.vertices.map((point, index) => {
      const next =
        panel.contour.vertices[(index + 1) % panel.contour.vertices.length]!;
      return Math.hypot(next.xMm - point.xMm, next.yMm - point.yMm);
    });
    const transformedLengths = edgeLengths(
      home.value.panelVertices[panel.panelId]!,
    );
    const maximumErrorMm = sourceLengths.reduce(
      (maximum, lengthMm, index) =>
        Math.max(maximum, Math.abs(lengthMm - transformedLengths[index]!)),
      0,
    );
    if (maximumErrorMm > 1e-6) {
      addFailure(state, {
        failureId: `rigid_transforms.panel_length#${panel.panelId}`,
        category: "kinematics",
        stage: "rigid_transforms",
        severity: "hard",
        message: "Rigid transform changed a panel edge length.",
        actual: measured(maximumErrorMm, "mm"),
        expected: measured(0, "mm"),
        geometryRefs: [geometryRef("panel", panel.panelId)],
        repairableProgramPaths: [],
      });
    }
  }
  addCheck(
    state,
    "rigid_transforms.invariants",
    "rigid_transforms",
    hardFailureCount(state) === 0 ? "pass" : "fail",
    "Home transforms, seam closure, and preserved panel lengths were checked.",
    measured(home.value.maximumClosureResidualMm, "mm"),
    measured(FABRICATION_KINEMATIC_LIMITS.maximumClosureResidualMm, "mm"),
  );
  return home.value;
};

const jointUnit = (joint: JointV1): "mm" | "deg" =>
  joint.kind === "prismatic" ? "mm" : "deg";

const movingDistanceMm = (
  first: EvaluatedMotionState,
  last: EvaluatedMotionState,
): number => {
  let maximumMm = 0;
  for (const [panelId, firstVertices] of Object.entries(first.panelVertices)) {
    const lastVertices = last.panelVertices[panelId]!;
    for (const [index, point] of firstVertices.entries()) {
      const end = lastVertices[index]!;
      maximumMm = Math.max(
        maximumMm,
        Math.hypot(
          end.xMm - point.xMm,
          end.yMm - point.yMm,
          end.zMm - point.zMm,
        ),
      );
    }
  }
  return maximumMm;
};

const sampleBaseMotion = (
  ir: FabricationIRV1,
  state: VerificationState,
): readonly EvaluatedMotionState[] | null => {
  if (!ir.driver) {
    const home = homeMotionState(ir);
    return home.ok ? [home.value] : null;
  }
  const states: EvaluatedMotionState[] = [];
  for (
    let index = 0;
    index < FABRICATION_LIMITS.requiredMotionSampleCount;
    index += 1
  ) {
    const ratio = index / (FABRICATION_LIMITS.requiredMotionSampleCount - 1);
    const value =
      ir.driver.minimumValue +
      ratio * (ir.driver.maximumValue - ir.driver.minimumValue);
    const evaluated = evaluateMotionState(ir, value);
    if (!evaluated.ok) {
      addFailure(state, {
        failureId: `motion.sample#${index}`,
        category: "kinematics",
        stage: "motion",
        severity: "hard",
        message: `Motion state ${index} failed: ${evaluated.error.id}.`,
        actual: measured(evaluated.error.id),
        expected: measured("reachable finite state"),
        geometryRefs: [geometryRef("driver", ir.driver.driverId)],
        repairableProgramPaths: motionRepairPaths(ir),
      });
      return null;
    }
    states.push(evaluated.value);
  }
  return states;
};

const validateMotion = (
  ir: FabricationIRV1,
  state: VerificationState,
): Omit<
  MotionEvaluation,
  | "adaptiveSampleCount"
  | "allStates"
  | "minimumClearanceMm"
  | "collisionFree"
  | "collisionRefs"
> | null => {
  const states = sampleBaseMotion(ir, state);
  if (!states || states.length === 0) return null;
  let maximumAngleErrorDeg = 0;
  let maximumTravelErrorMm = 0;
  const jointById = new Map(ir.joints.map((joint) => [joint.jointId, joint]));
  for (const output of ir.outputs) {
    const joint = jointById.get(output.jointId);
    const values = states
      .map((motionState) => motionState.jointValues[output.jointId])
      .filter((value): value is number => value !== undefined);
    if (!joint || values.length !== states.length) continue;
    const actualMinimum = Math.min(...values);
    const actualMaximum = Math.max(...values);
    const error = Math.max(
      Math.abs(actualMinimum - output.minimumValue),
      Math.abs(actualMaximum - output.maximumValue),
    );
    if (jointUnit(joint) === "deg")
      maximumAngleErrorDeg = Math.max(maximumAngleErrorDeg, error);
    else maximumTravelErrorMm = Math.max(maximumTravelErrorMm, error);
  }
  const branchContinuous = ir.joints.every((joint) => {
    const values = states
      .map((motionState) => motionState.jointValues[joint.jointId])
      .filter((value): value is number => value !== undefined);
    const differences = values
      .slice(1)
      .map((value, index) => value - (values[index] ?? value));
    const positive = differences.some((difference) => difference > 1e-8);
    const negative = differences.some((difference) => difference < -1e-8);
    return !(positive && negative);
  });
  const first = states[0];
  const last = states.at(-1);
  const driverReachable =
    ir.driver === null ||
    (first?.driverValue === ir.driver.minimumValue &&
      last?.driverValue === ir.driver.maximumValue);
  const deadStateFree =
    ir.behavior === "static" ||
    (first !== undefined &&
      last !== undefined &&
      movingDistanceMm(first, last) > 0.1);
  const maximumClosureResidualMm = Math.max(
    ...states.map((motionState) => motionState.maximumClosureResidualMm),
  );
  if (
    maximumAngleErrorDeg > FABRICATION_KINEMATIC_LIMITS.maximumAngleErrorDeg ||
    maximumTravelErrorMm > FABRICATION_KINEMATIC_LIMITS.maximumTravelErrorMm ||
    maximumClosureResidualMm >
      FABRICATION_KINEMATIC_LIMITS.maximumClosureResidualMm ||
    !branchContinuous ||
    !driverReachable ||
    !deadStateFree
  ) {
    addFailure(state, {
      failureId: "motion.hard_limits",
      category: "kinematics",
      stage: "motion",
      severity: "hard",
      message:
        "Motion violates an angle, travel, closure, continuity, reachability, or dead-state limit.",
      actual: measured(
        `angle=${maximumAngleErrorDeg.toFixed(3)}, travel=${maximumTravelErrorMm.toFixed(3)}, closure=${maximumClosureResidualMm.toFixed(3)}, continuous=${branchContinuous}, reachable=${driverReachable}, live=${deadStateFree}`,
      ),
      expected: measured("all motion hard limits pass"),
      geometryRefs: ir.driver
        ? [geometryRef("driver", ir.driver.driverId)]
        : [],
      repairableProgramPaths: motionRepairPaths(ir),
    });
  }
  addCheck(
    state,
    "motion.deployment",
    "motion",
    hardFailureCount(state) === 0 ? "pass" : "fail",
    "Driver range and output motion were sampled deterministically.",
    measured(states.length, "count"),
    measured(
      ir.driver ? FABRICATION_LIMITS.requiredMotionSampleCount : 1,
      "count",
    ),
  );
  return {
    baseStates: states,
    maximumAngleErrorDeg,
    maximumTravelErrorMm,
    maximumClosureResidualMm,
    branchContinuous,
    driverReachable,
    deadStateFree,
  };
};

type PanelTriangle3 = readonly [Point3Mm, Point3Mm, Point3Mm];
type Segment3Mm = readonly [Point3Mm, Point3Mm];

interface ReciprocalConnectorPair {
  readonly tab: Extract<
    FabricationIRV1["connectors"][number],
    { readonly kind: "tab" }
  >;
  readonly slot: Extract<
    FabricationIRV1["connectors"][number],
    { readonly kind: "slot" }
  >;
}

const triangleLike = (triangle: PanelTriangle3) => ({
  first: triangle[0],
  second: triangle[1],
  third: triangle[2],
});

const pointDistance3Mm = (first: Point3Mm, second: Point3Mm): number =>
  Math.hypot(
    first.xMm - second.xMm,
    first.yMm - second.yMm,
    first.zMm - second.zMm,
  );

const segmentTriangleIntersectionPoint = (
  segment: Segment3Mm,
  triangle: PanelTriangle3,
): Point3Mm | null => {
  const [start, end] = segment;
  const [first, second, third] = triangle;
  const direction = {
    x: end.xMm - start.xMm,
    y: end.yMm - start.yMm,
    z: end.zMm - start.zMm,
  };
  const firstEdge = {
    x: second.xMm - first.xMm,
    y: second.yMm - first.yMm,
    z: second.zMm - first.zMm,
  };
  const secondEdge = {
    x: third.xMm - first.xMm,
    y: third.yMm - first.yMm,
    z: third.zMm - first.zMm,
  };
  const directionCross = {
    x: direction.y * secondEdge.z - direction.z * secondEdge.y,
    y: direction.z * secondEdge.x - direction.x * secondEdge.z,
    z: direction.x * secondEdge.y - direction.y * secondEdge.x,
  };
  const determinant =
    firstEdge.x * directionCross.x +
    firstEdge.y * directionCross.y +
    firstEdge.z * directionCross.z;
  if (Math.abs(determinant) <= 1e-10) return null;
  const inverse = 1 / determinant;
  const startOffset = {
    x: start.xMm - first.xMm,
    y: start.yMm - first.yMm,
    z: start.zMm - first.zMm,
  };
  const firstBarycentric =
    inverse *
    (startOffset.x * directionCross.x +
      startOffset.y * directionCross.y +
      startOffset.z * directionCross.z);
  if (firstBarycentric < -1e-9 || firstBarycentric > 1 + 1e-9) {
    return null;
  }
  const offsetCross = {
    x: startOffset.y * firstEdge.z - startOffset.z * firstEdge.y,
    y: startOffset.z * firstEdge.x - startOffset.x * firstEdge.z,
    z: startOffset.x * firstEdge.y - startOffset.y * firstEdge.x,
  };
  const secondBarycentric =
    inverse *
    (direction.x * offsetCross.x +
      direction.y * offsetCross.y +
      direction.z * offsetCross.z);
  if (
    secondBarycentric < -1e-9 ||
    firstBarycentric + secondBarycentric > 1 + 1e-9
  ) {
    return null;
  }
  const segmentFraction =
    inverse *
    (secondEdge.x * offsetCross.x +
      secondEdge.y * offsetCross.y +
      secondEdge.z * offsetCross.z);
  if (segmentFraction < -1e-9 || segmentFraction > 1 + 1e-9) {
    return null;
  }
  return {
    xMm: start.xMm + direction.x * segmentFraction,
    yMm: start.yMm + direction.y * segmentFraction,
    zMm: start.zMm + direction.z * segmentFraction,
  };
};

const triangleIntersectionSegment = (
  first: PanelTriangle3,
  second: PanelTriangle3,
): Segment3Mm | null => {
  const edges = (triangle: PanelTriangle3): readonly Segment3Mm[] => [
    [triangle[0], triangle[1]],
    [triangle[1], triangle[2]],
    [triangle[2], triangle[0]],
  ];
  const points: Point3Mm[] = [];
  const addPoint = (point: Point3Mm | null): void => {
    if (
      point &&
      !points.some(
        (candidate) =>
          pointDistance3Mm(candidate, point) <= CONTACT_LOCUS_TOLERANCE_MM,
      )
    ) {
      points.push(point);
    }
  };
  for (const edge of edges(first)) {
    addPoint(segmentTriangleIntersectionPoint(edge, second));
  }
  for (const edge of edges(second)) {
    addPoint(segmentTriangleIntersectionPoint(edge, first));
  }
  if (points.length < 2) return null;

  let farthest: Segment3Mm | null = null;
  let farthestDistanceMm = 0;
  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    const firstPoint = points[firstIndex];
    if (!firstPoint) continue;
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < points.length;
      secondIndex += 1
    ) {
      const secondPoint = points[secondIndex];
      if (!secondPoint) continue;
      const distanceMm = pointDistance3Mm(firstPoint, secondPoint);
      if (distanceMm > farthestDistanceMm) {
        farthest = [firstPoint, secondPoint];
        farthestDistanceMm = distanceMm;
      }
    }
  }
  return farthestDistanceMm > CONTACT_LOCUS_TOLERANCE_MM ? farthest : null;
};

const panelIntersectionSegments = (
  firstPanelId: string,
  secondPanelId: string,
  motionState: EvaluatedMotionState,
): readonly Segment3Mm[] => {
  const firstTriangles = motionState.panelTriangles[firstPanelId] ?? [];
  const secondTriangles = motionState.panelTriangles[secondPanelId] ?? [];
  return firstTriangles.flatMap((first) =>
    secondTriangles.flatMap((second) => {
      const segment = triangleIntersectionSegment(first, second);
      return segment ? [segment] : [];
    }),
  );
};

const panelIntersectionWitnesses = (
  firstPanelId: string,
  secondPanelId: string,
  motionState: EvaluatedMotionState,
): readonly Point3Mm[] => {
  // A zero-area panel intersection can be a valid shared edge or an invalid
  // line through both interiors. Triangle witnesses retain the entire measured
  // intersection locus so a declared seam elsewhere cannot hide the crossing.
  const witnesses: Point3Mm[] = [];
  const firstBoundary = motionState.panelVertices[firstPanelId] ?? [];
  const secondBoundary = motionState.panelVertices[secondPanelId] ?? [];
  const firstTriangles = motionState.panelTriangles[firstPanelId] ?? [];
  const secondTriangles = motionState.panelTriangles[secondPanelId] ?? [];
  const collect = (
    boundary: readonly Point3Mm[],
    triangles: readonly PanelTriangle3[],
  ): void => {
    for (const point of boundary) {
      for (const triangle of triangles) {
        if (
          pointTriangleDistanceMm(point, triangleLike(triangle)) <=
          CONTACT_LOCUS_TOLERANCE_MM
        ) {
          witnesses.push(point);
        }
      }
    }
    for (const [start, end] of boundary.map(
      (point, index) =>
        [point, boundary[(index + 1) % boundary.length]!] as const,
    )) {
      for (const triangle of triangles) {
        const witness = segmentTriangleIntersectionPoint(
          [start, end],
          triangle,
        );
        if (witness) {
          witnesses.push(witness);
        }
      }
    }
  };
  collect(firstBoundary, secondTriangles);
  collect(secondBoundary, firstTriangles);
  return witnesses;
};

const coincidentSegmentOverlap3 = (
  first: Segment3Mm,
  second: Segment3Mm,
): Segment3Mm | null => {
  const firstDirection = {
    x: first[1].xMm - first[0].xMm,
    y: first[1].yMm - first[0].yMm,
    z: first[1].zMm - first[0].zMm,
  };
  const secondDirection = {
    x: second[1].xMm - second[0].xMm,
    y: second[1].yMm - second[0].yMm,
    z: second[1].zMm - second[0].zMm,
  };
  const firstLengthMm = Math.hypot(
    firstDirection.x,
    firstDirection.y,
    firstDirection.z,
  );
  const secondLengthMm = Math.hypot(
    secondDirection.x,
    secondDirection.y,
    secondDirection.z,
  );
  if (
    firstLengthMm <= CONTACT_LOCUS_TOLERANCE_MM ||
    secondLengthMm <= CONTACT_LOCUS_TOLERANCE_MM
  ) {
    return null;
  }
  const crossLength = Math.hypot(
    firstDirection.y * secondDirection.z - firstDirection.z * secondDirection.y,
    firstDirection.z * secondDirection.x - firstDirection.x * secondDirection.z,
    firstDirection.x * secondDirection.y - firstDirection.y * secondDirection.x,
  );
  if (crossLength / (firstLengthMm * secondLengthMm) > 1e-8) return null;
  if (
    distancePointToLine3Mm(second[0], first[0], firstDirection) >
      CONTACT_LOCUS_TOLERANCE_MM ||
    distancePointToLine3Mm(second[1], first[0], firstDirection) >
      CONTACT_LOCUS_TOLERANCE_MM
  ) {
    return null;
  }
  const unit = {
    x: firstDirection.x / firstLengthMm,
    y: firstDirection.y / firstLengthMm,
    z: firstDirection.z / firstLengthMm,
  };
  const project = (point: Point3Mm): number =>
    (point.xMm - first[0].xMm) * unit.x +
    (point.yMm - first[0].yMm) * unit.y +
    (point.zMm - first[0].zMm) * unit.z;
  const secondProjections = [project(second[0]), project(second[1])] as const;
  const overlapStartMm = Math.max(0, Math.min(...secondProjections));
  const overlapEndMm = Math.min(firstLengthMm, Math.max(...secondProjections));
  if (overlapEndMm - overlapStartMm <= CONTACT_LOCUS_TOLERANCE_MM) {
    return null;
  }
  const pointAt = (distanceMm: number): Point3Mm => ({
    xMm: first[0].xMm + unit.x * distanceMm,
    yMm: first[0].yMm + unit.y * distanceMm,
    zMm: first[0].zMm + unit.z * distanceMm,
  });
  return [pointAt(overlapStartMm), pointAt(overlapEndMm)];
};

const coincidentPanelBoundarySegments = (
  firstPanelId: string,
  secondPanelId: string,
  motionState: EvaluatedMotionState,
): readonly Segment3Mm[] => {
  const boundarySegments = (panelId: string): readonly Segment3Mm[] => {
    const vertices = motionState.panelVertices[panelId] ?? [];
    return vertices.map(
      (point, index) =>
        [point, vertices[(index + 1) % vertices.length]!] as const,
    );
  };
  return boundarySegments(firstPanelId).flatMap((first) =>
    boundarySegments(secondPanelId).flatMap((second) => {
      const overlap = coincidentSegmentOverlap3(first, second);
      return overlap ? [overlap] : [];
    }),
  );
};

const witnessesAreConfinedToSegments = (
  witnesses: readonly Point3Mm[],
  segments: readonly Segment3Mm[],
  toleranceMm = CONTACT_LOCUS_TOLERANCE_MM,
): boolean =>
  witnesses.length > 0 &&
  segments.length > 0 &&
  witnesses.every((point) =>
    segments.some(
      ([start, end]) =>
        distancePointToSegment3Mm(point, start, end) <= toleranceMm,
    ),
  );

const segmentIsCoveredByCoincidentSegments = (
  segment: Segment3Mm,
  coincidentSegments: readonly Segment3Mm[],
): boolean => {
  const direction = {
    x: segment[1].xMm - segment[0].xMm,
    y: segment[1].yMm - segment[0].yMm,
    z: segment[1].zMm - segment[0].zMm,
  };
  const lengthMm = Math.hypot(direction.x, direction.y, direction.z);
  if (lengthMm <= CONTACT_LOCUS_TOLERANCE_MM) return true;
  const unit = {
    x: direction.x / lengthMm,
    y: direction.y / lengthMm,
    z: direction.z / lengthMm,
  };
  const project = (point: Point3Mm): number =>
    (point.xMm - segment[0].xMm) * unit.x +
    (point.yMm - segment[0].yMm) * unit.y +
    (point.zMm - segment[0].zMm) * unit.z;
  const intervals = coincidentSegments
    .flatMap(([start, end]) => {
      if (
        distancePointToLine3Mm(start, segment[0], direction) >
          CONTACT_LOCUS_TOLERANCE_MM ||
        distancePointToLine3Mm(end, segment[0], direction) >
          CONTACT_LOCUS_TOLERANCE_MM
      ) {
        return [];
      }
      const startMm = Math.max(0, Math.min(project(start), project(end)));
      const endMm = Math.min(lengthMm, Math.max(project(start), project(end)));
      return endMm - startMm > CONTACT_LOCUS_TOLERANCE_MM
        ? ([[startMm, endMm]] as const)
        : [];
    })
    .toSorted((left, right) => left[0] - right[0]);
  const firstInterval = intervals[0];
  if (!firstInterval || firstInterval[0] > CONTACT_LOCUS_TOLERANCE_MM) {
    return false;
  }
  let coveredUntilMm = firstInterval[1];
  for (const [startMm, endMm] of intervals.slice(1)) {
    if (startMm > coveredUntilMm + CONTACT_LOCUS_TOLERANCE_MM) return false;
    coveredUntilMm = Math.max(coveredUntilMm, endMm);
  }
  return coveredUntilMm >= lengthMm - CONTACT_LOCUS_TOLERANCE_MM;
};

const boundaryContactIsLocusBound = (
  firstPanelId: string,
  secondPanelId: string,
  motionState: EvaluatedMotionState,
  witnesses: readonly Point3Mm[],
): boolean => {
  const coincidentSegments = coincidentPanelBoundarySegments(
    firstPanelId,
    secondPanelId,
    motionState,
  );
  if (!witnessesAreConfinedToSegments(witnesses, coincidentSegments)) {
    return false;
  }
  // Endpoint witnesses alone are insufficient for concave panels: a line can
  // enter both interiors between two genuine seam fragments. Require every
  // measured triangle-intersection interval to be continuously covered by the
  // coincident contour seams.
  return panelIntersectionSegments(
    firstPanelId,
    secondPanelId,
    motionState,
  ).every((segment) =>
    segmentIsCoveredByCoincidentSegments(segment, coincidentSegments),
  );
};

const positiveBoundarySeamExists = (
  firstPanelId: string,
  secondPanelId: string,
  motionState: EvaluatedMotionState,
): boolean =>
  coincidentPanelBoundarySegments(firstPanelId, secondPanelId, motionState)
    .length > 0;

const tabTrianglesAtState = (
  pair: ReciprocalConnectorPair,
  tabPanel: PanelV1,
  motionState: EvaluatedMotionState,
): readonly PanelTriangle3[] => {
  const triangulation = triangulatePolygonWithHoles(
    pair.tab.contour.vertices,
    [],
  );
  const vertices = triangulation.vertices.flatMap((point) => {
    const transformed = connectorWorldPoint(point, tabPanel, motionState);
    return transformed ? [transformed] : [];
  });
  if (vertices.length !== triangulation.vertices.length) return [];
  return triangulation.triangles.map(
    (triangle) =>
      [
        vertices[triangle.a]!,
        vertices[triangle.b]!,
        vertices[triangle.c]!,
      ] as const,
  );
};

const connectorContactIsLocusBound = (
  pairs: readonly ReciprocalConnectorPair[],
  panelById: ReadonlyMap<string, PanelV1>,
  motionState: EvaluatedMotionState,
  witnesses: readonly Point3Mm[],
): boolean =>
  witnesses.length > 0 &&
  pairs.some((pair) => {
    if (!connectorInsertionDirectionsCompatible(pair.tab, pair.slot)) {
      return false;
    }
    const tabPanel = panelById.get(pair.tab.panelId);
    const slotPanel = panelById.get(pair.slot.panelId);
    if (!tabPanel || !slotPanel) return false;
    const slotStart = connectorWorldPoint(
      pair.slot.centerline.start,
      slotPanel,
      motionState,
    );
    const slotEnd = connectorWorldPoint(
      pair.slot.centerline.end,
      slotPanel,
      motionState,
    );
    if (!slotStart || !slotEnd) return false;
    const tabTriangles = tabTrianglesAtState(pair, tabPanel, motionState);
    // Slot material is removed from the collision mesh. Any remaining
    // zero-clearance contact is allowed only at that aperture and within the
    // actual tab contour, never across the rest of either connector panel.
    const slotLocusToleranceMm =
      pair.slot.widthMm / 2 + CONTACT_LOCUS_TOLERANCE_MM;
    return (
      tabTriangles.length > 0 &&
      witnesses.every(
        (point) =>
          distancePointToSegment3Mm(point, slotStart, slotEnd) <=
            slotLocusToleranceMm &&
          tabTriangles.some(
            (triangle) =>
              pointTriangleDistanceMm(point, triangleLike(triangle)) <=
              CONTACT_LOCUS_TOLERANCE_MM,
          ),
      )
    );
  });

const validateCollision = (
  ir: FabricationIRV1,
  state: VerificationState,
  baseMotion: NonNullable<ReturnType<typeof validateMotion>>,
): MotionEvaluation => {
  const isSingleStateStaticDesign =
    ir.driver === null && baseMotion.baseStates.length === 1;
  const foldAdjacentBodies = new Set(
    ir.joints
      .filter((joint) => joint.kind === "fold")
      .map((joint) => unorderedPairKey(joint.parentBodyId, joint.childBodyId)),
  );
  const panelById = new Map(ir.panels.map((panel) => [panel.panelId, panel]));
  const bodyById = new Map(ir.bodies.map((body) => [body.bodyId, body]));
  const foldAdjacentPanelPairs = new Set(
    ir.joints.flatMap((joint) => {
      if (joint.kind !== "fold") return [];
      const parentPanelId = bodyById.get(joint.parentBodyId)?.panelIds[0];
      const childPanelId = bodyById.get(joint.childBodyId)?.panelIds[0];
      return parentPanelId && childPanelId
        ? [unorderedPairKey(parentPanelId, childPanelId)]
        : [];
    }),
  );
  const connectorById = new Map(
    ir.connectors.map((connector) => [connector.connectorId, connector]),
  );
  const reciprocalConnectorsByPanelPair = new Map<
    string,
    ReciprocalConnectorPair[]
  >();
  for (const connector of ir.connectors) {
    if (connector.kind !== "tab") continue;
    const mate = connectorById.get(connector.mateConnectorId);
    const firstPanel = panelById.get(connector.panelId);
    const secondPanel = mate ? panelById.get(mate.panelId) : undefined;
    if (
      mate?.mateConnectorId === connector.connectorId &&
      mate.kind === "slot" &&
      firstPanel &&
      secondPanel
    ) {
      const panelPairKey = unorderedPairKey(
        firstPanel.panelId,
        secondPanel.panelId,
      );
      const pairs = reciprocalConnectorsByPanelPair.get(panelPairKey) ?? [];
      pairs.push({ tab: connector, slot: mate });
      reciprocalConnectorsByPanelPair.set(panelPairKey, pairs);
    }
  }
  const declaredContactDuringByPanelPair = new Map<
    string,
    Set<"rest" | "all_states" | "open" | "closed">
  >();
  for (const constraint of ir.semanticConstraints) {
    if (constraint.kind !== "contact" || !constraint.hard) continue;
    const [firstRef, ...otherRefs] = constraint.geometryRefs;
    if (!firstRef) continue;
    const firstPanelIds = panelIdsForRef(ir, firstRef);
    const otherPanelIds = otherRefs.flatMap((reference) =>
      panelIdsForRef(ir, reference),
    );
    for (const firstPanelId of firstPanelIds) {
      for (const otherPanelId of otherPanelIds) {
        if (firstPanelId === otherPanelId) continue;
        const key = unorderedPairKey(firstPanelId, otherPanelId);
        const during = declaredContactDuringByPanelPair.get(key) ?? new Set();
        during.add(constraint.during);
        declaredContactDuringByPanelPair.set(key, during);
      }
    }
  }
  const declaredContactApplies = (
    pairKey: string,
    motionState: EvaluatedMotionState,
  ): boolean => {
    const during = declaredContactDuringByPanelPair.get(pairKey);
    if (!during) return false;
    if (during.has("all_states") || ir.driver === null) return true;
    const value = motionState.driverValue;
    return (
      value !== null &&
      ((during.has("rest") && Math.abs(value - ir.driver.homeValue) <= 1e-8) ||
        (during.has("open") &&
          Math.abs(value - ir.driver.maximumValue) <= 1e-8) ||
        (during.has("closed") &&
          Math.abs(value - ir.driver.minimumValue) <= 1e-8))
    );
  };
  let minimumClearanceMm = Number.POSITIVE_INFINITY;
  let minimumStateIndex = 0;
  let collisionRefs: readonly GeometryRefV1[] = [];
  const evaluateStates = (states: readonly EvaluatedMotionState[]): void => {
    for (const [stateIndex, motionState] of states.entries()) {
      for (let firstIndex = 0; firstIndex < ir.panels.length; firstIndex += 1) {
        const first = ir.panels[firstIndex];
        if (!first) continue;
        for (
          let secondIndex = firstIndex + 1;
          secondIndex < ir.panels.length;
          secondIndex += 1
        ) {
          const second = ir.panels[secondIndex];
          if (!second) continue;
          const centerlineDistanceMm = panelPairDistanceMm(
            first.panelId,
            second.panelId,
            motionState,
          );
          const overlapAreaMm2 =
            centerlineDistanceMm <= 1e-6
              ? panelPairContactAreaMm2(
                  first.panelId,
                  second.panelId,
                  motionState,
                )
              : 0;
          const intentionallyAdjacent =
            first.bodyId === second.bodyId ||
            foldAdjacentBodies.has(
              unorderedPairKey(first.bodyId, second.bodyId),
            );
          const panelPairKey = unorderedPairKey(first.panelId, second.panelId);
          const declaredContact = declaredContactApplies(
            panelPairKey,
            motionState,
          );
          const reciprocalConnectorPairs =
            reciprocalConnectorsByPanelPair.get(panelPairKey) ?? [];
          const contactRelationshipExists =
            intentionallyAdjacent ||
            declaredContact ||
            reciprocalConnectorPairs.length > 0;
          const zeroAreaCenterlineContact =
            centerlineDistanceMm <= 1e-6 && overlapAreaMm2 <= 1e-6;
          // A verified fold's two source edges are the joint axis. For two
          // rigid planes, every non-coplanar intersection lies on that axis;
          // coplanar interior overlap is already measured as positive area.
          // This proof avoids rebuilding triangle witnesses at 201 states.
          const locusBoundFoldSeam =
            !isSingleStateStaticDesign &&
            zeroAreaCenterlineContact &&
            foldAdjacentPanelPairs.has(panelPairKey) &&
            positiveBoundarySeamExists(
              first.panelId,
              second.panelId,
              motionState,
            );
          // A static assembly has exactly one measured pose. At that pose a
          // positive-length contour seam is sufficient physical evidence for
          // edge contact, even when the two walls are connected through the
          // fold tree rather than by a direct joint. The witness confinement
          // below is deliberately mandatory: neither a whole-panel relation
          // nor an authored contact declaration can excuse an interior line
          // crossing elsewhere on the same panel pair.
          const boundaryWitnessProofEligible =
            contactRelationshipExists || isSingleStateStaticDesign;
          const witnesses =
            boundaryWitnessProofEligible &&
            zeroAreaCenterlineContact &&
            !locusBoundFoldSeam
              ? panelIntersectionWitnesses(
                  first.panelId,
                  second.panelId,
                  motionState,
                )
              : [];
          const locusBoundBoundaryContact =
            boundaryWitnessProofEligible &&
            !locusBoundFoldSeam &&
            boundaryContactIsLocusBound(
              first.panelId,
              second.panelId,
              motionState,
              witnesses,
            );
          const locusBoundConnectorContact =
            reciprocalConnectorPairs.length > 0 &&
            connectorContactIsLocusBound(
              reciprocalConnectorPairs,
              panelById,
              motionState,
              witnesses,
            );
          const allowedBoundaryContact =
            zeroAreaCenterlineContact &&
            (locusBoundFoldSeam ||
              locusBoundBoundaryContact ||
              locusBoundConnectorContact);
          if (allowedBoundaryContact) continue;
          const clearanceMm =
            overlapAreaMm2 > 1e-6
              ? 0
              : Math.max(
                  0,
                  centerlineDistanceMm -
                    (first.thicknessMm + second.thicknessMm) / 2,
                );
          if (clearanceMm < minimumClearanceMm) {
            minimumClearanceMm = clearanceMm;
            minimumStateIndex = stateIndex;
            collisionRefs = [
              geometryRef("panel", first.panelId),
              geometryRef("panel", second.panelId),
            ];
          }
        }
      }
    }
  };
  evaluateStates(baseMotion.baseStates);

  const adaptiveStates: EvaluatedMotionState[] = [];
  if (
    ir.driver &&
    Number.isFinite(minimumClearanceMm) &&
    minimumClearanceMm <
      2 * FABRICATION_KINEMATIC_LIMITS.minimumMovingClearanceMm
  ) {
    for (const offset of [-0.5, 0.5]) {
      const ratio =
        (minimumStateIndex + offset) /
        (FABRICATION_LIMITS.requiredMotionSampleCount - 1);
      if (ratio <= 0 || ratio >= 1) continue;
      const value =
        ir.driver.minimumValue +
        ratio * (ir.driver.maximumValue - ir.driver.minimumValue);
      const evaluated = evaluateMotionState(ir, value);
      if (evaluated.ok) adaptiveStates.push(evaluated.value);
    }
  }
  const allStates = [...baseMotion.baseStates, ...adaptiveStates];
  evaluateStates(adaptiveStates);
  if (!Number.isFinite(minimumClearanceMm)) {
    minimumClearanceMm = Math.max(
      ...ir.sheets.map((sheet) => Math.hypot(sheet.widthMm, sheet.heightMm)),
    );
  }
  const collisionFree = minimumClearanceMm > 1e-8;
  const clearancePasses =
    minimumClearanceMm >= FABRICATION_KINEMATIC_LIMITS.minimumMovingClearanceMm;
  if (!collisionFree || !clearancePasses) {
    addFailure(state, {
      failureId: "collision.minimum_clearance",
      category: "collision",
      stage: "collision",
      severity: "hard",
      message:
        "Moving panels collide, overlap across a joint, or violate minimum clearance.",
      actual: measured(minimumClearanceMm, "mm"),
      expected: measured(
        FABRICATION_KINEMATIC_LIMITS.minimumMovingClearanceMm,
        "mm",
      ),
      geometryRefs: collisionRefs,
      repairableProgramPaths: [],
    });
  }
  addCheck(
    state,
    "collision.deployment",
    "collision",
    hardFailureCount(state) === 0 ? "pass" : "fail",
    "Every panel pair was checked for overlap and clearance over deployment states.",
    measured(minimumClearanceMm, "mm"),
    measured(FABRICATION_KINEMATIC_LIMITS.minimumMovingClearanceMm, "mm"),
    collisionRefs,
  );
  return {
    ...baseMotion,
    allStates,
    adaptiveSampleCount: adaptiveStates.length,
    minimumClearanceMm,
    collisionFree,
    collisionRefs,
  };
};

const semanticFailure = (
  state: VerificationState,
  constraint: SemanticConstraintV1,
  actual: MeasuredValueV1,
  expected: MeasuredValueV1,
  message: string,
): void =>
  addFailure(state, {
    failureId: `semantics.${constraint.kind}#${constraint.constraintId}`,
    category: "semantic",
    stage: "semantics",
    severity: constraint.hard ? "hard" : "warning",
    message,
    actual,
    expected,
    geometryRefs:
      "geometryRef" in constraint
        ? [constraint.geometryRef]
        : "geometryRefs" in constraint
          ? constraint.geometryRefs
          : [],
    repairableProgramPaths: [],
  });

const validateSemanticConstraint = (
  ir: FabricationIRV1,
  constraint: SemanticConstraintV1,
  motion: MotionEvaluation,
  state: VerificationState,
): void => {
  const home = motion.baseStates.reduce<EvaluatedMotionState | null>(
    (closest, candidate) =>
      closest === null ||
      Math.abs((candidate.driverValue ?? 0) - (ir.driver?.homeValue ?? 0)) <
        Math.abs((closest.driverValue ?? 0) - (ir.driver?.homeValue ?? 0))
        ? candidate
        : closest,
    null,
  );
  if (!home) return;
  switch (constraint.kind) {
    case "dimension": {
      const bounds = boundsForPoints(
        pointsForRefs(ir, home, [constraint.geometryRef]),
      );
      if (!bounds) {
        semanticFailure(
          state,
          constraint,
          measured(null),
          measured("referenced geometry"),
          "Dimension constraint references no measurable geometry.",
        );
        return;
      }
      const valueMm = dimensionValue(bounds, constraint.dimension);
      const toleranceMm = constraint.toleranceMm ?? 0;
      const passes =
        (constraint.minimumMm === null || valueMm >= constraint.minimumMm) &&
        (constraint.maximumMm === null || valueMm <= constraint.maximumMm) &&
        (constraint.targetMm === null ||
          Math.abs(valueMm - constraint.targetMm) <= toleranceMm);
      if (!passes) {
        semanticFailure(
          state,
          constraint,
          measured(valueMm, "mm"),
          measured(
            `min=${constraint.minimumMm}, max=${constraint.maximumMm}, target=${constraint.targetMm} ± ${toleranceMm} mm`,
          ),
          "Measured dimension does not satisfy the requested range.",
        );
      }
      return;
    }
    case "clearance": {
      const [firstRef, secondRef] = constraint.geometryRefs;
      if (!firstRef || !secondRef) {
        semanticFailure(
          state,
          constraint,
          measured(0, "count"),
          measured(2, "count"),
          "Clearance requires two geometry references.",
        );
        return;
      }
      const selectedStates = statesForDuring(
        motion.allStates,
        constraint.during,
        ir.driver?.homeValue ?? null,
      );
      const firstPanelIds = panelIdsForRef(ir, firstRef);
      const secondPanelIds = panelIdsForRef(ir, secondRef);
      let minimumMm = Number.POSITIVE_INFINITY;
      for (const motionState of selectedStates) {
        for (const firstPanelId of firstPanelIds) {
          for (const secondPanelId of secondPanelIds) {
            minimumMm = Math.min(
              minimumMm,
              panelPairDistanceMm(firstPanelId, secondPanelId, motionState),
            );
          }
        }
      }
      if (
        !Number.isFinite(minimumMm) ||
        minimumMm < constraint.minimumClearanceMm
      ) {
        semanticFailure(
          state,
          constraint,
          measured(Number.isFinite(minimumMm) ? minimumMm : null, "mm"),
          measured(constraint.minimumClearanceMm, "mm"),
          "Requested clearance is not maintained.",
        );
      }
      return;
    }
    case "symmetry": {
      const normalAxis: 0 | 1 | 2 =
        constraint.plane === "yz" ? 0 : constraint.plane === "xz" ? 1 : 2;
      const geometryError = mirroredBodyGeometryError(
        ir,
        home,
        constraint.bodyIds[0]!,
        constraint.bodyIds[1]!,
        normalAxis,
      );
      if (
        geometryError.linearMm > constraint.linearToleranceMm ||
        geometryError.angularDeg > constraint.angularToleranceDeg
      ) {
        semanticFailure(
          state,
          constraint,
          measured(
            `surface=${geometryError.linearMm.toFixed(6)} mm, angular=${geometryError.angularDeg.toFixed(6)} deg`,
          ),
          measured(
            `linear<=${constraint.linearToleranceMm} mm, angular<=${constraint.angularToleranceDeg} deg`,
          ),
          "Reflected panel contours, holes, correspondence, or surface orientation differ beyond tolerance.",
        );
      }
      return;
    }
    case "contact": {
      const selectedStates = statesForDuring(
        motion.allStates,
        constraint.during,
        ir.driver?.homeValue ?? null,
      );
      const [firstRef, ...otherRefs] = constraint.geometryRefs;
      const firstPanelIds = firstRef
        ? [...new Set(panelIdsForRef(ir, firstRef))]
        : [];
      const otherPanelIds = [
        ...new Set(otherRefs.flatMap((ref) => panelIdsForRef(ir, ref))),
      ];
      const areas = selectedStates.map((motionState) =>
        firstPanelIds.reduce(
          (total, firstPanelId) =>
            total +
            otherPanelIds.reduce(
              (pairTotal, secondPanelId) =>
                pairTotal +
                (firstPanelId === secondPanelId
                  ? 0
                  : panelPairContactAreaMm2(
                      firstPanelId,
                      secondPanelId,
                      motionState,
                    )),
              0,
            ),
          0,
        ),
      );
      const areaMm2 = areas.length > 0 ? Math.min(...areas) : 0;
      const boundarySeamRequired = constraint.minimumAreaMm2 <= 1e-6;
      const boundarySeamPresent =
        !boundarySeamRequired ||
        (selectedStates.length > 0 &&
          selectedStates.every((motionState) =>
            firstPanelIds.some((firstPanelId) =>
              otherPanelIds.some((secondPanelId) => {
                if (firstPanelId === secondPanelId) return false;
                const witnesses = panelIntersectionWitnesses(
                  firstPanelId,
                  secondPanelId,
                  motionState,
                );
                return boundaryContactIsLocusBound(
                  firstPanelId,
                  secondPanelId,
                  motionState,
                  witnesses,
                );
              }),
            ),
          ));
      if (areaMm2 < constraint.minimumAreaMm2 || !boundarySeamPresent) {
        semanticFailure(
          state,
          constraint,
          boundarySeamRequired
            ? measured(boundarySeamPresent ? "positive boundary seam" : "none")
            : measured(areaMm2, "mm2"),
          boundarySeamRequired
            ? measured("positive-length coincident panel boundaries")
            : measured(constraint.minimumAreaMm2, "mm2"),
          boundarySeamRequired
            ? "Declared seam contact requires positive-length coincident boundaries at the requested state."
            : "Measured coplanar contact overlap is below the requested minimum.",
        );
      }
      return;
    }
    case "motion": {
      const output = ir.outputs.find(
        (candidate) => candidate.outputId === constraint.outputId,
      )!;
      const values = motion.allStates
        .map((motionState) => motionState.jointValues[output.jointId])
        .filter((value): value is number => value !== undefined);
      const actualMinimum = values.length > 0 ? Math.min(...values) : null;
      const actualMaximum = values.length > 0 ? Math.max(...values) : null;
      if (
        actualMinimum === null ||
        actualMaximum === null ||
        actualMinimum > constraint.minimumValue ||
        actualMaximum < constraint.maximumValue
      ) {
        semanticFailure(
          state,
          constraint,
          measured(`${actualMinimum}..${actualMaximum}`),
          measured(
            `${constraint.minimumValue}..${constraint.maximumValue} ${constraint.unit}`,
          ),
          "Motion output does not cover the requested interval.",
        );
      }
      return;
    }
    case "recognizable_form": {
      const partsById = new Map(
        ir.semanticParts.map((part) => [
          part.semanticPartId.toLowerCase(),
          part,
        ]),
      );
      const referencedParts = constraint.semanticPartIds.flatMap((partId) => {
        const part = partsById.get(partId.toLowerCase());
        return part ? [part] : [];
      });
      const labels = referencedParts
        .flatMap((part) => [part.label, part.role])
        .join(" ")
        .toLowerCase();
      const missingParts = constraint.semanticPartIds.filter(
        (partId) => !partsById.has(partId.toLowerCase()),
      );
      const partsWithoutGeometry = referencedParts
        .filter((part) => part.geometryRefs.length === 0)
        .map((part) => part.semanticPartId);
      const missingLandmarks = constraint.requiredLandmarks.filter(
        (landmark) => !labels.includes(landmark.toLowerCase()),
      );
      if (
        constraint.evaluation !== "landmark_geometry" ||
        missingParts.length > 0 ||
        partsWithoutGeometry.length > 0 ||
        missingLandmarks.length > 0
      ) {
        semanticFailure(
          state,
          constraint,
          measured(
            `evaluation=${constraint.evaluation}; missing parts=${missingParts.join(",")}; parts without geometry=${partsWithoutGeometry.join(",")}; missing landmarks=${missingLandmarks.join(",")}`,
          ),
          measured("all named landmarks bound to validated geometry"),
          "Recognizable-form constraints require explicit semantic landmarks bound to source-checked geometry.",
        );
      }
      return;
    }
    case "fold_flat": {
      const points = constraint.bodyIds.flatMap((bodyId) =>
        pointsForRefs(ir, home, [geometryRef("body", bodyId)]),
      );
      const bounds = boundsForPoints(points);
      if (!bounds) {
        semanticFailure(
          state,
          constraint,
          measured(null),
          measured("measurable folded bodies"),
          "Fold-flat constraint references no measurable body geometry.",
        );
        return;
      }
      const bodyIds = new Set(constraint.bodyIds);
      const maximumThicknessMm = Math.max(
        0,
        ...ir.panels
          .filter((panel) => bodyIds.has(panel.bodyId))
          .map((panel) => panel.thicknessMm),
      );
      const stackMm =
        bounds.maximumZmm - bounds.minimumZmm + maximumThicknessMm;
      if (stackMm > constraint.maximumStackThicknessMm) {
        semanticFailure(
          state,
          constraint,
          measured(stackMm, "mm"),
          measured(constraint.maximumStackThicknessMm, "mm"),
          "Home configuration exceeds the requested flat stack thickness.",
        );
      }
      return;
    }
  }
};

const validateSemantics = (
  ir: FabricationIRV1,
  state: VerificationState,
  motion: MotionEvaluation,
): void => {
  const maximumSpansMm = motion.allStates.reduce(
    (maximum, motionState) => {
      const bounds = boundsForPoints(
        Object.values(motionState.panelVertices).flat(),
      );
      if (!bounds) return maximum;
      return {
        width: Math.max(maximum.width, bounds.maximumXmm - bounds.minimumXmm),
        height: Math.max(maximum.height, bounds.maximumYmm - bounds.minimumYmm),
        depth: Math.max(maximum.depth, bounds.maximumZmm - bounds.minimumZmm),
      };
    },
    { width: 0, height: 0, depth: 0 },
  );
  const spanPermutations = [
    [maximumSpansMm.width, maximumSpansMm.height, maximumSpansMm.depth],
    [maximumSpansMm.width, maximumSpansMm.depth, maximumSpansMm.height],
    [maximumSpansMm.height, maximumSpansMm.width, maximumSpansMm.depth],
    [maximumSpansMm.height, maximumSpansMm.depth, maximumSpansMm.width],
    [maximumSpansMm.depth, maximumSpansMm.width, maximumSpansMm.height],
    [maximumSpansMm.depth, maximumSpansMm.height, maximumSpansMm.width],
  ] as const;
  const requestedSpanValues = [
    ir.requestedSize.widthMm,
    ir.requestedSize.heightMm,
    ir.requestedSize.depthMm,
  ] as const;
  const assignmentErrorMm = (candidate: readonly number[]): number =>
    candidate.reduce(
      (sum, value, index) =>
        sum +
        (requestedSpanValues[index] === null
          ? 0
          : Math.abs(value - requestedSpanValues[index]!)),
      0,
    );
  const assignedSpansMm = spanPermutations.reduce((best, candidate) =>
    assignmentErrorMm(candidate) < assignmentErrorMm(best) ? candidate : best,
  );
  const requestedDimensions = [
    ["width", assignedSpansMm[0], ir.requestedSize.widthMm],
    ["height", assignedSpansMm[1], ir.requestedSize.heightMm],
    ["depth", assignedSpansMm[2], ir.requestedSize.depthMm],
  ] as const;
  for (const [dimension, actualMm, requestedMm] of requestedDimensions) {
    if (requestedMm === null) continue;
    state.metrics.push({
      metricId: `requested_size_${dimension}`,
      value: actualMm,
      unit: "mm",
      geometryRefs: ir.panels.map((panel) =>
        geometryRef("panel", panel.panelId),
      ),
    });
    if (Math.abs(actualMm - requestedMm) > REQUESTED_SIZE_TOLERANCE_MM) {
      addFailure(state, {
        failureId: `semantics.requested_size#${dimension}`,
        category: "semantic",
        stage: "semantics",
        severity: "hard",
        message: `Maximum ${dimension} span differs from the requested design envelope by more than ${REQUESTED_SIZE_TOLERANCE_MM} mm.`,
        actual: measured(actualMm, "mm"),
        expected: measured(requestedMm, "mm"),
        geometryRefs: ir.panels.map((panel) =>
          geometryRef("panel", panel.panelId),
        ),
        repairableProgramPaths: [],
      });
    }
  }
  for (const constraint of ir.semanticConstraints) {
    validateSemanticConstraint(ir, constraint, motion, state);
  }
  addCheck(
    state,
    "semantics.constraints",
    "semantics",
    hardFailureCount(state) === 0 ? "pass" : "fail",
    "Explicit semantic constraints were measured against compiled geometry.",
    measured(ir.semanticConstraints.length, "count"),
    measured("all hard constraints pass"),
  );
};

const exportChecks = (
  ir: FabricationIRV1,
  options: VerificationOptions,
): readonly ExportEquivalenceCheckV2[] => {
  const sourceIrHash = fabricationIrHash(ir);
  const canonicalJson = canonicalSerialize(ir);
  let jsonPasses = false;
  try {
    const roundTrip = FabricationIRV1Schema.safeParse(
      JSON.parse(canonicalJson),
    );
    jsonPasses =
      roundTrip.success && canonicalSerialize(roundTrip.data) === canonicalJson;
  } catch {
    jsonPasses = false;
  }
  const pathPreflightPasses =
    ir.paths.length > 0 &&
    ir.paths.every(
      (path) =>
        path.points.length >= 2 &&
        path.points.every(
          (point) => Number.isFinite(point.xMm) && Number.isFinite(point.yMm),
        ),
    ) &&
    ir.panels.every((panel) => {
      const expectedIds = [
        ...derivePanelBoundaryCutPaths(panel, ir.joints).map(
          (path) => path.pathId,
        ),
        ...panel.innerCutContours.map(
          (_, index) => `${panel.panelId}.cut.inner-${index + 1}`,
        ),
      ];
      return expectedIds.every((pathId) =>
        ir.paths.some(
          (path) =>
            path.pathId === pathId &&
            path.panelId === panel.panelId &&
            path.sheetId === panel.sheetId &&
            path.kind === "cut",
        ),
      );
    });
  const home = homeMotionState(ir);
  const meshPreflightPasses =
    home.ok &&
    ir.panels.every((panel) => {
      const triangulation = triangulatePolygonWithHoles(
        panel.contour.vertices,
        panelMaterialHoles(panel, ir.connectors).map((hole) => hole.vertices),
      );
      return (
        triangulation.triangles.length > 0 &&
        Number.isFinite(triangulation.relativeAreaDeviation) &&
        triangulation.relativeAreaDeviation <= 1e-10 &&
        home.value.panelTriangles[panel.panelId]?.length ===
          triangulation.triangles.length
      );
    });
  const internal: ExportEquivalenceCheckV2[] = [
    {
      format: "svg",
      status: pathPreflightPasses ? "pass" : "fail",
      sourceIrHash,
      artifactHash: null,
      message:
        "SVG preflight confirmed complete finite millimeter source paths.",
    },
    {
      format: "dxf",
      status: pathPreflightPasses ? "pass" : "fail",
      sourceIrHash,
      artifactHash: null,
      message:
        "DXF preflight confirmed complete finite millimeter source paths.",
    },
    {
      format: "glb",
      status: meshPreflightPasses ? "pass" : "fail",
      sourceIrHash,
      artifactHash: null,
      message: "GLB preflight confirmed deterministic panel triangulation.",
    },
    {
      format: "json",
      status: jsonPasses ? "pass" : "fail",
      sourceIrHash,
      artifactHash: null,
      message: "Canonical IR JSON round-trip matches the verified source.",
    },
  ];
  const suppliedInput: readonly unknown[] =
    options.exportEquivalence === undefined
      ? []
      : Array.isArray(options.exportEquivalence)
        ? options.exportEquivalence
        : [options.exportEquivalence];
  const allowedFormats = new Set<ExportEquivalenceCheckV2["format"]>([
    "svg",
    "dxf",
    "glb",
    "json",
    "fold",
  ]);
  const supplied = suppliedInput.map((input) => {
    const parsed = ExportEquivalenceCheckV2Schema.safeParse(input);
    if (parsed.success) return parsed.data;
    const rawFormat =
      typeof input === "object" && input !== null && "format" in input
        ? Reflect.get(input, "format")
        : null;
    const format =
      typeof rawFormat === "string" &&
      allowedFormats.has(rawFormat as ExportEquivalenceCheckV2["format"])
        ? (rawFormat as ExportEquivalenceCheckV2["format"])
        : "svg";
    return {
      format,
      status: "fail" as const,
      sourceIrHash,
      artifactHash: null,
      message: "Supplied export evidence failed contract validation.",
    };
  });
  const suppliedCounts = new Map<string, number>();
  for (const check of supplied) {
    suppliedCounts.set(
      check.format,
      (suppliedCounts.get(check.format) ?? 0) + 1,
    );
  }
  const normalized = new Map(
    internal.map((check) => [check.format, check] as const),
  );
  for (const check of supplied) {
    const duplicateFormat = (suppliedCounts.get(check.format) ?? 0) > 1;
    const validHash = /^[a-f0-9]{64}$/u.test(check.sourceIrHash);
    const validArtifactHash =
      check.artifactHash === null || /^[a-f0-9]{64}$/u.test(check.artifactHash);
    normalized.set(check.format, {
      ...check,
      status:
        !duplicateFormat &&
        validHash &&
        validArtifactHash &&
        check.sourceIrHash === sourceIrHash
          ? check.status
          : "fail",
      sourceIrHash,
      artifactHash: validArtifactHash ? check.artifactHash : null,
      message:
        duplicateFormat || check.sourceIrHash !== sourceIrHash
          ? "Supplied export evidence is duplicated or bound to another IR."
          : check.message,
    });
  }
  return ["svg", "dxf", "glb", "json", "fold"]
    .map((format) =>
      normalized.get(format as ExportEquivalenceCheckV2["format"]),
    )
    .filter((check): check is ExportEquivalenceCheckV2 => check !== undefined);
};

const validateExportEquivalence = (
  irHash: string,
  checks: readonly ExportEquivalenceCheckV2[],
  state: VerificationState,
): void => {
  const requiredFormats = ["svg", "dxf", "glb", "json"] as const;
  const complete = requiredFormats.every(
    (format) => checks.filter((check) => check.format === format).length === 1,
  );
  const failed = checks.filter(
    (check) =>
      requiredFormats.includes(
        check.format as (typeof requiredFormats)[number],
      ) &&
      (check.sourceIrHash !== irHash || check.status !== "pass"),
  );
  const passedRequiredCount = requiredFormats.filter((format) =>
    checks.some(
      (check) =>
        check.format === format &&
        check.sourceIrHash === irHash &&
        check.status === "pass",
    ),
  ).length;
  if (!complete || failed.length > 0) {
    addFailure(state, {
      failureId: "export.source_equivalence",
      category: "export",
      stage: "export_equivalence",
      severity: "hard",
      message: `Required export checks are incomplete or did not pass: ${failed.map((check) => check.format).join(", ")}.`,
      actual: measured(complete ? failed.length : checks.length, "count"),
      expected: measured(0, "count"),
      geometryRefs: failed.map((check) => geometryRef("export", check.format)),
      repairableProgramPaths: [],
    });
  }
  addCheck(
    state,
    "export_equivalence.artifacts",
    "export_equivalence",
    complete && failed.length === 0 ? "pass" : "fail",
    "Artifact source hashes and format equivalence checks were evaluated.",
    measured(passedRequiredCount, "count"),
    measured(requiredFormats.length, "count"),
  );
};

export const verifyFabricationIr = (
  input: unknown,
  candidateId: string,
  options: VerificationOptions = {},
): VerificationReportV2 => {
  const candidateIdIsValid =
    typeof candidateId === "string" && IDENTIFIER_PATTERN.test(candidateId);
  const normalizedCandidateId = candidateIdIsValid
    ? candidateId
    : `candidate:invalid:${sha256Hex(canonicalSerialize(String(candidateId))).slice(0, 16)}`;
  if (!candidateIdIsValid) {
    return invalidCandidateIdReport(input, candidateId, normalizedCandidateId);
  }
  const parsed = FabricationIRV1Schema.safeParse(input);
  if (!parsed.success) return schemaFailureReport(input, candidateId);
  const ir = parsed.data;
  const irHash = fabricationIrHash(ir);
  const state: VerificationState = { checks: [], failures: [], metrics: [] };
  addCheck(
    state,
    "schema.contract",
    "schema",
    "pass",
    "FabricationIRV1 is strict, finite, versioned, and within schema limits.",
    measured(true),
    measured(true),
  );

  const stop = (
    stage: VerificationStage,
    motion: MotionEvaluation | null,
    exports: readonly ExportEquivalenceCheckV2[] = [],
  ): VerificationReportV2 | null =>
    state.failures.some((failure) => failure.severity === "hard")
      ? buildReport(
          candidateId,
          ir.programId,
          ir.irId,
          irHash,
          state,
          stage,
          motion,
          exports,
        )
      : null;

  validateWorkBudget(ir, state);
  validateTopology(ir, state);
  const topologyFailure = stop("topology", null);
  if (topologyFailure) return topologyFailure;

  validatePanelGeometry(ir, state);
  const geometryFailure = stop("panel_geometry", null);
  if (geometryFailure) return geometryFailure;

  validateConnections(ir, state);
  const connectionFailure = stop("connections", null);
  if (connectionFailure) return connectionFailure;

  validateSheetPacking(ir, state);
  const packingFailure = stop("sheet_packing", null);
  if (packingFailure) return packingFailure;

  validateRigidTransforms(ir, state);
  const transformFailure = stop("rigid_transforms", null);
  if (transformFailure) return transformFailure;

  const motionBase = validateMotion(ir, state);
  const motionFailure = stop("motion", null);
  if (motionFailure || !motionBase) {
    return (
      motionFailure ??
      buildReport(
        candidateId,
        ir.programId,
        ir.irId,
        irHash,
        state,
        "motion",
        null,
        [],
      )
    );
  }

  const motion = validateCollision(ir, state, motionBase);
  const collisionFailure = stop("collision", motion);
  if (collisionFailure) return collisionFailure;

  validateSemantics(ir, state, motion);
  const semanticFailureReport = stop("semantics", motion);
  if (semanticFailureReport) return semanticFailureReport;

  const exports = exportChecks(ir, options);
  validateExportEquivalence(irHash, exports, state);
  const exportFailure = stop("export_equivalence", motion, exports);
  if (exportFailure) return exportFailure;

  addCheck(
    state,
    "scoring.eligible",
    "scoring",
    "pass",
    "Every hard verification stage passed; candidate is eligible for scoring.",
    measured(true),
    measured(true),
  );
  state.metrics.push({
    metricId: "verification_hard_failure_count",
    value: 0,
    unit: "count",
    geometryRefs: [],
  });
  return buildReport(
    candidateId,
    ir.programId,
    ir.irId,
    irHash,
    state,
    null,
    motion,
    exports,
  );
};

export const verificationStageOrder = (): readonly VerificationStage[] =>
  STAGES;
