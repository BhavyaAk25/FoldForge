import { panelMaterialHoles } from "./connector-geometry";
import type { EvaluatedMotionState } from "./kinematics";
import { transformPoint3 } from "./matrix";
import { transformPoint2 } from "./polygon";
import { triangleMinimumDistanceMm } from "./spatial";
import type {
  FabricationIRV1,
  GeometryRefV1,
  PanelV1,
  Point2Mm,
  Point3Mm,
} from "./types";

export interface Bounds3Mm {
  readonly minimumXmm: number;
  readonly maximumXmm: number;
  readonly minimumYmm: number;
  readonly maximumYmm: number;
  readonly minimumZmm: number;
  readonly maximumZmm: number;
}

export const unorderedPairKey = (first: string, second: string): string =>
  first < second ? `${first}\u0000${second}` : `${second}\u0000${first}`;

export const panelPairDistanceMm = (
  firstPanelId: string,
  secondPanelId: string,
  state: EvaluatedMotionState,
): number => {
  const firstTriangles = state.panelTriangles[firstPanelId]!;
  const secondTriangles = state.panelTriangles[secondPanelId]!;
  let minimumMm = Number.POSITIVE_INFINITY;
  for (const first of firstTriangles) {
    for (const second of secondTriangles) {
      minimumMm = Math.min(
        minimumMm,
        triangleMinimumDistanceMm(
          { first: first[0], second: first[1], third: first[2] },
          { first: second[0], second: second[1], third: second[2] },
        ),
      );
    }
  }
  return minimumMm;
};

type Triangle3 = readonly [Point3Mm, Point3Mm, Point3Mm];

interface ProjectedPoint {
  readonly x: number;
  readonly y: number;
}

const triangleNormal = (
  triangle: Triangle3,
): readonly [number, number, number] => {
  const [first, second, third] = triangle;
  const firstX = second.xMm - first.xMm;
  const firstY = second.yMm - first.yMm;
  const firstZ = second.zMm - first.zMm;
  const secondX = third.xMm - first.xMm;
  const secondY = third.yMm - first.yMm;
  const secondZ = third.zMm - first.zMm;
  return [
    firstY * secondZ - firstZ * secondY,
    firstZ * secondX - firstX * secondZ,
    firstX * secondY - firstY * secondX,
  ];
};

const signedArea2 = (points: readonly ProjectedPoint[]): number =>
  points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length] ?? point;
    return total + point.x * next.y - next.x * point.y;
  }, 0) / 2;

const lineIntersection = (
  first: ProjectedPoint,
  second: ProjectedPoint,
  clipStart: ProjectedPoint,
  clipEnd: ProjectedPoint,
): ProjectedPoint => {
  const segmentX = second.x - first.x;
  const segmentY = second.y - first.y;
  const clipX = clipEnd.x - clipStart.x;
  const clipY = clipEnd.y - clipStart.y;
  const denominator = segmentX * clipY - segmentY * clipX;
  if (Math.abs(denominator) <= 1e-12) return second;
  const offsetX = clipStart.x - first.x;
  const offsetY = clipStart.y - first.y;
  const ratio = (offsetX * clipY - offsetY * clipX) / denominator;
  return { x: first.x + ratio * segmentX, y: first.y + ratio * segmentY };
};

const clipConvexPolygon = (
  subject: readonly ProjectedPoint[],
  clip: readonly ProjectedPoint[],
): readonly ProjectedPoint[] => {
  let output = [...subject];
  const orientation = signedArea2(clip) >= 0 ? 1 : -1;
  const inside = (
    point: ProjectedPoint,
    start: ProjectedPoint,
    end: ProjectedPoint,
  ): boolean =>
    orientation *
      ((end.x - start.x) * (point.y - start.y) -
        (end.y - start.y) * (point.x - start.x)) >=
    -1e-8;
  for (let index = 0; index < clip.length; index += 1) {
    const clipStart = clip[index]!;
    const clipEnd = clip[(index + 1) % clip.length]!;
    const input = output;
    output = [];
    for (let pointIndex = 0; pointIndex < input.length; pointIndex += 1) {
      const current = input[pointIndex]!;
      const previous = input[(pointIndex - 1 + input.length) % input.length]!;
      const currentInside = inside(current, clipStart, clipEnd);
      const previousInside = inside(previous, clipStart, clipEnd);
      if (currentInside) {
        if (!previousInside) {
          output.push(lineIntersection(previous, current, clipStart, clipEnd));
        }
        output.push(current);
      } else if (previousInside) {
        output.push(lineIntersection(previous, current, clipStart, clipEnd));
      }
    }
    if (output.length === 0) break;
  }
  return output;
};

const coplanarTriangleOverlapAreaMm2 = (
  first: Triangle3,
  second: Triangle3,
): number => {
  const firstNormal = triangleNormal(first);
  const secondNormal = triangleNormal(second);
  const firstLength = Math.hypot(...firstNormal);
  const secondLength = Math.hypot(...secondNormal);
  if (firstLength <= 1e-10 || secondLength <= 1e-10) return 0;
  const normalCrossLength = Math.hypot(
    firstNormal[1] * secondNormal[2] - firstNormal[2] * secondNormal[1],
    firstNormal[2] * secondNormal[0] - firstNormal[0] * secondNormal[2],
    firstNormal[0] * secondNormal[1] - firstNormal[1] * secondNormal[0],
  );
  if (normalCrossLength / (firstLength * secondLength) > 1e-7) return 0;
  const origin = first[0];
  if (
    second.some(
      (point) =>
        Math.abs(
          firstNormal[0] * (point.xMm - origin.xMm) +
            firstNormal[1] * (point.yMm - origin.yMm) +
            firstNormal[2] * (point.zMm - origin.zMm),
        ) /
          firstLength >
        1e-6,
    )
  ) {
    return 0;
  }
  const dominant = [0, 1, 2].sort(
    (left, right) =>
      Math.abs(firstNormal[right]!) - Math.abs(firstNormal[left]!),
  )[0]!;
  const project = (point: Point3Mm): ProjectedPoint =>
    dominant === 0
      ? { x: point.yMm, y: point.zMm }
      : dominant === 1
        ? { x: point.xMm, y: point.zMm }
        : { x: point.xMm, y: point.yMm };
  const clipped = clipConvexPolygon(first.map(project), second.map(project));
  const projectedArea = Math.abs(signedArea2(clipped));
  const projectionScale = Math.abs(firstNormal[dominant]!) / firstLength;
  return projectionScale <= 1e-12 ? 0 : projectedArea / projectionScale;
};

export const panelPairContactAreaMm2 = (
  firstPanelId: string,
  secondPanelId: string,
  motionState: EvaluatedMotionState,
): number => {
  const firstTriangles = motionState.panelTriangles[firstPanelId] ?? [];
  const secondTriangles = motionState.panelTriangles[secondPanelId] ?? [];
  let areaMm2 = 0;
  for (const first of firstTriangles) {
    for (const second of secondTriangles) {
      areaMm2 += coplanarTriangleOverlapAreaMm2(first, second);
    }
  }
  return areaMm2;
};

export const boundsForPoints = (
  points: readonly Point3Mm[],
): Bounds3Mm | null => {
  if (points.length === 0) return null;
  return {
    minimumXmm: Math.min(...points.map((point) => point.xMm)),
    maximumXmm: Math.max(...points.map((point) => point.xMm)),
    minimumYmm: Math.min(...points.map((point) => point.yMm)),
    maximumYmm: Math.max(...points.map((point) => point.yMm)),
    minimumZmm: Math.min(...points.map((point) => point.zMm)),
    maximumZmm: Math.max(...points.map((point) => point.zMm)),
  };
};

export const panelIdsForRef = (
  ir: FabricationIRV1,
  ref: GeometryRefV1,
): readonly string[] => {
  switch (ref.kind) {
    case "panel":
      return ir.panels.some((panel) => panel.panelId === ref.id)
        ? [ref.id]
        : [];
    case "body":
      return ir.bodies.find((body) => body.bodyId === ref.id)!.panelIds;
    case "semantic_part": {
      const part = ir.semanticParts.find(
        (item) => item.semanticPartId === ref.id,
      );
      return part!.geometryRefs.flatMap((partRef) =>
        panelIdsForRef(ir, partRef),
      );
    }
    default:
      return [];
  }
};

export const pointsForRefs = (
  ir: FabricationIRV1,
  motionState: EvaluatedMotionState,
  refs: readonly GeometryRefV1[],
): readonly Point3Mm[] =>
  refs.flatMap((ref) =>
    panelIdsForRef(ir, ref).flatMap(
      (panelId) => motionState.panelVertices[panelId]!,
    ),
  );

export const statesForDuring = (
  states: readonly EvaluatedMotionState[],
  during: "rest" | "all_states" | "open" | "closed",
  homeValue: number | null,
): readonly EvaluatedMotionState[] => {
  if (during === "all_states") return states;
  if (during === "open") return states.length > 0 ? [states.at(-1)!] : [];
  if (during === "closed") return states.length > 0 ? [states[0]!] : [];
  const home = states.reduce<EvaluatedMotionState | null>(
    (closest, current) => {
      if (!closest) return current;
      const target = homeValue ?? 0;
      return Math.abs((current.driverValue ?? 0) - target) <
        Math.abs((closest.driverValue ?? 0) - target)
        ? current
        : closest;
    },
    null,
  );
  return home ? [home] : [];
};

export const dimensionValue = (
  bounds: Bounds3Mm,
  dimension: "width" | "height" | "depth" | "length",
): number => {
  const spans = [
    bounds.maximumXmm - bounds.minimumXmm,
    bounds.maximumYmm - bounds.minimumYmm,
    bounds.maximumZmm - bounds.minimumZmm,
  ] as const;
  switch (dimension) {
    case "width":
      return spans[0];
    case "height":
      return spans[1];
    case "depth":
      return spans[2];
    case "length":
      return Math.max(...spans);
  }
};

interface PanelSurfaceGeometry {
  readonly panelId: string;
  readonly outer: readonly Point3Mm[];
  readonly holes: readonly (readonly Point3Mm[])[];
  readonly normal: readonly [number, number, number] | null;
}

const reflectedPoint3 = (point: Point3Mm, normalAxis: 0 | 1 | 2): Point3Mm => ({
  xMm: normalAxis === 0 ? -point.xMm : point.xMm,
  yMm: normalAxis === 1 ? -point.yMm : point.yMm,
  zMm: normalAxis === 2 ? -point.zMm : point.zMm,
});

const cyclicContourErrorMm = (
  actual: readonly Point3Mm[],
  expected: readonly Point3Mm[],
): number => {
  if (actual.length !== expected.length || actual.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  let minimumErrorMm = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < actual.length; offset += 1) {
    for (const direction of [1, -1] as const) {
      let maximumErrorMm = 0;
      for (let index = 0; index < actual.length; index += 1) {
        const actualIndex =
          (offset + direction * index + actual.length * 2) % actual.length;
        const first = actual[actualIndex]!;
        const second = expected[index]!;
        maximumErrorMm = Math.max(
          maximumErrorMm,
          Math.hypot(
            first.xMm - second.xMm,
            first.yMm - second.yMm,
            first.zMm - second.zMm,
          ),
        );
      }
      minimumErrorMm = Math.min(minimumErrorMm, maximumErrorMm);
    }
  }
  return minimumErrorMm;
};

const panelSurfaceGeometry = (
  home: EvaluatedMotionState,
  panel: PanelV1,
  connectors: FabricationIRV1["connectors"],
): PanelSurfaceGeometry | null => {
  const bodyMatrix = home.bodyMatrices[panel.bodyId];
  if (!bodyMatrix) return null;
  const transformContour3 = (
    points: readonly Point2Mm[],
  ): readonly Point3Mm[] =>
    points.map((point) =>
      transformPoint3(bodyMatrix, {
        ...transformPoint2(point, panel.flatTransform),
        zMm: 0,
      }),
    );
  const triangle = home.panelTriangles[panel.panelId]?.[0];
  const unnormalized = triangle ? triangleNormal(triangle) : null;
  const normalLength = unnormalized ? Math.hypot(...unnormalized) : 0;
  return {
    panelId: panel.panelId,
    outer: transformContour3(panel.contour.vertices),
    holes: panelMaterialHoles(panel, connectors).map((hole) =>
      transformContour3(hole.vertices),
    ),
    normal:
      unnormalized && normalLength > 1e-12
        ? [
            unnormalized[0] / normalLength,
            unnormalized[1] / normalLength,
            unnormalized[2] / normalLength,
          ]
        : null,
  };
};

const panelMirrorError = (
  first: PanelSurfaceGeometry,
  second: PanelSurfaceGeometry,
  normalAxis: 0 | 1 | 2,
): { readonly linearMm: number; readonly angularDeg: number } => {
  if (first.holes.length !== second.holes.length) {
    return {
      linearMm: Number.POSITIVE_INFINITY,
      angularDeg: Number.POSITIVE_INFINITY,
    };
  }
  const reflectedOuter = first.outer.map((point) =>
    reflectedPoint3(point, normalAxis),
  );
  let linearMm = cyclicContourErrorMm(reflectedOuter, second.outer);
  const unmatchedHoles = new Set(second.holes.map((_, index) => index));
  for (const firstHole of first.holes) {
    const reflectedHole = firstHole.map((point) =>
      reflectedPoint3(point, normalAxis),
    );
    const best = [...unmatchedHoles]
      .map((index) => ({
        index,
        errorMm: cyclicContourErrorMm(reflectedHole, second.holes[index]!),
      }))
      .sort(
        (left, right) =>
          left.errorMm - right.errorMm || left.index - right.index,
      )[0];
    if (!best) {
      linearMm = Number.POSITIVE_INFINITY;
      break;
    }
    unmatchedHoles.delete(best.index);
    linearMm = Math.max(linearMm, best.errorMm);
  }
  let angularDeg = Number.POSITIVE_INFINITY;
  if (first.normal && second.normal) {
    const reflectedNormal = [...first.normal] as [number, number, number];
    reflectedNormal[normalAxis] *= -1;
    const cosine = Math.min(
      1,
      Math.max(
        -1,
        Math.abs(
          reflectedNormal[0] * second.normal[0] +
            reflectedNormal[1] * second.normal[1] +
            reflectedNormal[2] * second.normal[2],
        ),
      ),
    );
    angularDeg = (Math.acos(cosine) * 180) / Math.PI;
  }
  return { linearMm, angularDeg };
};

export const mirroredBodyGeometryError = (
  ir: FabricationIRV1,
  home: EvaluatedMotionState,
  firstBodyId: string,
  secondBodyId: string,
  normalAxis: 0 | 1 | 2,
): { readonly linearMm: number; readonly angularDeg: number } => {
  const surfacesForBody = (bodyId: string): readonly PanelSurfaceGeometry[] =>
    ir.panels
      .filter((panel) => panel.bodyId === bodyId)
      .map((panel) => panelSurfaceGeometry(home, panel, ir.connectors))
      .filter((surface): surface is PanelSurfaceGeometry => surface !== null)
      .sort((left, right) => left.panelId.localeCompare(right.panelId));
  const firstSurfaces = surfacesForBody(firstBodyId);
  const secondSurfaces = surfacesForBody(secondBodyId);
  if (
    firstSurfaces.length === 0 ||
    firstSurfaces.length !== secondSurfaces.length
  ) {
    return {
      linearMm: Number.POSITIVE_INFINITY,
      angularDeg: Number.POSITIVE_INFINITY,
    };
  }
  const unmatched = new Set(secondSurfaces.map((_, index) => index));
  let linearMm = 0;
  let angularDeg = 0;
  for (const first of firstSurfaces) {
    const best = [...unmatched]
      .map((index) => ({
        index,
        error: panelMirrorError(first, secondSurfaces[index]!, normalAxis),
      }))
      .sort(
        (left, right) =>
          left.error.linearMm - right.error.linearMm ||
          left.error.angularDeg - right.error.angularDeg ||
          left.index - right.index,
      )[0];
    if (!best) {
      return {
        linearMm: Number.POSITIVE_INFINITY,
        angularDeg: Number.POSITIVE_INFINITY,
      };
    }
    unmatched.delete(best.index);
    linearMm = Math.max(linearMm, best.error.linearMm);
    angularDeg = Math.max(angularDeg, best.error.angularDeg);
  }
  return { linearMm, angularDeg };
};
