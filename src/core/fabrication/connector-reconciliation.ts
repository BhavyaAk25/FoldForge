import {
  connectorReferencePoint2,
  slotConnectorContour,
} from "./connector-geometry";
import { homeMotionState } from "./kinematics";
import { inverseRigidMatrix4, transformPoint3, type Matrix4 } from "./matrix";
import {
  isSimplePolygon,
  pointInPolygon,
  polygonCentroid,
  transformPoint2,
} from "./polygon";
import type {
  FabricationIRV1,
  FabricationProgramV1,
  PanelV1,
  Point2Mm,
  Point3Mm,
  SlotConnectorV1,
} from "./types";

/**
 * Home-pose-consistent placement for reciprocal tab/slot lock connectors.
 *
 * The semantic-plan expander places a tab and its mating slot independently —
 * each centered on its own panel edge in flat (pre-fold) 2D coordinates. Those
 * two points only coincide once the sheet is folded when the panels happen to
 * be identical and symmetric (i.e. the exact authored fixture). For any other
 * dimensions the tab and slot miss each other in the assembled frame, so the
 * verifier's `connections.connector_mate_reach` and
 * `connections.connector_span_alignment` hard checks fail and no design is
 * produced.
 *
 * This pass moves ONLY the slot so its centerline sits directly under the tab's
 * engagement anchor — and parallel to the tab's root edge — in the folded home
 * pose. That satisfies both reciprocal checks by construction, independent of
 * the panel dimensions the model chose. The tab (an attached three-sided flap
 * whose placement is constrained by its own panel) is never moved.
 */

// Inverse of `connectorWorldPoint` in verification.ts: map a world-frame point
// back into a panel's local (pre-`flatTransform`) coordinates at the home pose.
const worldToPanelLocal = (
  world: Point3Mm,
  panel: PanelV1,
  bodyMatrixInverse: Matrix4,
): Point2Mm => {
  const sheet = transformPoint3(bodyMatrixInverse, world);
  // `transformPoint2` is p' = R(θ)·p + t; invert with p = R(−θ)·(p' − t).
  const radians = (panel.flatTransform.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = sheet.xMm - panel.flatTransform.translationMm.xMm;
  const dy = sheet.yMm - panel.flatTransform.translationMm.yMm;
  return { xMm: dx * cos + dy * sin, yMm: -dx * sin + dy * cos };
};

const panelLocalToWorld = (
  point: Point2Mm,
  panel: PanelV1,
  bodyMatrix: Matrix4,
): Point3Mm =>
  transformPoint3(bodyMatrix, {
    ...transformPoint2(point, panel.flatTransform),
    zMm: 0,
  });

const slotCenterlineAt = (
  center: Point2Mm,
  halfSpan: Point2Mm,
): SlotConnectorV1["centerline"] => ({
  start: { xMm: center.xMm - halfSpan.xMm, yMm: center.yMm - halfSpan.yMm },
  end: { xMm: center.xMm + halfSpan.xMm, yMm: center.yMm + halfSpan.yMm },
});

// The verifier requires the slot cut to be simple and strictly inside its
// panel. Mirror that exact test so reconciliation only proposes slots the
// verifier will accept.
const slotStrictlyInsidePanel = (
  slot: SlotConnectorV1,
  panel: PanelV1,
): boolean => {
  const contour = slotConnectorContour(slot);
  return (
    isSimplePolygon(contour) &&
    contour.every((point) =>
      pointInPolygon(point, panel.contour.vertices, false),
    )
  );
};

// The tab's mating point can project onto — or just past — a thin panel's edge.
// Keep the slot under the tab, but blend its center toward the panel interior
// by the smallest amount that makes the whole cut strictly contained. Returns
// null when no bounded interior placement exists (a genuinely infeasible lock).
const CONTAINMENT_BLEND_STEPS = 16;
const interiorSlotCenterline = (
  slot: SlotConnectorV1,
  panel: PanelV1,
  desiredCenter: Point2Mm,
  halfSpan: Point2Mm,
): SlotConnectorV1["centerline"] | null => {
  const interior = polygonCentroid(panel.contour.vertices);
  for (let step = 0; step <= CONTAINMENT_BLEND_STEPS; step += 1) {
    const t = step / CONTAINMENT_BLEND_STEPS;
    const center = {
      xMm: desiredCenter.xMm + (interior.xMm - desiredCenter.xMm) * t,
      yMm: desiredCenter.yMm + (interior.yMm - desiredCenter.yMm) * t,
    };
    const centerline = slotCenterlineAt(center, halfSpan);
    if (slotStrictlyInsidePanel({ ...slot, centerline }, panel)) {
      return centerline;
    }
  }
  return null;
};

/**
 * Returns a program whose reciprocal slots are repositioned to mate their tabs
 * in the folded home pose, or `null` when nothing could be reconciled (no lock
 * pair spanning two bodies, or the home pose could not be solved).
 */
export const reconcileLockConnectorPlacement = (
  program: FabricationProgramV1,
  ir: FabricationIRV1,
): FabricationProgramV1 | null => {
  const home = homeMotionState(ir);
  if (!home.ok) return null;
  const panelById = new Map(ir.panels.map((panel) => [panel.panelId, panel]));
  const connectorById = new Map(
    ir.connectors.map((connector) => [connector.connectorId, connector]),
  );
  const inverseByBodyId = new Map<string, Matrix4 | null>();
  const inverseFor = (bodyId: string): Matrix4 | null => {
    if (inverseByBodyId.has(bodyId)) return inverseByBodyId.get(bodyId) ?? null;
    const matrix = home.value.bodyMatrices[bodyId];
    const inverse = matrix ? inverseRigidMatrix4(matrix) : null;
    inverseByBodyId.set(bodyId, inverse);
    return inverse;
  };

  let changed = false;
  const connectors = program.blueprint.connectors.map((connector) => {
    if (connector.kind !== "slot") return connector;
    const tab = connectorById.get(connector.mateConnectorId);
    if (!tab || tab.kind !== "tab") return connector;
    const tabPanel = panelById.get(tab.panelId);
    const slotPanel = panelById.get(connector.panelId);
    if (!tabPanel || !slotPanel) return connector;
    // A reciprocal pair on one panel is a repeatable external module port; the
    // verifier does not require those to mate within this assembly.
    if (tabPanel.bodyId === slotPanel.bodyId) return connector;
    const tabBody = home.value.bodyMatrices[tabPanel.bodyId];
    if (!tabBody) return connector;
    const slotInverse = inverseFor(slotPanel.bodyId);
    if (!slotInverse) return connector;

    const tabAnchorWorld = panelLocalToWorld(
      connectorReferencePoint2(tab),
      tabPanel,
      tabBody,
    );
    const tabRootStartWorld = panelLocalToWorld(
      tab.rootEdge.start,
      tabPanel,
      tabBody,
    );
    const tabRootEndWorld = panelLocalToWorld(
      tab.rootEdge.end,
      tabPanel,
      tabBody,
    );
    const spanDirection = {
      x: tabRootEndWorld.xMm - tabRootStartWorld.xMm,
      y: tabRootEndWorld.yMm - tabRootStartWorld.yMm,
      z: tabRootEndWorld.zMm - tabRootStartWorld.zMm,
    };
    const spanLength = Math.hypot(
      spanDirection.x,
      spanDirection.y,
      spanDirection.z,
    );
    if (spanLength <= 1e-9) return connector;
    // Preserve the slot's current centerline length; only its position and
    // orientation are reconciled to the tab.
    const halfLengthMm =
      Math.hypot(
        connector.centerline.end.xMm - connector.centerline.start.xMm,
        connector.centerline.end.yMm - connector.centerline.start.yMm,
      ) / 2;
    const unit = {
      x: spanDirection.x / spanLength,
      y: spanDirection.y / spanLength,
      z: spanDirection.z / spanLength,
    };
    const startWorld: Point3Mm = {
      xMm: tabAnchorWorld.xMm - unit.x * halfLengthMm,
      yMm: tabAnchorWorld.yMm - unit.y * halfLengthMm,
      zMm: tabAnchorWorld.zMm - unit.z * halfLengthMm,
    };
    const endWorld: Point3Mm = {
      xMm: tabAnchorWorld.xMm + unit.x * halfLengthMm,
      yMm: tabAnchorWorld.yMm + unit.y * halfLengthMm,
      zMm: tabAnchorWorld.zMm + unit.z * halfLengthMm,
    };
    // Desired slot endpoints under the tab, in slot-panel-local coordinates.
    const desiredStart = worldToPanelLocal(startWorld, slotPanel, slotInverse);
    const desiredEnd = worldToPanelLocal(endWorld, slotPanel, slotInverse);
    const desiredCenter = {
      xMm: (desiredStart.xMm + desiredEnd.xMm) / 2,
      yMm: (desiredStart.yMm + desiredEnd.yMm) / 2,
    };
    const halfSpan = {
      xMm: (desiredEnd.xMm - desiredStart.xMm) / 2,
      yMm: (desiredEnd.yMm - desiredStart.yMm) / 2,
    };
    const centerline = interiorSlotCenterline(
      connector,
      slotPanel,
      desiredCenter,
      halfSpan,
    );
    if (!centerline) return connector;
    changed = true;
    return { ...connector, centerline };
  });

  if (!changed) return null;
  return {
    ...program,
    blueprint: { ...program.blueprint, connectors },
  };
};

export const programHasLockConnectors = (
  program: FabricationProgramV1,
): boolean =>
  program.blueprint.connectors.some((connector) => connector.kind === "slot");
