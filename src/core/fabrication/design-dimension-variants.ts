import type {
  FabricationDesignPartV3,
  FabricationDesignSpecV3,
  FabricationDimensionRangeV3,
  FabricationPartRelationV3,
} from "./design-spec";

export const MAXIMUM_DESIGN_DIMENSION_VARIANTS = 24;

export interface FabricationPartDimensionAssignmentV3 {
  readonly partKey: string;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface FabricationDesignDimensionVariantV3 {
  readonly parts: readonly FabricationPartDimensionAssignmentV3[];
}

export type FabricationPartDimensionAxisV3 = "widthMm" | "heightMm";

export interface FabricationProtectedPartAxisV3 {
  readonly partKey: string;
  readonly axis: FabricationPartDimensionAxisV3;
}

export interface FabricationDesignDimensionVariantOptionsV3 {
  /**
   * Axes backed by an explicit user constraint. Unlike model-inferred fixed
   * values, these axes cannot move within the spec's general tolerance.
   */
  readonly protectedPartAxes?: readonly FabricationProtectedPartAxisV3[];
  readonly requestedEnvelope?: {
    readonly widthMm: number;
    readonly heightMm: number;
    readonly depthMm: number | null;
  };
}

type DimensionAxis = FabricationPartDimensionAxisV3;

interface MutablePartDimensions {
  widthMm: number;
  heightMm: number;
}

type MutableAssignment = Map<string, MutablePartDimensions>;

type EdgeRelation = Extract<
  FabricationPartRelationV3,
  { readonly kind: "fold" | "open_close" | "slide" | "lock" | "touch" }
>;

const axisRange = (
  part: FabricationDesignPartV3,
  axis: DimensionAxis,
): FabricationDimensionRangeV3 =>
  axis === "widthMm" ? part.width : part.height;

const protectedAxisKey = (partKey: string, axis: DimensionAxis): string =>
  `${partKey}\u0000${axis}`;

const searchableAxisRange = (
  part: FabricationDesignPartV3,
  axis: DimensionAxis,
  dimensionToleranceMm: number,
  protectedAxes: ReadonlySet<string>,
): FabricationDimensionRangeV3 => {
  const range = axisRange(part, axis);
  const isFixed = range.minimumMm === range.maximumMm;
  if (
    !isFixed ||
    dimensionToleranceMm === 0 ||
    protectedAxes.has(protectedAxisKey(part.key, axis))
  ) {
    return range;
  }
  return {
    minimumMm: Math.max(
      Number.EPSILON,
      range.preferredMm - dimensionToleranceMm,
    ),
    preferredMm: range.preferredMm,
    maximumMm: range.preferredMm + dimensionToleranceMm,
  };
};

const preferredAssignment = (
  parts: readonly FabricationDesignPartV3[],
): MutableAssignment =>
  new Map(
    parts.map((part) => [
      part.key,
      {
        widthMm: part.width.preferredMm,
        heightMm: part.height.preferredMm,
      },
    ]),
  );

const cloneAssignment = (assignment: MutableAssignment): MutableAssignment =>
  new Map(
    [...assignment].map(([partKey, dimensions]) => [
      partKey,
      { ...dimensions },
    ]),
  );

const roundedMm = (value: number): number => Math.round(value * 1e9) / 1e9;

const distinctNumbers = (values: readonly number[]): readonly number[] => [
  ...new Set(values.map(roundedMm)),
];

const sharedValuesMm = (
  left: FabricationDimensionRangeV3,
  right: FabricationDimensionRangeV3,
): readonly number[] => {
  const minimumMm = Math.max(left.minimumMm, right.minimumMm);
  const maximumMm = Math.min(left.maximumMm, right.maximumMm);
  if (minimumMm > maximumMm) return [];
  const clamp = (value: number): number =>
    Math.min(maximumMm, Math.max(minimumMm, value));
  return distinctNumbers([
    clamp(left.preferredMm),
    clamp(right.preferredMm),
    clamp((left.preferredMm + right.preferredMm) / 2),
    minimumMm,
    maximumMm,
  ]).toSorted(
    (leftValue, rightValue) =>
      Math.abs(leftValue - left.preferredMm) +
        Math.abs(leftValue - right.preferredMm) -
        (Math.abs(rightValue - left.preferredMm) +
          Math.abs(rightValue - right.preferredMm)) || leftValue - rightValue,
  );
};

const edgeRelations = (
  relations: readonly FabricationPartRelationV3[],
): readonly EdgeRelation[] =>
  relations.filter(
    (relation): relation is EdgeRelation => relation.kind !== "contain",
  );

const assignmentKey = (
  assignment: MutableAssignment,
  partOrder: readonly string[],
): string =>
  partOrder
    .map((partKey) => {
      const dimensions = assignment.get(partKey)!;
      return `${partKey}:${dimensions.widthMm}:${dimensions.heightMm}`;
    })
    .join("|");

const relationHasMatchingEdge = (
  relation: EdgeRelation,
  assignment: MutableAssignment,
): boolean => {
  const left = assignment.get(relation.partAKey);
  const right = assignment.get(relation.partBKey);
  if (!left || !right) return false;
  return [left.widthMm, left.heightMm].some((leftValue) =>
    [right.widthMm, right.heightMm].some(
      (rightValue) => Math.abs(leftValue - rightValue) <= 0.1,
    ),
  );
};

const relationMatchCount = (
  relations: readonly EdgeRelation[],
  assignment: MutableAssignment,
): number =>
  relations.filter((relation) => relationHasMatchingEdge(relation, assignment))
    .length;

const preferredDeviationMm = (
  partsByKey: ReadonlyMap<string, FabricationDesignPartV3>,
  assignment: MutableAssignment,
): number =>
  [...assignment].reduce((total, [partKey, dimensions]) => {
    const part = partsByKey.get(partKey)!;
    return (
      total +
      Math.abs(dimensions.widthMm - part.width.preferredMm) +
      Math.abs(dimensions.heightMm - part.height.preferredMm)
    );
  }, 0);

const rankedAssignments = (
  assignments: readonly MutableAssignment[],
  partsByKey: ReadonlyMap<string, FabricationDesignPartV3>,
  relations: readonly EdgeRelation[],
  partOrder: readonly string[],
): readonly MutableAssignment[] =>
  [...assignments].toSorted(
    (left, right) =>
      relationMatchCount(relations, right) -
        relationMatchCount(relations, left) ||
      preferredDeviationMm(partsByKey, left) -
        preferredDeviationMm(partsByKey, right) ||
      assignmentKey(left, partOrder).localeCompare(
        assignmentKey(right, partOrder),
        "en-US",
      ),
  );

const deduplicateAssignments = (
  assignments: readonly MutableAssignment[],
  partOrder: readonly string[],
): readonly MutableAssignment[] => {
  const byKey = new Map<string, MutableAssignment>();
  for (const assignment of assignments) {
    const key = assignmentKey(assignment, partOrder);
    if (!byKey.has(key)) byKey.set(key, assignment);
  }
  return [...byKey.values()];
};

const relationVariants = (
  assignment: MutableAssignment,
  relation: EdgeRelation,
  partsByKey: ReadonlyMap<string, FabricationDesignPartV3>,
  dimensionToleranceMm: number,
  protectedAxes: ReadonlySet<string>,
): readonly MutableAssignment[] => {
  const leftPart = partsByKey.get(relation.partAKey);
  const rightPart = partsByKey.get(relation.partBKey);
  if (!leftPart || !rightPart) return [];
  const variants: MutableAssignment[] = [];
  for (const leftAxis of ["widthMm", "heightMm"] as const) {
    for (const rightAxis of ["widthMm", "heightMm"] as const) {
      for (const sharedMm of sharedValuesMm(
        searchableAxisRange(
          leftPart,
          leftAxis,
          dimensionToleranceMm,
          protectedAxes,
        ),
        searchableAxisRange(
          rightPart,
          rightAxis,
          dimensionToleranceMm,
          protectedAxes,
        ),
      )) {
        const variant = cloneAssignment(assignment);
        variant.get(leftPart.key)![leftAxis] = sharedMm;
        variant.get(rightPart.key)![rightAxis] = sharedMm;
        variants.push(variant);
      }
    }
  }
  return variants;
};

const boundaryVariants = (
  preferred: MutableAssignment,
  parts: readonly FabricationDesignPartV3[],
  dimensionToleranceMm: number,
  clearanceMm: number,
  protectedAxes: ReadonlySet<string>,
): readonly MutableAssignment[] =>
  parts.flatMap((part) =>
    (["widthMm", "heightMm"] as const).flatMap((axis) => {
      const range = searchableAxisRange(
        part,
        axis,
        dimensionToleranceMm,
        protectedAxes,
      );
      const reliefMm = Math.min(dimensionToleranceMm, clearanceMm * 2);
      return distinctNumbers([
        range.minimumMm,
        Math.max(range.minimumMm, range.preferredMm - reliefMm),
        Math.min(range.maximumMm, range.preferredMm + reliefMm),
        range.maximumMm,
      ]).map((value) => {
        const variant = cloneAssignment(preferred);
        variant.get(part.key)![axis] = value;
        return variant;
      });
    }),
  );

const coordinatedReliefVariants = (
  preferred: MutableAssignment,
  parts: readonly FabricationDesignPartV3[],
  dimensionToleranceMm: number,
  clearanceMm: number,
  protectedAxes: ReadonlySet<string>,
): readonly MutableAssignment[] => {
  const groups = new Map<
    string,
    { readonly part: FabricationDesignPartV3; readonly axis: DimensionAxis }[]
  >();
  for (const part of parts) {
    for (const axis of ["widthMm", "heightMm"] as const) {
      if (protectedAxes.has(protectedAxisKey(part.key, axis))) continue;
      const range = axisRange(part, axis);
      const groupKey = `${part.role}\u0000${roundedMm(range.preferredMm)}`;
      const group = groups.get(groupKey) ?? [];
      group.push({ part, axis });
      groups.set(groupKey, group);
    }
  }
  const reliefMm = Math.min(dimensionToleranceMm, clearanceMm * 2);
  if (reliefMm <= 0) return [];
  return [...groups.values()].flatMap((group) => {
    if (group.length < 2) return [];
    return [-reliefMm, reliefMm].flatMap((deltaMm) => {
      const targetMm =
        group[0]!["part"][group[0]!.axis === "widthMm" ? "width" : "height"]
          .preferredMm + deltaMm;
      if (
        group.some(({ part, axis }) => {
          const range = searchableAxisRange(
            part,
            axis,
            dimensionToleranceMm,
            protectedAxes,
          );
          return targetMm < range.minimumMm || targetMm > range.maximumMm;
        })
      ) {
        return [];
      }
      const variant = cloneAssignment(preferred);
      for (const { part, axis } of group) {
        variant.get(part.key)![axis] = targetMm;
      }
      return [variant];
    });
  });
};

/**
 * A semantic shell describes finished faces, not which face the model happened
 * to call its base. This role-based assignment maps the requested envelope to
 * those faces while leaving graph topology and every attachment to synthesis.
 * It is enabled only for a rectangular support/wall/closure inventory with a
 * driven closure and a lock; no object labels or prompt text are inspected.
 */
const roleDefinedShellVariant = (
  preferred: MutableAssignment,
  spec: FabricationDesignSpecV3,
  requestedEnvelope:
    | {
        readonly widthMm: number;
        readonly heightMm: number;
        readonly depthMm: number | null;
      }
    | undefined,
  protectedAxes: ReadonlySet<string>,
): MutableAssignment | null => {
  const drivenRelation = spec.driver
    ? spec.relations.find(
        (relation) => relation.key === spec.driver?.relationKey,
      )
    : null;
  const drivenOutput = spec.driver
    ? spec.outputs.find(
        (output) => output.relationKey === spec.driver?.relationKey,
      )
    : null;
  const drivenPart = drivenOutput
    ? spec.parts.find((part) => part.key === drivenOutput.partKey)
    : null;
  const structuralParts = spec.parts.filter(
    (part) =>
      part.key !== drivenPart?.key &&
      part.role !== "decorative" &&
      part.role !== "guide" &&
      part.role !== "slider" &&
      part.role !== "driver",
  );
  const declaredSupports = structuralParts.filter(
    (part) => part.role === "support",
  );
  const envelopeDeviation = (part: FabricationDesignPartV3): number => {
    if (!requestedEnvelope) return Number.POSITIVE_INFINITY;
    const direct =
      Math.abs(part.width.preferredMm - requestedEnvelope.widthMm) +
      Math.abs(part.height.preferredMm - requestedEnvelope.heightMm);
    const rotated =
      Math.abs(part.width.preferredMm - requestedEnvelope.heightMm) +
      Math.abs(part.height.preferredMm - requestedEnvelope.widthMm);
    return Math.min(direct, rotated);
  };
  const supportPart = (
    declaredSupports.length === 1 ? declaredSupports : structuralParts
  ).toSorted(
    (left, right) =>
      envelopeDeviation(left) - envelopeDeviation(right) ||
      left.key.localeCompare(right.key),
  )[0];
  const wallParts = structuralParts.filter(
    (part) => part.key !== supportPart?.key,
  );
  if (
    !requestedEnvelope?.depthMm ||
    !supportPart ||
    !drivenPart ||
    wallParts.length < 2 ||
    drivenRelation?.kind !== "open_close" ||
    !spec.relations.some(
      (relation) =>
        relation.kind === "lock" &&
        (relation.partAKey === drivenPart.key ||
          relation.partBKey === drivenPart.key),
    ) ||
    [supportPart, ...wallParts, drivenPart].some(
      (part) =>
        part.shapePreference !== "rectangle" ||
        protectedAxes.has(protectedAxisKey(part.key, "widthMm")) ||
        protectedAxes.has(protectedAxisKey(part.key, "heightMm")),
    )
  ) {
    return null;
  }
  const variant = cloneAssignment(preferred);
  const { widthMm, heightMm, depthMm } = requestedEnvelope;
  const depthPanelMm = Math.max(
    Number.EPSILON,
    depthMm - spec.tolerances.clearanceMm * 2,
  );
  for (const part of [supportPart, drivenPart]) {
    const current = preferred.get(part.key)!;
    const directDeviation =
      Math.abs(current.widthMm - widthMm) +
      Math.abs(current.heightMm - heightMm);
    const rotatedDeviation =
      Math.abs(current.widthMm - heightMm) +
      Math.abs(current.heightMm - widthMm);
    variant.set(
      part.key,
      directDeviation <= rotatedDeviation
        ? { widthMm, heightMm }
        : { widthMm: heightMm, heightMm: widthMm },
    );
  }
  for (const part of wallParts) {
    const current = preferred.get(part.key)!;
    const widthSpan =
      Math.abs(current.widthMm - widthMm) <=
      Math.abs(current.widthMm - heightMm)
        ? widthMm
        : heightMm;
    const heightSpan =
      Math.abs(current.heightMm - widthMm) <=
      Math.abs(current.heightMm - heightMm)
        ? widthMm
        : heightMm;
    const widthDeviation = Math.abs(current.widthMm - widthSpan);
    const heightDeviation = Math.abs(current.heightMm - heightSpan);
    // One opposing wall pair owns the full outside depth; the orthogonal pair
    // nests between it and receives the canonical two-clearance relief.
    const widthOwnedDepthMm = widthSpan === widthMm ? depthMm : depthPanelMm;
    const heightOwnedDepthMm = heightSpan === widthMm ? depthMm : depthPanelMm;
    variant.set(
      part.key,
      widthDeviation <= heightDeviation
        ? { widthMm: widthSpan, heightMm: widthOwnedDepthMm }
        : { widthMm: heightOwnedDepthMm, heightMm: heightSpan },
    );
  }
  return variant;
};

const immutableVariant = (
  assignment: MutableAssignment,
  partOrder: readonly string[],
): FabricationDesignDimensionVariantV3 => ({
  parts: partOrder.map((partKey) => ({
    partKey,
    ...assignment.get(partKey)!,
  })),
});

/**
 * Produces a small deterministic beam of dimension assignments. The preferred
 * assignment is always first. Remaining variants favor shared physical edge
 * lengths for declared relations, then minimum/maximum range boundaries.
 */
export const fabricationDesignDimensionVariants = (
  spec: FabricationDesignSpecV3,
  options: FabricationDesignDimensionVariantOptionsV3 = {},
): readonly FabricationDesignDimensionVariantV3[] => {
  const partOrder = spec.parts.map((part) => part.key);
  const partsByKey = new Map(spec.parts.map((part) => [part.key, part]));
  const relations = edgeRelations(spec.relations);
  const preferred = preferredAssignment(spec.parts);
  const protectedAxes = new Set(
    (options.protectedPartAxes ?? []).map(({ partKey, axis }) =>
      protectedAxisKey(partKey, axis),
    ),
  );
  let beam: readonly MutableAssignment[] = [preferred];

  for (const relation of relations) {
    const expanded = beam.flatMap((assignment) => [
      assignment,
      ...relationVariants(
        assignment,
        relation,
        partsByKey,
        spec.tolerances.dimensionMm,
        protectedAxes,
      ),
    ]);
    beam = rankedAssignments(
      deduplicateAssignments(expanded, partOrder),
      partsByKey,
      relations,
      partOrder,
    ).slice(0, MAXIMUM_DESIGN_DIMENSION_VARIANTS * 2);
  }

  const nonPreferred = rankedAssignments(
    deduplicateAssignments(
      [
        ...beam,
        ...boundaryVariants(
          preferred,
          spec.parts,
          spec.tolerances.dimensionMm,
          spec.tolerances.clearanceMm,
          protectedAxes,
        ),
      ],
      partOrder,
    ).filter(
      (assignment) =>
        assignmentKey(assignment, partOrder) !==
        assignmentKey(preferred, partOrder),
    ),
    partsByKey,
    relations,
    partOrder,
  );
  const coordinated = rankedAssignments(
    deduplicateAssignments(
      coordinatedReliefVariants(
        preferred,
        spec.parts,
        spec.tolerances.dimensionMm,
        spec.tolerances.clearanceMm,
        protectedAxes,
      ),
      partOrder,
    ),
    partsByKey,
    relations,
    partOrder,
  );
  const coordinatedKeys = new Set(
    coordinated.map((assignment) => assignmentKey(assignment, partOrder)),
  );
  const shellVariant = roleDefinedShellVariant(
    preferred,
    spec,
    options.requestedEnvelope,
    protectedAxes,
  );
  const shellVariantKey = shellVariant
    ? assignmentKey(shellVariant, partOrder)
    : null;
  return [
    preferred,
    ...(shellVariant && shellVariantKey !== assignmentKey(preferred, partOrder)
      ? [shellVariant]
      : []),
    ...coordinated,
    ...nonPreferred.filter((assignment) => {
      const key = assignmentKey(assignment, partOrder);
      return !coordinatedKeys.has(key) && key !== shellVariantKey;
    }),
  ]
    .slice(0, MAXIMUM_DESIGN_DIMENSION_VARIANTS)
    .map((assignment) => immutableVariant(assignment, partOrder));
};
