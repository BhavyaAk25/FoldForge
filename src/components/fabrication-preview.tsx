"use client";

import { useMemo } from "react";

import { evaluateMotionState } from "@/core/fabrication/kinematics";
import { transformPoint3 } from "@/core/fabrication/matrix";
import { transformPoint2 } from "@/core/fabrication/polygon";
import type {
  FabricationIRV1,
  PanelV1,
  Point2Mm,
  Point3Mm,
} from "@/core/fabrication/types";

import styles from "./fabrication-preview.module.css";

export type FabricationPreviewMode = "assembled" | "pattern";

interface PreviewPolygon {
  readonly panel: PanelV1;
  readonly points: readonly Point2Mm[];
  readonly holes: readonly (readonly Point2Mm[])[];
  readonly depth: number;
}

export interface FabricationPreviewProps {
  readonly ir: FabricationIRV1;
  readonly mode: FabricationPreviewMode;
  readonly motionPosition: number;
  readonly rotationDeg: number;
  readonly highlightedPanelIds?: readonly string[];
  readonly label: string;
}

const projectedPoint = (point: Point3Mm, rotationDeg: number): Point2Mm => {
  const angleRad = (rotationDeg * Math.PI) / 180;
  const rotatedX =
    point.xMm * Math.cos(angleRad) - point.yMm * Math.sin(angleRad);
  const rotatedY =
    point.xMm * Math.sin(angleRad) + point.yMm * Math.cos(angleRad);
  return {
    xMm: rotatedX,
    yMm: rotatedY * 0.42 - point.zMm * 0.92,
  };
};

const homeDriverValue = (
  ir: FabricationIRV1,
  position: number,
): number | undefined => {
  if (!ir.driver) return undefined;
  const bounded = Math.max(0, Math.min(1, position));
  return (
    ir.driver.minimumValue +
    (ir.driver.maximumValue - ir.driver.minimumValue) * bounded
  );
};

const flatPolygons = (ir: FabricationIRV1): readonly PreviewPolygon[] =>
  ir.panels.map((panel) => ({
    panel,
    points: panel.contour.vertices.map((point) =>
      transformPoint2(point, panel.flatTransform),
    ),
    holes: panel.innerCutContours.map((contour) =>
      contour.vertices.map((point) =>
        transformPoint2(point, panel.flatTransform),
      ),
    ),
    depth: 0,
  }));

const assembledPolygons = (
  ir: FabricationIRV1,
  motionPosition: number,
  rotationDeg: number,
): readonly PreviewPolygon[] => {
  const evaluated = evaluateMotionState(
    ir,
    homeDriverValue(ir, motionPosition),
  );
  if (!evaluated.ok) return flatPolygons(ir);
  return ir.panels
    .flatMap((panel): readonly PreviewPolygon[] => {
      const vertices = evaluated.value.panelVertices[panel.panelId];
      const bodyMatrix = evaluated.value.bodyMatrices[panel.bodyId];
      if (!vertices || !bodyMatrix) return [];
      return [
        {
          panel,
          points: vertices.map((point) => projectedPoint(point, rotationDeg)),
          holes: panel.innerCutContours.map((contour) =>
            contour.vertices.map((point) =>
              projectedPoint(
                transformPoint3(bodyMatrix, {
                  ...transformPoint2(point, panel.flatTransform),
                  zMm: 0,
                }),
                rotationDeg,
              ),
            ),
          ),
          depth:
            vertices.reduce(
              (total, point) => total + point.yMm + point.zMm,
              0,
            ) / vertices.length,
        },
      ];
    })
    .sort((left, right) => left.depth - right.depth);
};

const viewBoxFor = (polygons: readonly PreviewPolygon[]): string => {
  const points = polygons.flatMap((polygon) => polygon.points);
  if (points.length === 0) return "0 0 100 100";
  const minimumX = Math.min(...points.map((point) => point.xMm));
  const maximumX = Math.max(...points.map((point) => point.xMm));
  const minimumY = Math.min(...points.map((point) => point.yMm));
  const maximumY = Math.max(...points.map((point) => point.yMm));
  const width = Math.max(1, maximumX - minimumX);
  const height = Math.max(1, maximumY - minimumY);
  const padding = Math.max(8, Math.max(width, height) * 0.12);
  return `${minimumX - padding} ${minimumY - padding} ${width + padding * 2} ${height + padding * 2}`;
};

const polygonPoints = (points: readonly Point2Mm[]): string =>
  points.map((point) => `${point.xMm},${point.yMm}`).join(" ");

const pathSegment = (points: readonly Point2Mm[]): string =>
  points.length === 0
    ? ""
    : `M ${points.map((point) => `${point.xMm} ${point.yMm}`).join(" L ")} Z`;

const polygonPath = (polygon: PreviewPolygon): string =>
  [polygon.points, ...polygon.holes].map(pathSegment).join(" ");

const roleClass = (role: PanelV1["role"]): string => {
  switch (role) {
    case "driver":
      return styles.driver ?? "";
    case "output":
      return styles.output ?? "";
    case "decorative":
      return styles.decorative ?? "";
    case "guide":
    case "slider":
      return styles.mechanism ?? "";
    case "structural":
      return styles.structural ?? "";
  }
};

export function FabricationPreview({
  ir,
  mode,
  motionPosition,
  rotationDeg,
  highlightedPanelIds = [],
  label,
}: FabricationPreviewProps) {
  const polygons = useMemo(
    () =>
      mode === "pattern"
        ? flatPolygons(ir)
        : assembledPolygons(ir, motionPosition, rotationDeg),
    [ir, mode, motionPosition, rotationDeg],
  );
  const highlighted = useMemo(
    () => new Set(highlightedPanelIds),
    [highlightedPanelIds],
  );

  return (
    <svg
      className={styles.preview}
      viewBox={viewBoxFor(polygons)}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{label}</title>
      <g className={styles.paperShadow} aria-hidden="true">
        {polygons.map((polygon) => (
          <path
            key={`shadow-${polygon.panel.panelId}`}
            d={polygonPath(polygon)}
            fillRule="evenodd"
          />
        ))}
      </g>
      <g>
        {polygons.map((polygon) => (
          <path
            key={polygon.panel.panelId}
            className={`${styles.panel ?? ""} ${roleClass(polygon.panel.role)} ${
              highlighted.has(polygon.panel.panelId)
                ? (styles.highlighted ?? "")
                : ""
            }`}
            d={polygonPath(polygon)}
            fillRule="evenodd"
            data-inner-cut-count={polygon.holes.length}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
      {mode === "pattern" ? (
        <g className={styles.scoreLines} aria-hidden="true">
          {ir.paths
            .filter((path) => path.kind === "score")
            .map((path) => (
              <polyline
                key={path.pathId}
                points={polygonPoints(path.points)}
                vectorEffect="non-scaling-stroke"
              />
            ))}
        </g>
      ) : null}
    </svg>
  );
}
