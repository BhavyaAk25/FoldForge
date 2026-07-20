import { canonicalSerialize } from "../canonical";
import { compileFabricationProgram, type CompilationError } from "./compiler";
import { decomposeRigidMatrix4, rotationAroundAxisMatrix4 } from "./matrix";
import { connectorReferencePoint2 } from "./connector-geometry";
import {
  isSimplePolygon,
  pointInPolygon,
  signedPolygonAreaMm2,
  transformPoint2,
} from "./polygon";
import { FabricationIntentV1Schema } from "./schemas";
import {
  expandFabricationPlan,
  type FabricationPlanExpansionError,
} from "./planning";
import { semanticPlanResourceCounts } from "./resource-counts";
import type { FabricationLimitError } from "./result";
import {
  FabricationPlanV2Schema,
  type FabricationPlanV2,
  type SemanticEdgeAttachmentV2,
  type SemanticPanelOutlineV2,
  type SemanticPanelV2,
} from "./semantic-plan";
import { buildDirectedBodyTopology } from "./topology";
import type {
  ConnectorV1,
  CouplingV1,
  FabricationIntentV1,
  FabricationPlanV1,
  FabricationProgramV1,
  GeometryRefV1,
  JointV1,
  NormalizedPolygonContourV1,
  PlannedPanelBlueprintV1,
  Point2Mm,
  SemanticPartV1,
  Transform2Mm,
  Transform3Mm,
  VerificationReportV2,
} from "./types";
import { verificationStageOrder, verifyFabricationIr } from "./verification";

const LAYOUT_GAP_MM = 2;
const EDGE_LENGTH_TOLERANCE_MM = 0.1;
const IDENTITY_TRANSFORM_3D: Transform3Mm = {
  translationMm: { xMm: 0, yMm: 0, zMm: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
};

export interface SemanticPlanMappingError {
  readonly kind: "semantic_plan_mapping";
  readonly code:
    | "contract_invalid"
    | "duplicate_reference"
    | "invalid_reference"
    | "ambiguous_ground"
    | "invalid_edge"
    | "edge_length_mismatch"
    | "invalid_outline"
    | "invalid_motion"
    | "unsupported_mapping"
    | "packing_failed";
  readonly path: readonly string[];
  readonly message: string;
}

export type SemanticPlanExpansionError =
  SemanticPlanMappingError | FabricationLimitError;

export type SemanticPlanMappingResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: SemanticPlanExpansionError };

const mappingError = (
  code: SemanticPlanMappingError["code"],
  path: readonly string[],
  message: string,
): SemanticPlanMappingResult<never> => ({
  ok: false,
  error: { kind: "semantic_plan_mapping", code, path, message },
});

const planLimitError = (
  limit: string,
  actual: number,
  maximum: number,
): SemanticPlanMappingResult<never> => ({
  ok: false,
  error: { kind: "limit_exceeded", limit, actual, maximum },
});

const canonicalId = (
  kind: "panel" | "body" | "joint" | "driver" | "output" | "coupling" | "part",
  key: string,
): string => `${kind}-${key}`;

const relationshipConnectorIds = (relationshipKey: string) => ({
  tab: `connector-${relationshipKey}-tab`,
  slot: `connector-${relationshipKey}-slot`,
});

const outlineVertices = (
  outline: SemanticPanelOutlineV2,
): readonly { readonly u: number; readonly v: number }[] => {
  switch (outline.kind) {
    case "rectangle":
      return [
        { u: 0, v: 0 },
        { u: 1, v: 0 },
        { u: 1, v: 1 },
        { u: 0, v: 1 },
      ];
    case "triangle":
      switch (outline.apexSide) {
        case "top":
          return [
            { u: 0.5, v: 0 },
            { u: 1, v: 1 },
            { u: 0, v: 1 },
          ];
        case "right":
          return [
            { u: 0, v: 0 },
            { u: 1, v: 0.5 },
            { u: 0, v: 1 },
          ];
        case "bottom":
          return [
            { u: 0, v: 0 },
            { u: 1, v: 0 },
            { u: 0.5, v: 1 },
          ];
        case "left":
          return [
            { u: 0, v: 0.5 },
            { u: 1, v: 0 },
            { u: 1, v: 1 },
          ];
      }
    case "trapezoid": {
      const inset = (1 - outline.shortSideRatio) / 2;
      switch (outline.shortSide) {
        case "top":
          return [
            { u: inset, v: 0 },
            { u: 1 - inset, v: 0 },
            { u: 1, v: 1 },
            { u: 0, v: 1 },
          ];
        case "right":
          return [
            { u: 0, v: 0 },
            { u: 1, v: inset },
            { u: 1, v: 1 - inset },
            { u: 0, v: 1 },
          ];
        case "bottom":
          return [
            { u: 0, v: 0 },
            { u: 1, v: 0 },
            { u: 1 - inset, v: 1 },
            { u: inset, v: 1 },
          ];
        case "left":
          return [
            { u: 0, v: inset },
            { u: 1, v: 0 },
            { u: 1, v: 1 },
            { u: 0, v: 1 - inset },
          ];
      }
    }
    case "polygon":
      return outline.vertices;
  }
};

interface PanelGeometry {
  readonly semantic: SemanticPanelV2;
  readonly contour: NormalizedPolygonContourV1;
  readonly localVertices: readonly Point2Mm[];
}

interface Edge2Mm {
  readonly start: Point2Mm;
  readonly end: Point2Mm;
}

const panelGeometry = (
  panel: SemanticPanelV2,
): SemanticPlanMappingResult<PanelGeometry> => {
  const contour = { vertices: outlineVertices(panel.outline) };
  const localVertices = contour.vertices.map((point) => ({
    xMm: point.u * panel.widthMm,
    yMm: point.v * panel.heightMm,
  }));
  if (
    !isSimplePolygon(localVertices) ||
    Math.abs(signedPolygonAreaMm2(localVertices)) < 1
  ) {
    return mappingError(
      "invalid_outline",
      ["panels", panel.key, "outline"],
      `Panel ${panel.key} must have one nondegenerate simple local outline.`,
    );
  }
  for (const [index, innerCut] of panel.innerCutContours.entries()) {
    const vertices = innerCut.vertices.map((point) => ({
      xMm: point.u * panel.widthMm,
      yMm: point.v * panel.heightMm,
    }));
    if (
      !isSimplePolygon(vertices) ||
      vertices.some((point) => !pointInPolygon(point, localVertices, false))
    ) {
      return mappingError(
        "invalid_outline",
        ["panels", panel.key, "innerCutContours", String(index)],
        `Inner cut ${index} of panel ${panel.key} must be simple and strictly inside the panel.`,
      );
    }
  }
  return { ok: true, value: { semantic: panel, contour, localVertices } };
};

const edgeFor = (
  geometry: PanelGeometry,
  edgeIndex: number,
): SemanticPlanMappingResult<Edge2Mm> => {
  const start = geometry.localVertices[edgeIndex];
  const end =
    geometry.localVertices[(edgeIndex + 1) % geometry.localVertices.length];
  if (!start || !end) {
    return mappingError(
      "invalid_edge",
      ["panels", geometry.semantic.key, "edgeIndex"],
      `Panel ${geometry.semantic.key} has no edge ${edgeIndex}.`,
    );
  }
  const edge = { start, end };
  return edgeLengthMm(edge) >= 1
    ? { ok: true, value: edge }
    : mappingError(
        "invalid_edge",
        ["panels", geometry.semantic.key, "edgeIndex"],
        `Panel ${geometry.semantic.key} edge ${edgeIndex} is shorter than 1 mm.`,
      );
};

const edgeLengthMm = (edge: Edge2Mm): number =>
  Math.hypot(edge.end.xMm - edge.start.xMm, edge.end.yMm - edge.start.yMm);

const transformFromAlignedEdges = (
  child: Edge2Mm,
  parent: Edge2Mm,
): Transform2Mm => {
  const childAngle = Math.atan2(
    child.end.yMm - child.start.yMm,
    child.end.xMm - child.start.xMm,
  );
  const targetAngle = Math.atan2(
    parent.start.yMm - parent.end.yMm,
    parent.start.xMm - parent.end.xMm,
  );
  const rotationDeg = ((targetAngle - childAngle) * 180) / Math.PI;
  const rotatedStart = transformPoint2(child.start, {
    translationMm: { xMm: 0, yMm: 0 },
    rotationDeg,
  });
  return {
    translationMm: {
      xMm: parent.end.xMm - rotatedStart.xMm,
      yMm: parent.end.yMm - rotatedStart.yMm,
    },
    rotationDeg,
  };
};

const transformedEdge = (edge: Edge2Mm, transform: Transform2Mm): Edge2Mm => ({
  start: transformPoint2(edge.start, transform),
  end: transformPoint2(edge.end, transform),
});

interface PackedPanels {
  readonly transformsByPanelKey: ReadonlyMap<string, Transform2Mm>;
}

interface OrientedPanelComponent {
  readonly rotationDeg: 0 | 90;
  readonly transformsByPanelKey: ReadonlyMap<string, Transform2Mm>;
  readonly minimumXmm: number;
  readonly minimumYmm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

const orientPanelComponent = (
  panelKeys: readonly string[],
  rotationDeg: 0 | 90,
  relativeTransforms: ReadonlyMap<string, Transform2Mm>,
  geometryByPanelKey: ReadonlyMap<string, PanelGeometry>,
): OrientedPanelComponent => {
  const groupRotation: Transform2Mm = {
    translationMm: { xMm: 0, yMm: 0 },
    rotationDeg,
  };
  const transformsByPanelKey = new Map<string, Transform2Mm>();
  const points: Point2Mm[] = [];
  for (const panelKey of panelKeys) {
    const relative = relativeTransforms.get(panelKey)!;
    const oriented = {
      translationMm: transformPoint2(relative.translationMm, groupRotation),
      rotationDeg: relative.rotationDeg + rotationDeg,
    };
    transformsByPanelKey.set(panelKey, oriented);
    const geometry = geometryByPanelKey.get(panelKey)!;
    points.push(
      ...geometry.localVertices.map((point) =>
        transformPoint2(point, oriented),
      ),
    );
  }
  const minimumXmm = Math.min(...points.map((point) => point.xMm));
  const minimumYmm = Math.min(...points.map((point) => point.yMm));
  return {
    rotationDeg,
    transformsByPanelKey,
    minimumXmm,
    minimumYmm,
    widthMm: Math.max(...points.map((point) => point.xMm)) - minimumXmm,
    heightMm: Math.max(...points.map((point) => point.yMm)) - minimumYmm,
  };
};

const inwardNormal = (geometry: PanelGeometry, edge: Edge2Mm): Point2Mm => {
  const lengthMm = edgeLengthMm(edge);
  const sign = signedPolygonAreaMm2(geometry.localVertices) >= 0 ? 1 : -1;
  return {
    xMm: (-(edge.end.yMm - edge.start.yMm) / lengthMm) * sign,
    yMm: ((edge.end.xMm - edge.start.xMm) / lengthMm) * sign,
  };
};

const matchingExteriorChildEdge = (
  parentGeometry: PanelGeometry,
  parentEdge: Edge2Mm,
  childGeometry: PanelGeometry,
): Edge2Mm | null => {
  const parentLengthMm = edgeLengthMm(parentEdge);
  const parentMidpoint = {
    xMm: (parentEdge.start.xMm + parentEdge.end.xMm) / 2,
    yMm: (parentEdge.start.yMm + parentEdge.end.yMm) / 2,
  };
  const parentInward = inwardNormal(parentGeometry, parentEdge);
  return (
    childGeometry.localVertices
      .map((_, edgeIndex) => ({
        edgeIndex,
        result: edgeFor(childGeometry, edgeIndex),
      }))
      .flatMap(({ edgeIndex, result }) => {
        if (
          !result.ok ||
          Math.abs(edgeLengthMm(result.value) - parentLengthMm) >
            EDGE_LENGTH_TOLERANCE_MM
        ) {
          return [];
        }
        const transform = transformFromAlignedEdges(result.value, parentEdge);
        const inwardDistancesMm = childGeometry.localVertices.map((point) => {
          const placed = transformPoint2(point, transform);
          return (
            (placed.xMm - parentMidpoint.xMm) * parentInward.xMm +
            (placed.yMm - parentMidpoint.yMm) * parentInward.yMm
          );
        });
        if (
          inwardDistancesMm.some(
            (distanceMm) => distanceMm > EDGE_LENGTH_TOLERANCE_MM,
          ) ||
          Math.min(...inwardDistancesMm) >= -EDGE_LENGTH_TOLERANCE_MM
        ) {
          return [];
        }
        return [
          {
            edgeIndex,
            edge: result.value,
            meanInwardDistanceMm:
              inwardDistancesMm.reduce((sum, value) => sum + value, 0) /
              inwardDistancesMm.length,
          },
        ];
      })
      .toSorted(
        (left, right) =>
          left.meanInwardDistanceMm - right.meanInwardDistanceMm ||
          left.edgeIndex - right.edgeIndex,
      )[0]?.edge ?? null
  );
};

const derivePanelPacking = (
  intent: FabricationIntentV1,
  plan: FabricationPlanV2,
  geometryByPanelKey: ReadonlyMap<string, PanelGeometry>,
): SemanticPlanMappingResult<PackedPanels> => {
  const angularJoints = plan.joints.filter(
    (joint) => joint.kind === "fold" || joint.kind === "revolute",
  );
  const childKeys = new Set<string>();
  for (const joint of angularJoints) {
    if (childKeys.has(joint.childAttachment.panelKey)) {
      return mappingError(
        "duplicate_reference",
        ["joints", joint.key, "childAttachment"],
        `Panel ${joint.childAttachment.panelKey} has more than one angular parent attachment.`,
      );
    }
    childKeys.add(joint.childAttachment.panelKey);
  }

  const relative = new Map<string, Transform2Mm>();
  const groupRoot = new Map<string, string>();
  for (const panel of plan.panels) {
    if (!childKeys.has(panel.key)) {
      relative.set(panel.key, {
        translationMm: { xMm: 0, yMm: 0 },
        rotationDeg: 0,
      });
      groupRoot.set(panel.key, panel.key);
    }
  }

  const pending = [...angularJoints];
  while (pending.length > 0) {
    const before = pending.length;
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const joint = pending[index]!;
      const parentTransform = relative.get(joint.parentAttachment.panelKey);
      if (!parentTransform) continue;
      const parentGeometry = geometryByPanelKey.get(
        joint.parentAttachment.panelKey,
      );
      const childGeometry = geometryByPanelKey.get(
        joint.childAttachment.panelKey,
      );
      if (!parentGeometry || !childGeometry) {
        return mappingError(
          "invalid_reference",
          ["joints", joint.key],
          `Joint ${joint.key} references a missing attachment panel.`,
        );
      }
      if (
        parentGeometry.semantic.sheetIndex !== childGeometry.semantic.sheetIndex
      ) {
        return mappingError(
          "unsupported_mapping",
          ["joints", joint.key],
          `Angular attachment ${joint.key} must keep both panels on one source sheet.`,
        );
      }
      const parentEdgeResult = edgeFor(
        parentGeometry,
        joint.parentAttachment.edgeIndex,
      );
      let childEdgeResult = edgeFor(
        childGeometry,
        joint.childAttachment.edgeIndex,
      );
      if (!parentEdgeResult.ok) return parentEdgeResult;
      if (!childEdgeResult.ok) return childEdgeResult;
      if (
        Math.abs(
          edgeLengthMm(parentEdgeResult.value) -
            edgeLengthMm(childEdgeResult.value),
        ) > EDGE_LENGTH_TOLERANCE_MM
      ) {
        const resolvedChildEdge = matchingExteriorChildEdge(
          parentGeometry,
          parentEdgeResult.value,
          childGeometry,
        );
        if (!resolvedChildEdge) {
          return mappingError(
            "edge_length_mismatch",
            ["joints", joint.key],
            `Joint ${joint.key} attachment edges must have equal physical length.`,
          );
        }
        childEdgeResult = { ok: true, value: resolvedChildEdge };
      }
      const parentPlacedEdge = transformedEdge(
        parentEdgeResult.value,
        parentTransform,
      );
      relative.set(
        childGeometry.semantic.key,
        transformFromAlignedEdges(childEdgeResult.value, parentPlacedEdge),
      );
      groupRoot.set(
        childGeometry.semantic.key,
        groupRoot.get(parentGeometry.semantic.key)!,
      );
      pending.splice(index, 1);
    }
    if (pending.length === before) {
      return mappingError(
        "unsupported_mapping",
        ["joints"],
        "Angular panel attachments must form an acyclic directed forest.",
      );
    }
  }

  const groups = new Map<string, string[]>();
  for (const panel of plan.panels) {
    // Every non-child starts a component and the pending-loop assigns every
    // child after its parent. Reaching this point without a root would violate
    // that loop invariant rather than represent an expected model failure.
    const root = groupRoot.get(panel.key)!;
    const values = groups.get(root) ?? [];
    values.push(panel.key);
    groups.set(root, values);
  }

  const packed = new Map<string, Transform2Mm>();
  const cursorBySheetIndex = new Map<
    number,
    { xMm: number; yMm: number; rowHeightMm: number }
  >();
  for (const panelKeys of groups.values()) {
    const first = geometryByPanelKey.get(panelKeys[0]!)!;
    // Sheet references are checked before packing, and every angular edge is
    // checked for same-sheet membership while its component is assembled.
    const sheet = intent.stockOptions[first.semantic.sheetIndex]!;
    const usableWidthMm = sheet.widthMm - sheet.printableMarginMm * 2;
    const usableHeightMm = sheet.heightMm - sheet.printableMarginMm * 2;
    const cursor = cursorBySheetIndex.get(first.semantic.sheetIndex) ?? {
      xMm: 0,
      yMm: 0,
      rowHeightMm: 0,
    };

    const placements = ([0, 90] as const)
      .map((rotationDeg) =>
        orientPanelComponent(
          panelKeys,
          rotationDeg,
          relative,
          geometryByPanelKey,
        ),
      )
      .filter(
        (component) =>
          component.widthMm <= usableWidthMm &&
          component.heightMm <= usableHeightMm,
      )
      .flatMap((component) => {
        const startsNewRow =
          cursor.xMm > 0 && cursor.xMm + component.widthMm > usableWidthMm;
        const xMm = startsNewRow ? 0 : cursor.xMm;
        const yMm = startsNewRow
          ? cursor.yMm + cursor.rowHeightMm + LAYOUT_GAP_MM
          : cursor.yMm;
        const rowHeightMm = startsNewRow
          ? component.heightMm
          : Math.max(cursor.rowHeightMm, component.heightMm);
        return yMm + component.heightMm <= usableHeightMm
          ? [{ component, xMm, yMm, rowHeightMm }]
          : [];
      })
      .toSorted(
        (left, right) =>
          left.yMm + left.rowHeightMm - (right.yMm + right.rowHeightMm) ||
          left.component.rotationDeg - right.component.rotationDeg,
      );
    const placement = placements[0];
    if (!placement) {
      return mappingError(
        "packing_failed",
        ["panels", first.semantic.key],
        `Layout component ${first.semantic.key} does not fit the remaining printable area on sheet ${sheet.sheetId}.`,
      );
    }
    const shift = {
      xMm:
        sheet.printableMarginMm +
        placement.xMm -
        placement.component.minimumXmm,
      yMm:
        sheet.printableMarginMm +
        placement.yMm -
        placement.component.minimumYmm,
    };
    for (const panelKey of panelKeys) {
      const transform = placement.component.transformsByPanelKey.get(panelKey)!;
      packed.set(panelKey, {
        translationMm: {
          xMm: transform.translationMm.xMm + shift.xMm,
          yMm: transform.translationMm.yMm + shift.yMm,
        },
        rotationDeg: transform.rotationDeg,
      });
    }
    cursor.xMm = placement.xMm + placement.component.widthMm + LAYOUT_GAP_MM;
    cursor.yMm = placement.yMm;
    cursor.rowHeightMm = placement.rowHeightMm;
    cursorBySheetIndex.set(first.semantic.sheetIndex, cursor);
  }
  return { ok: true, value: { transformsByPanelKey: packed } };
};

const pointAlong = (edge: Edge2Mm, distanceMm: number): Point2Mm => {
  const lengthMm = edgeLengthMm(edge);
  return {
    xMm:
      edge.start.xMm +
      ((edge.end.xMm - edge.start.xMm) / lengthMm) * distanceMm,
    yMm:
      edge.start.yMm +
      ((edge.end.yMm - edge.start.yMm) / lengthMm) * distanceMm,
  };
};

const CONNECTOR_ENGAGEMENT_MARGIN_MM = 1;

const deriveConnectors = (
  intent: FabricationIntentV1,
  plan: FabricationPlanV2,
  geometryByPanelKey: ReadonlyMap<string, PanelGeometry>,
): SemanticPlanMappingResult<readonly ConnectorV1[]> => {
  const connectors: ConnectorV1[] = [];
  for (const relationship of plan.connectorRelationships) {
    const tabPanel = geometryByPanelKey.get(
      relationship.tabAttachment.panelKey,
    );
    const slotPanel = geometryByPanelKey.get(
      relationship.slotAttachment.panelKey,
    );
    if (!tabPanel || !slotPanel) {
      return mappingError(
        "invalid_reference",
        ["connectorRelationships", relationship.key],
        `Connector relationship ${relationship.key} references a missing panel.`,
      );
    }
    const tabEdgeResult = edgeFor(
      tabPanel,
      relationship.tabAttachment.edgeIndex,
    );
    const slotEdgeResult = edgeFor(
      slotPanel,
      relationship.slotAttachment.edgeIndex,
    );
    if (!tabEdgeResult.ok) return tabEdgeResult;
    if (!slotEdgeResult.ok) return slotEdgeResult;
    const tabEdge = tabEdgeResult.value;
    const slotEdge = slotEdgeResult.value;
    const slotLengthMm = relationship.spanMm + relationship.clearanceMm + 0.1;
    if (
      relationship.spanMm > edgeLengthMm(tabEdge) - LAYOUT_GAP_MM ||
      slotLengthMm > edgeLengthMm(slotEdge) - LAYOUT_GAP_MM
    ) {
      return mappingError(
        "unsupported_mapping",
        ["connectorRelationships", relationship.key, "spanMm"],
        `Connector ${relationship.key} does not fit its selected local edges.`,
      );
    }
    const tabNormal = inwardNormal(tabPanel, tabEdge);
    const boundaryTabStart = pointAlong(
      tabEdge,
      (edgeLengthMm(tabEdge) - relationship.spanMm) / 2,
    );
    const boundaryTabEnd = pointAlong(
      tabEdge,
      (edgeLengthMm(tabEdge) + relationship.spanMm) / 2,
    );
    // A paper tab is represented as a three-sided internal flap. Its root is
    // inset from the perimeter and the free edge stops one minimum feature
    // before the panel boundary, so the derived cut retains real material.
    const tabRootInsetMm =
      relationship.tabDepthMm + CONNECTOR_ENGAGEMENT_MARGIN_MM;
    const tabStart = {
      xMm: boundaryTabStart.xMm + tabNormal.xMm * tabRootInsetMm,
      yMm: boundaryTabStart.yMm + tabNormal.yMm * tabRootInsetMm,
    };
    const tabEnd = {
      xMm: boundaryTabEnd.xMm + tabNormal.xMm * tabRootInsetMm,
      yMm: boundaryTabEnd.yMm + tabNormal.yMm * tabRootInsetMm,
    };
    const tabContour = [
      tabStart,
      tabEnd,
      {
        xMm: tabEnd.xMm - tabNormal.xMm * relationship.tabDepthMm,
        yMm: tabEnd.yMm - tabNormal.yMm * relationship.tabDepthMm,
      },
      {
        xMm: tabStart.xMm - tabNormal.xMm * relationship.tabDepthMm,
        yMm: tabStart.yMm - tabNormal.yMm * relationship.tabDepthMm,
      },
    ];
    if (
      tabContour.some((point) => !pointInPolygon(point, tabPanel.localVertices))
    ) {
      return mappingError(
        "unsupported_mapping",
        ["connectorRelationships", relationship.key, "tabDepthMm"],
        `Connector ${relationship.key} produces a tab outside its panel.`,
      );
    }
    const slotNormal = inwardNormal(slotPanel, slotEdge);
    const slotEdgeCenter = pointAlong(slotEdge, edgeLengthMm(slotEdge) / 2);
    const slotTangent = {
      xMm: (slotEdge.end.xMm - slotEdge.start.xMm) / edgeLengthMm(slotEdge),
      yMm: (slotEdge.end.yMm - slotEdge.start.yMm) / edgeLengthMm(slotEdge),
    };
    const slotSegmentAtInset = (insetMm: number) => {
      const center = {
        xMm: slotEdgeCenter.xMm + slotNormal.xMm * insetMm,
        yMm: slotEdgeCenter.yMm + slotNormal.yMm * insetMm,
      };
      return {
        start: {
          xMm: center.xMm - (slotTangent.xMm * slotLengthMm) / 2,
          yMm: center.yMm - (slotTangent.yMm * slotLengthMm) / 2,
        },
        end: {
          xMm: center.xMm + (slotTangent.xMm * slotLengthMm) / 2,
          yMm: center.yMm + (slotTangent.yMm * slotLengthMm) / 2,
        },
      };
    };
    const requestedSlot = slotSegmentAtInset(relationship.slotInsetMm);
    if (
      !pointInPolygon(requestedSlot.start, slotPanel.localVertices, false) ||
      !pointInPolygon(requestedSlot.end, slotPanel.localVertices, false)
    ) {
      return mappingError(
        "unsupported_mapping",
        ["connectorRelationships", relationship.key, "slotInsetMm"],
        `Connector ${relationship.key} produces a slot outside its panel.`,
      );
    }
    // A slot inset equal to or deeper than the whole tab leaves no material
    // available to engage the receiving panel. Treat the model value as an
    // authoring preference and cap the derived geometry so code preserves a
    // minimum landing length. The original plan remains unchanged for trace
    // provenance; only the code-owned reciprocal connector geometry is
    // normalized.
    const usableSlotInsetMm = Math.min(
      relationship.slotInsetMm,
      Math.max(
        CONNECTOR_ENGAGEMENT_MARGIN_MM,
        relationship.tabDepthMm - CONNECTOR_ENGAGEMENT_MARGIN_MM,
      ),
    );
    const slotSegment = slotSegmentAtInset(usableSlotInsetMm);
    const ids = relationshipConnectorIds(relationship.key);
    // Panel sheet references are validated before connector derivation.
    const stock = intent.stockOptions[tabPanel.semantic.sheetIndex]!;
    connectors.push(
      {
        connectorId: ids.tab,
        kind: "tab",
        panelId: canonicalId("panel", tabPanel.semantic.key),
        mateConnectorId: ids.slot,
        contour: { vertices: tabContour },
        rootEdge: { start: tabStart, end: tabEnd },
        insertionDirection: { x: 0, y: 0, z: 1 },
        clearanceMm: relationship.clearanceMm,
      },
      {
        connectorId: ids.slot,
        kind: "slot",
        panelId: canonicalId("panel", slotPanel.semantic.key),
        mateConnectorId: ids.tab,
        centerline: slotSegment,
        widthMm: Math.max(
          1.01,
          stock.material.thicknessMm + relationship.clearanceMm + 0.01,
        ),
        insertionDirection: { x: 0, y: 0, z: -1 },
        clearanceMm: relationship.clearanceMm,
      },
    );
  }
  return { ok: true, value: connectors };
};

const attachmentEdge = (
  attachment: SemanticEdgeAttachmentV2,
  geometryByPanelKey: ReadonlyMap<string, PanelGeometry>,
  transformsByPanelKey: ReadonlyMap<string, Transform2Mm>,
): SemanticPlanMappingResult<Edge2Mm> => {
  // Joint ownership validation establishes both maps before this helper runs.
  const geometry = geometryByPanelKey.get(attachment.panelKey)!;
  const transform = transformsByPanelKey.get(attachment.panelKey)!;
  const local = edgeFor(geometry, attachment.edgeIndex);
  return local.ok
    ? { ok: true, value: transformedEdge(local.value, transform) }
    : local;
};

const connectorIdsForRelationships = (
  relationshipKeys: readonly string[],
  relationshipKeySet: ReadonlySet<string>,
  ownerPath: readonly string[],
): SemanticPlanMappingResult<readonly string[]> => {
  for (const relationshipKey of relationshipKeys) {
    if (!relationshipKeySet.has(relationshipKey)) {
      return mappingError(
        "invalid_reference",
        ownerPath,
        `Missing connector relationship ${relationshipKey}.`,
      );
    }
  }
  return {
    ok: true,
    value: relationshipKeys.flatMap((relationshipKey) => {
      const ids = relationshipConnectorIds(relationshipKey);
      return [ids.tab, ids.slot];
    }),
  };
};

const createJoints = (
  plan: FabricationPlanV2,
  geometryByPanelKey: ReadonlyMap<string, PanelGeometry>,
  transformsByPanelKey: ReadonlyMap<string, Transform2Mm>,
  bodyKeySet: ReadonlySet<string>,
  connectors: readonly ConnectorV1[],
): SemanticPlanMappingResult<readonly JointV1[]> => {
  const relationshipKeySet = new Set(
    plan.connectorRelationships.map((relationship) => relationship.key),
  );
  const joints: JointV1[] = [];
  for (const semantic of plan.joints) {
    if (
      !bodyKeySet.has(semantic.parentBodyKey) ||
      !bodyKeySet.has(semantic.childBodyKey) ||
      semantic.parentBodyKey === semantic.childBodyKey
    ) {
      return mappingError(
        "invalid_reference",
        ["joints", semantic.key],
        `Joint ${semantic.key} must connect two distinct existing bodies.`,
      );
    }
    const parentPanel = geometryByPanelKey.get(
      semantic.parentAttachment.panelKey,
    );
    const childPanel = geometryByPanelKey.get(
      semantic.childAttachment.panelKey,
    );
    if (
      parentPanel?.semantic.bodyKey !== semantic.parentBodyKey ||
      childPanel?.semantic.bodyKey !== semantic.childBodyKey
    ) {
      return mappingError(
        "invalid_reference",
        ["joints", semantic.key, "parentAttachment"],
        `Joint ${semantic.key} attachments must belong to their declared bodies.`,
      );
    }
    const parentEdge = attachmentEdge(
      semantic.parentAttachment,
      geometryByPanelKey,
      transformsByPanelKey,
    );
    if (!parentEdge.ok) return parentEdge;
    if (semantic.kind !== "prismatic") {
      if (
        semantic.minimumAngleDeg > semantic.homeAngleDeg ||
        semantic.homeAngleDeg > semantic.maximumAngleDeg
      ) {
        return mappingError(
          "invalid_motion",
          ["joints", semantic.key],
          `Joint ${semantic.key} home angle must lie inside its range.`,
        );
      }
      const axis = {
        startMm: { ...parentEdge.value.start, zMm: 0 },
        endMm: { ...parentEdge.value.end, zMm: 0 },
      };
      if (semantic.kind === "fold") {
        joints.push({
          jointId: canonicalId("joint", semantic.key),
          kind: "fold",
          parentBodyId: canonicalId("body", semantic.parentBodyKey),
          childBodyId: canonicalId("body", semantic.childBodyKey),
          axis,
          creasePathId: `path-crease-${semantic.key}`,
          foldDirection: semantic.foldDirection,
          homeAngleDeg: semantic.homeAngleDeg,
          minAngleDeg: semantic.minimumAngleDeg,
          maxAngleDeg: semantic.maximumAngleDeg,
        });
      } else {
        const connectorIds = connectorIdsForRelationships(
          semantic.connectorRelationshipKeys,
          relationshipKeySet,
          ["joints", semantic.key, "connectorRelationshipKeys"],
        );
        if (!connectorIds.ok) return connectorIds;
        joints.push({
          jointId: canonicalId("joint", semantic.key),
          kind: "revolute",
          parentBodyId: canonicalId("body", semantic.parentBodyKey),
          childBodyId: canonicalId("body", semantic.childBodyKey),
          axis,
          connectorIds: connectorIds.value,
          homeAngleDeg: semantic.homeAngleDeg,
          minAngleDeg: semantic.minimumAngleDeg,
          maxAngleDeg: semantic.maximumAngleDeg,
        });
      }
      continue;
    }
    if (
      semantic.minimumTravelMm > semantic.homeTravelMm ||
      semantic.homeTravelMm > semantic.maximumTravelMm
    ) {
      return mappingError(
        "invalid_motion",
        ["joints", semantic.key],
        `Joint ${semantic.key} home travel must lie inside its range.`,
      );
    }
    const guideConnectorIds = connectorIdsForRelationships(
      semantic.guideRelationshipKeys,
      relationshipKeySet,
      ["joints", semantic.key, "guideRelationshipKeys"],
    );
    if (!guideConnectorIds.ok) return guideConnectorIds;
    const delta = {
      x: parentEdge.value.end.xMm - parentEdge.value.start.xMm,
      y: parentEdge.value.end.yMm - parentEdge.value.start.yMm,
    };
    const length = Math.hypot(delta.x, delta.y);
    const tangent = { x: delta.x / length, y: delta.y / length, z: 0 };
    const inward = inwardNormal(parentPanel, {
      start: parentPanel.localVertices[semantic.parentAttachment.edgeIndex]!,
      end: parentPanel.localVertices[
        (semantic.parentAttachment.edgeIndex + 1) %
          parentPanel.localVertices.length
      ]!,
    });
    const rotationRadians =
      ((transformsByPanelKey.get(parentPanel.semantic.key)!.rotationDeg ?? 0) *
        Math.PI) /
      180;
    const inwardPlaced = {
      x:
        inward.xMm * Math.cos(rotationRadians) -
        inward.yMm * Math.sin(rotationRadians),
      y:
        inward.xMm * Math.sin(rotationRadians) +
        inward.yMm * Math.cos(rotationRadians),
      z: 0,
    };
    const axis =
      semantic.travelDirection === "sheet_normal"
        ? { x: 0, y: 0, z: 1 }
        : semantic.travelDirection === "edge_tangent"
          ? tangent
          : semantic.travelDirection === "edge_normal_inward"
            ? inwardPlaced
            : { x: -inwardPlaced.x, y: -inwardPlaced.y, z: 0 };
    const parentGuideConnector = connectors.find((connector) => {
      if (!guideConnectorIds.value.includes(connector.connectorId))
        return false;
      const panelKey = connector.panelId.slice("panel-".length);
      return (
        geometryByPanelKey.get(panelKey)?.semantic.bodyKey ===
        semantic.parentBodyKey
      );
    });
    if (!parentGuideConnector) {
      return mappingError(
        "unsupported_mapping",
        ["joints", semantic.key, "guideRelationshipKeys"],
        `Prismatic joint ${semantic.key} needs one guide connector on its parent body.`,
      );
    }
    const parentGuidePanelKey = parentGuideConnector.panelId.slice(
      "panel-".length,
    );
    const parentGuideTransform = transformsByPanelKey.get(parentGuidePanelKey)!;
    const parentGuideReference = transformPoint2(
      connectorReferencePoint2(parentGuideConnector),
      parentGuideTransform,
    );
    joints.push({
      jointId: canonicalId("joint", semantic.key),
      kind: "prismatic",
      parentBodyId: canonicalId("body", semantic.parentBodyKey),
      childBodyId: canonicalId("body", semantic.childBodyKey),
      originMm: {
        xMm: parentGuideReference.xMm,
        yMm: parentGuideReference.yMm,
        zMm: 0,
      },
      axis,
      guideConnectorIds: guideConnectorIds.value,
      homeTravelMm: semantic.homeTravelMm,
      minTravelMm: semantic.minimumTravelMm,
      maxTravelMm: semantic.maximumTravelMm,
    });
  }
  return { ok: true, value: joints };
};

const deriveBodyTransform = (
  bodyKey: string,
  plan: FabricationPlanV2,
  joints: readonly JointV1[],
  geometryByPanelKey: ReadonlyMap<string, PanelGeometry>,
  transformsByPanelKey: ReadonlyMap<string, Transform2Mm>,
  connectors: readonly ConnectorV1[],
): Transform3Mm => {
  const semanticJoint = plan.joints.find(
    (joint) => joint.childBodyKey === bodyKey,
  );
  if (!semanticJoint) return IDENTITY_TRANSFORM_3D;
  const joint = joints.find(
    (candidate) =>
      candidate.jointId === canonicalId("joint", semanticJoint.key),
  )!;
  if (joint.kind !== "prismatic") {
    const matrix = rotationAroundAxisMatrix4(
      joint.axis.startMm,
      joint.axis.endMm,
      joint.homeAngleDeg,
    );
    const transform = matrix ? decomposeRigidMatrix4(matrix) : null;
    if (!transform) {
      throw new Error(
        `Invariant violated: finite semantic joint ${joint.jointId} has no rigid home transform.`,
      );
    }
    return transform;
  }
  const guideIds = new Set(joint.guideConnectorIds);
  const guideConnectors = connectors.filter((connector) =>
    guideIds.has(connector.connectorId),
  );
  const placedReference = (connector: ConnectorV1): Point2Mm => {
    const panelKey = connector.panelId.slice("panel-".length);
    const transform = transformsByPanelKey.get(panelKey)!;
    return transformPoint2(connectorReferencePoint2(connector), transform);
  };
  const parentConnector = guideConnectors.find((connector) => {
    const panelKey = connector.panelId.slice("panel-".length);
    return (
      geometryByPanelKey.get(panelKey)?.semantic.bodyKey ===
      semanticJoint.parentBodyKey
    );
  });
  const childConnector = guideConnectors.find((connector) => {
    const panelKey = connector.panelId.slice("panel-".length);
    return (
      geometryByPanelKey.get(panelKey)?.semantic.bodyKey ===
      semanticJoint.childBodyKey
    );
  });
  // createJoints has already required a guide connector on the parent body.
  const parentCenter = placedReference(parentConnector!);
  const childCenter = childConnector ? placedReference(childConnector) : null;
  if (!childCenter) return IDENTITY_TRANSFORM_3D;
  return {
    translationMm: {
      xMm: parentCenter.xMm - childCenter.xMm,
      yMm: parentCenter.yMm - childCenter.yMm,
      zMm: 0,
    },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  };
};

const unitForJoint = (joint: JointV1): "mm" | "deg" =>
  joint.kind === "prismatic" ? "mm" : "deg";

export const semanticPlanToFabricationPlanV1 = (
  intentInput: unknown,
  planInput: unknown,
): SemanticPlanMappingResult<FabricationPlanV1> => {
  const intentParsed = FabricationIntentV1Schema.safeParse(intentInput);
  if (!intentParsed.success) {
    const issue = intentParsed.error.issues[0]!;
    return mappingError(
      "contract_invalid",
      issue.path.map(String),
      "FabricationIntentV1 is invalid.",
    );
  }
  const planParsed = FabricationPlanV2Schema.safeParse(planInput);
  if (!planParsed.success) {
    const issue = planParsed.error.issues[0]!;
    return mappingError(
      "contract_invalid",
      issue.path.map(String),
      issue.message,
    );
  }
  const intent = intentParsed.data;
  const plan = planParsed.data;
  const resourceCounts = semanticPlanResourceCounts(plan);
  if (resourceCounts.panelCount > intent.fabricationBudget.maximumPanels) {
    return planLimitError(
      "intent.maximumPanels",
      resourceCounts.panelCount,
      intent.fabricationBudget.maximumPanels,
    );
  }
  if (
    resourceCounts.mechanismFeatureCount >
    intent.fabricationBudget.maximumJointAndConnectorCount
  ) {
    return planLimitError(
      "intent.maximumJointAndConnectorCount",
      resourceCounts.mechanismFeatureCount,
      intent.fabricationBudget.maximumJointAndConnectorCount,
    );
  }
  const selectedSheetIndexes = new Set(
    plan.panels.map((panel) => panel.sheetIndex),
  );
  if (selectedSheetIndexes.size > intent.fabricationBudget.maximumSheets) {
    return mappingError(
      "unsupported_mapping",
      ["panels", "sheetIndex"],
      "The semantic plan selects more sheets than the intent permits.",
    );
  }

  const geometries: PanelGeometry[] = [];
  for (const panel of plan.panels) {
    if (!intent.stockOptions[panel.sheetIndex]) {
      return mappingError(
        "invalid_reference",
        ["panels", panel.key, "sheetIndex"],
        `Sheet index ${panel.sheetIndex} is not available.`,
      );
    }
    const result = panelGeometry(panel);
    if (!result.ok) return result;
    geometries.push(result.value);
  }
  const geometryByPanelKey = new Map(
    geometries.map((geometry) => [geometry.semantic.key, geometry]),
  );
  const bodyByKey = new Map(plan.bodies.map((body) => [body.key, body]));
  for (const panel of plan.panels) {
    const body = bodyByKey.get(panel.bodyKey);
    if (!body || !body.panelKeys.includes(panel.key)) {
      return mappingError(
        "invalid_reference",
        ["panels", panel.key, "bodyKey"],
        `Panel ${panel.key} and body ${panel.bodyKey} must reference each other.`,
      );
    }
  }
  for (const body of plan.bodies) {
    for (const panelKey of body.panelKeys) {
      if (geometryByPanelKey.get(panelKey)?.semantic.bodyKey !== body.key) {
        return mappingError(
          "invalid_reference",
          ["bodies", body.key, "panelKeys"],
          `Body ${body.key} references missing or differently owned panel ${panelKey}.`,
        );
      }
    }
  }
  if (plan.bodies.filter((body) => body.grounded).length !== 1) {
    return mappingError(
      "ambiguous_ground",
      ["bodies"],
      "Exactly one semantic body must be grounded.",
    );
  }

  const packing = derivePanelPacking(intent, plan, geometryByPanelKey);
  if (!packing.ok) return packing;
  const connectorsResult = deriveConnectors(intent, plan, geometryByPanelKey);
  if (!connectorsResult.ok) return connectorsResult;
  if (connectorsResult.value.length !== resourceCounts.expandedConnectorCount) {
    return mappingError(
      "unsupported_mapping",
      ["connectorRelationships"],
      "Semantic connector expansion did not produce one tab and one slot per relationship.",
    );
  }
  const jointsResult = createJoints(
    plan,
    geometryByPanelKey,
    packing.value.transformsByPanelKey,
    new Set(plan.bodies.map((body) => body.key)),
    connectorsResult.value,
  );
  if (!jointsResult.ok) return jointsResult;
  const joints = jointsResult.value;
  const topology = buildDirectedBodyTopology(
    plan.bodies.map((body) => canonicalId("body", body.key)),
    joints,
  );
  if (!topology.ok) {
    return mappingError(
      "unsupported_mapping",
      ["joints"],
      `Body joints must form one connected acyclic graph: ${topology.error.id}.`,
    );
  }
  const grounded = plan.bodies.find((body) => body.grounded)!;
  if (canonicalId("body", grounded.key) !== topology.value.rootBodyId) {
    return mappingError(
      "ambiguous_ground",
      ["bodies", grounded.key, "grounded"],
      "The grounded body must be the root of the directed joint graph.",
    );
  }

  const panels: PlannedPanelBlueprintV1[] = geometries.map((geometry) => {
    const panel = geometry.semantic;
    return {
      panelId: canonicalId("panel", panel.key),
      sheetId: intent.stockOptions[panel.sheetIndex]!.sheetId,
      bodyId: canonicalId("body", panel.bodyKey),
      label: panel.label,
      role: panel.role,
      widthMm: panel.widthMm,
      heightMm: panel.heightMm,
      contour: geometry.contour,
      innerCutContours: panel.innerCutContours,
      flatTransform: packing.value.transformsByPanelKey.get(panel.key)!,
      semanticPartIds: plan.landmarks
        .filter((landmark) =>
          landmark.geometryRefs.some(
            (reference) =>
              reference.kind === "panel" && reference.key === panel.key,
          ),
        )
        .map((landmark) => canonicalId("part", landmark.key)),
    };
  });
  const jointByKey = new Map(
    plan.joints.map((joint, index) => [joint.key, joints[index]!]),
  );
  const driver = plan.driver;
  if ((intent.behavior === "static") !== (driver === null)) {
    return mappingError(
      "invalid_motion",
      ["driver"],
      "Static plans require no driver; moving plans require exactly one driver.",
    );
  }
  const mappedDriver = driver
    ? (() => {
        const joint = jointByKey.get(driver.jointKey);
        if (!joint) return null;
        const allowed =
          joint.kind === "fold"
            ? driver.control === "fold"
            : joint.kind === "revolute"
              ? driver.control === "rotate"
              : driver.control === "slide" || driver.control === "pull_tab";
        if (!allowed) return null;
        return {
          driverId: canonicalId("driver", driver.key),
          jointId: joint.jointId,
          label: driver.label,
          control: driver.control,
          minimumValue: driver.minimumValue,
          maximumValue: driver.maximumValue,
          homeValue: driver.homeValue,
          unit: unitForJoint(joint),
          direction: driver.direction,
        } as const;
      })()
    : null;
  if (driver && !mappedDriver) {
    return mappingError(
      "invalid_motion",
      ["driver", driver.key],
      `Driver ${driver.key} references an incompatible joint or control.`,
    );
  }
  if (driver && plan.outputs.length === 0) {
    return mappingError(
      "invalid_motion",
      ["outputs"],
      "A moving semantic plan requires at least one output.",
    );
  }
  const outputs = [];
  for (const output of plan.outputs) {
    const joint = jointByKey.get(output.jointKey);
    if (!joint || !bodyByKey.has(output.bodyKey)) {
      return mappingError(
        "invalid_reference",
        ["outputs", output.key],
        `Output ${output.key} references a missing joint or body.`,
      );
    }
    outputs.push({
      outputId: canonicalId("output", output.key),
      jointId: joint.jointId,
      bodyId: canonicalId("body", output.bodyKey),
      label: output.label,
      minimumValue: output.minimumValue,
      maximumValue: output.maximumValue,
      unit: unitForJoint(joint),
      direction: output.direction,
    });
  }
  const relationshipKeySet = new Set(
    plan.connectorRelationships.map((relationship) => relationship.key),
  );
  const couplings: CouplingV1[] = [];
  for (const coupling of plan.couplings) {
    const couplingId = canonicalId("coupling", coupling.key);
    switch (coupling.kind) {
      case "direct_ratio": {
        const input = jointByKey.get(coupling.inputJointKey);
        const outputJoints = coupling.outputJointKeys.map((key) =>
          jointByKey.get(key),
        );
        if (!input || outputJoints.some((joint) => !joint)) {
          return mappingError(
            "invalid_reference",
            ["couplings", coupling.key],
            `Coupling ${coupling.key} references a missing joint.`,
          );
        }
        couplings.push({
          couplingId,
          kind: "direct_ratio",
          inputJointId: input.jointId,
          outputJointIds: outputJoints.map((joint) => joint!.jointId),
          ratio: coupling.ratio,
          offset: coupling.offset,
          offsetUnit: coupling.offsetUnit,
        });
        break;
      }
      case "mirrored_pair": {
        const input = jointByKey.get(coupling.inputJointKey);
        const left = jointByKey.get(coupling.leftOutputJointKey);
        const right = jointByKey.get(coupling.rightOutputJointKey);
        if (!input || !left || !right) {
          return mappingError(
            "invalid_reference",
            ["couplings", coupling.key],
            `Coupling ${coupling.key} references a missing joint.`,
          );
        }
        couplings.push({
          couplingId,
          kind: "mirrored_pair",
          inputJointId: input.jointId,
          leftOutputJointId: left.jointId,
          rightOutputJointId: right.jointId,
          ratio: coupling.ratio,
          phaseOffsetDeg: coupling.phaseOffsetDeg,
        });
        break;
      }
      case "pull_tab": {
        const slider = jointByKey.get(coupling.sliderJointKey);
        const outputJoints = coupling.outputJointKeys.map((key) =>
          jointByKey.get(key),
        );
        if (
          !driver ||
          coupling.driverKey !== driver.key ||
          !slider ||
          slider.kind !== "prismatic" ||
          outputJoints.some((joint) => !joint)
        ) {
          return mappingError(
            "invalid_reference",
            ["couplings", coupling.key],
            `Pull-tab coupling ${coupling.key} references an incompatible driver or joint.`,
          );
        }
        couplings.push({
          couplingId,
          kind: "pull_tab",
          driverId: canonicalId("driver", driver.key),
          sliderJointId: slider.jointId,
          outputJointIds: outputJoints.map((joint) => joint!.jointId),
          ratio: coupling.ratio,
        });
        break;
      }
      case "cam_slot": {
        const outputJoint = jointByKey.get(coupling.outputJointKey);
        if (
          !driver ||
          coupling.driverKey !== driver.key ||
          !outputJoint ||
          !relationshipKeySet.has(coupling.connectorRelationshipKey)
        ) {
          return mappingError(
            "invalid_reference",
            ["couplings", coupling.key],
            `Cam-slot coupling ${coupling.key} references a missing driver, relationship, or output joint.`,
          );
        }
        const ids = relationshipConnectorIds(coupling.connectorRelationshipKey);
        couplings.push({
          couplingId,
          kind: "cam_slot",
          driverId: canonicalId("driver", driver.key),
          slotConnectorId: ids.slot,
          followerConnectorId: ids.tab,
          outputJointId: outputJoint.jointId,
          branch: coupling.branch,
          phaseOffsetMm: coupling.phaseOffsetMm,
        });
        break;
      }
    }
  }

  const referenceForLandmark = (
    reference: FabricationPlanV2["landmarks"][number]["geometryRefs"][number],
  ): SemanticPlanMappingResult<readonly GeometryRefV1[]> => {
    switch (reference.kind) {
      case "panel":
        return geometryByPanelKey.has(reference.key)
          ? {
              ok: true,
              value: [
                { kind: "panel", id: canonicalId("panel", reference.key) },
              ],
            }
          : mappingError(
              "invalid_reference",
              ["landmarks"],
              `Missing panel ${reference.key}.`,
            );
      case "body":
        return bodyByKey.has(reference.key)
          ? {
              ok: true,
              value: [{ kind: "body", id: canonicalId("body", reference.key) }],
            }
          : mappingError(
              "invalid_reference",
              ["landmarks"],
              `Missing body ${reference.key}.`,
            );
      case "joint":
        return jointByKey.has(reference.key)
          ? {
              ok: true,
              value: [
                { kind: "joint", id: canonicalId("joint", reference.key) },
              ],
            }
          : mappingError(
              "invalid_reference",
              ["landmarks"],
              `Missing joint ${reference.key}.`,
            );
      case "connector_relationship": {
        if (!relationshipKeySet.has(reference.key)) {
          return mappingError(
            "invalid_reference",
            ["landmarks"],
            `Missing connector relationship ${reference.key}.`,
          );
        }
        const ids = relationshipConnectorIds(reference.key);
        return {
          ok: true,
          value: [
            { kind: "connector", id: ids.tab },
            { kind: "connector", id: ids.slot },
          ],
        };
      }
      case "driver":
        return driver?.key === reference.key
          ? {
              ok: true,
              value: [
                { kind: "driver", id: canonicalId("driver", reference.key) },
              ],
            }
          : mappingError(
              "invalid_reference",
              ["landmarks"],
              `Missing driver ${reference.key}.`,
            );
      case "output":
        return plan.outputs.some((output) => output.key === reference.key)
          ? {
              ok: true,
              value: [
                { kind: "output", id: canonicalId("output", reference.key) },
              ],
            }
          : mappingError(
              "invalid_reference",
              ["landmarks"],
              `Missing output ${reference.key}.`,
            );
    }
  };
  const semanticParts: SemanticPartV1[] = [];
  for (const landmark of plan.landmarks) {
    const geometryRefs: GeometryRefV1[] = [];
    for (const reference of landmark.geometryRefs) {
      const mapped = referenceForLandmark(reference);
      if (!mapped.ok) return mapped;
      geometryRefs.push(...mapped.value);
    }
    semanticParts.push({
      semanticPartId: canonicalId("part", landmark.key),
      label: landmark.label,
      role: landmark.role,
      geometryRefs,
    });
  }
  for (const relationship of plan.connectorRelationships) {
    const ids = relationshipConnectorIds(relationship.key);
    const semanticPartId = `part-connector-${relationship.key}`;
    const connectorRefs: readonly GeometryRefV1[] = [
      { kind: "connector", id: ids.tab },
      { kind: "connector", id: ids.slot },
    ];
    const existingIndex = semanticParts.findIndex(
      (part) => part.semanticPartId === semanticPartId,
    );
    const existing = semanticParts[existingIndex];
    if (existing) {
      const geometryRefs = new Map(
        [...existing.geometryRefs, ...connectorRefs].map((reference) => [
          `${reference.kind}:${reference.id}`,
          reference,
        ]),
      );
      semanticParts[existingIndex] = {
        ...existing,
        geometryRefs: [...geometryRefs.values()],
      };
    } else {
      semanticParts.push({
        semanticPartId,
        label: `Tab and slot ${relationship.key}`,
        role: "derived reciprocal tab-slot relationship",
        geometryRefs: connectorRefs,
      });
    }
  }

  return {
    ok: true,
    value: {
      version: "1",
      candidateLabel: plan.candidateLabel,
      topologyId: `topology-${plan.topologyKey}`,
      panels,
      bodies: plan.bodies.map((body) => ({
        bodyId: canonicalId("body", body.key),
        label: body.label,
        panelIds: body.panelKeys.map((panelKey) =>
          canonicalId("panel", panelKey),
        ),
        initialTransform: deriveBodyTransform(
          body.key,
          plan,
          joints,
          geometryByPanelKey,
          packing.value.transformsByPanelKey,
          connectorsResult.value,
        ),
        grounded: body.grounded,
        semanticPartIds: plan.landmarks
          .filter((landmark) =>
            landmark.geometryRefs.some(
              (reference) =>
                reference.kind === "body" && reference.key === body.key,
            ),
          )
          .map((landmark) => canonicalId("part", landmark.key)),
      })),
      joints,
      connectors: connectorsResult.value,
      driver: mappedDriver,
      outputs,
      couplings,
      semanticParts,
      assemblyStrategy: plan.assemblyStrategy,
      designSummary: plan.designSummary,
    },
  };
};

export const expandSemanticFabricationPlan = (
  intentInput: unknown,
  planInput: unknown,
  candidateOrdinal: number,
):
  | SemanticPlanMappingResult<FabricationProgramV1>
  | ReturnType<typeof expandFabricationPlan> => {
  const mapped = semanticPlanToFabricationPlanV1(intentInput, planInput);
  return mapped.ok
    ? expandFabricationPlan(intentInput, mapped.value, candidateOrdinal)
    : mapped;
};

interface ResolvedPlanEvaluation {
  readonly plan: FabricationPlanV2;
  readonly program: FabricationProgramV1;
  readonly report: VerificationReportV2;
}

export interface StructuralCollisionError {
  readonly kind: "structural_collision";
  readonly code: "collision.minimum_clearance";
  readonly path: readonly string[];
  readonly panelIds: readonly [string, string];
  readonly actualClearanceMm: number;
  readonly requiredClearanceMm: number;
  readonly report: VerificationReportV2;
  readonly message: string;
}

export type ResolvedSemanticPlanExpansionError =
  | SemanticPlanExpansionError
  | FabricationPlanExpansionError
  | CompilationError
  | StructuralCollisionError;

export type ResolvedSemanticPlanExpansionResult =
  | { readonly ok: true; readonly value: FabricationProgramV1 }
  | {
      readonly ok: false;
      readonly error: ResolvedSemanticPlanExpansionError;
    };

type ResolvedPlanEvaluationResult =
  | { readonly ok: true; readonly value: ResolvedPlanEvaluation }
  | {
      readonly ok: false;
      readonly error: ResolvedSemanticPlanExpansionError;
    };

const MAXIMUM_PLAN_RESOLUTION_EVALUATIONS = 160;
const MAXIMUM_EDGE_CHOICES_PER_PANEL = 8;
const MAXIMUM_JOINT_ATTACHMENT_PAIRS = 6;
const MAXIMUM_COLLISION_SEARCH_DEPTH = 5;
const COLLISION_SEARCH_BEAM_WIDTH = 10;

const numericFailureDeficit = (report: VerificationReportV2): number =>
  report.failures.reduce((total, failure) => {
    if (
      typeof failure.actual.value !== "number" ||
      typeof failure.expected.value !== "number"
    ) {
      return total;
    }
    const scale = Math.max(1, Math.abs(failure.expected.value));
    const deficit = failure.failureId.startsWith(
      "connections.connector_mate_reach",
    )
      ? failure.actual.value - failure.expected.value
      : failure.expected.value - failure.actual.value;
    return total + Math.max(0, deficit) / scale;
  }, 0);

const reportIsBetter = (
  candidate: VerificationReportV2,
  current: VerificationReportV2,
): boolean => {
  if (candidate.valid !== current.valid) return candidate.valid;
  const stages = verificationStageOrder();
  const stageIndex = (report: VerificationReportV2): number =>
    report.failedAtStage === null
      ? stages.length
      : stages.indexOf(report.failedAtStage);
  const candidateStage = stageIndex(candidate);
  const currentStage = stageIndex(current);
  if (candidateStage !== currentStage) return candidateStage > currentStage;
  const hardFailureCount = (report: VerificationReportV2): number =>
    report.failures.filter((failure) => failure.severity === "hard").length;
  const candidateFailures = hardFailureCount(candidate);
  const currentFailures = hardFailureCount(current);
  if (candidateFailures !== currentFailures) {
    return candidateFailures < currentFailures;
  }
  return numericFailureDeficit(candidate) < numericFailureDeficit(current);
};

const isStaticPoseFailure = (report: VerificationReportV2): boolean =>
  report.failures.some(
    (failure) =>
      failure.failureId.startsWith("connections.connector_") ||
      failure.failureId === "collision.minimum_clearance",
  );

const edgeChoiceIndexes = (
  panel: SemanticPanelV2,
  currentIndex: number,
  minimumLengthMm: number,
): readonly number[] => {
  const geometry = panelGeometry(panel);
  if (!geometry.ok) return [currentIndex];
  const fittingIndexes = geometry.value.localVertices.flatMap((_, index) => {
    const edge = edgeFor(geometry.value, index);
    return edge.ok && edgeLengthMm(edge.value) >= minimumLengthMm
      ? [index]
      : [];
  });
  return [currentIndex, ...fittingIndexes]
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, MAXIMUM_EDGE_CHOICES_PER_PANEL);
};

const withDirectionConsistentStaticFolds = (
  plan: FabricationPlanV2,
): FabricationPlanV2 => ({
  ...plan,
  joints: plan.joints.map((joint) => {
    if (joint.kind !== "fold") return joint;
    const magnitudeDeg = Math.abs(joint.homeAngleDeg);
    const homeAngleDeg =
      joint.foldDirection === "valley" ? magnitudeDeg : -magnitudeDeg;
    return {
      ...joint,
      homeAngleDeg,
      minimumAngleDeg: Math.min(joint.minimumAngleDeg, homeAngleDeg),
      maximumAngleDeg: Math.max(joint.maximumAngleDeg, homeAngleDeg),
    };
  }),
});

const collisionFailure = (report: VerificationReportV2) =>
  report.failures.find(
    (failure) => failure.failureId === "collision.minimum_clearance",
  );

const panelKeyForId = (
  plan: FabricationPlanV2,
  panelId: string,
): string | null =>
  plan.panels.find((panel) => canonicalId("panel", panel.key) === panelId)
    ?.key ?? null;

const bodyKeyForPanelKey = (
  plan: FabricationPlanV2,
  panelKey: string,
): string | null =>
  plan.panels.find((panel) => panel.key === panelKey)?.bodyKey ?? null;

const jointPathBetweenBodies = (
  plan: FabricationPlanV2,
  firstBodyKey: string,
  secondBodyKey: string,
): readonly string[] => {
  if (firstBodyKey === secondBodyKey) return [];
  const adjacency = new Map<
    string,
    { readonly bodyKey: string; readonly jointKey: string }[]
  >();
  for (const joint of plan.joints) {
    const parentNeighbors = adjacency.get(joint.parentBodyKey) ?? [];
    parentNeighbors.push({ bodyKey: joint.childBodyKey, jointKey: joint.key });
    adjacency.set(joint.parentBodyKey, parentNeighbors);
    const childNeighbors = adjacency.get(joint.childBodyKey) ?? [];
    childNeighbors.push({ bodyKey: joint.parentBodyKey, jointKey: joint.key });
    adjacency.set(joint.childBodyKey, childNeighbors);
  }
  const previous = new Map<
    string,
    { readonly bodyKey: string; readonly jointKey: string }
  >();
  const visited = new Set([firstBodyKey]);
  const queue = [firstBodyKey];
  while (queue.length > 0) {
    const bodyKey = queue.shift();
    if (bodyKey === undefined) break;
    for (const neighbor of adjacency.get(bodyKey) ?? []) {
      if (visited.has(neighbor.bodyKey)) continue;
      visited.add(neighbor.bodyKey);
      previous.set(neighbor.bodyKey, {
        bodyKey,
        jointKey: neighbor.jointKey,
      });
      if (neighbor.bodyKey === secondBodyKey) {
        const jointKeys: string[] = [];
        let cursor = secondBodyKey;
        while (cursor !== firstBodyKey) {
          const step = previous.get(cursor);
          if (!step) return [];
          jointKeys.push(step.jointKey);
          cursor = step.bodyKey;
        }
        return jointKeys.reverse();
      }
      queue.push(neighbor.bodyKey);
    }
  }
  return [];
};

interface CollisionResolutionContext {
  readonly panelKeys: readonly [string, string];
  readonly jointKeys: readonly string[];
}

const collisionResolutionContext = (
  evaluation: ResolvedPlanEvaluation,
): CollisionResolutionContext | null => {
  const failure = collisionFailure(evaluation.report);
  if (!failure) return null;
  const panelIds = failure.geometryRefs
    .filter((reference) => reference.kind === "panel")
    .map((reference) => reference.id);
  const firstPanelId = panelIds[0];
  const secondPanelId = panelIds[1];
  if (!firstPanelId || !secondPanelId) return null;
  const firstPanelKey = panelKeyForId(evaluation.plan, firstPanelId);
  const secondPanelKey = panelKeyForId(evaluation.plan, secondPanelId);
  if (!firstPanelKey || !secondPanelKey) return null;
  const firstBodyKey = bodyKeyForPanelKey(evaluation.plan, firstPanelKey);
  const secondBodyKey = bodyKeyForPanelKey(evaluation.plan, secondPanelKey);
  if (!firstBodyKey || !secondBodyKey) return null;
  return {
    panelKeys: [firstPanelKey, secondPanelKey],
    jointKeys: jointPathBetweenBodies(
      evaluation.plan,
      firstBodyKey,
      secondBodyKey,
    ),
  };
};

const equalLengthAttachmentPairs = (
  plan: FabricationPlanV2,
  jointKey: string,
): readonly (readonly [number, number])[] => {
  const joint = plan.joints.find((candidate) => candidate.key === jointKey);
  if (!joint || joint.kind === "prismatic") return [];
  const parentPanel = plan.panels.find(
    (panel) => panel.key === joint.parentAttachment.panelKey,
  );
  const childPanel = plan.panels.find(
    (panel) => panel.key === joint.childAttachment.panelKey,
  );
  if (!parentPanel || !childPanel) return [];
  const parentGeometry = panelGeometry(parentPanel);
  const childGeometry = panelGeometry(childPanel);
  if (!parentGeometry.ok || !childGeometry.ok) return [];
  const pairs = parentGeometry.value.localVertices.flatMap((_, parentIndex) => {
    const parentEdge = edgeFor(parentGeometry.value, parentIndex);
    if (!parentEdge.ok) return [];
    return childGeometry.value.localVertices.flatMap((__, childIndex) => {
      const childEdge = edgeFor(childGeometry.value, childIndex);
      return childEdge.ok &&
        Math.abs(
          edgeLengthMm(parentEdge.value) - edgeLengthMm(childEdge.value),
        ) <= EDGE_LENGTH_TOLERANCE_MM
        ? ([[parentIndex, childIndex]] as const)
        : [];
    });
  });
  const current = [
    joint.parentAttachment.edgeIndex,
    joint.childAttachment.edgeIndex,
  ] as const;
  return [current, ...pairs]
    .filter(
      (pair, index, values) =>
        values.findIndex(
          (value) => value[0] === pair[0] && value[1] === pair[1],
        ) === index,
    )
    .slice(0, MAXIMUM_JOINT_ATTACHMENT_PAIRS);
};

const staticJointPlanVariants = (
  plan: FabricationPlanV2,
  jointKey: string,
): readonly FabricationPlanV2[] => {
  const jointIndex = plan.joints.findIndex((joint) => joint.key === jointKey);
  const joint = plan.joints[jointIndex];
  if (!joint || joint.kind === "prismatic") return [];
  const magnitudeDeg = Math.abs(joint.homeAngleDeg);
  const angleChoices = [
    joint.homeAngleDeg,
    magnitudeDeg,
    -magnitudeDeg,
    90,
    -90,
  ].filter(
    (value, index, values) =>
      Number.isFinite(value) && values.indexOf(value) === index,
  );
  return equalLengthAttachmentPairs(plan, jointKey).flatMap(
    ([parentEdgeIndex, childEdgeIndex]) =>
      angleChoices.flatMap((homeAngleDeg) => {
        const changed =
          parentEdgeIndex !== joint.parentAttachment.edgeIndex ||
          childEdgeIndex !== joint.childAttachment.edgeIndex ||
          homeAngleDeg !== joint.homeAngleDeg ||
          (joint.kind === "fold" &&
            joint.foldDirection !==
              (homeAngleDeg >= 0 ? "valley" : "mountain"));
        if (!changed) return [];
        return [
          {
            ...plan,
            joints: plan.joints.map((candidate, index) => {
              if (index !== jointIndex || candidate.kind === "prismatic") {
                return candidate;
              }
              const updated = {
                ...candidate,
                parentAttachment: {
                  ...candidate.parentAttachment,
                  edgeIndex: parentEdgeIndex,
                },
                childAttachment: {
                  ...candidate.childAttachment,
                  edgeIndex: childEdgeIndex,
                },
                homeAngleDeg,
                minimumAngleDeg: Math.min(
                  candidate.minimumAngleDeg,
                  homeAngleDeg,
                ),
                maximumAngleDeg: Math.max(
                  candidate.maximumAngleDeg,
                  homeAngleDeg,
                ),
              };
              return updated.kind === "fold"
                ? {
                    ...updated,
                    foldDirection: homeAngleDeg >= 0 ? "valley" : "mountain",
                  }
                : updated;
            }),
          },
        ];
      }),
  );
};

const connectorPlanVariants = (
  plan: FabricationPlanV2,
  relevantPanelKeys: ReadonlySet<string> | null,
): readonly {
  readonly groupKey: string;
  readonly plan: FabricationPlanV2;
}[] => {
  const variants: { groupKey: string; plan: FabricationPlanV2 }[] = [];
  for (const [
    relationshipIndex,
    relationship,
  ] of plan.connectorRelationships.entries()) {
    if (
      relevantPanelKeys &&
      !relevantPanelKeys.has(relationship.tabAttachment.panelKey) &&
      !relevantPanelKeys.has(relationship.slotAttachment.panelKey)
    ) {
      continue;
    }
    const tabPanel = plan.panels.find(
      (panel) => panel.key === relationship.tabAttachment.panelKey,
    );
    const slotPanel = plan.panels.find(
      (panel) => panel.key === relationship.slotAttachment.panelKey,
    );
    if (!tabPanel || !slotPanel) continue;
    const tabChoices = edgeChoiceIndexes(
      tabPanel,
      relationship.tabAttachment.edgeIndex,
      relationship.spanMm + LAYOUT_GAP_MM,
    );
    const slotChoices = edgeChoiceIndexes(
      slotPanel,
      relationship.slotAttachment.edgeIndex,
      relationship.spanMm + relationship.clearanceMm + 0.1 + LAYOUT_GAP_MM,
    );
    for (const tabEdgeIndex of tabChoices) {
      for (const slotEdgeIndex of slotChoices) {
        if (
          tabEdgeIndex === relationship.tabAttachment.edgeIndex &&
          slotEdgeIndex === relationship.slotAttachment.edgeIndex
        ) {
          continue;
        }
        variants.push({
          groupKey: `connector:${relationship.key}`,
          plan: {
            ...plan,
            connectorRelationships: plan.connectorRelationships.map(
              (candidate, index) =>
                index === relationshipIndex
                  ? {
                      ...candidate,
                      tabAttachment: {
                        ...candidate.tabAttachment,
                        edgeIndex: tabEdgeIndex,
                      },
                      slotAttachment: {
                        ...candidate.slotAttachment,
                        edgeIndex: slotEdgeIndex,
                      },
                    }
                  : candidate,
            ),
          },
        });
      }
    }
  }
  return variants;
};

const structuralCollisionError = (
  evaluation: ResolvedPlanEvaluation,
): StructuralCollisionError => {
  const failure = collisionFailure(evaluation.report);
  const panelIds = failure?.geometryRefs
    .filter((reference) => reference.kind === "panel")
    .map((reference) => reference.id);
  const firstPanelId = panelIds?.[0] ?? "panel-unknown-a";
  const secondPanelId = panelIds?.[1] ?? "panel-unknown-b";
  const actualClearanceMm =
    typeof failure?.actual.value === "number" ? failure.actual.value : 0;
  const requiredClearanceMm =
    typeof failure?.expected.value === "number" ? failure.expected.value : 0;
  return {
    kind: "structural_collision",
    code: "collision.minimum_clearance",
    path: ["collision", firstPanelId, secondPanelId],
    panelIds: [firstPanelId, secondPanelId],
    actualClearanceMm,
    requiredClearanceMm,
    report: evaluation.report,
    message: `${failure?.message ?? "The generated panels collide."} The model-selected topology could not be assembled without overlap using bounded attachment, fold-orientation, and home-angle choices.`,
  };
};

interface ResolutionCandidate {
  readonly evaluation: ResolvedPlanEvaluation;
  readonly groupKey: string;
  readonly serializedPlan: string;
}

const compareResolutionCandidates = (
  left: ResolutionCandidate,
  right: ResolutionCandidate,
): number => {
  if (reportIsBetter(left.evaluation.report, right.evaluation.report))
    return -1;
  if (reportIsBetter(right.evaluation.report, left.evaluation.report)) return 1;
  return left.serializedPlan.localeCompare(right.serializedPlan);
};

const selectCollisionSearchBeam = (
  candidates: readonly ResolutionCandidate[],
): readonly ResolvedPlanEvaluation[] => {
  const sorted = candidates.toSorted(compareResolutionCandidates);
  const selected: ResolutionCandidate[] = [];
  const selectedPlans = new Set<string>();
  const selectedGroups = new Set<string>();
  for (const candidate of sorted) {
    if (selectedGroups.has(candidate.groupKey)) continue;
    selected.push(candidate);
    selectedPlans.add(candidate.serializedPlan);
    selectedGroups.add(candidate.groupKey);
    if (selected.length >= COLLISION_SEARCH_BEAM_WIDTH) break;
  }
  for (const candidate of sorted) {
    if (selected.length >= COLLISION_SEARCH_BEAM_WIDTH) break;
    if (selectedPlans.has(candidate.serializedPlan)) continue;
    selected.push(candidate);
    selectedPlans.add(candidate.serializedPlan);
  }
  return selected.map((candidate) => candidate.evaluation);
};

/**
 * Sol chooses semantic topology and local attachments. For a static fold tree,
 * edge numbering, fold orientation, and a fixed orthogonal home pose are
 * discrete authoring choices that code can search inside a small budget. The
 * search follows the joint path between the measured colliding panels and
 * never changes panel dimensions, bodies, topology, or requested semantics.
 */
export const expandResolvedSemanticFabricationPlan = (
  intentInput: unknown,
  planInput: unknown,
  candidateOrdinal: number,
): ResolvedSemanticPlanExpansionResult => {
  const intent = FabricationIntentV1Schema.safeParse(intentInput);
  const plan = FabricationPlanV2Schema.safeParse(planInput);
  const initial = expandSemanticFabricationPlan(
    intentInput,
    planInput,
    candidateOrdinal,
  );
  if (!intent.success || !plan.success || !initial.ok) return initial;

  const evaluate = (
    candidatePlan: FabricationPlanV2,
  ): ResolvedPlanEvaluationResult => {
    const expanded = expandSemanticFabricationPlan(
      intent.data,
      candidatePlan,
      candidateOrdinal,
    );
    if (!expanded.ok) return expanded;
    const compiled = compileFabricationProgram(intent.data, expanded.value);
    if (!compiled.ok) return compiled;
    return {
      ok: true,
      value: {
        plan: candidatePlan,
        program: expanded.value,
        report: verifyFabricationIr(
          compiled.value,
          `candidate-plan-resolution-${candidateOrdinal}`,
        ),
      },
    };
  };

  const initialEvaluation = evaluate(plan.data);
  if (!initialEvaluation.ok) return initialEvaluation;
  if (
    initialEvaluation.value.report.valid ||
    intent.data.behavior !== "static" ||
    !isStaticPoseFailure(initialEvaluation.value.report)
  ) {
    return { ok: true, value: initialEvaluation.value.program };
  }

  let evaluationCount = 1;
  let best = initialEvaluation.value;
  let frontier: readonly ResolvedPlanEvaluation[] = [initialEvaluation.value];
  const seenPlans = new Set([canonicalSerialize(initialEvaluation.value.plan)]);

  for (
    let depth = 0;
    depth < MAXIMUM_COLLISION_SEARCH_DEPTH &&
    evaluationCount < MAXIMUM_PLAN_RESOLUTION_EVALUATIONS &&
    !best.report.valid;
    depth += 1
  ) {
    const nextCandidates: ResolutionCandidate[] = [];
    for (const current of frontier) {
      const context = collisionResolutionContext(current);
      const relevantPanelKeys = context ? new Set(context.panelKeys) : null;
      const variants: {
        readonly groupKey: string;
        readonly plan: FabricationPlanV2;
      }[] = [
        {
          groupKey: "fold:direction-consistency",
          plan: withDirectionConsistentStaticFolds(current.plan),
        },
        ...(context?.jointKeys.flatMap((jointKey) =>
          staticJointPlanVariants(current.plan, jointKey).map((variant) => ({
            groupKey: `joint:${jointKey}`,
            plan: variant,
          })),
        ) ?? []),
        ...connectorPlanVariants(current.plan, relevantPanelKeys),
      ];
      for (const variant of variants) {
        if (evaluationCount >= MAXIMUM_PLAN_RESOLUTION_EVALUATIONS) break;
        const serializedPlan = canonicalSerialize(variant.plan);
        if (seenPlans.has(serializedPlan)) continue;
        seenPlans.add(serializedPlan);
        evaluationCount += 1;
        const candidate = evaluate(variant.plan);
        if (!candidate.ok) continue;
        if (candidate.value.report.valid) {
          return { ok: true, value: candidate.value.program };
        }
        if (reportIsBetter(candidate.value.report, best.report)) {
          best = candidate.value;
        }
        nextCandidates.push({
          evaluation: candidate.value,
          groupKey: variant.groupKey,
          serializedPlan,
        });
      }
    }
    if (nextCandidates.length === 0) break;
    frontier = selectCollisionSearchBeam(nextCandidates);
  }

  return collisionFailure(best.report)
    ? { ok: false, error: structuralCollisionError(best) }
    : { ok: true, value: best.program };
};
