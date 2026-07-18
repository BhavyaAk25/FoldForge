import { FABRICATION_KINEMATIC_LIMITS, FABRICATION_LIMITS } from "./limits";
import { buildDirectedBodyTopology } from "./topology";
import type {
  ConnectorV1,
  FabricationPlanV1,
  JointV1,
  PlannedPanelBlueprintV1,
  Point2Mm,
  RequestedSizeV1,
  SheetV1,
  Transform2Mm,
} from "./types";

const EPSILON_MM = 1e-7;
// A small deterministic guard avoids a mathematically 1 mm split being
// reconstructed as 0.99999998 mm after normalized-coordinate scaling.
const LAYOUT_FEATURE_GAP_MM = FABRICATION_LIMITS.minimumFeatureMm + 0.01;
const QUARTER_TURNS_DEG = [0, 90, 180, 270] as const;
const IDENTITY_TRANSFORM_3D = {
  translationMm: { xMm: 0, yMm: 0, zMm: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
} as const;

interface Bounds2Mm {
  readonly minimumXmm: number;
  readonly minimumYmm: number;
  readonly maximumXmm: number;
  readonly maximumYmm: number;
}

type RectangleSide = "top" | "right" | "bottom" | "left";

interface Segment2Mm {
  readonly start: Point2Mm;
  readonly end: Point2Mm;
}

interface PlacedPanel {
  readonly panelId: string;
  readonly transform: Transform2Mm;
  readonly bounds: Bounds2Mm;
}

interface CompletedLayout {
  readonly placed: ReadonlyMap<string, PlacedPanel>;
  readonly attachments: readonly Attachment[];
  readonly score: number;
}

interface Attachment {
  readonly jointId: string;
  readonly parentPanelId: string;
  readonly childPanelId: string;
  readonly parentSide: RectangleSide;
  readonly segment: Segment2Mm;
}

type FoldJoint = Extract<JointV1, { kind: "fold" }>;

const isFoldJoint = (joint: JointV1): joint is FoldJoint =>
  joint.kind === "fold";

export type FoldPlanNormalizationResult =
  | { readonly ok: true; readonly value: FabricationPlanV1 }
  | {
      readonly ok: false;
      readonly path: readonly string[];
      readonly message: string;
    };

const rotateQuarterTurn = (
  point: Point2Mm,
  rotationDeg: (typeof QUARTER_TURNS_DEG)[number],
): Point2Mm => {
  switch (rotationDeg) {
    case 0:
      return point;
    case 90:
      return { xMm: -point.yMm, yMm: point.xMm };
    case 180:
      return { xMm: -point.xMm, yMm: -point.yMm };
    case 270:
      return { xMm: point.yMm, yMm: -point.xMm };
  }
};

const transformPoint = (point: Point2Mm, transform: Transform2Mm): Point2Mm => {
  const rotation = QUARTER_TURNS_DEG.find(
    (candidate) => candidate === transform.rotationDeg,
  );
  if (rotation !== undefined) {
    const rotated = rotateQuarterTurn(point, rotation);
    return {
      xMm: rotated.xMm + transform.translationMm.xMm,
      yMm: rotated.yMm + transform.translationMm.yMm,
    };
  }
  const radians = (transform.rotationDeg * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    xMm: point.xMm * cosine - point.yMm * sine + transform.translationMm.xMm,
    yMm: point.xMm * sine + point.yMm * cosine + transform.translationMm.yMm,
  };
};

const rectangleCorners = (
  panel: Pick<PlannedPanelBlueprintV1, "widthMm" | "heightMm">,
): readonly Point2Mm[] => [
  { xMm: 0, yMm: 0 },
  { xMm: panel.widthMm, yMm: 0 },
  { xMm: panel.widthMm, yMm: panel.heightMm },
  { xMm: 0, yMm: panel.heightMm },
];

const boundsFor = (
  panel: Pick<PlannedPanelBlueprintV1, "widthMm" | "heightMm">,
  transform: Transform2Mm,
): Bounds2Mm => {
  const points = rectangleCorners(panel).map((point) =>
    transformPoint(point, transform),
  );
  return {
    minimumXmm: Math.min(...points.map((point) => point.xMm)),
    minimumYmm: Math.min(...points.map((point) => point.yMm)),
    maximumXmm: Math.max(...points.map((point) => point.xMm)),
    maximumYmm: Math.max(...points.map((point) => point.yMm)),
  };
};

const segmentLengthMm = (segment: Segment2Mm): number =>
  Math.hypot(
    segment.end.xMm - segment.start.xMm,
    segment.end.yMm - segment.start.yMm,
  );

const pointsNear = (first: Point2Mm, second: Point2Mm): boolean =>
  Math.hypot(first.xMm - second.xMm, first.yMm - second.yMm) <= EPSILON_MM;

const segmentsEquivalent = (first: Segment2Mm, second: Segment2Mm): boolean =>
  (pointsNear(first.start, second.start) &&
    pointsNear(first.end, second.end)) ||
  (pointsNear(first.start, second.end) && pointsNear(first.end, second.start));

const placedPanelEdges = (
  panel: PlannedPanelBlueprintV1,
  transform: Transform2Mm,
): readonly Segment2Mm[] => {
  const points = panel.contour.vertices.map((point) =>
    transformPoint(
      { xMm: point.u * panel.widthMm, yMm: point.v * panel.heightMm },
      transform,
    ),
  );
  return points.map((start, index) => ({
    start,
    end: points[(index + 1) % points.length]!,
  }));
};

const axisSegment = (
  joint: Extract<JointV1, { kind: "fold" }>,
): Segment2Mm => ({
  start: {
    xMm: joint.axis.startMm.xMm,
    yMm: joint.axis.startMm.yMm,
  },
  end: { xMm: joint.axis.endMm.xMm, yMm: joint.axis.endMm.yMm },
});

const boundsInteriorOverlap = (first: Bounds2Mm, second: Bounds2Mm): boolean =>
  Math.min(first.maximumXmm, second.maximumXmm) -
    Math.max(first.minimumXmm, second.minimumXmm) >
    EPSILON_MM &&
  Math.min(first.maximumYmm, second.maximumYmm) -
    Math.max(first.minimumYmm, second.minimumYmm) >
    EPSILON_MM;

const boundsClearanceMm = (first: Bounds2Mm, second: Bounds2Mm): number => {
  const horizontalMm = Math.max(
    0,
    first.minimumXmm - second.maximumXmm,
    second.minimumXmm - first.maximumXmm,
  );
  const verticalMm = Math.max(
    0,
    first.minimumYmm - second.maximumYmm,
    second.minimumYmm - first.maximumYmm,
  );
  return Math.hypot(horizontalMm, verticalMm);
};

const fitsSheet = (bounds: Bounds2Mm, sheet: SheetV1): boolean =>
  bounds.minimumXmm >= sheet.printableMarginMm - EPSILON_MM &&
  bounds.minimumYmm >= sheet.printableMarginMm - EPSILON_MM &&
  bounds.maximumXmm <= sheet.widthMm - sheet.printableMarginMm + EPSILON_MM &&
  bounds.maximumYmm <= sheet.heightMm - sheet.printableMarginMm + EPSILON_MM;

const sideSegment = (
  bounds: Bounds2Mm,
  side: RectangleSide,
  startMm: number,
  lengthMm: number,
): Segment2Mm => {
  switch (side) {
    case "top":
      return {
        start: { xMm: startMm, yMm: bounds.minimumYmm },
        end: { xMm: startMm + lengthMm, yMm: bounds.minimumYmm },
      };
    case "right":
      return {
        start: { xMm: bounds.maximumXmm, yMm: startMm },
        end: { xMm: bounds.maximumXmm, yMm: startMm + lengthMm },
      };
    case "bottom":
      return {
        start: { xMm: startMm + lengthMm, yMm: bounds.maximumYmm },
        end: { xMm: startMm, yMm: bounds.maximumYmm },
      };
    case "left":
      return {
        start: { xMm: bounds.minimumXmm, yMm: startMm + lengthMm },
        end: { xMm: bounds.minimumXmm, yMm: startMm },
      };
  }
};

const sideRange = (
  bounds: Bounds2Mm,
  side: RectangleSide,
): readonly [number, number] =>
  side === "top" || side === "bottom"
    ? [bounds.minimumXmm, bounds.maximumXmm]
    : [bounds.minimumYmm, bounds.maximumYmm];

const intervalForSegment = (
  segment: Segment2Mm,
  side: RectangleSide,
): readonly [number, number] => {
  const values =
    side === "top" || side === "bottom"
      ? [segment.start.xMm, segment.end.xMm]
      : [segment.start.yMm, segment.end.yMm];
  return [Math.min(...values), Math.max(...values)];
};

const uniqueSorted = (values: readonly number[]): readonly number[] =>
  [...new Set(values.map((value) => Number(value.toFixed(9))))].sort(
    (left, right) => left - right,
  );

const attachmentStarts = (
  bounds: Bounds2Mm,
  side: RectangleSide,
  lengthMm: number,
  attachments: readonly Attachment[],
): readonly number[] => {
  const [minimum, maximum] = sideRange(bounds, side);
  const intervals = attachments
    .filter((attachment) => attachment.parentSide === side)
    .map((attachment) => intervalForSegment(attachment.segment, side));
  return uniqueSorted([
    minimum,
    maximum - lengthMm,
    (minimum + maximum - lengthMm) / 2,
    ...intervals.flatMap(([start, end]) => [
      end + LAYOUT_FEATURE_GAP_MM,
      start - LAYOUT_FEATURE_GAP_MM - lengthMm,
    ]),
  ]).filter(
    (start) =>
      start >= minimum - EPSILON_MM && start + lengthMm <= maximum + EPSILON_MM,
  );
};

const splitLengthsAreManufacturable = (
  bounds: Bounds2Mm,
  side: RectangleSide,
  candidate: Segment2Mm,
  attachments: readonly Attachment[],
): boolean => {
  const [minimum, maximum] = sideRange(bounds, side);
  const breakpoints = uniqueSorted([
    minimum,
    maximum,
    ...attachments
      .filter((attachment) => attachment.parentSide === side)
      .flatMap((attachment) => intervalForSegment(attachment.segment, side)),
    ...intervalForSegment(candidate, side),
  ]);
  return breakpoints.slice(1).every((point, index) => {
    const lengthMm = point - breakpoints[index]!;
    return (
      lengthMm <= EPSILON_MM ||
      lengthMm >= FABRICATION_LIMITS.minimumFeatureMm - EPSILON_MM
    );
  });
};

const localRectangleEdges = (
  panel: PlannedPanelBlueprintV1,
): readonly Segment2Mm[] => {
  const corners = rectangleCorners(panel);
  return corners.map((start, index) => ({
    start,
    end: corners[(index + 1) % corners.length]!,
  }));
};

const transformFromEdge = (
  localEdge: Segment2Mm,
  targetEdge: Segment2Mm,
  rotationDeg: (typeof QUARTER_TURNS_DEG)[number],
): Transform2Mm | null => {
  const rotatedStart = rotateQuarterTurn(localEdge.start, rotationDeg);
  const rotatedEnd = rotateQuarterTurn(localEdge.end, rotationDeg);
  const localVector = {
    xMm: rotatedEnd.xMm - rotatedStart.xMm,
    yMm: rotatedEnd.yMm - rotatedStart.yMm,
  };
  const targetVector = {
    xMm: targetEdge.end.xMm - targetEdge.start.xMm,
    yMm: targetEdge.end.yMm - targetEdge.start.yMm,
  };
  if (
    Math.abs(localVector.xMm - targetVector.xMm) > EPSILON_MM ||
    Math.abs(localVector.yMm - targetVector.yMm) > EPSILON_MM
  ) {
    return null;
  }
  return {
    translationMm: {
      xMm: targetEdge.start.xMm - rotatedStart.xMm,
      yMm: targetEdge.start.yMm - rotatedStart.yMm,
    },
    rotationDeg,
  };
};

const extendsOutsideParent = (
  child: Bounds2Mm,
  parent: Bounds2Mm,
  side: RectangleSide,
): boolean => {
  switch (side) {
    case "top":
      return child.maximumYmm <= parent.minimumYmm + EPSILON_MM;
    case "right":
      return child.minimumXmm >= parent.maximumXmm - EPSILON_MM;
    case "bottom":
      return child.minimumYmm >= parent.maximumYmm - EPSILON_MM;
    case "left":
      return child.maximumXmm <= parent.minimumXmm + EPSILON_MM;
  }
};

const compatibleExistingLayout = (
  plan: FabricationPlanV1,
  foldJoints: readonly FoldJoint[],
  panelByBodyId: ReadonlyMap<string, PlannedPanelBlueprintV1>,
  sheetById: ReadonlyMap<string, SheetV1>,
): boolean => {
  for (const panel of plan.panels) {
    const sheet = sheetById.get(panel.sheetId);
    if (!sheet) return false;
    const points = panel.contour.vertices.map((point) =>
      transformPoint(
        { xMm: point.u * panel.widthMm, yMm: point.v * panel.heightMm },
        panel.flatTransform,
      ),
    );
    const bounds = {
      minimumXmm: Math.min(...points.map((point) => point.xMm)),
      minimumYmm: Math.min(...points.map((point) => point.yMm)),
      maximumXmm: Math.max(...points.map((point) => point.xMm)),
      maximumYmm: Math.max(...points.map((point) => point.yMm)),
    };
    if (!fitsSheet(bounds, sheet)) return false;
  }

  for (let firstIndex = 0; firstIndex < plan.panels.length; firstIndex += 1) {
    const first = plan.panels[firstIndex]!;
    const firstBounds = boundsFor(first, first.flatTransform);
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < plan.panels.length;
      secondIndex += 1
    ) {
      const second = plan.panels[secondIndex]!;
      if (
        first.sheetId === second.sheetId &&
        boundsInteriorOverlap(
          firstBounds,
          boundsFor(second, second.flatTransform),
        )
      ) {
        return false;
      }
    }
  }

  return foldJoints.every((joint) => {
    const parent = panelByBodyId.get(joint.parentBodyId)!;
    const child = panelByBodyId.get(joint.childBodyId)!;
    if (parent.sheetId !== child.sheetId) return false;
    const axis = axisSegment(joint);
    return (
      placedPanelEdges(parent, parent.flatTransform).some((edge) =>
        segmentsEquivalent(edge, axis),
      ) &&
      placedPanelEdges(child, child.flatTransform).some((edge) =>
        segmentsEquivalent(edge, axis),
      )
    );
  });
};

const connectorReferences = (plan: FabricationPlanV1): ReadonlySet<string> => {
  const referenced = new Set<string>();
  for (const joint of plan.joints) {
    if (joint.kind === "revolute") {
      joint.connectorIds.forEach((connectorId) => referenced.add(connectorId));
    } else if (joint.kind === "prismatic") {
      joint.guideConnectorIds.forEach((connectorId) =>
        referenced.add(connectorId),
      );
    }
  }
  for (const coupling of plan.couplings) {
    if (coupling.kind !== "cam_slot") continue;
    referenced.add(coupling.slotConnectorId);
    referenced.add(coupling.followerConnectorId);
  }
  for (const part of plan.semanticParts) {
    part.geometryRefs
      .filter((reference) => reference.kind === "connector")
      .forEach((reference) => referenced.add(reference.id));
  }
  const connectorById = new Map(
    plan.connectors.map((connector) => [connector.connectorId, connector]),
  );
  for (const connectorId of [...referenced]) {
    const mate = connectorById.get(connectorId)?.mateConnectorId;
    if (mate) referenced.add(mate);
  }
  return referenced;
};

const withoutUnusedConnectors = (
  plan: FabricationPlanV1,
): FabricationPlanV1 => {
  const required = connectorReferences(plan);
  if (required.size === plan.connectors.length) return plan;
  return {
    ...plan,
    connectors: plan.connectors.filter((connector) =>
      required.has(connector.connectorId),
    ),
  };
};

const localSpanIsHorizontal = (transform: Transform2Mm): boolean =>
  transform.rotationDeg % 180 === 0;

/**
 * Connector coordinates authored for a discarded flat placement are no
 * longer meaningful. For retained semantic tab/slot pairs, derive a compact
 * internal flap and receiver from the preserved panel dimensions and IDs.
 */
const normalizedConnectorPairs = (
  connectors: readonly ConnectorV1[],
  panels: readonly PlannedPanelBlueprintV1[],
  sheetById: ReadonlyMap<string, SheetV1>,
): readonly ConnectorV1[] => {
  const panelById = new Map(panels.map((panel) => [panel.panelId, panel]));
  const connectorById = new Map(
    connectors.map((connector) => [connector.connectorId, connector]),
  );
  const normalized = new Map<string, ConnectorV1>();

  for (const connector of connectors) {
    if (connector.kind !== "tab" || normalized.has(connector.connectorId)) {
      continue;
    }
    const slot = connectorById.get(connector.mateConnectorId);
    const tabPanel = panelById.get(connector.panelId);
    const slotPanel = slot ? panelById.get(slot.panelId) : undefined;
    if (
      slot?.kind !== "slot" ||
      slot.mateConnectorId !== connector.connectorId ||
      !tabPanel ||
      !slotPanel
    ) {
      continue;
    }
    const tabHorizontal = localSpanIsHorizontal(tabPanel.flatTransform);
    const slotHorizontal = localSpanIsHorizontal(slotPanel.flatTransform);
    const tabSpanCapacityMm =
      (tabHorizontal ? tabPanel.widthMm : tabPanel.heightMm) - 4;
    const slotSpanCapacityMm =
      (slotHorizontal ? slotPanel.widthMm : slotPanel.heightMm) - 4;
    const clearanceMm = Math.max(
      FABRICATION_LIMITS.minimumFeatureMm / 5,
      connector.clearanceMm,
      slot.clearanceMm,
    );
    const spanMm = Math.min(
      10,
      tabSpanCapacityMm,
      slotSpanCapacityMm - clearanceMm - 0.1,
    );
    const tabDepthCapacityMm =
      (tabHorizontal ? tabPanel.heightMm : tabPanel.widthMm) - 4;
    const depthMm = Math.min(6, tabDepthCapacityMm);
    if (
      spanMm < FABRICATION_LIMITS.minimumFeatureMm ||
      depthMm < FABRICATION_LIMITS.minimumFeatureMm
    ) {
      continue;
    }

    const tabCenter = { xMm: tabPanel.widthMm / 2, yMm: tabPanel.heightMm / 2 };
    const rootStart = tabHorizontal
      ? { xMm: tabCenter.xMm - spanMm / 2, yMm: tabCenter.yMm - depthMm / 2 }
      : { xMm: tabCenter.xMm - depthMm / 2, yMm: tabCenter.yMm - spanMm / 2 };
    const rootEnd = tabHorizontal
      ? { xMm: rootStart.xMm + spanMm, yMm: rootStart.yMm }
      : { xMm: rootStart.xMm, yMm: rootStart.yMm + spanMm };
    const tabContour = tabHorizontal
      ? [
          rootStart,
          rootEnd,
          { xMm: rootEnd.xMm, yMm: rootEnd.yMm + depthMm },
          { xMm: rootStart.xMm, yMm: rootStart.yMm + depthMm },
        ]
      : [
          rootStart,
          rootEnd,
          { xMm: rootEnd.xMm + depthMm, yMm: rootEnd.yMm },
          { xMm: rootStart.xMm + depthMm, yMm: rootStart.yMm },
        ];
    const slotLengthMm = spanMm + clearanceMm + 0.1;
    const slotCenter = {
      xMm: slotPanel.widthMm / 2,
      yMm: slotPanel.heightMm / 2,
    };
    const centerline = slotHorizontal
      ? {
          start: {
            xMm: slotCenter.xMm - slotLengthMm / 2,
            yMm: slotCenter.yMm,
          },
          end: {
            xMm: slotCenter.xMm + slotLengthMm / 2,
            yMm: slotCenter.yMm,
          },
        }
      : {
          start: {
            xMm: slotCenter.xMm,
            yMm: slotCenter.yMm - slotLengthMm / 2,
          },
          end: {
            xMm: slotCenter.xMm,
            yMm: slotCenter.yMm + slotLengthMm / 2,
          },
        };
    const thicknessMm =
      sheetById.get(tabPanel.sheetId)?.material.thicknessMm ?? 0;
    normalized.set(connector.connectorId, {
      ...connector,
      contour: { vertices: tabContour },
      rootEdge: { start: rootStart, end: rootEnd },
      insertionDirection: { x: 0, y: 0, z: 1 },
      clearanceMm,
    });
    normalized.set(slot.connectorId, {
      ...slot,
      centerline,
      widthMm: Math.max(
        FABRICATION_LIMITS.minimumFeatureMm,
        thicknessMm + clearanceMm,
      ),
      insertionDirection: { x: 0, y: 0, z: -1 },
      clearanceMm,
    });
  }

  return connectors.map(
    (connector) => normalized.get(connector.connectorId) ?? connector,
  );
};

const normalizedContour = (
  panel: PlannedPanelBlueprintV1,
  transform: Transform2Mm,
  segments: readonly Segment2Mm[],
): PlannedPanelBlueprintV1["contour"] => {
  const inversePoint = (point: Point2Mm): Point2Mm => {
    const translated = {
      xMm: point.xMm - transform.translationMm.xMm,
      yMm: point.yMm - transform.translationMm.yMm,
    };
    const inverseRotation = ((360 - transform.rotationDeg) % 360) as
      0 | 90 | 180 | 270;
    return rotateQuarterTurn(translated, inverseRotation);
  };
  const top = [0, 1];
  const right = [0, 1];
  const bottom = [0, 1];
  const left = [0, 1];
  for (const segment of segments) {
    for (const point of [segment.start, segment.end]) {
      const local = inversePoint(point);
      const u = local.xMm / panel.widthMm;
      const v = local.yMm / panel.heightMm;
      if (Math.abs(local.yMm) <= EPSILON_MM) top.push(u);
      if (Math.abs(local.xMm - panel.widthMm) <= EPSILON_MM) right.push(v);
      if (Math.abs(local.yMm - panel.heightMm) <= EPSILON_MM) bottom.push(u);
      if (Math.abs(local.xMm) <= EPSILON_MM) left.push(v);
    }
  }
  return {
    vertices: [
      ...uniqueSorted(top).map((u) => ({ u, v: 0 })),
      ...uniqueSorted(right)
        .filter((v) => v > EPSILON_MM)
        .map((v) => ({ u: 1, v })),
      ...[...uniqueSorted(bottom)]
        .reverse()
        .filter((u) => u < 1 - EPSILON_MM)
        .map((u) => ({ u, v: 1 })),
      ...[...uniqueSorted(left)]
        .reverse()
        .filter((v) => v > EPSILON_MM && v < 1 - EPSILON_MM)
        .map((v) => ({ u: 0, v })),
    ],
  };
};

const rootTransforms = (
  panel: PlannedPanelBlueprintV1,
  sheet: SheetV1,
): readonly Transform2Mm[] => {
  const minimumXmm = sheet.printableMarginMm;
  const minimumYmm = sheet.printableMarginMm;
  const maximumXmm = sheet.widthMm - sheet.printableMarginMm - panel.widthMm;
  const maximumYmm = sheet.heightMm - sheet.printableMarginMm - panel.heightMm;
  if (maximumXmm < minimumXmm || maximumYmm < minimumYmm) return [];
  const centerXmm = (minimumXmm + maximumXmm) / 2;
  const centerYmm = (minimumYmm + maximumYmm) / 2;
  return [
    [centerXmm, centerYmm],
    [minimumXmm, minimumYmm],
    [maximumXmm, minimumYmm],
    [minimumXmm, maximumYmm],
    [maximumXmm, maximumYmm],
    [centerXmm, minimumYmm],
    [centerXmm, maximumYmm],
    [minimumXmm, centerYmm],
    [maximumXmm, centerYmm],
  ].map(([xMm, yMm]) => ({
    translationMm: { xMm: xMm!, yMm: yMm! },
    rotationDeg: 0,
  }));
};

const layoutScore = (
  placed: ReadonlyMap<string, PlacedPanel>,
  requestedSize: RequestedSizeV1 | undefined,
): number => {
  const bounds = [...placed.values()].map((placement) => placement.bounds);
  if (bounds.length === 0) return Number.POSITIVE_INFINITY;
  const widthMm =
    Math.max(...bounds.map((value) => value.maximumXmm)) -
    Math.min(...bounds.map((value) => value.minimumXmm));
  const heightMm =
    Math.max(...bounds.map((value) => value.maximumYmm)) -
    Math.min(...bounds.map((value) => value.minimumYmm));
  if (!requestedSize) return 0;
  return (
    Math.abs(widthMm - requestedSize.widthMm) +
    Math.abs(heightMm - requestedSize.heightMm)
  );
};

const isCompleteRectangularContour = (
  panel: PlannedPanelBlueprintV1,
): boolean => {
  const vertices = panel.contour.vertices;
  const signedDoubleArea = vertices.reduce((total, point, index) => {
    const next = vertices[(index + 1) % vertices.length]!;
    return total + point.u * next.v - next.u * point.v;
  }, 0);
  const containsCorner = (u: number, v: number): boolean =>
    vertices.some(
      (point) =>
        Math.abs(point.u - u) <= EPSILON_MM &&
        Math.abs(point.v - v) <= EPSILON_MM,
    );
  return (
    Math.abs(Math.abs(signedDoubleArea) / 2 - 1) <= EPSILON_MM &&
    vertices.every(
      (point) =>
        Math.abs(point.u) <= EPSILON_MM ||
        Math.abs(point.u - 1) <= EPSILON_MM ||
        Math.abs(point.v) <= EPSILON_MM ||
        Math.abs(point.v - 1) <= EPSILON_MM,
    ) &&
    containsCorner(0, 0) &&
    containsCorner(1, 0) &&
    containsCorner(1, 1) &&
    containsCorner(0, 1)
  );
};

/**
 * Converts the semantic fold tree authored by the model into one planar net.
 * The bounded search owns only redundant layout geometry; it does not choose
 * panel semantics, dimensions, body topology, or motion ranges.
 */
export const normalizeFoldOnlyPlan = (
  inputPlan: FabricationPlanV1,
  sheets: readonly SheetV1[],
  requestedSize?: RequestedSizeV1,
): FoldPlanNormalizationResult => {
  // The strategy is a semantic assembly label, not a topology discriminator.
  // Sol may call an all-fold net articulated_tab_slot even when no connector
  // is mechanically required, so the joint graph is the authoritative gate.
  const foldJoints = inputPlan.joints.filter(isFoldJoint);
  if (
    foldJoints.length === 0 ||
    foldJoints.length !== inputPlan.joints.length
  ) {
    return { ok: true, value: inputPlan };
  }
  const plan = withoutUnusedConnectors(inputPlan);

  const sheetById = new Map(sheets.map((sheet) => [sheet.sheetId, sheet]));
  const panelById = new Map(plan.panels.map((panel) => [panel.panelId, panel]));
  const panelByBodyId = new Map<string, PlannedPanelBlueprintV1>();
  for (const body of plan.bodies) {
    const panelId = body.panelIds[0];
    const panel = panelId ? panelById.get(panelId) : undefined;
    if (body.panelIds.length !== 1 || !panel || panel.bodyId !== body.bodyId) {
      return {
        ok: false,
        path: ["bodies", body.bodyId, "panelIds"],
        message:
          "Fold-only normalization requires exactly one matching panel per rigid body.",
      };
    }
    panelByBodyId.set(body.bodyId, panel);
  }
  if (panelByBodyId.size !== plan.panels.length) {
    return {
      ok: false,
      path: ["panels"],
      message: "Every fold-only panel must belong to exactly one rigid body.",
    };
  }

  const topology = buildDirectedBodyTopology(
    plan.bodies.map((body) => body.bodyId),
    foldJoints,
  );
  if (!topology.ok) {
    return {
      ok: false,
      path: ["joints"],
      message: `Fold-only body graph is not one acyclic tree: ${topology.error.id}.`,
    };
  }
  if (compatibleExistingLayout(plan, foldJoints, panelByBodyId, sheetById)) {
    return { ok: true, value: plan };
  }
  const expressivePanel = plan.panels.find(
    (panel) => !isCompleteRectangularContour(panel),
  );
  if (expressivePanel) {
    return {
      ok: false,
      path: ["panels", expressivePanel.panelId, "contour"],
      message:
        "Automatic fold-net layout cannot rewrite a non-rectangular silhouette. Provide valid authored flat transforms and full shared contour edges.",
    };
  }
  const rootPanel = panelByBodyId.get(topology.value.rootBodyId)!;
  const sheet = sheetById.get(rootPanel.sheetId);
  if (!sheet) {
    return {
      ok: false,
      path: ["panels", rootPanel.panelId, "sheetId"],
      message: `Fold-only root references unknown sheet ${rootPanel.sheetId}.`,
    };
  }

  const jointById = new Map(foldJoints.map((joint) => [joint.jointId, joint]));
  const orderedJoints = topology.value.orderedJointIds.map((jointId) =>
    jointById.get(jointId)!,
  );
  let completed: CompletedLayout | undefined;
  let exploredStateCount = 0;
  const maximumStateCount = 100_000;
  let completedLayoutCount = 0;
  const maximumCompletedLayoutCount = 64;

  const search = (
    jointIndex: number,
    placed: ReadonlyMap<string, PlacedPanel>,
    attachments: readonly Attachment[],
  ): boolean => {
    exploredStateCount += 1;
    if (exploredStateCount > maximumStateCount) return false;
    if (jointIndex === orderedJoints.length) {
      completedLayoutCount += 1;
      const score = layoutScore(placed, requestedSize);
      if (!completed || score < completed.score - EPSILON_MM) {
        completed = { placed, attachments, score };
      }
      // A zero-score layout already matches every requested planar envelope
      // dimension, so later traversal cannot improve it.
      return (
        score <= EPSILON_MM ||
        completedLayoutCount >= maximumCompletedLayoutCount
      );
    }
    const joint = orderedJoints[jointIndex]!;
    const parentPanel = panelByBodyId.get(joint.parentBodyId)!;
    const childPanel = panelByBodyId.get(joint.childBodyId)!;
    const parentPlacement = placed.get(parentPanel.panelId);
    if (!parentPlacement) return false;
    const parentAttachments = attachments.filter(
      (attachment) => attachment.parentPanelId === parentPanel.panelId,
    );

    for (const side of ["top", "right", "bottom", "left"] as const) {
      for (const localEdge of localRectangleEdges(childPanel)) {
        const lengthMm = segmentLengthMm(localEdge);
        for (const startMm of attachmentStarts(
          parentPlacement.bounds,
          side,
          lengthMm,
          parentAttachments,
        )) {
          const target = sideSegment(
            parentPlacement.bounds,
            side,
            startMm,
            lengthMm,
          );
          if (
            !splitLengthsAreManufacturable(
              parentPlacement.bounds,
              side,
              target,
              parentAttachments,
            )
          ) {
            continue;
          }
          for (const rotationDeg of QUARTER_TURNS_DEG) {
            for (const directedTarget of [
              target,
              { start: target.end, end: target.start },
            ]) {
              const transform = transformFromEdge(
                localEdge,
                directedTarget,
                rotationDeg,
              );
              if (!transform) continue;
              const bounds = boundsFor(childPanel, transform);
              if (
                !extendsOutsideParent(bounds, parentPlacement.bounds, side) ||
                !fitsSheet(bounds, sheet)
              ) {
                continue;
              }
              const conflicts = [...placed.values()].some((other) => {
                if (other.panelId === parentPanel.panelId) {
                  return boundsInteriorOverlap(bounds, other.bounds);
                }
                return (
                  boundsInteriorOverlap(bounds, other.bounds) ||
                  boundsClearanceMm(bounds, other.bounds) <
                    FABRICATION_KINEMATIC_LIMITS.minimumMovingClearanceMm -
                      EPSILON_MM
                );
              });
              if (conflicts) continue;
              const nextPlaced = new Map(placed);
              nextPlaced.set(childPanel.panelId, {
                panelId: childPanel.panelId,
                transform,
                bounds,
              });
              const nextAttachments = [
                ...attachments,
                {
                  jointId: joint.jointId,
                  parentPanelId: parentPanel.panelId,
                  childPanelId: childPanel.panelId,
                  parentSide: side,
                  segment: target,
                },
              ];
              if (search(jointIndex + 1, nextPlaced, nextAttachments)) {
                return true;
              }
            }
          }
        }
      }
    }
    return false;
  };

  for (const transform of rootTransforms(rootPanel, sheet)) {
    const placed = new Map<string, PlacedPanel>([
      [
        rootPanel.panelId,
        {
          panelId: rootPanel.panelId,
          transform,
          bounds: boundsFor(rootPanel, transform),
        },
      ],
    ]);
    if (search(0, placed, [])) break;
  }
  if (!completed) {
    return {
      ok: false,
      path: ["panels"],
      message: `The fold tree could not be laid out inside ${sheet.sheetId} printable margins without overlap.`,
    };
  }

  const attachmentSegmentsByPanelId = new Map<string, Segment2Mm[]>();
  for (const attachment of completed.attachments) {
    for (const panelId of [attachment.parentPanelId, attachment.childPanelId]) {
      const values = attachmentSegmentsByPanelId.get(panelId) ?? [];
      values.push(attachment.segment);
      attachmentSegmentsByPanelId.set(panelId, values);
    }
  }
  const normalizedPanels = plan.panels.map((panel) => {
    const placement = completed!.placed.get(panel.panelId)!;
    return {
      ...panel,
      sheetId: sheet.sheetId,
      contour: normalizedContour(
        panel,
        placement.transform,
        attachmentSegmentsByPanelId.get(panel.panelId) ?? [],
      ),
      flatTransform: placement.transform,
    };
  });
  const attachmentByJointId = new Map(
    completed.attachments.map((attachment) => [attachment.jointId, attachment]),
  );
  const normalizedJoints = foldJoints.map((joint) => {
    const segment = attachmentByJointId.get(joint.jointId)!.segment;
    return {
      ...joint,
      axis: {
        startMm: { ...segment.start, zMm: 0 },
        endMm: { ...segment.end, zMm: 0 },
      },
    };
  });
  return {
    ok: true,
    value: {
      ...plan,
      panels: normalizedPanels,
      bodies: plan.bodies.map((body) => ({
        ...body,
        initialTransform: IDENTITY_TRANSFORM_3D,
        grounded: body.bodyId === topology.value.rootBodyId,
      })),
      joints: normalizedJoints,
      connectors: normalizedConnectorPairs(
        plan.connectors,
        normalizedPanels,
        sheetById,
      ),
    },
  };
};
