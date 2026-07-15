import {
  isSimplePolygon,
  pointInPolygon,
  polygonCentroid,
  segmentsEquivalent,
  signedPolygonAreaMm2,
} from "./polygon";
import type {
  ConnectorV1,
  PanelV1,
  Point2Mm,
  SlotConnectorV1,
  TabConnectorV1,
} from "./types";

const CONNECTOR_GEOMETRY_TOLERANCE_MM = 0.1;

interface ContourSegment {
  readonly start: Point2Mm;
  readonly end: Point2Mm;
}

export type PanelMaterialHole =
  | {
      readonly holeId: string;
      readonly source: "inner_cut";
      readonly connectorId: null;
      readonly vertices: readonly Point2Mm[];
    }
  | {
      readonly holeId: string;
      readonly source: "slot";
      readonly connectorId: string;
      readonly vertices: readonly Point2Mm[];
    };

export type TabAttachmentKind = "internal_flap" | "perimeter_tab";

export interface ConnectorPairFit {
  readonly fits: boolean;
  readonly slotWidthMm: number;
  readonly requiredSlotWidthMm: number;
  readonly slotLengthMm: number;
  readonly requiredSlotLengthMm: number;
}

const CONNECTOR_DIRECTION_COSINE_TOLERANCE = 1e-6;

const contourSegments = (
  vertices: readonly Point2Mm[],
): readonly ContourSegment[] =>
  vertices.map((start, index) => ({
    start,
    end: vertices[(index + 1) % vertices.length]!,
  }));

const segmentsMatch = (
  first: ContourSegment,
  second: ContourSegment,
): boolean =>
  segmentsEquivalent(
    first.start,
    first.end,
    second.start,
    second.end,
    CONNECTOR_GEOMETRY_TOLERANCE_MM,
  );

/** Exact rectangular material removed by a slot connector, in panel coordinates. */
export const slotConnectorContour = (
  slot: SlotConnectorV1,
): readonly Point2Mm[] => {
  const deltaXmm = slot.centerline.end.xMm - slot.centerline.start.xMm;
  const deltaYmm = slot.centerline.end.yMm - slot.centerline.start.yMm;
  const lengthMm = Math.hypot(deltaXmm, deltaYmm);
  const normalX = lengthMm > 0 ? -deltaYmm / lengthMm : 0;
  const normalY = lengthMm > 0 ? deltaXmm / lengthMm : 0;
  const halfWidthMm = slot.widthMm / 2;
  return [
    {
      xMm: slot.centerline.start.xMm + normalX * halfWidthMm,
      yMm: slot.centerline.start.yMm + normalY * halfWidthMm,
    },
    {
      xMm: slot.centerline.end.xMm + normalX * halfWidthMm,
      yMm: slot.centerline.end.yMm + normalY * halfWidthMm,
    },
    {
      xMm: slot.centerline.end.xMm - normalX * halfWidthMm,
      yMm: slot.centerline.end.yMm - normalY * halfWidthMm,
    },
    {
      xMm: slot.centerline.start.xMm - normalX * halfWidthMm,
      yMm: slot.centerline.start.yMm - normalY * halfWidthMm,
    },
  ];
};

/** Every area-removing contour used by verification, collision meshes, and exports. */
export const panelMaterialHoles = (
  panel: PanelV1,
  connectors: readonly ConnectorV1[],
): readonly PanelMaterialHole[] => [
  ...panel.innerCutContours.map((contour, index) => ({
    holeId: `${panel.panelId}.inner-${index + 1}`,
    source: "inner_cut" as const,
    connectorId: null,
    vertices: contour.vertices,
  })),
  ...connectors.flatMap((connector) =>
    connector.kind === "slot" && connector.panelId === panel.panelId
      ? [
          {
            holeId: connector.connectorId,
            source: "slot" as const,
            connectorId: connector.connectorId,
            vertices: slotConnectorContour(connector),
          },
        ]
      : [],
  ),
];

export const panelNetMaterialAreaMm2 = (
  panel: PanelV1,
  connectors: readonly ConnectorV1[],
): number =>
  Math.abs(signedPolygonAreaMm2(panel.contour.vertices)) -
  panelMaterialHoles(panel, connectors)
    .filter(
      (hole) =>
        hole.source === "inner_cut" ||
        (isSimplePolygon(hole.vertices) &&
          hole.vertices.every((point) =>
            pointInPolygon(point, panel.contour.vertices, false),
          )),
    )
    .reduce(
      (areaMm2, hole) =>
        areaMm2 + Math.abs(signedPolygonAreaMm2(hole.vertices)),
      0,
    );

/**
 * Classifies only tabs whose declared root leaves the source material attached.
 * An internal flap is cut on three sides; a perimeter tab reuses every outer
 * edge except its root chord.
 */
export const classifyTabAttachment = (
  tab: TabConnectorV1,
  panel: PanelV1,
): TabAttachmentKind | null => {
  const tabEdges = contourSegments(tab.contour.vertices);
  const panelEdges = contourSegments(panel.contour.vertices);
  const root: ContourSegment = tab.rootEdge;
  const rootEdgeIndices = tabEdges.flatMap((edge, index) =>
    segmentsMatch(edge, root) ? [index] : [],
  );
  if (rootEdgeIndices.length !== 1) return null;

  const rootEdgeIndex = rootEdgeIndices[0]!;
  const perimeterMatches = tabEdges.map((edge) =>
    panelEdges.some((panelEdge) => segmentsMatch(edge, panelEdge)),
  );
  const everyVertexInside = tab.contour.vertices.every((point) =>
    pointInPolygon(point, panel.contour.vertices),
  );
  if (!everyVertexInside) return null;

  const everyVertexStrictlyInside = tab.contour.vertices.every((point) =>
    pointInPolygon(point, panel.contour.vertices, false),
  );
  if (
    everyVertexStrictlyInside &&
    perimeterMatches.every((matches) => !matches)
  ) {
    return "internal_flap";
  }

  return !perimeterMatches[rootEdgeIndex] &&
    perimeterMatches.every(
      (matches, index) => index === rootEdgeIndex || matches,
    )
    ? "perimeter_tab"
    : null;
};

/**
 * Measures whether a reciprocal tab/slot pair can physically mate. Slot width
 * clears the stock thickness; slot length clears the tab's widest span along
 * its own root tangent. This captures flared tabs while remaining rotation-
 * and frame-invariant, unlike projecting coordinates from two unrelated panel
 * frames. The larger declared clearance governs the pair.
 */
export const connectorPairFit = (
  tab: TabConnectorV1,
  slot: SlotConnectorV1,
  tabPanelThicknessMm: number,
): ConnectorPairFit => {
  const deltaXmm = slot.centerline.end.xMm - slot.centerline.start.xMm;
  const deltaYmm = slot.centerline.end.yMm - slot.centerline.start.yMm;
  const slotLengthMm = Math.hypot(deltaXmm, deltaYmm);
  const tabRootLengthMm = Math.hypot(
    tab.rootEdge.end.xMm - tab.rootEdge.start.xMm,
    tab.rootEdge.end.yMm - tab.rootEdge.start.yMm,
  );
  const tabSpanMm = (() => {
    if (
      tabRootLengthMm <= 0 ||
      !Number.isFinite(tabRootLengthMm) ||
      tab.contour.vertices.length === 0
    ) {
      return Number.POSITIVE_INFINITY;
    }
    const tangentX =
      (tab.rootEdge.end.xMm - tab.rootEdge.start.xMm) / tabRootLengthMm;
    const tangentY =
      (tab.rootEdge.end.yMm - tab.rootEdge.start.yMm) / tabRootLengthMm;
    const projected = tab.contour.vertices.map(
      (point) => point.xMm * tangentX + point.yMm * tangentY,
    );
    return Math.max(...projected) - Math.min(...projected);
  })();
  const pairClearanceMm = Math.max(tab.clearanceMm, slot.clearanceMm);
  const requiredSlotWidthMm = tabPanelThicknessMm + pairClearanceMm;
  const requiredSlotLengthMm = tabSpanMm + pairClearanceMm;
  return {
    fits:
      Number.isFinite(requiredSlotWidthMm) &&
      Number.isFinite(requiredSlotLengthMm) &&
      slot.widthMm >= requiredSlotWidthMm &&
      slotLengthMm >= requiredSlotLengthMm,
    slotWidthMm: slot.widthMm,
    requiredSlotWidthMm,
    slotLengthMm,
    requiredSlotLengthMm,
  };
};

/** Absolute cosine for reciprocal insertion axes; parallel and antiparallel mate. */
export const connectorInsertionAlignment = (
  tab: TabConnectorV1,
  slot: SlotConnectorV1,
): number | null => {
  const tabLength = Math.hypot(
    tab.insertionDirection.x,
    tab.insertionDirection.y,
    tab.insertionDirection.z,
  );
  const slotLength = Math.hypot(
    slot.insertionDirection.x,
    slot.insertionDirection.y,
    slot.insertionDirection.z,
  );
  if (
    !Number.isFinite(tabLength) ||
    !Number.isFinite(slotLength) ||
    tabLength <= 0 ||
    slotLength <= 0
  ) {
    return null;
  }
  const dot =
    tab.insertionDirection.x * slot.insertionDirection.x +
    tab.insertionDirection.y * slot.insertionDirection.y +
    tab.insertionDirection.z * slot.insertionDirection.z;
  return Math.min(1, Math.abs(dot / (tabLength * slotLength)));
};

export const connectorInsertionDirectionsCompatible = (
  tab: TabConnectorV1,
  slot: SlotConnectorV1,
): boolean => {
  const alignment = connectorInsertionAlignment(tab, slot);
  return (
    alignment !== null && 1 - alignment <= CONNECTOR_DIRECTION_COSINE_TOLERANCE
  );
};

/** Canonical point used to bind a connector to a declared joint anchor. */
export const connectorReferencePoint2 = (connector: ConnectorV1): Point2Mm =>
  connector.kind === "tab"
    ? polygonCentroid(connector.contour.vertices)
    : {
        xMm:
          (connector.centerline.start.xMm + connector.centerline.end.xMm) / 2,
        yMm:
          (connector.centerline.start.yMm + connector.centerline.end.yMm) / 2,
      };
