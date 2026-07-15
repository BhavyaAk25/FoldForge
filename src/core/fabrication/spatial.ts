import type { Point3Like } from "./matrix";

export interface Triangle3Like {
  readonly first: Point3Like;
  readonly second: Point3Like;
  readonly third: Point3Like;
}

export interface Bounds3Mm {
  readonly minimumXmm: number;
  readonly minimumYmm: number;
  readonly minimumZmm: number;
  readonly maximumXmm: number;
  readonly maximumYmm: number;
  readonly maximumZmm: number;
}

interface Vector3Value {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const subtract = (left: Point3Like, right: Point3Like): Vector3Value => ({
  x: left.xMm - right.xMm,
  y: left.yMm - right.yMm,
  z: left.zMm - right.zMm,
});

const addScaled = (
  point: Point3Like,
  vector: Vector3Value,
  scale: number,
): Point3Like => ({
  xMm: point.xMm + vector.x * scale,
  yMm: point.yMm + vector.y * scale,
  zMm: point.zMm + vector.z * scale,
});

const dot = (left: Vector3Value, right: Vector3Value): number =>
  left.x * right.x + left.y * right.y + left.z * right.z;

const cross = (left: Vector3Value, right: Vector3Value): Vector3Value => ({
  x: left.y * right.z - left.z * right.y,
  y: left.z * right.x - left.x * right.z,
  z: left.x * right.y - left.y * right.x,
});

const lengthSquared = (vector: Vector3Value): number => dot(vector, vector);

const distance = (left: Point3Like, right: Point3Like): number =>
  Math.hypot(left.xMm - right.xMm, left.yMm - right.yMm, left.zMm - right.zMm);

export const triangleBounds3 = (triangle: Triangle3Like): Bounds3Mm => ({
  minimumXmm: Math.min(
    triangle.first.xMm,
    triangle.second.xMm,
    triangle.third.xMm,
  ),
  minimumYmm: Math.min(
    triangle.first.yMm,
    triangle.second.yMm,
    triangle.third.yMm,
  ),
  minimumZmm: Math.min(
    triangle.first.zMm,
    triangle.second.zMm,
    triangle.third.zMm,
  ),
  maximumXmm: Math.max(
    triangle.first.xMm,
    triangle.second.xMm,
    triangle.third.xMm,
  ),
  maximumYmm: Math.max(
    triangle.first.yMm,
    triangle.second.yMm,
    triangle.third.yMm,
  ),
  maximumZmm: Math.max(
    triangle.first.zMm,
    triangle.second.zMm,
    triangle.third.zMm,
  ),
});

export const bounds3Overlap = (
  first: Bounds3Mm,
  second: Bounds3Mm,
  toleranceMm = 0,
): boolean =>
  first.minimumXmm <= second.maximumXmm + toleranceMm &&
  first.maximumXmm + toleranceMm >= second.minimumXmm &&
  first.minimumYmm <= second.maximumYmm + toleranceMm &&
  first.maximumYmm + toleranceMm >= second.minimumYmm &&
  first.minimumZmm <= second.maximumZmm + toleranceMm &&
  first.maximumZmm + toleranceMm >= second.minimumZmm;

const closestPointOnTriangle = (
  point: Point3Like,
  triangle: Triangle3Like,
): Point3Like => {
  const edgeFirst = subtract(triangle.second, triangle.first);
  const edgeSecond = subtract(triangle.third, triangle.first);
  const fromFirst = subtract(point, triangle.first);
  const firstProjection = dot(edgeFirst, fromFirst);
  const secondProjection = dot(edgeSecond, fromFirst);
  if (firstProjection <= 0 && secondProjection <= 0) return triangle.first;

  const fromSecond = subtract(point, triangle.second);
  const thirdProjection = dot(edgeFirst, fromSecond);
  const fourthProjection = dot(edgeSecond, fromSecond);
  if (thirdProjection >= 0 && fourthProjection <= thirdProjection) {
    return triangle.second;
  }

  const firstRegion =
    firstProjection * fourthProjection - thirdProjection * secondProjection;
  if (firstRegion <= 0 && firstProjection >= 0 && thirdProjection <= 0) {
    const fraction = firstProjection / (firstProjection - thirdProjection);
    return addScaled(triangle.first, edgeFirst, fraction);
  }

  const fromThird = subtract(point, triangle.third);
  const fifthProjection = dot(edgeFirst, fromThird);
  const sixthProjection = dot(edgeSecond, fromThird);
  if (sixthProjection >= 0 && fifthProjection <= sixthProjection) {
    return triangle.third;
  }

  const secondRegion =
    fifthProjection * secondProjection - firstProjection * sixthProjection;
  if (secondRegion <= 0 && secondProjection >= 0 && sixthProjection <= 0) {
    const fraction = secondProjection / (secondProjection - sixthProjection);
    return addScaled(triangle.first, edgeSecond, fraction);
  }

  const thirdRegion =
    thirdProjection * sixthProjection - fifthProjection * fourthProjection;
  if (
    thirdRegion <= 0 &&
    fourthProjection - thirdProjection >= 0 &&
    fifthProjection - sixthProjection >= 0
  ) {
    const fraction =
      (fourthProjection - thirdProjection) /
      (fourthProjection - thirdProjection + fifthProjection - sixthProjection);
    return addScaled(
      triangle.second,
      subtract(triangle.third, triangle.second),
      fraction,
    );
  }

  const denominator = 1 / (firstRegion + secondRegion + thirdRegion);
  const secondWeight = secondRegion * denominator;
  const thirdWeight = firstRegion * denominator;
  return {
    xMm:
      triangle.first.xMm +
      edgeFirst.x * secondWeight +
      edgeSecond.x * thirdWeight,
    yMm:
      triangle.first.yMm +
      edgeFirst.y * secondWeight +
      edgeSecond.y * thirdWeight,
    zMm:
      triangle.first.zMm +
      edgeFirst.z * secondWeight +
      edgeSecond.z * thirdWeight,
  };
};

export const pointTriangleDistanceMm = (
  point: Point3Like,
  triangle: Triangle3Like,
): number => distance(point, closestPointOnTriangle(point, triangle));

const segmentSegmentDistanceMm = (
  firstStart: Point3Like,
  firstEnd: Point3Like,
  secondStart: Point3Like,
  secondEnd: Point3Like,
): number => {
  const firstDirection = subtract(firstEnd, firstStart);
  const secondDirection = subtract(secondEnd, secondStart);
  const betweenStarts = subtract(firstStart, secondStart);
  const firstLengthSquared = lengthSquared(firstDirection);
  const secondLengthSquared = lengthSquared(secondDirection);
  const directionDot = dot(firstDirection, secondDirection);
  const firstOffset = dot(firstDirection, betweenStarts);
  const secondOffset = dot(secondDirection, betweenStarts);
  const denominator =
    firstLengthSquared * secondLengthSquared - directionDot * directionDot;
  let firstFraction = 0;
  let secondFraction = 0;

  if (firstLengthSquared <= 1e-12 && secondLengthSquared <= 1e-12) {
    return distance(firstStart, secondStart);
  }
  if (firstLengthSquared <= 1e-12) {
    secondFraction = Math.max(
      0,
      Math.min(1, secondOffset / secondLengthSquared),
    );
  } else if (secondLengthSquared <= 1e-12) {
    firstFraction = Math.max(0, Math.min(1, -firstOffset / firstLengthSquared));
  } else {
    firstFraction =
      Math.abs(denominator) <= 1e-12
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              (directionDot * secondOffset -
                secondLengthSquared * firstOffset) /
                denominator,
            ),
          );
    secondFraction =
      (directionDot * firstFraction + secondOffset) / secondLengthSquared;
    if (secondFraction < 0) {
      secondFraction = 0;
      firstFraction = Math.max(
        0,
        Math.min(1, -firstOffset / firstLengthSquared),
      );
    } else if (secondFraction > 1) {
      secondFraction = 1;
      firstFraction = Math.max(
        0,
        Math.min(1, (directionDot - firstOffset) / firstLengthSquared),
      );
    }
  }

  return distance(
    addScaled(firstStart, firstDirection, firstFraction),
    addScaled(secondStart, secondDirection, secondFraction),
  );
};

const triangleEdges = (
  triangle: Triangle3Like,
): readonly (readonly [Point3Like, Point3Like])[] => [
  [triangle.first, triangle.second],
  [triangle.second, triangle.third],
  [triangle.third, triangle.first],
];

const segmentIntersectsTriangle = (
  start: Point3Like,
  end: Point3Like,
  triangle: Triangle3Like,
): boolean => {
  const epsilon = 1e-9;
  const direction = subtract(end, start);
  const firstEdge = subtract(triangle.second, triangle.first);
  const secondEdge = subtract(triangle.third, triangle.first);
  const directionCross = cross(direction, secondEdge);
  const determinant = dot(firstEdge, directionCross);
  if (Math.abs(determinant) <= epsilon) return false;
  const inverse = 1 / determinant;
  const startOffset = subtract(start, triangle.first);
  const firstBarycentric = inverse * dot(startOffset, directionCross);
  if (firstBarycentric < -epsilon || firstBarycentric > 1 + epsilon) {
    return false;
  }
  const offsetCross = cross(startOffset, firstEdge);
  const secondBarycentric = inverse * dot(direction, offsetCross);
  if (
    secondBarycentric < -epsilon ||
    firstBarycentric + secondBarycentric > 1 + epsilon
  ) {
    return false;
  }
  const segmentFraction = inverse * dot(secondEdge, offsetCross);
  return segmentFraction >= -epsilon && segmentFraction <= 1 + epsilon;
};

export const triangleMinimumDistanceMm = (
  first: Triangle3Like,
  second: Triangle3Like,
): number => {
  if (
    bounds3Overlap(triangleBounds3(first), triangleBounds3(second), 0) &&
    (triangleEdges(first).some(([start, end]) =>
      segmentIntersectsTriangle(start, end, second),
    ) ||
      triangleEdges(second).some(([start, end]) =>
        segmentIntersectsTriangle(start, end, first),
      ))
  ) {
    return 0;
  }

  let minimumMm = Math.min(
    pointTriangleDistanceMm(first.first, second),
    pointTriangleDistanceMm(first.second, second),
    pointTriangleDistanceMm(first.third, second),
    pointTriangleDistanceMm(second.first, first),
    pointTriangleDistanceMm(second.second, first),
    pointTriangleDistanceMm(second.third, first),
  );
  for (const [firstStart, firstEnd] of triangleEdges(first)) {
    for (const [secondStart, secondEnd] of triangleEdges(second)) {
      minimumMm = Math.min(
        minimumMm,
        segmentSegmentDistanceMm(firstStart, firstEnd, secondStart, secondEnd),
      );
    }
  }
  return minimumMm;
};
