import { err, ok, type Result } from "@/core/result";

export interface DirectedJointLike {
  readonly jointId: string;
  readonly parentBodyId: string;
  readonly childBodyId: string;
}

export type TopologyFailure =
  | {
      readonly id: "topology.body_duplicate";
      readonly bodyId: string;
    }
  | {
      readonly id: "topology.joint_duplicate";
      readonly jointId: string;
    }
  | {
      readonly id: "topology.reference";
      readonly jointId: string;
      readonly bodyId: string;
    }
  | {
      readonly id: "topology.self_edge";
      readonly jointId: string;
      readonly bodyId: string;
    }
  | {
      readonly id: "topology.multiple_parents";
      readonly bodyId: string;
    }
  | {
      readonly id: "topology.root_count";
      readonly actualRootCount: number;
    }
  | {
      readonly id: "topology.disconnected_or_cyclic";
      readonly bodyIds: readonly string[];
    };

export interface DirectedBodyTopology {
  readonly rootBodyId: string;
  readonly orderedBodyIds: readonly string[];
  readonly orderedJointIds: readonly string[];
  readonly parentJointByBodyId: Readonly<Record<string, string>>;
  readonly childJointIdsByBodyId: Readonly<Record<string, readonly string[]>>;
}

const firstDuplicate = (values: readonly string[]): string | null => {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
};

export const buildDirectedBodyTopology = (
  bodyIds: readonly string[],
  joints: readonly DirectedJointLike[],
): Result<DirectedBodyTopology, TopologyFailure> => {
  const duplicateBodyId = firstDuplicate(bodyIds);
  if (duplicateBodyId !== null) {
    return err({ id: "topology.body_duplicate", bodyId: duplicateBodyId });
  }
  const duplicateJointId = firstDuplicate(joints.map((joint) => joint.jointId));
  if (duplicateJointId !== null) {
    return err({ id: "topology.joint_duplicate", jointId: duplicateJointId });
  }

  const bodyIdSet = new Set(bodyIds);
  const parentJointByBodyId: Record<string, string> = {};
  const childJointIdsByBodyId: Record<string, string[]> = Object.fromEntries(
    bodyIds.map((bodyId) => [bodyId, []]),
  );
  const jointById = new Map(joints.map((joint) => [joint.jointId, joint]));

  for (const joint of joints) {
    if (!bodyIdSet.has(joint.parentBodyId)) {
      return err({
        id: "topology.reference",
        jointId: joint.jointId,
        bodyId: joint.parentBodyId,
      });
    }
    if (!bodyIdSet.has(joint.childBodyId)) {
      return err({
        id: "topology.reference",
        jointId: joint.jointId,
        bodyId: joint.childBodyId,
      });
    }
    if (joint.parentBodyId === joint.childBodyId) {
      return err({
        id: "topology.self_edge",
        jointId: joint.jointId,
        bodyId: joint.parentBodyId,
      });
    }
    if (parentJointByBodyId[joint.childBodyId] !== undefined) {
      return err({
        id: "topology.multiple_parents",
        bodyId: joint.childBodyId,
      });
    }
    parentJointByBodyId[joint.childBodyId] = joint.jointId;
    childJointIdsByBodyId[joint.parentBodyId]?.push(joint.jointId);
  }

  const rootBodyIds = bodyIds.filter(
    (bodyId) => parentJointByBodyId[bodyId] === undefined,
  );
  if (rootBodyIds.length !== 1) {
    return err({
      id: "topology.root_count",
      actualRootCount: rootBodyIds.length,
    });
  }
  const rootBodyId = rootBodyIds[0];
  if (rootBodyId === undefined) {
    return err({ id: "topology.root_count", actualRootCount: 0 });
  }

  const orderedBodyIds: string[] = [];
  const orderedJointIds: string[] = [];
  const queue = [rootBodyId];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const bodyId = queue.shift();
    if (bodyId === undefined || visited.has(bodyId)) continue;
    visited.add(bodyId);
    orderedBodyIds.push(bodyId);
    const childJointIds = [...(childJointIdsByBodyId[bodyId] ?? [])].sort();
    for (const jointId of childJointIds) {
      const joint = jointById.get(jointId);
      if (!joint) continue;
      orderedJointIds.push(jointId);
      queue.push(joint.childBodyId);
    }
  }

  if (visited.size !== bodyIds.length) {
    return err({
      id: "topology.disconnected_or_cyclic",
      bodyIds: bodyIds.filter((bodyId) => !visited.has(bodyId)).sort(),
    });
  }

  return ok({
    rootBodyId,
    orderedBodyIds,
    orderedJointIds,
    parentJointByBodyId,
    childJointIdsByBodyId,
  });
};
