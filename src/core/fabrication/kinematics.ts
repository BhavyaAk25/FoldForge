import { err, ok, type Result } from "@/core/result";

import { connectorReferencePoint2 } from "./connector-geometry";
import {
  IDENTITY_MATRIX_4,
  matrixIsFinite,
  multiplyMatrices4,
  rotationAroundAxisMatrix4,
  transformPoint3,
  translationMatrix4,
  type Matrix4,
} from "./matrix";
import { transformPoint2, triangulatePolygonWithHoles } from "./polygon";
import { buildDirectedBodyTopology } from "./topology";
import type {
  CouplingV1,
  FabricationIRV1,
  JointV1,
  Point3Mm,
  Transform3Mm,
} from "./types";

export type MotionFailure =
  | {
      readonly id: "motion.driver_value";
      readonly value: number;
    }
  | {
      readonly id: "motion.reference";
      readonly referenceKind: "body" | "driver" | "joint" | "panel";
      readonly referenceId: string;
    }
  | {
      readonly id: "motion.axis";
      readonly jointId: string;
    }
  | {
      readonly id: "motion.joint_range";
      readonly jointId: string;
      readonly value: number;
      readonly minimum: number;
      readonly maximum: number;
    }
  | {
      readonly id: "motion.transform";
      readonly bodyId: string;
    }
  | {
      readonly id: "motion.topology";
      readonly detail: string;
    };

export interface EvaluatedMotionState {
  readonly driverValue: number | null;
  readonly driverRatio: number;
  readonly jointValues: Readonly<Record<string, number>>;
  readonly bodyMatrices: Readonly<Record<string, Matrix4>>;
  readonly panelVertices: Readonly<Record<string, readonly Point3Mm[]>>;
  readonly panelTriangles: Readonly<
    Record<string, readonly (readonly [Point3Mm, Point3Mm, Point3Mm])[]>
  >;
  readonly maximumClosureResidualMm: number;
}

const normalizedQuaternionMatrix = (
  transform: Transform3Mm,
): Matrix4 | null => {
  const { x, y, z, w } = transform.rotation;
  const length = Math.hypot(x, y, z, w);
  if (!Number.isFinite(length) || length <= 1e-12) return null;
  const qx = x / length;
  const qy = y / length;
  const qz = z / length;
  const qw = w / length;
  const xx = qx * qx;
  const yy = qy * qy;
  const zz = qz * qz;
  const xy = qx * qy;
  const xz = qx * qz;
  const yz = qy * qz;
  const wx = qw * qx;
  const wy = qw * qy;
  const wz = qw * qz;
  const { xMm, yMm, zMm } = transform.translationMm;
  return [
    1 - 2 * (yy + zz),
    2 * (xy - wz),
    2 * (xz + wy),
    xMm,
    2 * (xy + wz),
    1 - 2 * (xx + zz),
    2 * (yz - wx),
    yMm,
    2 * (xz - wy),
    2 * (yz + wx),
    1 - 2 * (xx + yy),
    zMm,
    0,
    0,
    0,
    1,
  ];
};

const jointHomeValue = (joint: JointV1): number =>
  joint.kind === "prismatic" ? joint.homeTravelMm : joint.homeAngleDeg;

const jointMinimum = (joint: JointV1): number =>
  joint.kind === "prismatic" ? joint.minTravelMm : joint.minAngleDeg;

const jointMaximum = (joint: JointV1): number =>
  joint.kind === "prismatic" ? joint.maxTravelMm : joint.maxAngleDeg;

const couplingInputs = (
  coupling: CouplingV1,
): readonly { readonly jointId: string; readonly valueKey: string }[] => {
  switch (coupling.kind) {
    case "direct_ratio":
      return [{ jointId: coupling.inputJointId, valueKey: "input" }];
    case "mirrored_pair":
      return [{ jointId: coupling.inputJointId, valueKey: "input" }];
    case "pull_tab":
      return [{ jointId: coupling.sliderJointId, valueKey: "slider" }];
    case "cam_slot":
      return [];
  }
};

const applyCoupling = (
  coupling: CouplingV1,
  values: Record<string, number>,
  driverValue: number,
): string | null => {
  for (const input of couplingInputs(coupling)) {
    if (values[input.jointId] === undefined) return input.jointId;
  }
  switch (coupling.kind) {
    case "direct_ratio": {
      const input = values[coupling.inputJointId]!;
      for (const outputJointId of coupling.outputJointIds) {
        values[outputJointId] = input * coupling.ratio + coupling.offset;
      }
      return null;
    }
    case "mirrored_pair": {
      const input = values[coupling.inputJointId]!;
      values[coupling.leftOutputJointId] =
        input * coupling.ratio + coupling.phaseOffsetDeg;
      values[coupling.rightOutputJointId] =
        -input * coupling.ratio + coupling.phaseOffsetDeg;
      return null;
    }
    case "pull_tab":
      values[coupling.sliderJointId] = driverValue;
      for (const outputJointId of coupling.outputJointIds) {
        values[outputJointId] = driverValue * coupling.ratio;
      }
      return null;
    case "cam_slot":
      values[coupling.outputJointId] =
        (coupling.branch === "positive" ? 1 : -1) *
        (driverValue + coupling.phaseOffsetMm);
      return null;
  }
};

const jointMotionMatrix = (joint: JointV1, value: number): Matrix4 | null => {
  if (joint.kind === "prismatic") {
    const axisLength = Math.hypot(joint.axis.x, joint.axis.y, joint.axis.z);
    if (axisLength <= 1e-12) return null;
    const deltaMm = value - joint.homeTravelMm;
    return translationMatrix4(
      (joint.axis.x / axisLength) * deltaMm,
      (joint.axis.y / axisLength) * deltaMm,
      (joint.axis.z / axisLength) * deltaMm,
    );
  }
  return rotationAroundAxisMatrix4(
    joint.axis.startMm,
    joint.axis.endMm,
    value - joint.homeAngleDeg,
  );
};

const closureResidualMm = (
  joint: JointV1,
  parentMatrix: Matrix4,
  childMatrix: Matrix4,
): number => {
  if (joint.kind === "prismatic") return 0;
  const parentStart = transformPoint3(parentMatrix, joint.axis.startMm);
  const parentEnd = transformPoint3(parentMatrix, joint.axis.endMm);
  const childStart = transformPoint3(childMatrix, joint.axis.startMm);
  const childEnd = transformPoint3(childMatrix, joint.axis.endMm);
  return Math.max(
    Math.hypot(
      parentStart.xMm - childStart.xMm,
      parentStart.yMm - childStart.yMm,
      parentStart.zMm - childStart.zMm,
    ),
    Math.hypot(
      parentEnd.xMm - childEnd.xMm,
      parentEnd.yMm - childEnd.yMm,
      parentEnd.zMm - childEnd.zMm,
    ),
  );
};

const motionFailureFromTopology = (detail: unknown): MotionFailure => ({
  id: "motion.topology",
  detail: JSON.stringify(detail),
});

export const evaluateMotionState = (
  ir: FabricationIRV1,
  requestedDriverValue?: number,
): Result<EvaluatedMotionState, MotionFailure> => {
  const driver = ir.driver;
  const driverValue = driver
    ? (requestedDriverValue ?? driver.homeValue)
    : null;
  if (
    (driverValue !== null && !Number.isFinite(driverValue)) ||
    (driver === null && requestedDriverValue !== undefined)
  ) {
    return err({
      id: "motion.driver_value",
      value: requestedDriverValue!,
    });
  }
  if (
    driver &&
    driverValue !== null &&
    (driverValue < driver.minimumValue || driverValue > driver.maximumValue)
  ) {
    return err({ id: "motion.driver_value", value: driverValue });
  }

  const jointById = new Map(ir.joints.map((joint) => [joint.jointId, joint]));
  const jointValues: Record<string, number> = Object.fromEntries(
    ir.joints.map((joint) => [joint.jointId, jointHomeValue(joint)]),
  );
  if (driver) {
    const drivenJoint = jointById.get(driver.jointId);
    if (!drivenJoint) {
      return err({
        id: "motion.reference",
        referenceKind: "joint",
        referenceId: driver.jointId,
      });
    }
    jointValues[driver.jointId] = driverValue!;
    for (const coupling of ir.couplings) {
      const missingJointId = applyCoupling(coupling, jointValues, driverValue!);
      if (missingJointId) {
        return err({
          id: "motion.reference",
          referenceKind: "joint",
          referenceId: missingJointId,
        });
      }
    }
  }

  for (const joint of ir.joints) {
    // Every joint key is initialized from this same list before couplings run.
    const value = jointValues[joint.jointId]!;
    const minimum = jointMinimum(joint);
    const maximum = jointMaximum(joint);
    if (value < minimum || value > maximum) {
      return err({
        id: "motion.joint_range",
        jointId: joint.jointId,
        value,
        minimum,
        maximum,
      });
    }
  }

  const topology = buildDirectedBodyTopology(
    ir.bodies.map((body) => body.bodyId),
    ir.joints,
  );
  if (!topology.ok) return err(motionFailureFromTopology(topology.error));
  const bodyById = new Map(ir.bodies.map((body) => [body.bodyId, body]));
  const jointIdByChildBody = topology.value.parentJointByBodyId;
  const bodyMatrices: Record<string, Matrix4> = {};
  let maximumClosureResidualMm = 0;

  for (const bodyId of topology.value.orderedBodyIds) {
    // The topology order is constructed from the same body collection.
    const body = bodyById.get(bodyId)!;
    const initialMatrix = normalizedQuaternionMatrix(body.initialTransform);
    if (!initialMatrix || !matrixIsFinite(initialMatrix)) {
      return err({ id: "motion.transform", bodyId });
    }
    if (bodyId === topology.value.rootBodyId) {
      bodyMatrices[bodyId] = initialMatrix;
      continue;
    }

    // A non-root topology node always has a known parent joint, and the
    // topological ordering guarantees that the parent matrix already exists.
    const jointId = jointIdByChildBody[bodyId]!;
    const joint = jointById.get(jointId)!;
    const parentMatrix = bodyMatrices[joint.parentBodyId]!;
    const value = jointValues[joint.jointId]!;
    const motionMatrix = jointMotionMatrix(joint, value);
    if (!motionMatrix)
      return err({ id: "motion.axis", jointId: joint.jointId });
    const bodyMatrix = multiplyMatrices4(
      parentMatrix,
      multiplyMatrices4(motionMatrix, initialMatrix),
    );
    if (!matrixIsFinite(bodyMatrix)) {
      return err({ id: "motion.transform", bodyId });
    }
    bodyMatrices[bodyId] = bodyMatrix;
    maximumClosureResidualMm = Math.max(
      maximumClosureResidualMm,
      closureResidualMm(joint, parentMatrix, bodyMatrix),
    );
  }

  const connectorById = new Map(
    ir.connectors.map((connector) => [connector.connectorId, connector]),
  );
  const panelById = new Map(ir.panels.map((panel) => [panel.panelId, panel]));
  for (const joint of ir.joints) {
    if (joint.kind !== "prismatic") continue;
    const axisLength = Math.hypot(joint.axis.x, joint.axis.y, joint.axis.z);
    if (axisLength <= 1e-12) continue;
    const axis = {
      x: joint.axis.x / axisLength,
      y: joint.axis.y / axisLength,
      z: joint.axis.z / axisLength,
    };
    for (const connectorId of joint.guideConnectorIds) {
      const connector = connectorById.get(connectorId);
      const panel = connector ? panelById.get(connector.panelId) : undefined;
      const bodyMatrix = panel ? bodyMatrices[panel.bodyId] : undefined;
      if (!connector || !panel || !bodyMatrix) continue;
      const localAnchor = connectorReferencePoint2(connector);
      const placedAnchor = transformPoint2(localAnchor, panel.flatTransform);
      const actualAnchor = transformPoint3(bodyMatrix, {
        ...placedAnchor,
        zMm: 0,
      });
      const relative = {
        x: actualAnchor.xMm - joint.originMm.xMm,
        y: actualAnchor.yMm - joint.originMm.yMm,
        z: actualAnchor.zMm - joint.originMm.zMm,
      };
      const axialDistanceMm =
        relative.x * axis.x + relative.y * axis.y + relative.z * axis.z;
      const closestAxisPoint = {
        xMm: joint.originMm.xMm + axis.x * axialDistanceMm,
        yMm: joint.originMm.yMm + axis.y * axialDistanceMm,
        zMm: joint.originMm.zMm + axis.z * axialDistanceMm,
      };
      maximumClosureResidualMm = Math.max(
        maximumClosureResidualMm,
        Math.hypot(
          actualAnchor.xMm - closestAxisPoint.xMm,
          actualAnchor.yMm - closestAxisPoint.yMm,
          actualAnchor.zMm - closestAxisPoint.zMm,
        ),
      );
    }
  }

  const panelVertices: Record<string, readonly Point3Mm[]> = {};
  const panelTriangles: Record<
    string,
    readonly (readonly [Point3Mm, Point3Mm, Point3Mm])[]
  > = {};
  for (const panel of ir.panels) {
    const bodyMatrix = bodyMatrices[panel.bodyId];
    if (!bodyMatrix) {
      return err({
        id: "motion.reference",
        referenceKind: "body",
        referenceId: panel.bodyId,
      });
    }
    const flatPoints = panel.contour.vertices.map((point) =>
      transformPoint2(point, panel.flatTransform),
    );
    const vertices = flatPoints.map((point) =>
      transformPoint3(bodyMatrix, { ...point, zMm: 0 }),
    );
    panelVertices[panel.panelId] = vertices;
    const triangulation = triangulatePolygonWithHoles(
      panel.contour.vertices,
      panel.innerCutContours.map((contour) => contour.vertices),
    );
    const meshVertices = triangulation.vertices.map((point) =>
      transformPoint3(bodyMatrix, {
        ...transformPoint2(point, panel.flatTransform),
        zMm: 0,
      }),
    );
    panelTriangles[panel.panelId] = triangulation.triangles.map(
      (triangle) =>
        [
          meshVertices[triangle.a]!,
          meshVertices[triangle.b]!,
          meshVertices[triangle.c]!,
        ] as const,
    );
  }

  const driverRatio = driver
    ? (driverValue! - driver.minimumValue) /
      Math.max(1e-12, driver.maximumValue - driver.minimumValue)
    : 0;
  return ok({
    driverValue,
    driverRatio,
    jointValues,
    bodyMatrices,
    panelVertices,
    panelTriangles,
    maximumClosureResidualMm,
  });
};

export const homeMotionState = (
  ir: FabricationIRV1,
): Result<EvaluatedMotionState, MotionFailure> =>
  ir.driver
    ? evaluateMotionState(ir, ir.driver.homeValue)
    : evaluateMotionState(ir);

export const identityBodyMatrix = (): Matrix4 => IDENTITY_MATRIX_4;
