import { segmentsEquivalent, transformPoint2 } from "./polygon";
import type {
  ConnectorV1,
  FabricationPathV1,
  JointV1,
  PanelV1,
  Point2Mm,
  SlotConnectorV1,
} from "./types";

/** Source geometry may be normalized within the same tolerance as joint closure. */
export const PATH_EQUIVALENCE_TOLERANCE_MM = 0.1;

export interface DerivedCutPathShape {
  readonly pathId: string;
  readonly panelId: string;
  readonly points: readonly Point2Mm[];
  readonly closed: boolean;
}

interface Segment2Points {
  readonly start: Point2Mm;
  readonly end: Point2Mm;
}

const closedSegments = (
  points: readonly Point2Mm[],
): readonly Segment2Points[] =>
  points.map((start, index) => ({
    start,
    end: points[(index + 1) % points.length]!,
  }));

const jointAxisSegment = (joint: JointV1): Segment2Points | null =>
  joint.kind === "prismatic"
    ? null
    : {
        start: {
          xMm: joint.axis.startMm.xMm,
          yMm: joint.axis.startMm.yMm,
        },
        end: { xMm: joint.axis.endMm.xMm, yMm: joint.axis.endMm.yMm },
      };

const segmentMatches = (
  first: Segment2Points,
  second: Segment2Points,
): boolean =>
  segmentsEquivalent(
    first.start,
    first.end,
    second.start,
    second.end,
    PATH_EQUIVALENCE_TOLERANCE_MM,
  );

const panelParticipatesInFold = (panel: PanelV1, joint: JointV1): boolean =>
  joint.kind === "fold" &&
  (joint.parentBodyId === panel.bodyId || joint.childBodyId === panel.bodyId);

/**
 * Emits only perimeter segments that must be cut. A shared fold edge remains
 * part of both panel meshes, but is deliberately absent from the CUT layer.
 */
export const derivePanelBoundaryCutPaths = (
  panel: PanelV1,
  joints: readonly JointV1[],
): readonly DerivedCutPathShape[] => {
  const placedContour = panel.contour.vertices.map((point) =>
    transformPoint2(point, panel.flatTransform),
  );
  const foldSegments = joints
    .filter((joint) => panelParticipatesInFold(panel, joint))
    .map(jointAxisSegment)
    .filter((segment): segment is Segment2Points => segment !== null);

  return closedSegments(placedContour).flatMap((segment, index) =>
    foldSegments.some((foldSegment) => segmentMatches(segment, foldSegment))
      ? []
      : [
          {
            pathId: `${panel.panelId}.cut.edge-${index + 1}`,
            panelId: panel.panelId,
            points: [segment.start, segment.end],
            closed: false,
          },
        ],
  );
};

const slotContour = (slot: SlotConnectorV1): readonly Point2Mm[] => {
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

/**
 * Slot contours are closed cuts. Tab roots remain attached, and tab edges that
 * are already represented by the panel perimeter are not emitted twice.
 */
export const deriveConnectorCutPaths = (
  connector: ConnectorV1,
  panel: PanelV1,
  panelBoundaryPaths: readonly DerivedCutPathShape[],
): readonly DerivedCutPathShape[] => {
  if (connector.kind === "slot") {
    return [
      {
        pathId: `${connector.connectorId}.cut`,
        panelId: panel.panelId,
        points: slotContour(connector).map((point) =>
          transformPoint2(point, panel.flatTransform),
        ),
        closed: true,
      },
    ];
  }

  const root: Segment2Points = {
    start: transformPoint2(connector.rootEdge.start, panel.flatTransform),
    end: transformPoint2(connector.rootEdge.end, panel.flatTransform),
  };
  const perimeterSegments = panelBoundaryPaths
    .filter((path) => path.points.length === 2)
    .map((path) => ({ start: path.points[0]!, end: path.points[1]! }));
  const contour = connector.contour.vertices.map((point) =>
    transformPoint2(point, panel.flatTransform),
  );

  return closedSegments(contour).flatMap((segment, index) =>
    segmentMatches(segment, root) ||
    perimeterSegments.some((panelSegment) =>
      segmentMatches(segment, panelSegment),
    )
      ? []
      : [
          {
            pathId: `${connector.connectorId}.cut.edge-${index + 1}`,
            panelId: panel.panelId,
            points: [segment.start, segment.end],
            closed: false,
          },
        ],
  );
};

export const cutPathFromShape = (
  shape: DerivedCutPathShape,
  panel: PanelV1,
): FabricationPathV1 => ({
  pathId: shape.pathId,
  sheetId: panel.sheetId,
  panelId: panel.panelId,
  kind: "cut",
  points: shape.points,
  closed: shape.closed,
  strokeWidthMm: 0.1,
});
