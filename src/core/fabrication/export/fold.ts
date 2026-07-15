import { canonicalSerialize } from "@/core/canonical";
import { sha256Hex } from "@/core/sha256";

import type {
  CandidateProvenanceV2,
  FabricationIRV1,
  FabricationPathV1,
  FoldJointV1,
  Point2Mm,
} from "../types";
import {
  createTextArtifact,
  formatExportNumber,
  prepareExportSource,
  sourceIrHash,
  type FabricationExportArtifact,
  type FabricationExportError,
  type VerifiedFabricationExportSource,
} from "./artifact";

export type FoldOmissionCode =
  | "multiple_sheets"
  | "non_fold_joint"
  | "connector_semantics"
  | "coupling_semantics"
  | "motion_semantics"
  | "unsupported_path_semantics"
  | "unmapped_score_path";

export interface FoldOmissionReason {
  readonly code: FoldOmissionCode;
  readonly message: string;
  readonly sourceCandidateId: string;
  readonly sourceIrHash: string;
  readonly geometryIds: readonly string[];
}

export interface FabricationFoldCompatibilitySource {
  readonly ir: FabricationIRV1;
  readonly sourceCandidateId: string;
  readonly sourceIrHash: string;
}

export type FoldCompatibilityResult =
  | {
      readonly status: "available";
      readonly sourceCandidateId: string;
      readonly sourceIrHash: string;
    }
  | { readonly status: "omitted"; readonly reason: FoldOmissionReason };

export type FoldExportResult =
  | {
      readonly status: "generated";
      readonly artifact: FabricationExportArtifact;
    }
  | { readonly status: "omitted"; readonly reason: FoldOmissionReason }
  | { readonly status: "failed"; readonly error: FabricationExportError };

type FoldAssignment = "C" | "M" | "V";

interface FoldEdgeAccumulator {
  readonly vertices: [number, number][];
  readonly edges: [number, number][];
  readonly assignments: FoldAssignment[];
  readonly angles: number[];
  readonly pathIds: string[];
  readonly vertexByPoint: Map<string, number>;
}

const omitCompatibility = (
  source: FabricationFoldCompatibilitySource,
  code: FoldOmissionCode,
  message: string,
  geometryIds: readonly string[] = [],
): FoldCompatibilityResult => ({
  status: "omitted",
  reason: {
    code,
    message,
    sourceCandidateId: source.sourceCandidateId,
    sourceIrHash: source.sourceIrHash,
    geometryIds,
  },
});

const pointKey = (point: Point2Mm): string =>
  `${formatExportNumber(point.xMm)},${formatExportNumber(point.yMm)}`;

const vertexIndex = (
  accumulator: FoldEdgeAccumulator,
  point: Point2Mm,
): number => {
  const key = pointKey(point);
  const existing = accumulator.vertexByPoint.get(key);
  if (existing !== undefined) return existing;
  const index = accumulator.vertices.length;
  accumulator.vertexByPoint.set(key, index);
  accumulator.vertices.push([
    Number(formatExportNumber(point.xMm)),
    Number(formatExportNumber(point.yMm)),
  ]);
  return index;
};

const addPathEdges = (
  accumulator: FoldEdgeAccumulator,
  path: FabricationPathV1,
  assignment: FoldAssignment,
  angleDeg: number,
): void => {
  const edgeCount = path.closed ? path.points.length : path.points.length - 1;
  for (let index = 0; index < edgeCount; index += 1) {
    const start = path.points[index];
    const end = path.points[(index + 1) % path.points.length];
    if (!start || !end) continue;
    const startIndex = vertexIndex(accumulator, start);
    const endIndex = vertexIndex(accumulator, end);
    if (startIndex === endIndex) continue;
    accumulator.edges.push([startIndex, endIndex]);
    accumulator.assignments.push(assignment);
    accumulator.angles.push(angleDeg);
    accumulator.pathIds.push(path.pathId);
  }
};

const foldAngle = (joint: FoldJointV1): number => {
  const magnitude = Math.abs(joint.homeAngleDeg);
  return joint.foldDirection === "mountain" ? -magnitude : magnitude;
};

/**
 * Reports whether the complete source semantics can survive the deliberately
 * narrow FOLD crease-pattern profile. This is pure and safe to use before a
 * download is offered; artifact generation repeats the same inspection after
 * verifying the candidate binding.
 */
export const inspectFabricationFoldCompatibility = (
  source: FabricationFoldCompatibilitySource,
): FoldCompatibilityResult => {
  const { ir } = source;
  if (ir.sheets.length !== 1) {
    return omitCompatibility(
      source,
      "multiple_sheets",
      "FOLD export is limited to one source sheet.",
      ir.sheets.map((sheet) => sheet.sheetId),
    );
  }
  const nonFoldJoints = ir.joints.filter((joint) => joint.kind !== "fold");
  if (nonFoldJoints.length > 0) {
    return omitCompatibility(
      source,
      "non_fold_joint",
      "Revolute and prismatic joints cannot be represented losslessly in this FOLD profile.",
      nonFoldJoints.map((joint) => joint.jointId),
    );
  }
  if (ir.connectors.length > 0) {
    return omitCompatibility(
      source,
      "connector_semantics",
      "Tab, slot, and slider connector semantics are not preserved by this FOLD profile.",
      ir.connectors.map((connector) => connector.connectorId),
    );
  }
  if (ir.couplings.length > 0) {
    return omitCompatibility(
      source,
      "coupling_semantics",
      "Motion couplings cannot be represented losslessly in this FOLD profile.",
      ir.couplings.map((coupling) => coupling.couplingId),
    );
  }
  if (ir.behavior !== "static" || ir.driver !== null || ir.outputs.length > 0) {
    const geometryIds = [
      ...(ir.driver ? [ir.driver.driverId] : []),
      ...ir.outputs.map((output) => output.outputId),
    ];
    return omitCompatibility(
      source,
      "motion_semantics",
      "Driver and output semantics would be lost in a crease-pattern-only FOLD file.",
      geometryIds,
    );
  }
  const unsupportedPaths = ir.paths.filter(
    (path) => path.kind !== "cut" && path.kind !== "score",
  );
  if (unsupportedPaths.length > 0) {
    return omitCompatibility(
      source,
      "unsupported_path_semantics",
      "Perforation and engraving semantics are not represented by this FOLD profile.",
      unsupportedPaths.map((path) => path.pathId),
    );
  }

  const folds = ir.joints.filter(
    (joint): joint is FoldJointV1 => joint.kind === "fold",
  );
  const foldByCreasePathId = new Map<string, FoldJointV1>();
  for (const joint of folds) {
    if (foldByCreasePathId.has(joint.creasePathId)) {
      return omitCompatibility(
        source,
        "unmapped_score_path",
        "Each score path must map to exactly one fold joint.",
        [joint.creasePathId],
      );
    }
    foldByCreasePathId.set(joint.creasePathId, joint);
  }
  const scorePaths = ir.paths.filter((path) => path.kind === "score");
  const scorePathIds = new Set(scorePaths.map((path) => path.pathId));
  const unmappedScore = scorePaths.find(
    (path) => !foldByCreasePathId.has(path.pathId),
  );
  const missingCrease = folds.find(
    (joint) => !scorePathIds.has(joint.creasePathId),
  );
  if (unmappedScore || missingCrease) {
    const geometryId = unmappedScore?.pathId ?? missingCrease?.jointId;
    return omitCompatibility(
      source,
      "unmapped_score_path",
      "Every score path and fold joint must have an exact one-to-one mapping.",
      geometryId ? [geometryId] : [],
    );
  }
  return {
    status: "available",
    sourceCandidateId: source.sourceCandidateId,
    sourceIrHash: source.sourceIrHash,
  };
};

export const exportFabricationFold = (
  source: VerifiedFabricationExportSource,
): FoldExportResult => {
  const preparedResult = prepareExportSource(source);
  if (!preparedResult.ok) {
    return { status: "failed", error: preparedResult.error };
  }
  const prepared = preparedResult.value;
  const { ir } = prepared;

  const compatibility = inspectFabricationFoldCompatibility(prepared);
  if (compatibility.status === "omitted") {
    return { status: "omitted", reason: compatibility.reason };
  }

  const folds = ir.joints.filter(
    (joint): joint is FoldJointV1 => joint.kind === "fold",
  );
  const foldByCreasePathId = new Map<string, FoldJointV1>();
  for (const joint of folds) {
    foldByCreasePathId.set(joint.creasePathId, joint);
  }

  const accumulator: FoldEdgeAccumulator = {
    vertices: [],
    edges: [],
    assignments: [],
    angles: [],
    pathIds: [],
    vertexByPoint: new Map(),
  };
  for (const path of [...ir.paths].sort((left, right) =>
    left.pathId.localeCompare(right.pathId),
  )) {
    if (path.kind === "cut") {
      addPathEdges(accumulator, path, "C", 0);
      continue;
    }
    const joint = foldByCreasePathId.get(path.pathId);
    if (!joint) continue;
    addPathEdges(
      accumulator,
      path,
      joint.foldDirection === "mountain" ? "M" : "V",
      foldAngle(joint),
    );
  }

  const hasDeclaredFoldAngle = accumulator.angles.some(
    (angleDeg) => Math.abs(angleDeg) > Number.EPSILON,
  );
  const graph = {
    vertices_coords: accumulator.vertices,
    edges_vertices: accumulator.edges,
    edges_assignment: accumulator.assignments,
    // FOLD treats a zero angle as an unfolded edge, which conflicts with an
    // M/V assignment in common validators. A crease-pattern frame can omit
    // this optional array when the source only declares fold direction.
    ...(hasDeclaredFoldAngle ? { edges_foldAngle: accumulator.angles } : {}),
    edges_foldforgePathId: accumulator.pathIds,
  };
  const document = {
    file_spec: 1.2,
    file_creator: "FoldForge",
    file_title: prepared.sourceCandidateId,
    file_description: `Source IR SHA-256 ${prepared.sourceIrHash}`,
    frame_classes: ["creasePattern"],
    frame_attributes: ["2D", "cuts"],
    frame_unit: "mm",
    foldforge_sourceCandidateId: prepared.sourceCandidateId,
    foldforge_sourceIrHash: prepared.sourceIrHash,
    foldforge_payloadSha256: sha256Hex(canonicalSerialize(graph)),
    ...graph,
  };
  const text = `${canonicalSerialize(document)}\n`;
  return {
    status: "generated",
    artifact: createTextArtifact(
      "fold",
      "fold",
      "application/vnd.fold+json",
      text,
      prepared,
    ),
  };
};

export const foldArtifactMatchesSource = (
  bytes: Uint8Array,
  ir: FabricationIRV1,
  sourceCandidateId: string,
  provenance?: CandidateProvenanceV2,
): boolean => {
  const expected = exportFabricationFold({
    ir,
    sourceCandidateId,
    selectionStatus: "selected",
    verification: {
      candidateId: sourceCandidateId,
      irHash: sourceIrHash(ir),
      irId: ir.irId,
      programId: ir.programId,
      valid: true,
    },
    ...(provenance ? { provenance } : {}),
  });
  return (
    expected.status === "generated" &&
    expected.artifact.bytes.byteLength === bytes.byteLength &&
    expected.artifact.bytes.every((byte, index) => byte === bytes[index])
  );
};
