import earcut, { deviation as triangulationDeviation } from "earcut";

export interface Point2Like {
  readonly xMm: number;
  readonly yMm: number;
}

export interface Bounds2Mm {
  readonly minimumXmm: number;
  readonly minimumYmm: number;
  readonly maximumXmm: number;
  readonly maximumYmm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface Placement2Like {
  readonly translationMm: Point2Like;
  readonly rotationDeg: number;
}

export interface TriangleIndices {
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

export interface PolygonTriangulation {
  readonly vertices: readonly Point2Like[];
  readonly triangles: readonly TriangleIndices[];
  readonly relativeAreaDeviation: number;
}

const GEOMETRY_EPSILON_MM = 1e-7;
const AREA_EPSILON_MM2 = 1e-7;

const cross = (a: Point2Like, b: Point2Like, c: Point2Like): number =>
  (b.xMm - a.xMm) * (c.yMm - a.yMm) - (b.yMm - a.yMm) * (c.xMm - a.xMm);

const squaredDistance = (a: Point2Like, b: Point2Like): number => {
  const dxMm = a.xMm - b.xMm;
  const dyMm = a.yMm - b.yMm;
  return dxMm * dxMm + dyMm * dyMm;
};

const almostEqual = (left: number, right: number, tolerance: number): boolean =>
  Math.abs(left - right) <= tolerance;

const pointsEqual = (
  left: Point2Like,
  right: Point2Like,
  toleranceMm = GEOMETRY_EPSILON_MM,
): boolean =>
  almostEqual(left.xMm, right.xMm, toleranceMm) &&
  almostEqual(left.yMm, right.yMm, toleranceMm);

const pointOnSegment = (
  point: Point2Like,
  start: Point2Like,
  end: Point2Like,
): boolean =>
  Math.abs(cross(start, end, point)) <= AREA_EPSILON_MM2 &&
  point.xMm >= Math.min(start.xMm, end.xMm) - GEOMETRY_EPSILON_MM &&
  point.xMm <= Math.max(start.xMm, end.xMm) + GEOMETRY_EPSILON_MM &&
  point.yMm >= Math.min(start.yMm, end.yMm) - GEOMETRY_EPSILON_MM &&
  point.yMm <= Math.max(start.yMm, end.yMm) + GEOMETRY_EPSILON_MM;

const orientation = (
  first: Point2Like,
  second: Point2Like,
  third: Point2Like,
): -1 | 0 | 1 => {
  const value = cross(first, second, third);
  if (Math.abs(value) <= AREA_EPSILON_MM2) return 0;
  return value < 0 ? -1 : 1;
};

export const segmentIntersects = (
  firstStart: Point2Like,
  firstEnd: Point2Like,
  secondStart: Point2Like,
  secondEnd: Point2Like,
): boolean => {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);

  if (
    firstOrientation !== secondOrientation &&
    thirdOrientation !== fourthOrientation
  ) {
    return true;
  }

  return (
    (firstOrientation === 0 &&
      pointOnSegment(secondStart, firstStart, firstEnd)) ||
    (secondOrientation === 0 &&
      pointOnSegment(secondEnd, firstStart, firstEnd)) ||
    (thirdOrientation === 0 &&
      pointOnSegment(firstStart, secondStart, secondEnd)) ||
    (fourthOrientation === 0 &&
      pointOnSegment(firstEnd, secondStart, secondEnd))
  );
};

export const segmentProperlyIntersects = (
  firstStart: Point2Like,
  firstEnd: Point2Like,
  secondStart: Point2Like,
  secondEnd: Point2Like,
): boolean =>
  orientation(firstStart, firstEnd, secondStart) !==
    orientation(firstStart, firstEnd, secondEnd) &&
  orientation(secondStart, secondEnd, firstStart) !==
    orientation(secondStart, secondEnd, firstEnd) &&
  orientation(firstStart, firstEnd, secondStart) !== 0 &&
  orientation(firstStart, firstEnd, secondEnd) !== 0 &&
  orientation(secondStart, secondEnd, firstStart) !== 0 &&
  orientation(secondStart, secondEnd, firstEnd) !== 0;

export const collinearSegmentOverlapLengthMm = (
  firstStart: Point2Like,
  firstEnd: Point2Like,
  secondStart: Point2Like,
  secondEnd: Point2Like,
): number => {
  if (
    orientation(firstStart, firstEnd, secondStart) !== 0 ||
    orientation(firstStart, firstEnd, secondEnd) !== 0
  ) {
    return 0;
  }
  const useX =
    Math.abs(firstEnd.xMm - firstStart.xMm) >=
    Math.abs(firstEnd.yMm - firstStart.yMm);
  const firstMinimum = Math.min(
    useX ? firstStart.xMm : firstStart.yMm,
    useX ? firstEnd.xMm : firstEnd.yMm,
  );
  const firstMaximum = Math.max(
    useX ? firstStart.xMm : firstStart.yMm,
    useX ? firstEnd.xMm : firstEnd.yMm,
  );
  const secondMinimum = Math.min(
    useX ? secondStart.xMm : secondStart.yMm,
    useX ? secondEnd.xMm : secondEnd.yMm,
  );
  const secondMaximum = Math.max(
    useX ? secondStart.xMm : secondStart.yMm,
    useX ? secondEnd.xMm : secondEnd.yMm,
  );
  return Math.max(
    0,
    Math.min(firstMaximum, secondMaximum) -
      Math.max(firstMinimum, secondMinimum),
  );
};

export const signedPolygonAreaMm2 = (points: readonly Point2Like[]): number => {
  let doubledAreaMm2 = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    const next = points[(index + 1) % points.length]!;
    doubledAreaMm2 += point.xMm * next.yMm - next.xMm * point.yMm;
  }
  return doubledAreaMm2 / 2;
};

/** Triangulates one outer contour plus cutout contours without filling holes. */
export const triangulatePolygonWithHoles = (
  outer: readonly Point2Like[],
  holes: readonly (readonly Point2Like[])[] = [],
): PolygonTriangulation => {
  if (outer.length < 3 || holes.some((hole) => hole.length < 3)) {
    return { vertices: [], triangles: [], relativeAreaDeviation: 1 };
  }
  const contours = [outer, ...holes];
  const vertices = contours.flatMap((contour) => contour);
  const coordinates = vertices.flatMap((point) => [point.xMm, point.yMm]);
  let vertexOffset = outer.length;
  const holeIndices = holes.map((hole) => {
    const index = vertexOffset;
    vertexOffset += hole.length;
    return index;
  });
  const indices = earcut(coordinates, holeIndices, 2);
  return {
    vertices,
    relativeAreaDeviation: triangulationDeviation(
      coordinates,
      holeIndices,
      2,
      indices,
    ),
    triangles: Array.from({ length: indices.length / 3 }, (_, index) => ({
      a: indices[index * 3]!,
      b: indices[index * 3 + 1]!,
      c: indices[index * 3 + 2]!,
    })),
  };
};

export const polygonPerimeterMm = (points: readonly Point2Like[]): number => {
  let perimeterMm = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    const next = points[(index + 1) % points.length]!;
    perimeterMm += Math.sqrt(squaredDistance(point, next));
  }
  return perimeterMm;
};

export const minimumEdgeLengthMm = (points: readonly Point2Like[]): number => {
  let minimumMm = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    const next = points[(index + 1) % points.length]!;
    minimumMm = Math.min(minimumMm, Math.sqrt(squaredDistance(point, next)));
  }
  return minimumMm;
};

export const polygonBounds = (points: readonly Point2Like[]): Bounds2Mm => {
  let minimumXmm = Number.POSITIVE_INFINITY;
  let minimumYmm = Number.POSITIVE_INFINITY;
  let maximumXmm = Number.NEGATIVE_INFINITY;
  let maximumYmm = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minimumXmm = Math.min(minimumXmm, point.xMm);
    minimumYmm = Math.min(minimumYmm, point.yMm);
    maximumXmm = Math.max(maximumXmm, point.xMm);
    maximumYmm = Math.max(maximumYmm, point.yMm);
  }

  return {
    minimumXmm,
    minimumYmm,
    maximumXmm,
    maximumYmm,
    widthMm: maximumXmm - minimumXmm,
    heightMm: maximumYmm - minimumYmm,
  };
};

export const isSimplePolygon = (points: readonly Point2Like[]): boolean => {
  if (points.length < 3) return false;
  if (
    points.some(
      (point) => !Number.isFinite(point.xMm) || !Number.isFinite(point.yMm),
    )
  ) {
    return false;
  }
  if (Math.abs(signedPolygonAreaMm2(points)) <= AREA_EPSILON_MM2) return false;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    const next = points[(index + 1) % points.length]!;
    if (pointsEqual(point, next)) return false;
  }

  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    const firstStart = points[firstIndex]!;
    const firstEnd = points[(firstIndex + 1) % points.length]!;

    for (
      let secondIndex = firstIndex + 1;
      secondIndex < points.length;
      secondIndex += 1
    ) {
      const adjacent =
        secondIndex === firstIndex + 1 ||
        (firstIndex === 0 && secondIndex === points.length - 1);
      if (adjacent) continue;
      const secondStart = points[secondIndex]!;
      const secondEnd = points[(secondIndex + 1) % points.length]!;
      if (segmentIntersects(firstStart, firstEnd, secondStart, secondEnd)) {
        return false;
      }
    }
  }

  return true;
};

export const pointInPolygon = (
  point: Point2Like,
  polygon: readonly Point2Like[],
  includeBoundary = true,
): boolean => {
  let inside = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1
  ) {
    const currentPoint = polygon[index]!;
    const previousPoint = polygon[previous]!;
    if (pointOnSegment(point, previousPoint, currentPoint))
      return includeBoundary;

    const crossesRay =
      currentPoint.yMm > point.yMm !== previousPoint.yMm > point.yMm;
    if (!crossesRay) continue;
    const intersectionXmm =
      ((previousPoint.xMm - currentPoint.xMm) *
        (point.yMm - currentPoint.yMm)) /
        (previousPoint.yMm - currentPoint.yMm) +
      currentPoint.xMm;
    if (point.xMm < intersectionXmm) inside = !inside;
  }
  return inside;
};

export const polygonCentroid = (points: readonly Point2Like[]): Point2Like => {
  const signedAreaMm2 = signedPolygonAreaMm2(points);
  if (Math.abs(signedAreaMm2) <= AREA_EPSILON_MM2) {
    const sums = points.reduce(
      (value, point) => ({
        xMm: value.xMm + point.xMm,
        yMm: value.yMm + point.yMm,
      }),
      { xMm: 0, yMm: 0 },
    );
    const divisor = Math.max(1, points.length);
    return { xMm: sums.xMm / divisor, yMm: sums.yMm / divisor };
  }

  let weightedXmm3 = 0;
  let weightedYmm3 = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const weightMm2 = point.xMm * next.yMm - next.xMm * point.yMm;
    weightedXmm3 += (point.xMm + next.xMm) * weightMm2;
    weightedYmm3 += (point.yMm + next.yMm) * weightMm2;
  }
  const divisorMm2 = 6 * signedAreaMm2;
  return {
    xMm: weightedXmm3 / divisorMm2,
    yMm: weightedYmm3 / divisorMm2,
  };
};

export const transformPoint2 = (
  point: Point2Like,
  placement: Placement2Like,
): Point2Like => {
  const radians = (placement.rotationDeg * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    xMm: point.xMm * cosine - point.yMm * sine + placement.translationMm.xMm,
    yMm: point.xMm * sine + point.yMm * cosine + placement.translationMm.yMm,
  };
};

const distancePointToSegmentMm = (
  point: Point2Like,
  start: Point2Like,
  end: Point2Like,
): number => {
  const dxMm = end.xMm - start.xMm;
  const dyMm = end.yMm - start.yMm;
  const lengthSquaredMm2 = dxMm * dxMm + dyMm * dyMm;
  if (lengthSquaredMm2 <= AREA_EPSILON_MM2) {
    return Math.sqrt(squaredDistance(point, start));
  }
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point.xMm - start.xMm) * dxMm + (point.yMm - start.yMm) * dyMm) /
        lengthSquaredMm2,
    ),
  );
  return Math.hypot(
    point.xMm - (start.xMm + projection * dxMm),
    point.yMm - (start.yMm + projection * dyMm),
  );
};

const distanceBetweenSegmentsMm = (
  firstStart: Point2Like,
  firstEnd: Point2Like,
  secondStart: Point2Like,
  secondEnd: Point2Like,
): number => {
  if (segmentIntersects(firstStart, firstEnd, secondStart, secondEnd)) return 0;
  return Math.min(
    distancePointToSegmentMm(firstStart, secondStart, secondEnd),
    distancePointToSegmentMm(firstEnd, secondStart, secondEnd),
    distancePointToSegmentMm(secondStart, firstStart, firstEnd),
    distancePointToSegmentMm(secondEnd, firstStart, firstEnd),
  );
};

/** Minimum distance between contour boundaries, independent of containment. */
export const minimumContourBoundaryClearanceMm = (
  first: readonly Point2Like[],
  second: readonly Point2Like[],
): number => {
  let minimumMm = Number.POSITIVE_INFINITY;
  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    const firstStart = first[firstIndex]!;
    const firstEnd = first[(firstIndex + 1) % first.length]!;
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      const secondStart = second[secondIndex]!;
      const secondEnd = second[(secondIndex + 1) % second.length]!;
      minimumMm = Math.min(
        minimumMm,
        distanceBetweenSegmentsMm(firstStart, firstEnd, secondStart, secondEnd),
      );
    }
  }
  return minimumMm;
};

export const polygonsInteriorOverlap = (
  first: readonly Point2Like[],
  second: readonly Point2Like[],
): boolean => {
  const orientationProduct =
    Math.sign(signedPolygonAreaMm2(first)) *
    Math.sign(signedPolygonAreaMm2(second));
  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    const firstStart = first[firstIndex]!;
    const firstEnd = first[(firstIndex + 1) % first.length]!;
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      const secondStart = second[secondIndex]!;
      const secondEnd = second[(secondIndex + 1) % second.length]!;
      if (
        segmentProperlyIntersects(firstStart, firstEnd, secondStart, secondEnd)
      ) {
        return true;
      }
      const overlapLengthMm = collinearSegmentOverlapLengthMm(
        firstStart,
        firstEnd,
        secondStart,
        secondEnd,
      );
      const directionDot =
        (firstEnd.xMm - firstStart.xMm) * (secondEnd.xMm - secondStart.xMm) +
        (firstEnd.yMm - firstStart.yMm) * (secondEnd.yMm - secondStart.yMm);
      // Coincident edges bound overlapping interiors only when their inward
      // half-planes point to the same side. Opposite directions represent a
      // legal shared boundary between adjacent panels.
      if (
        overlapLengthMm > GEOMETRY_EPSILON_MM &&
        directionDot * orientationProduct > 0
      ) {
        return true;
      }
    }
  }

  return (
    first.some((point) => pointInPolygon(point, second, false)) ||
    second.some((point) => pointInPolygon(point, first, false)) ||
    pointInPolygon(polygonCentroid(first), second, false) ||
    pointInPolygon(polygonCentroid(second), first, false)
  );
};

export const minimumPolygonClearanceMm = (
  first: readonly Point2Like[],
  second: readonly Point2Like[],
): number => {
  if (polygonsInteriorOverlap(first, second)) return -0;
  let minimumMm = Number.POSITIVE_INFINITY;
  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    const firstStart = first[firstIndex]!;
    const firstEnd = first[(firstIndex + 1) % first.length]!;
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      const secondStart = second[secondIndex]!;
      const secondEnd = second[(secondIndex + 1) % second.length]!;
      minimumMm = Math.min(
        minimumMm,
        distanceBetweenSegmentsMm(firstStart, firstEnd, secondStart, secondEnd),
      );
    }
  }
  return minimumMm;
};

const pointInsideTriangle = (
  point: Point2Like,
  first: Point2Like,
  second: Point2Like,
  third: Point2Like,
): boolean => {
  const firstCross = cross(first, second, point);
  const secondCross = cross(second, third, point);
  const thirdCross = cross(third, first, point);
  return (
    firstCross >= -AREA_EPSILON_MM2 &&
    secondCross >= -AREA_EPSILON_MM2 &&
    thirdCross >= -AREA_EPSILON_MM2
  );
};

export const triangulateSimplePolygon = (
  points: readonly Point2Like[],
): readonly TriangleIndices[] => {
  if (!isSimplePolygon(points)) return [];
  const remaining = Array.from({ length: points.length }, (_, index) => index);
  if (signedPolygonAreaMm2(points) < 0) remaining.reverse();
  const triangles: TriangleIndices[] = [];
  let attemptsWithoutEar = 0;

  while (remaining.length > 3) {
    const cursor = attemptsWithoutEar % remaining.length;
    const previousIndex =
      remaining[(cursor - 1 + remaining.length) % remaining.length]!;
    const currentIndex = remaining[cursor]!;
    const nextIndex = remaining[(cursor + 1) % remaining.length]!;
    const previous = points[previousIndex]!;
    const current = points[currentIndex]!;
    const next = points[nextIndex]!;

    const convex = cross(previous, current, next) > AREA_EPSILON_MM2;
    const containsVertex = remaining.some((candidateIndex) => {
      if (
        candidateIndex === previousIndex ||
        candidateIndex === currentIndex ||
        candidateIndex === nextIndex
      ) {
        return false;
      }
      const candidate = points[candidateIndex]!;
      return pointInsideTriangle(candidate, previous, current, next);
    });

    if (convex && !containsVertex) {
      triangles.push({ a: previousIndex, b: currentIndex, c: nextIndex });
      remaining.splice(cursor, 1);
      attemptsWithoutEar = 0;
      continue;
    }

    attemptsWithoutEar += 1;
    if (attemptsWithoutEar > remaining.length * 2) return [];
  }

  const [a, b, c] = remaining;
  return [...triangles, { a: a!, b: b!, c: c! }];
};

export const segmentsEquivalent = (
  firstStart: Point2Like,
  firstEnd: Point2Like,
  secondStart: Point2Like,
  secondEnd: Point2Like,
  toleranceMm: number,
): boolean =>
  (pointsEqual(firstStart, secondStart, toleranceMm) &&
    pointsEqual(firstEnd, secondEnd, toleranceMm)) ||
  (pointsEqual(firstStart, secondEnd, toleranceMm) &&
    pointsEqual(firstEnd, secondStart, toleranceMm));
