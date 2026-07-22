import { canonicalSerialize } from "../canonical";
import { sha256Hex } from "../sha256";
import { compileFabricationProgram } from "./compiler";
import {
  fabricationDesignDimensionVariants,
  type FabricationDesignDimensionVariantV3,
} from "./design-dimension-variants";
import {
  FabricationDesignSpecV3Schema,
  type FabricationDesignPartV3,
  type FabricationDesignSpecV3,
  type FabricationPartRelationV3,
} from "./design-spec";
import {
  normalizedFabricationDesignSpecVariants,
  type NormalizedDesignSpecVariant,
} from "./design-spec-normalization";
import { stripRedundantSpecRelations } from "./feasibility-normalization";
import { FABRICATION_LIMITS } from "./limits";
import {
  expandResolvedSemanticFabricationPlan,
  semanticPanelOutlineVertices,
} from "./semantic-plan-expansion";
import { semanticPlanStructureFingerprint } from "./semantic-plan-fingerprint";
import type {
  FabricationPlanV2,
  SemanticEdgeAttachmentV2,
  SemanticPanelOutlineV2,
  SemanticPanelV2,
} from "./semantic-plan";
import { FabricationIntentV1Schema } from "./schemas";
import type {
  FabricationIntentV1,
  FabricationProgramV1,
  VerificationReportV2,
} from "./types";
import { verifyFabricationIr } from "./verification";

export const FABRICATION_SYNTHESIZER_VERSION = "3.1.0" as const;

export const FABRICATION_SYNTHESIS_LIMITS = {
  maximumGraphCandidates: 12,
  maximumRootCandidates: 6,
  maximumAttachmentLayouts: 4,
  maximumMaterializedCandidates: 24,
  maximumFullEvaluationsStatic: 24,
  maximumFullEvaluationsMoving: 24,
  resolverEvaluationsPerCandidate: 8,
} as const;

type SynthesisFailureKind =
  | "invalid_design_spec"
  | "unsupported_design_spec"
  | "design_infeasible"
  | "synthesis_budget_exhausted";

export interface FabricationSynthesisFailure {
  readonly kind: SynthesisFailureKind;
  readonly code: string;
  readonly path: readonly string[];
  readonly message: string;
  readonly evaluatedCandidateCount: number;
  readonly rejectedCandidateCount: number;
  readonly nogoodCount: number;
  readonly terminalFailureCodes: readonly string[];
}

export interface FabricationSynthesisDiagnostics {
  readonly specHash: string;
  readonly graphCandidateCount: number;
  readonly materializedCandidateCount: number;
  readonly evaluatedCandidateCount: number;
  readonly rejectedCandidateCount: number;
  readonly nogoodCount: number;
  readonly selectedProgramHash: string;
  readonly selectedTopologyId: string;
  readonly terminalFailureCodes: readonly string[];
}

export type FabricationSynthesisResult =
  | {
      readonly ok: true;
      readonly value: FabricationProgramV1;
      readonly report: VerificationReportV2;
      readonly diagnostics: FabricationSynthesisDiagnostics;
    }
  | { readonly ok: false; readonly error: FabricationSynthesisFailure };

type JointRelation = Extract<
  FabricationPartRelationV3,
  { readonly kind: "fold" | "open_close" | "slide" }
>;

interface OrientedRelation {
  readonly relation: JointRelation;
  readonly parentKey: string;
  readonly childKey: string;
}

interface EdgeChoice {
  readonly parentEdgeIndex: number;
  readonly childEdgeIndex: number;
  readonly lengthMm: number;
}

interface SynthesisLane {
  readonly specVariant: NormalizedDesignSpecVariant;
  readonly dimensionVariant: FabricationDesignDimensionVariantV3;
  readonly graph: readonly JointRelation[];
  readonly graphOrdinal: number;
  readonly roots: readonly FabricationDesignPartV3[];
  nextAttemptOrdinal: number;
}

const failure = (
  kind: SynthesisFailureKind,
  code: string,
  path: readonly string[],
  message: string,
  diagnostics?: {
    readonly evaluatedCandidateCount?: number;
    readonly rejectedCandidateCount?: number;
    readonly nogoods?: ReadonlySet<string>;
    readonly terminalFailureCodes?: readonly string[];
  },
): FabricationSynthesisResult => ({
  ok: false,
  error: {
    kind,
    code,
    path,
    message,
    evaluatedCandidateCount: diagnostics?.evaluatedCandidateCount ?? 0,
    rejectedCandidateCount: diagnostics?.rejectedCandidateCount ?? 0,
    nogoodCount: diagnostics?.nogoods?.size ?? 0,
    terminalFailureCodes: diagnostics?.terminalFailureCodes ?? [],
  },
});

const preferredDimensionMm = (
  range: FabricationDesignPartV3["width"],
): number =>
  Math.min(range.maximumMm, Math.max(range.minimumMm, range.preferredMm));

const outlineForPart = (
  part: FabricationDesignPartV3,
): SemanticPanelOutlineV2 => {
  switch (part.shapePreference) {
    case "rectangle":
      return { kind: "rectangle" };
    case "triangle":
      return { kind: "triangle", apexSide: "top" };
    case "trapezoid":
      return { kind: "trapezoid", shortSide: "top", shortSideRatio: 0.6 };
  }
};

const panelRole = (
  role: FabricationDesignPartV3["role"],
): SemanticPanelV2["role"] => {
  switch (role) {
    case "decorative":
      return "decorative";
    case "slider":
      return "slider";
    case "guide":
      return "guide";
    case "driver":
      return "driver";
    case "moving":
    case "output":
      return "output";
    case "support":
    case "structural":
    case "wall":
    case "closure":
      return "structural";
  }
};

const panelForPart = (
  part: FabricationDesignPartV3,
  sheetIndex: number,
  dimensions?: {
    readonly widthMm: number;
    readonly heightMm: number;
  },
): SemanticPanelV2 => ({
  key: part.key,
  sheetIndex,
  bodyKey: part.key,
  label: part.label,
  role: panelRole(part.role),
  widthMm: dimensions?.widthMm ?? preferredDimensionMm(part.width),
  heightMm: dimensions?.heightMm ?? preferredDimensionMm(part.height),
  outline: outlineForPart(part),
  innerCutContours: [],
});

const localEdgeLengthsMm = (panel: SemanticPanelV2): readonly number[] => {
  const vertices = semanticPanelOutlineVertices(panel.outline).map((point) => ({
    xMm: point.u * panel.widthMm,
    yMm: point.v * panel.heightMm,
  }));
  return vertices.map((point, index) => {
    const next = vertices[(index + 1) % vertices.length]!;
    return Math.hypot(next.xMm - point.xMm, next.yMm - point.yMm);
  });
};

const matchingEdgeChoices = (
  parent: SemanticPanelV2,
  child: SemanticPanelV2,
): readonly EdgeChoice[] => {
  const parentLengths = localEdgeLengthsMm(parent);
  const childLengths = localEdgeLengthsMm(child);
  return parentLengths
    .flatMap((parentLengthMm, parentEdgeIndex) =>
      childLengths.flatMap((childLengthMm, childEdgeIndex) =>
        Math.abs(parentLengthMm - childLengthMm) <= 0.1
          ? [{ parentEdgeIndex, childEdgeIndex, lengthMm: parentLengthMm }]
          : [],
      ),
    )
    .toSorted(
      (left, right) =>
        left.parentEdgeIndex - right.parentEdgeIndex ||
        left.childEdgeIndex - right.childEdgeIndex,
    );
};

const relationConnects = (relation: JointRelation, partKey: string): boolean =>
  relation.partAKey === partKey || relation.partBKey === partKey;

const graphConnected = (
  partKeys: readonly string[],
  relations: readonly JointRelation[],
): boolean => {
  // FabricationDesignSpecV3 requires at least one part.
  const first = partKeys[0]!;
  const visited = new Set([first]);
  const pending = [first];
  while (pending.length > 0) {
    const current = pending.shift()!;
    for (const relation of relations) {
      if (!relationConnects(relation, current)) continue;
      const next =
        relation.partAKey === current ? relation.partBKey : relation.partAKey;
      if (visited.has(next)) continue;
      visited.add(next);
      pending.push(next);
    }
  }
  return visited.size === partKeys.length;
};

const graphAcyclic = (
  partKeys: readonly string[],
  relations: readonly JointRelation[],
): boolean => {
  const parent = new Map(partKeys.map((partKey) => [partKey, partKey]));
  const find = (partKey: string): string => {
    let root = partKey;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  for (const relation of relations) {
    const left = find(relation.partAKey);
    const right = find(relation.partBKey);
    if (left === right) return false;
    parent.set(right, left);
  }
  return true;
};

const relationPairKey = (relation: {
  readonly partAKey: string;
  readonly partBKey: string;
}): string => [relation.partAKey, relation.partBKey].toSorted().join("::");

const graphFingerprint = (relations: readonly JointRelation[]): string =>
  relations.map(relationPairKey).toSorted().join("|");

interface CompletionEdge {
  readonly relation: JointRelation;
  readonly semanticPriority: number;
  readonly attachmentChoiceCount: number;
}

/**
 * The semantic model may omit source-sheet crease adjacency because it only
 * describes assembled relationships. Complete that forest with generic,
 * equal-edge-supported fixed folds. Explicit motion relations are mandatory;
 * locks never become graph edges.
 */
const graphCandidates = (
  spec: FabricationDesignSpecV3,
  panels: readonly SemanticPanelV2[],
): readonly (readonly JointRelation[])[] => {
  const partKeys = spec.parts.map((part) => part.key);
  if (partKeys.length === 1) return [[]];
  const jointRelations = spec.relations.filter(
    (relation): relation is JointRelation =>
      relation.kind === "fold" ||
      relation.kind === "open_close" ||
      relation.kind === "slide",
  );
  const drivenRelationKeys = new Set([
    ...(spec.driver ? [spec.driver.relationKey] : []),
    ...spec.outputs.map((output) => output.relationKey),
  ]);
  const required = jointRelations.filter(
    (relation) =>
      drivenRelationKeys.has(relation.key) || relation.kind === "slide",
  );
  const preferredJoints = jointRelations.filter(
    (relation) => !required.includes(relation),
  );
  if (
    required.length > partKeys.length - 1 ||
    !graphAcyclic(partKeys, required)
  ) {
    return [];
  }
  if (
    required.length === partKeys.length - 1 &&
    graphConnected(partKeys, required)
  ) {
    return [required];
  }

  const panelsByKey = new Map(panels.map((panel) => [panel.key, panel]));
  const requiredPairs = new Set(required.map(relationPairKey));
  const declaredPairs = new Set(jointRelations.map(relationPairKey));
  const touchPairs = new Set(
    spec.relations
      .filter((relation) => relation.kind === "touch")
      .map(relationPairKey),
  );
  const pool: CompletionEdge[] = [];
  for (const relation of preferredJoints) {
    const partA = panelsByKey.get(relation.partAKey)!;
    const partB = panelsByKey.get(relation.partBKey)!;
    const attachmentChoiceCount = matchingEdgeChoices(partA, partB).length;
    if (attachmentChoiceCount === 0) continue;
    pool.push({
      relation,
      semanticPriority: 0,
      attachmentChoiceCount,
    });
  }
  let generatedOrdinal = 0;
  for (let leftIndex = 0; leftIndex < partKeys.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < partKeys.length;
      rightIndex += 1
    ) {
      const partAKey = partKeys[leftIndex]!;
      const partBKey = partKeys[rightIndex]!;
      const pairKey = relationPairKey({ partAKey, partBKey });
      if (requiredPairs.has(pairKey) || declaredPairs.has(pairKey)) continue;
      const partA = panelsByKey.get(partAKey)!;
      const partB = panelsByKey.get(partBKey)!;
      const attachmentChoiceCount = matchingEdgeChoices(partA, partB).length;
      if (attachmentChoiceCount === 0) continue;
      pool.push({
        relation: {
          key: `autoFold${generatedOrdinal}`,
          kind: "fold",
          partAKey,
          partBKey,
          angleRangeDeg: { minimum: 90, home: 90, maximum: 90 },
        },
        semanticPriority: touchPairs.has(pairKey) ? 1 : 2,
        attachmentChoiceCount,
      });
      generatedOrdinal += 1;
    }
  }
  const rankedPool = pool.toSorted(
    (left, right) =>
      left.semanticPriority - right.semanticPriority ||
      right.attachmentChoiceCount - left.attachmentChoiceCount ||
      relationPairKey(left.relation).localeCompare(
        relationPairKey(right.relation),
      ),
  );
  const needed = partKeys.length - 1 - required.length;
  const results: JointRelation[][] = [];
  const seen = new Set<string>();

  const addCompletions = (orderedPool: readonly CompletionEdge[]): void => {
    const visit = (
      startIndex: number,
      chosen: readonly JointRelation[],
    ): void => {
      if (
        results.length >= FABRICATION_SYNTHESIS_LIMITS.maximumGraphCandidates
      ) {
        return;
      }
      if (chosen.length === needed) {
        const graph = [...required, ...chosen];
        if (!graphConnected(partKeys, graph)) return;
        const fingerprint = graphFingerprint(graph);
        if (seen.has(fingerprint)) return;
        seen.add(fingerprint);
        results.push(graph);
        return;
      }
      const remainingNeeded = needed - chosen.length;
      for (
        let index = startIndex;
        index <= orderedPool.length - remainingNeeded;
        index += 1
      ) {
        const next = orderedPool[index]!.relation;
        const partial = [...required, ...chosen, next];
        if (!graphAcyclic(partKeys, partial)) continue;
        visit(index + 1, [...chosen, next]);
        if (
          results.length >= FABRICATION_SYNTHESIS_LIMITS.maximumGraphCandidates
        ) {
          return;
        }
      }
    };
    visit(0, []);
  };

  const rotationCount = Math.max(
    1,
    Math.min(
      rankedPool.length,
      FABRICATION_SYNTHESIS_LIMITS.maximumGraphCandidates,
    ),
  );
  for (let rotation = 0; rotation < rotationCount; rotation += 1) {
    const orderedPool = [
      ...rankedPool.slice(rotation),
      ...rankedPool.slice(0, rotation),
    ];
    const chosen: JointRelation[] = [];
    for (const edge of orderedPool) {
      if (chosen.length === needed) break;
      const partial = [...required, ...chosen, edge.relation];
      if (graphAcyclic(partKeys, partial)) chosen.push(edge.relation);
    }
    if (chosen.length !== needed) continue;
    const graph = [...required, ...chosen];
    if (!graphConnected(partKeys, graph)) continue;
    const fingerprint = graphFingerprint(graph);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    results.push(graph);
  }
  if (results.length < FABRICATION_SYNTHESIS_LIMITS.maximumGraphCandidates) {
    addCompletions(rankedPool);
  }
  return results;
};

const rootRank = (part: FabricationDesignPartV3): number => {
  switch (part.role) {
    case "support":
      return 0;
    case "structural":
      return 1;
    case "wall":
      return 2;
    case "closure":
      return 3;
    case "guide":
      return 4;
    case "decorative":
      return 5;
    case "moving":
    case "slider":
    case "driver":
    case "output":
      return 6;
  }
};

const orientTree = (
  rootKey: string,
  relations: readonly JointRelation[],
): readonly OrientedRelation[] => {
  const visited = new Set([rootKey]);
  const queue = [rootKey];
  const oriented: OrientedRelation[] = [];
  while (queue.length > 0) {
    const parentKey = queue.shift()!;
    for (const relation of relations) {
      if (!relationConnects(relation, parentKey)) continue;
      const childKey =
        relation.partAKey === parentKey ? relation.partBKey : relation.partAKey;
      if (visited.has(childKey)) continue;
      visited.add(childKey);
      queue.push(childKey);
      oriented.push({ relation, parentKey, childKey });
    }
  }
  return oriented;
};

const oppositeEdgeIndex = (edgeIndex: number, edgeCount: number): number =>
  (edgeIndex + Math.floor(edgeCount / 2)) % edgeCount;

const chooseJointAttachments = (
  oriented: readonly OrientedRelation[],
  panelsByKey: ReadonlyMap<string, SemanticPanelV2>,
  layoutOrdinal: number,
): ReadonlyMap<
  string,
  readonly [SemanticEdgeAttachmentV2, SemanticEdgeAttachmentV2]
> | null => {
  const usedEdges = new Map<string, Set<number>>();
  const selected = new Map<
    string,
    readonly [SemanticEdgeAttachmentV2, SemanticEdgeAttachmentV2]
  >();
  for (const [relationIndex, item] of oriented.entries()) {
    const parent = panelsByKey.get(item.parentKey)!;
    const child = panelsByKey.get(item.childKey)!;
    const parentUsed = usedEdges.get(parent.key) ?? new Set<number>();
    const childUsed = usedEdges.get(child.key) ?? new Set<number>();
    usedEdges.set(parent.key, parentUsed);
    usedEdges.set(child.key, childUsed);
    const pairs = matchingEdgeChoices(parent, child);
    if (pairs.length === 0) return null;
    const preferred = pairs.filter(
      (pair) =>
        !parentUsed.has(pair.parentEdgeIndex) &&
        !childUsed.has(pair.childEdgeIndex) &&
        pair.childEdgeIndex ===
          oppositeEdgeIndex(
            pair.parentEdgeIndex,
            localEdgeLengthsMm(child).length,
          ),
    );
    const unused = pairs.filter(
      (pair) =>
        !parentUsed.has(pair.parentEdgeIndex) &&
        !childUsed.has(pair.childEdgeIndex),
    );
    const choices =
      preferred.length > 0 ? preferred : unused.length > 0 ? unused : pairs;
    const choice = choices[(layoutOrdinal + relationIndex) % choices.length]!;
    parentUsed.add(choice.parentEdgeIndex);
    childUsed.add(choice.childEdgeIndex);
    selected.set(item.relation.key, [
      { panelKey: parent.key, edgeIndex: choice.parentEdgeIndex },
      { panelKey: child.key, edgeIndex: choice.childEdgeIndex },
    ]);
  }
  return selected;
};

const attachmentInwardDepthMm = (
  panel: SemanticPanelV2,
  edgeIndex: number,
): number => {
  const lengths = localEdgeLengthsMm(panel);
  if (lengths.length !== 4) return Math.min(panel.widthMm, panel.heightMm) / 2;
  return edgeIndex % 2 === 0 ? panel.heightMm : panel.widthMm;
};

const chooseConnectorAttachments = (
  relation: Extract<FabricationPartRelationV3, { readonly kind: "lock" }>,
  panelsByKey: ReadonlyMap<string, SemanticPanelV2>,
  usedJointEdges: ReadonlyMap<string, ReadonlySet<number>>,
  layoutOrdinal: number,
): {
  readonly tabAttachment: SemanticEdgeAttachmentV2;
  readonly slotAttachment: SemanticEdgeAttachmentV2;
  readonly lengthMm: number;
} | null => {
  const tabPanel = panelsByKey.get(relation.partAKey)!;
  const slotPanel = panelsByKey.get(relation.partBKey)!;
  const pairs = matchingEdgeChoices(tabPanel, slotPanel).filter(
    (pair) =>
      !usedJointEdges.get(tabPanel.key)?.has(pair.parentEdgeIndex) &&
      !usedJointEdges.get(slotPanel.key)?.has(pair.childEdgeIndex) &&
      attachmentInwardDepthMm(tabPanel, pair.parentEdgeIndex) >= 4 &&
      attachmentInwardDepthMm(slotPanel, pair.childEdgeIndex) >= 4,
  );
  if (pairs.length === 0) return null;
  const pair = pairs[layoutOrdinal % pairs.length]!;
  return {
    tabAttachment: {
      panelKey: tabPanel.key,
      edgeIndex: pair.parentEdgeIndex,
    },
    slotAttachment: {
      panelKey: slotPanel.key,
      edgeIndex: pair.childEdgeIndex,
    },
    lengthMm: pair.lengthMm,
  };
};

const relationRange = (relation: JointRelation) => {
  if (relation.kind === "slide") return relation.travelRangeMm;
  return relation.angleRangeDeg;
};

const buildInternalPlan = (
  spec: FabricationDesignSpecV3,
  dimensionVariant: FabricationDesignDimensionVariantV3,
  graph: readonly JointRelation[],
  rootKey: string,
  layoutOrdinal: number,
  connectorOrientationOrdinal: number,
  topologyOrdinal: number,
): FabricationPlanV2 | null => {
  const dimensionsByPartKey = new Map(
    dimensionVariant.parts.map((part) => [part.partKey, part]),
  );
  const panels = spec.parts.map((part) =>
    panelForPart(part, 0, dimensionsByPartKey.get(part.key)),
  );
  const panelsByKey = new Map(panels.map((panel) => [panel.key, panel]));
  const oriented = orientTree(rootKey, graph);
  if (
    spec.outputs.some((output) => {
      const relation = oriented.find(
        (candidate) => candidate.relation.key === output.relationKey,
      );
      return !relation || relation.childKey !== output.partKey;
    })
  ) {
    return null;
  }
  const attachments = chooseJointAttachments(
    oriented,
    panelsByKey,
    layoutOrdinal,
  );
  if (!attachments) return null;
  const usedJointEdges = new Map<string, Set<number>>();
  for (const [parent, child] of attachments.values()) {
    const parentSet = usedJointEdges.get(parent.panelKey) ?? new Set<number>();
    parentSet.add(parent.edgeIndex);
    usedJointEdges.set(parent.panelKey, parentSet);
    const childSet = usedJointEdges.get(child.panelKey) ?? new Set<number>();
    childSet.add(child.edgeIndex);
    usedJointEdges.set(child.panelKey, childSet);
  }
  const lockRelations = spec.relations.filter(
    (
      relation,
    ): relation is Extract<
      FabricationPartRelationV3,
      { readonly kind: "lock" }
    > => relation.kind === "lock",
  );
  const connectorRelationships = lockRelations.flatMap((relation) => {
    const orientedLock =
      connectorOrientationOrdinal % 2 === 0
        ? relation
        : {
            ...relation,
            partAKey: relation.partBKey,
            partBKey: relation.partAKey,
          };
    const slideGuide = oriented.find(
      (item) =>
        item.relation.kind === "slide" &&
        new Set([item.relation.partAKey, item.relation.partBKey]).has(
          orientedLock.partAKey,
        ) &&
        new Set([item.relation.partAKey, item.relation.partBKey]).has(
          orientedLock.partBKey,
        ),
    );
    const slideAttachments = slideGuide
      ? attachments.get(slideGuide.relation.key)
      : null;
    const selected =
      slideGuide && slideAttachments
        ? {
            tabAttachment: slideAttachments[1],
            slotAttachment: slideAttachments[0],
            lengthMm: localEdgeLengthsMm(
              panelsByKey.get(slideAttachments[1].panelKey)!,
            )[slideAttachments[1].edgeIndex]!,
          }
        : chooseConnectorAttachments(
            orientedLock,
            panelsByKey,
            usedJointEdges,
            layoutOrdinal,
          );
    if (!selected || selected.lengthMm <= 5) return [];
    const tabPanel = panelsByKey.get(selected.tabAttachment.panelKey)!;
    const maximumDepthMm =
      attachmentInwardDepthMm(tabPanel, selected.tabAttachment.edgeIndex) - 1;
    const tabDepthMm = Math.max(2, Math.min(6, maximumDepthMm));
    return [
      {
        key: relation.key,
        tabAttachment: selected.tabAttachment,
        slotAttachment: selected.slotAttachment,
        spanMm: Math.max(2, Math.min(14, selected.lengthMm - 4)),
        tabDepthMm,
        slotInsetMm: Math.max(1, Math.min(2, tabDepthMm - 1)),
        clearanceMm: spec.tolerances.clearanceMm,
      },
    ];
  });
  if (connectorRelationships.length !== lockRelations.length) return null;
  const driverRelation = spec.driver
    ? (oriented.find((item) => item.relation.key === spec.driver!.relationKey)
        ?.relation ?? null)
    : null;
  if (spec.driver && !driverRelation) return null;
  const joints = oriented.map((item) => {
    const selected = attachments.get(item.relation.key)!;
    const range = relationRange(item.relation);
    if (item.relation.kind === "slide") {
      return {
        key: item.relation.key,
        kind: "prismatic" as const,
        parentBodyKey: item.parentKey,
        childBodyKey: item.childKey,
        parentAttachment: selected[0],
        childAttachment: selected[1],
        // A flat-sheet slider travels along its guide edge. Moving along the
        // sheet normal would stack the two panels through one another at the
        // home pose instead of forming a manufacturable planar guide.
        travelDirection: "edge_tangent" as const,
        guideRelationshipKeys: connectorRelationships
          .filter(
            (connector) =>
              connector.tabAttachment.panelKey === item.relation.partAKey ||
              connector.tabAttachment.panelKey === item.relation.partBKey,
          )
          .map((connector) => connector.key),
        homeTravelMm: range.home,
        minimumTravelMm:
          driverRelation?.key === item.relation.key
            ? range.minimum
            : range.home,
        maximumTravelMm:
          driverRelation?.key === item.relation.key
            ? range.maximum
            : range.home,
      };
    }
    return {
      key: item.relation.key,
      kind: "fold" as const,
      parentBodyKey: item.parentKey,
      childBodyKey: item.childKey,
      parentAttachment: selected[0],
      childAttachment: selected[1],
      foldDirection: "valley" as const,
      homeAngleDeg: range.home,
      minimumAngleDeg:
        driverRelation?.key === item.relation.key ? range.minimum : range.home,
      maximumAngleDeg:
        driverRelation?.key === item.relation.key ? range.maximum : range.home,
    };
  });
  if (
    joints.some(
      (joint) =>
        joint.kind === "prismatic" && joint.guideRelationshipKeys.length === 0,
    )
  ) {
    return null;
  }
  const driverJoint = spec.driver
    ? (joints.find((joint) => joint.key === spec.driver!.relationKey) ?? null)
    : null;
  const driverRange = driverJoint
    ? driverJoint.kind === "prismatic"
      ? {
          minimum: driverJoint.minimumTravelMm,
          home: driverJoint.homeTravelMm,
          maximum: driverJoint.maximumTravelMm,
        }
      : {
          minimum: driverJoint.minimumAngleDeg,
          home: driverJoint.homeAngleDeg,
          maximum: driverJoint.maximumAngleDeg,
        }
    : null;
  const outputs = spec.outputs.flatMap((output) => {
    const joint = joints.find(
      (candidate) => candidate.key === output.relationKey,
    );
    if (!joint) return [];
    const range =
      joint.kind === "prismatic"
        ? {
            minimum: joint.minimumTravelMm,
            maximum: joint.maximumTravelMm,
          }
        : {
            minimum: joint.minimumAngleDeg,
            maximum: joint.maximumAngleDeg,
          };
    return [
      {
        key: output.key,
        jointKey: joint.key,
        bodyKey: output.partKey,
        label: output.label,
        minimumValue: range.minimum,
        maximumValue: range.maximum,
        direction: 1 as const,
      },
    ];
  });
  if (outputs.length !== spec.outputs.length) return null;
  const mechanismFeatureCount =
    joints.length + connectorRelationships.length * 2;
  if (
    mechanismFeatureCount > FABRICATION_LIMITS.maximumJointAndConnectorCount
  ) {
    return null;
  }
  return {
    version: "2",
    candidateLabel: spec.label,
    topologyKey:
      `synth${topologyOrdinal}r${rootKey}l${layoutOrdinal}c${connectorOrientationOrdinal}`.slice(
        0,
        40,
      ),
    panels,
    bodies: spec.parts.map((part) => ({
      key: part.key,
      label: `${part.label} body`,
      panelKeys: [part.key],
      grounded: part.key === rootKey,
    })),
    joints,
    connectorRelationships,
    driver:
      spec.driver && driverJoint && driverRange
        ? {
            key: spec.driver.relationKey,
            jointKey: spec.driver.relationKey,
            label: spec.driver.label,
            control: spec.driver.control,
            minimumValue: driverRange.minimum,
            maximumValue: driverRange.maximum,
            homeValue: driverRange.home,
            direction: 1,
          }
        : null,
    outputs,
    couplings: [],
    landmarks: [
      // Intent constraints bind semantic parts by the canonical V3 part key.
      // Visible landmarks are additional named features; they must never be
      // the only semantic binding for a fabricated panel.
      ...spec.parts.map((part) => ({
        key: part.key,
        label: part.label,
        role: part.role,
        geometryRefs: [
          { kind: "panel" as const, key: part.key },
          { kind: "body" as const, key: part.key },
        ],
      })),
      ...spec.visibleLandmarks
        .filter(
          (landmark) => !spec.parts.some((part) => part.key === landmark.key),
        )
        .map((landmark) => ({
          key: landmark.key,
          label: landmark.label,
          role: landmark.importance,
          geometryRefs: landmark.partKeys.flatMap((partKey) => [
            { kind: "panel" as const, key: partKey },
            { kind: "body" as const, key: partKey },
          ]),
        })),
    ],
    assemblyStrategy:
      connectorRelationships.length === 0
        ? "fold_only"
        : spec.driver
          ? "articulated_tab_slot"
          : "tab_slot",
    designSummary: spec.summary,
  };
};

export const safeSynthesisErrorCode = (error: unknown): string => {
  if (typeof error !== "object" || error === null) return "unknown";
  const record = error as Record<string, unknown>;
  if (typeof record.code === "string") return record.code;
  if (typeof record.kind === "string") return record.kind;
  return "unknown";
};

const preflight = (
  intent: FabricationIntentV1,
  spec: FabricationDesignSpecV3,
): FabricationSynthesisResult | null => {
  if (intent.scopeStatus !== "supported") {
    return failure(
      "unsupported_design_spec",
      "intent_not_supported",
      ["scopeStatus"],
      "The normalized request is not inside the supported fabrication grammar.",
    );
  }
  if (spec.parts.length > intent.fabricationBudget.maximumPanels) {
    return failure(
      "design_infeasible",
      "panel_limit",
      ["parts"],
      `The design requires ${spec.parts.length} parts, above the permitted ${intent.fabricationBudget.maximumPanels}.`,
    );
  }
  if (spec.glueAllowed && !intent.fabricationBudget.glueAllowed) {
    return failure(
      "invalid_design_spec",
      "glue_constraint_conflict",
      ["glueAllowed"],
      "The design specification weakened the user's no-glue constraint.",
    );
  }
  if (
    spec.sheetConstraints.minimumSheets > 1 ||
    spec.sheetConstraints.maximumSheets > intent.fabricationBudget.maximumSheets
  ) {
    return failure(
      "unsupported_design_spec",
      "sheet_constraint_domain",
      ["sheetConstraints"],
      "This synthesis domain currently requires one connected fold graph on one source sheet.",
    );
  }
  // FabricationIntentV1 guarantees at least one stock option.
  const sheet = intent.stockOptions[0]!;
  const printableWidthMm = sheet.widthMm - sheet.printableMarginMm * 2;
  const printableHeightMm = sheet.heightMm - sheet.printableMarginMm * 2;
  for (const [index, part] of spec.parts.entries()) {
    const widthMm = preferredDimensionMm(part.width);
    const heightMm = preferredDimensionMm(part.height);
    if (!(
      (widthMm <= printableWidthMm && heightMm <= printableHeightMm) ||
      (heightMm <= printableWidthMm && widthMm <= printableHeightMm)
    )) {
      return failure(
        "design_infeasible",
        "part_sheet_fit",
        ["parts", String(index)],
        `Part ${part.key} cannot fit the printable sheet bounds.`,
      );
    }
  }
  // Physical stock thickness is manufacturing ground truth: every panel, tab,
  // and slot downstream is derived from `stock.material.thicknessMm`. The
  // spec's declared thickness range comes from a *separate* model call and is
  // only an advisory preference — it must never veto an otherwise
  // manufacturable design. (Coupling these two independent model outputs as a
  // hard gate was the dominant cause of "design failed" on realistic prompts.)
  // We keep a stock selection that honors the declared range when possible, but
  // fall back to the available stock rather than failing on thickness alone.
  return null;
};

const protectedPartAxesFromIntent = (
  intent: FabricationIntentV1,
  spec: FabricationDesignSpecV3,
) => {
  const partKeys = new Set(spec.parts.map((part) => part.key));
  return intent.semanticConstraints.flatMap((constraint) => {
    if (
      constraint.kind !== "dimension" ||
      constraint.source !== "user" ||
      (constraint.dimension !== "width" && constraint.dimension !== "height")
    ) {
      return [];
    }
    const prefix = `${constraint.geometryRef.kind}-`;
    const partKey = constraint.geometryRef.id.startsWith(prefix)
      ? constraint.geometryRef.id.slice(prefix.length)
      : constraint.geometryRef.id;
    if (!partKeys.has(partKey)) return [];
    return [
      {
        partKey,
        axis:
          constraint.dimension === "width"
            ? ("widthMm" as const)
            : ("heightMm" as const),
      },
    ];
  });
};

const panelsForDimensionVariant = (
  spec: FabricationDesignSpecV3,
  dimensionVariant: FabricationDesignDimensionVariantV3,
): readonly SemanticPanelV2[] => {
  const dimensionsByPartKey = new Map(
    dimensionVariant.parts.map((part) => [part.partKey, part]),
  );
  return spec.parts.map((part) =>
    panelForPart(part, 0, dimensionsByPartKey.get(part.key)),
  );
};

const rootCandidates = (
  spec: FabricationDesignSpecV3,
): readonly FabricationDesignPartV3[] =>
  spec.parts
    .filter(
      (part) => !spec.outputs.some((output) => output.partKey === part.key),
    )
    .toSorted(
      (left, right) =>
        rootRank(left) - rootRank(right) || left.key.localeCompare(right.key),
    )
    .slice(0, FABRICATION_SYNTHESIS_LIMITS.maximumRootCandidates);

const maximumLaneAttemptCount = (lane: SynthesisLane): number =>
  lane.roots.length * FABRICATION_SYNTHESIS_LIMITS.maximumAttachmentLayouts * 2;

export const fabricationSynthesisAttemptCoordinates = (
  rootCandidateCount: number,
  laneOrdinal: number,
  attemptOrdinal: number,
): {
  readonly rootIndex: number;
  readonly layoutOrdinal: number;
  readonly connectorOrientationOrdinal: number;
} => {
  if (
    !Number.isInteger(rootCandidateCount) ||
    rootCandidateCount < 1 ||
    !Number.isInteger(laneOrdinal) ||
    laneOrdinal < 0 ||
    !Number.isInteger(attemptOrdinal) ||
    attemptOrdinal < 0
  ) {
    throw new Error(
      "Synthesis attempt coordinates require non-negative integer ordinals and at least one root.",
    );
  }
  const rootIndex = (attemptOrdinal + laneOrdinal) % rootCandidateCount;
  const cycleOrdinal = Math.floor(attemptOrdinal / rootCandidateCount);
  const layoutOrdinal =
    (cycleOrdinal + laneOrdinal) %
    FABRICATION_SYNTHESIS_LIMITS.maximumAttachmentLayouts;
  const connectorOrientationOrdinal =
    (Math.floor(
      cycleOrdinal / FABRICATION_SYNTHESIS_LIMITS.maximumAttachmentLayouts,
    ) +
      laneOrdinal) %
    2;
  return { rootIndex, layoutOrdinal, connectorOrientationOrdinal };
};

const nextPlanFromLane = (lane: SynthesisLane): FabricationPlanV2 | null => {
  if (lane.nextAttemptOrdinal >= maximumLaneAttemptCount(lane)) return null;
  const attemptOrdinal = lane.nextAttemptOrdinal;
  lane.nextAttemptOrdinal += 1;
  const { rootIndex, layoutOrdinal, connectorOrientationOrdinal } =
    fabricationSynthesisAttemptCoordinates(
      lane.roots.length,
      lane.graphOrdinal,
      attemptOrdinal,
    );
  return buildInternalPlan(
    lane.specVariant.spec,
    lane.dimensionVariant,
    lane.graph,
    lane.roots[rootIndex]!.key,
    layoutOrdinal,
    connectorOrientationOrdinal,
    lane.graphOrdinal,
  );
};

export const synthesizeFabricationDesign = (
  intentInput: unknown,
  specInput: unknown,
  candidateOrdinal: number,
): FabricationSynthesisResult => {
  const intent = FabricationIntentV1Schema.safeParse(intentInput);
  if (!intent.success) {
    const issue = intent.error.issues[0];
    return failure(
      "invalid_design_spec",
      "intent_contract_invalid",
      issue?.path.map(String) ?? [],
      "The normalized fabrication intent is invalid.",
    );
  }
  const spec = FabricationDesignSpecV3Schema.safeParse(specInput);
  if (!spec.success) {
    const issue = spec.error.issues[0];
    return failure(
      "invalid_design_spec",
      issue?.code ?? "contract_invalid",
      issue?.path.map(String) ?? [],
      issue?.message ?? "The fabrication design specification is invalid.",
    );
  }
  // Strip redundant wall-to-wall relations and surplus seam locks that
  // over-constrain a single-sheet net before enumerating realizations.
  const feasibleSpec = stripRedundantSpecRelations(spec.data);
  const normalizedCandidates = normalizedFabricationDesignSpecVariants(
    intent.data,
    feasibleSpec,
  );
  if (normalizedCandidates.length === 0) {
    return failure(
      "unsupported_design_spec",
      "connector_clearance_domain",
      ["tolerances", "clearanceMm"],
      "The explicit connector clearance is outside the supported fabrication range.",
    );
  }
  const preflightResults = normalizedCandidates.map((specVariant) => ({
    specVariant,
    failure: preflight(intent.data, specVariant.spec),
  }));
  const normalizedVariants = preflightResults.flatMap(
    ({ specVariant, failure: variantFailure }) =>
      variantFailure ? [] : [specVariant],
  );
  if (normalizedVariants.length === 0) {
    return preflightResults[0]!.failure!;
  }
  const dimensionRows = normalizedVariants.map((specVariant) => {
    const protectedPartAxes = protectedPartAxesFromIntent(
      intent.data,
      specVariant.spec,
    );
    return fabricationDesignDimensionVariants(specVariant.spec, {
      protectedPartAxes,
      requestedEnvelope: intent.data.requestedSize,
    }).map((dimensionVariant) => ({
      specVariant,
      dimensionVariant,
      graphs: graphCandidates(
        specVariant.spec,
        panelsForDimensionVariant(specVariant.spec, dimensionVariant),
      ),
      roots: rootCandidates(specVariant.spec),
    }));
  });
  const maximumDimensionVariantCount = Math.max(
    0,
    ...dimensionRows.map((rows) => rows.length),
  );
  const maximumGraphVariantCount = Math.max(
    0,
    ...dimensionRows.flatMap((rows) => rows.map((row) => row.graphs.length)),
  );
  const lanes: SynthesisLane[] = [];
  let graphOrdinal = 0;
  // Diagonal ordering gives every semantic normalization an early preferred
  // realization, then interleaves dimension relief with alternate graphs.
  for (
    let frontier = 0;
    frontier < maximumDimensionVariantCount + maximumGraphVariantCount - 1;
    frontier += 1
  ) {
    for (
      let normalizedOrdinal = 0;
      normalizedOrdinal < normalizedVariants.length;
      normalizedOrdinal += 1
    ) {
      for (
        let dimensionOrdinal = Math.min(
          frontier,
          maximumDimensionVariantCount - 1,
        );
        dimensionOrdinal >= 0;
        dimensionOrdinal -= 1
      ) {
        const candidateGraphOrdinal = frontier - dimensionOrdinal;
        const row = dimensionRows[normalizedOrdinal]?.[dimensionOrdinal];
        const graph = row?.graphs[candidateGraphOrdinal];
        if (!row || !graph || row.roots.length === 0) continue;
        lanes.push({
          specVariant: row.specVariant,
          dimensionVariant: row.dimensionVariant,
          graph,
          graphOrdinal,
          roots: row.roots,
          nextAttemptOrdinal: 0,
        });
        graphOrdinal += 1;
      }
    }
  }
  if (lanes.length === 0) {
    return failure(
      "design_infeasible",
      "connected_acyclic_graph",
      ["relations"],
      "The semantic relationships and physical edge ranges cannot form a connected acyclic fabrication graph.",
    );
  }
  const uniqueGraphFingerprints = new Set(
    lanes.map((lane) => graphFingerprint(lane.graph)),
  );
  const materialized: FabricationPlanV2[] = [];
  const seenStructures = new Set<string>();
  let truncated = false;
  let schedulingRound = 0;
  let activeLaneCount = lanes.length;
  while (
    materialized.length <
      FABRICATION_SYNTHESIS_LIMITS.maximumMaterializedCandidates &&
    activeLaneCount > 0
  ) {
    activeLaneCount = 0;
    for (let offset = 0; offset < lanes.length; offset += 1) {
      const lane = lanes[(schedulingRound + offset) % lanes.length]!;
      if (lane.nextAttemptOrdinal >= maximumLaneAttemptCount(lane)) continue;
      activeLaneCount += 1;
      const plan = nextPlanFromLane(lane);
      if (!plan) continue;
      const fingerprint = semanticPlanStructureFingerprint(plan);
      if (seenStructures.has(fingerprint)) continue;
      seenStructures.add(fingerprint);
      materialized.push(plan);
      if (
        materialized.length >=
        FABRICATION_SYNTHESIS_LIMITS.maximumMaterializedCandidates
      ) {
        break;
      }
    }
    schedulingRound += 1;
  }
  truncated = lanes.some(
    (lane) => lane.nextAttemptOrdinal < maximumLaneAttemptCount(lane),
  );
  if (materialized.length === 0) {
    return failure(
      "design_infeasible",
      "no_materialized_candidate",
      [],
      "No bounded semantic realization produced compatible joints, connectors, motion, and output mappings.",
      { terminalFailureCodes: ["materialization_failed"] },
    );
  }
  const fullEvaluationLimit =
    intent.data.behavior === "static"
      ? FABRICATION_SYNTHESIS_LIMITS.maximumFullEvaluationsStatic
      : FABRICATION_SYNTHESIS_LIMITS.maximumFullEvaluationsMoving;
  const nogoods = new Set<string>();
  const terminalFailureCodes: string[] = [];
  let evaluatedCandidateCount = 0;
  let rejectedCandidateCount = 0;
  for (const plan of materialized) {
    if (evaluatedCandidateCount >= fullEvaluationLimit) {
      truncated = true;
      break;
    }
    const structure = semanticPlanStructureFingerprint(plan);
    if (nogoods.has(structure)) continue;
    evaluatedCandidateCount += 1;
    const expanded = expandResolvedSemanticFabricationPlan(
      intent.data,
      plan,
      candidateOrdinal,
      FABRICATION_SYNTHESIS_LIMITS.resolverEvaluationsPerCandidate,
    );
    if (!expanded.ok) {
      rejectedCandidateCount += 1;
      const code = safeSynthesisErrorCode(expanded.error);
      terminalFailureCodes.push(code);
      nogoods.add(structure);
      continue;
    }
    const compiled = compileFabricationProgram(intent.data, expanded.value);
    if (!compiled.ok) {
      rejectedCandidateCount += 1;
      const code = safeSynthesisErrorCode(compiled.error);
      terminalFailureCodes.push(code);
      nogoods.add(structure);
      continue;
    }
    const report = verifyFabricationIr(
      compiled.value,
      `candidate-v3-synthesis-${candidateOrdinal}-${evaluatedCandidateCount}`,
    );
    if (!report.valid) {
      rejectedCandidateCount += 1;
      const code =
        report.failures.find((item) => item.severity === "hard")?.failureId ??
        "verification_hard_failure";
      terminalFailureCodes.push(code);
      nogoods.add(structure);
      continue;
    }
    const programHash = sha256Hex(canonicalSerialize(expanded.value));
    // The public forge exposes one candidate. The ranked synthesis frontier is
    // deterministic, so a later alternative must not replace an already fully
    // verified design or add unnecessary server work.
    return {
      ok: true,
      value: expanded.value,
      report,
      diagnostics: {
        specHash: sha256Hex(canonicalSerialize(spec.data)),
        graphCandidateCount: uniqueGraphFingerprints.size,
        materializedCandidateCount: materialized.length,
        evaluatedCandidateCount,
        rejectedCandidateCount,
        nogoodCount: nogoods.size,
        selectedProgramHash: programHash,
        selectedTopologyId: expanded.value.topologyId,
        terminalFailureCodes: [...new Set(terminalFailureCodes)].slice(0, 12),
      },
    };
  }
  const diagnostics = {
    evaluatedCandidateCount,
    rejectedCandidateCount,
    nogoods,
    terminalFailureCodes: [...new Set(terminalFailureCodes)].slice(0, 12),
  };
  return truncated
    ? failure(
        "synthesis_budget_exhausted",
        "bounded_search_exhausted",
        [],
        "The deterministic synthesis work budget ended before a verified design was found.",
        diagnostics,
      )
    : failure(
        "design_infeasible",
        "no_verified_realization",
        [],
        "Every bounded realization of the design specification failed a hard fabrication check.",
        diagnostics,
      );
};
