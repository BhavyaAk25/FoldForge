import { canonicalSerialize } from "../canonical";
import type {
  FabricationDesignSpecV3,
  FabricationPartRelationV3,
} from "./design-spec";
import { FABRICATION_KINEMATIC_LIMITS } from "./limits";
import type { FabricationIntentV1 } from "./types";

export const MAXIMUM_NORMALIZED_DESIGN_SPEC_VARIANTS = 12;
const MAXIMUM_DESIGN_SPEC_CLEARANCE_MM = 5;

export interface NormalizedDesignSpecVariant {
  readonly spec: FabricationDesignSpecV3;
  readonly normalizationKeys: readonly string[];
}

type JointRelation = Extract<
  FabricationPartRelationV3,
  { readonly kind: "fold" | "open_close" | "slide" }
>;

type LockRelation = Extract<
  FabricationPartRelationV3,
  { readonly kind: "lock" }
>;

interface LockFeatureLowering {
  readonly featurePartKey: string;
  readonly carrierPartKey: string;
  readonly attachmentRelationKey: string;
  readonly lockRelationKey: string;
}

interface DrivenOpenClosePhase {
  readonly minimum: number;
  readonly home: number;
  readonly maximum: number;
  readonly normalizationKey: string;
}

const relationContainsPart = (
  relation: FabricationPartRelationV3,
  partKey: string,
): boolean => relation.partAKey === partKey || relation.partBKey === partKey;

const otherPartKey = (
  relation: FabricationPartRelationV3,
  partKey: string,
): string =>
  relation.partAKey === partKey ? relation.partBKey : relation.partAKey;

const motionRelations = (
  spec: FabricationDesignSpecV3,
): readonly JointRelation[] =>
  spec.relations.filter(
    (relation): relation is JointRelation =>
      relation.kind === "fold" ||
      relation.kind === "open_close" ||
      relation.kind === "slide",
  );

const motionRelationRank = (
  intent: FabricationIntentV1,
  relation: JointRelation,
): number => {
  if (intent.behavior === "slide") return relation.kind === "slide" ? 0 : 3;
  if (intent.behavior === "open_close") {
    return relation.kind === "open_close"
      ? 0
      : relation.kind === "fold"
        ? 1
        : 3;
  }
  if (intent.behavior === "flap" || intent.behavior === "rotate") {
    return relation.kind === "fold" || relation.kind === "open_close" ? 0 : 3;
  }
  if (intent.behavior === "expand_collapse") return 0;
  return 3;
};

const movingPartRank = (
  spec: FabricationDesignSpecV3,
  partKey: string,
): number => {
  const role = spec.parts.find((part) => part.key === partKey)?.role;
  switch (role) {
    case "moving":
    case "output":
    case "closure":
    case "slider":
      return 0;
    case "driver":
    case "decorative":
      return 1;
    case "wall":
    case "guide":
      return 2;
    case "support":
    case "structural":
    case undefined:
      return 3;
  }
};

const normalizedMotionContract = (
  intent: FabricationIntentV1,
  spec: FabricationDesignSpecV3,
): FabricationDesignSpecV3 => {
  if (intent.behavior === "static") {
    return spec.driver === null && spec.outputs.length === 0
      ? spec
      : { ...spec, driver: null, outputs: [] };
  }
  const relations = motionRelations(spec);
  const rankedRelations = relations
    .filter((relation) => motionRelationRank(intent, relation) < 3)
    .toSorted(
      (left, right) =>
        motionRelationRank(intent, left) - motionRelationRank(intent, right) ||
        Math.min(
          movingPartRank(spec, left.partAKey),
          movingPartRank(spec, left.partBKey),
        ) -
          Math.min(
            movingPartRank(spec, right.partAKey),
            movingPartRank(spec, right.partBKey),
          ) ||
        left.key.localeCompare(right.key),
    );
  const bestRank = rankedRelations[0]
    ? motionRelationRank(intent, rankedRelations[0])
    : null;
  const declaredDriver = spec.driver
    ? rankedRelations.find(
        (relation) =>
          relation.key === spec.driver?.relationKey &&
          motionRelationRank(intent, relation) === bestRank,
      )
    : null;
  const relation = declaredDriver ?? rankedRelations[0];
  if (!relation) return spec;
  const declaredOutputPartKeys = [
    ...new Set(
      spec.outputs.flatMap((output) =>
        output.relationKey === relation.key &&
        relationContainsPart(relation, output.partKey)
          ? [output.partKey]
          : [],
      ),
    ),
  ];
  const outputPartKey = (
    declaredOutputPartKeys.length > 0
      ? declaredOutputPartKeys
      : [relation.partAKey, relation.partBKey]
  ).toSorted(
    (left, right) =>
      movingPartRank(spec, left) - movingPartRank(spec, right) ||
      left.localeCompare(right),
  )[0]!;
  const control =
    relation.kind === "slide"
      ? "slide"
      : intent.behavior === "rotate"
        ? "rotate"
        : "fold";
  const normalizedOutputs =
    spec.outputs.length === 0
      ? [
          {
            key: "drivenOutput",
            relationKey: relation.key,
            partKey: outputPartKey,
            label: "Driven output",
          },
        ]
      : spec.outputs.map((output) => {
          // V3 currently emits no couplings. An output is driven only when it
          // observes the selected driver joint's child body; every other
          // schema-valid mapping is normalized onto that actual motion path.
          return output.relationKey === relation.key &&
            output.partKey === outputPartKey
            ? output
            : {
                ...output,
                relationKey: relation.key,
                partKey: outputPartKey,
              };
        });
  return {
    ...spec,
    driver: {
      relationKey: relation.key,
      label: spec.driver?.label ?? "Move the design",
      control,
    },
    outputs: normalizedOutputs,
  };
};

const preferredAreaMm2 = (
  spec: FabricationDesignSpecV3,
  partKey: string,
): number => {
  const part = spec.parts.find((candidate) => candidate.key === partKey);
  return part ? part.width.preferredMm * part.height.preferredMm : 0;
};

/**
 * A connector tab is sometimes described as a small leaf panel even though
 * the lock relation already carries that semantic. The compiler owns the tab
 * geometry, so this structural pattern can be lowered without inspecting
 * labels, object names, or prompt keywords.
 */
const lockFeatureLowerings = (
  intent: FabricationIntentV1,
  spec: FabricationDesignSpecV3,
): readonly LockFeatureLowering[] =>
  spec.parts.flatMap((part) => {
    const related = spec.relations.filter((relation) =>
      relationContainsPart(relation, part.key),
    );
    const attachments = related.filter(
      (relation): relation is JointRelation => relation.kind === "fold",
    );
    const locks = related.filter(
      (relation): relation is LockRelation => relation.kind === "lock",
    );
    if (
      part.role !== "closure" ||
      attachments.length !== 1 ||
      locks.length !== 1 ||
      related.length !== 2 ||
      spec.visibleLandmarks.some(
        (landmark) =>
          landmark.importance === "required" &&
          landmark.partKeys.includes(part.key),
      ) ||
      intent.semanticConstraints.some(
        (constraint) =>
          constraint.kind === "recognizable_form" &&
          constraint.semanticPartIds.includes(`part-${part.key}`),
      )
    ) {
      return [];
    }
    const attachment = attachments[0]!;
    const lock = locks[0]!;
    if (
      spec.driver?.relationKey === attachment.key ||
      spec.outputs.some(
        (output) =>
          output.partKey === part.key || output.relationKey === attachment.key,
      )
    ) {
      return [];
    }
    const carrierPartKey = otherPartKey(attachment, part.key);
    const carrier = spec.parts.find(
      (candidate) => candidate.key === carrierPartKey,
    );
    if (!carrier) return [];
    const carrierAreaMm2 = preferredAreaMm2(spec, carrierPartKey);
    const featureAreaMm2 = preferredAreaMm2(spec, part.key);
    const featureSpans = [
      part.width.preferredMm,
      part.height.preferredMm,
    ].toSorted((left, right) => left - right);
    const carrierSpans = [
      carrier.width.preferredMm,
      carrier.height.preferredMm,
    ].toSorted((left, right) => left - right);
    if (
      carrierAreaMm2 <= 0 ||
      featureAreaMm2 <= 0 ||
      featureAreaMm2 >= carrierAreaMm2 ||
      featureSpans[0]! >= carrierSpans[0]! ||
      featureSpans[1]! >= carrierSpans[1]!
    ) {
      return [];
    }
    return [
      {
        featurePartKey: part.key,
        carrierPartKey,
        attachmentRelationKey: attachment.key,
        lockRelationKey: lock.key,
      },
    ];
  });

const lowerLockFeature = (
  spec: FabricationDesignSpecV3,
  lowering: LockFeatureLowering,
): FabricationDesignSpecV3 => ({
  ...spec,
  parts: spec.parts.filter((part) => part.key !== lowering.featurePartKey),
  relations: spec.relations.flatMap((relation) => {
    if (relation.key === lowering.attachmentRelationKey) return [];
    if (relation.key !== lowering.lockRelationKey) return [relation];
    return [
      {
        ...relation,
        partAKey:
          relation.partAKey === lowering.featurePartKey
            ? lowering.carrierPartKey
            : relation.partAKey,
        partBKey:
          relation.partBKey === lowering.featurePartKey
            ? lowering.carrierPartKey
            : relation.partBKey,
      },
    ];
  }),
  visibleLandmarks: spec.visibleLandmarks.map((landmark) => ({
    ...landmark,
    partKeys: [
      ...new Set(
        landmark.partKeys.map((partKey) =>
          partKey === lowering.featurePartKey
            ? lowering.carrierPartKey
            : partKey,
        ),
      ),
    ],
  })),
});

const normalizedClearanceMm = (intent: FabricationIntentV1): number => {
  const explicitMinimumsMm = intent.semanticConstraints.flatMap((constraint) =>
    constraint.kind === "clearance" && constraint.source === "user"
      ? [constraint.minimumClearanceMm]
      : [],
  );
  return Math.max(
    FABRICATION_KINEMATIC_LIMITS.minimumMovingClearanceMm,
    ...explicitMinimumsMm,
  );
};

const withCodeOwnedClearance = (
  intent: FabricationIntentV1,
  spec: FabricationDesignSpecV3,
): FabricationDesignSpecV3 => ({
  ...spec,
  tolerances: {
    ...spec.tolerances,
    clearanceMm: normalizedClearanceMm(intent),
  },
});

const drivenOpenClosePhaseCandidates = (
  intent: FabricationIntentV1,
  spec: FabricationDesignSpecV3,
): readonly DrivenOpenClosePhase[] => {
  if (!spec.driver) return [];
  const relation = spec.relations.find(
    (candidate) =>
      candidate.key === spec.driver?.relationKey &&
      candidate.kind === "open_close",
  );
  if (!relation || relation.kind !== "open_close") return [];
  const range = relation.angleRangeDeg;
  const alternateEndpoint =
    Math.abs(range.maximum - range.home) >= Math.abs(range.home - range.minimum)
      ? range.maximum
      : range.minimum;
  const homes = [
    ...new Set([
      range.home,
      ...(range.minimum <= 90 && range.maximum >= 90 ? [90] : []),
      alternateEndpoint,
    ]),
  ];
  const phases: DrivenOpenClosePhase[] = homes.map((home) => ({
    minimum: range.minimum,
    home,
    maximum: range.maximum,
    normalizationKey: `open-close-home:${home}`,
  }));
  const hasExplicitUserMotion = intent.semanticConstraints.some(
    (constraint) =>
      constraint.kind === "motion" && constraint.source === "user",
  );
  if (!hasExplicitUserMotion) {
    phases.push({
      minimum: 0,
      home: 90,
      maximum: 90,
      normalizationKey: "open-close-range:canonical-0-90",
    });
  }
  const seen = new Set<string>();
  return phases.filter((phase) => {
    const key = `${phase.minimum}:${phase.home}:${phase.maximum}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const withDrivenOpenClosePhase = (
  spec: FabricationDesignSpecV3,
  phase: DrivenOpenClosePhase,
): FabricationDesignSpecV3 => ({
  ...spec,
  relations: spec.relations.map((relation) =>
    relation.key === spec.driver?.relationKey && relation.kind === "open_close"
      ? {
          ...relation,
          angleRangeDeg: {
            minimum: phase.minimum,
            home: phase.home,
            maximum: phase.maximum,
          },
        }
      : relation,
  ),
});

/**
 * Produces a small deterministic frontier of equivalent semantic inputs. The
 * variants resolve representation choices left ambiguous by the model while
 * preserving the declared parts, dimensions, motion bounds, and user-owned
 * constraints. Compilation and the complete verifier still decide validity.
 */
export const normalizedFabricationDesignSpecVariants = (
  intent: FabricationIntentV1,
  inputSpec: FabricationDesignSpecV3,
): readonly NormalizedDesignSpecVariant[] => {
  const motionNormalized = normalizedMotionContract(intent, inputSpec);
  const base = withCodeOwnedClearance(intent, motionNormalized);
  // The V3 contract cannot represent a larger connector clearance. Returning
  // no variants preserves the user's value so the caller can report the
  // unsupported requirement instead of silently clamping it.
  if (base.tolerances.clearanceMm > MAXIMUM_DESIGN_SPEC_CLEARANCE_MM) return [];
  const structures: NormalizedDesignSpecVariant[] = [
    { spec: base, normalizationKeys: ["clearance:code-owned"] },
    ...lockFeatureLowerings(intent, base).map((lowering) => ({
      spec: lowerLockFeature(base, lowering),
      normalizationKeys: [
        "clearance:code-owned",
        `lock-feature:${lowering.featurePartKey}`,
      ],
    })),
  ];
  const phases = drivenOpenClosePhaseCandidates(intent, base);
  const phaseValues = phases.length > 0 ? phases : [null];
  const variants: NormalizedDesignSpecVariant[] = [];
  const seen = new Set<string>();
  for (const phase of phaseValues) {
    for (const structure of structures) {
      const spec =
        phase === null
          ? structure.spec
          : withDrivenOpenClosePhase(structure.spec, phase);
      const serialized = canonicalSerialize(spec);
      if (seen.has(serialized)) continue;
      seen.add(serialized);
      variants.push({
        spec,
        normalizationKeys:
          phase === null
            ? structure.normalizationKeys
            : [...structure.normalizationKeys, phase.normalizationKey],
      });
      if (variants.length >= MAXIMUM_NORMALIZED_DESIGN_SPEC_VARIANTS) {
        return variants;
      }
    }
  }
  return variants;
};
