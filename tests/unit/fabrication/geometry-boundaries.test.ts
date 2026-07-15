import { describe, expect, it } from "vitest";

import {
  IDENTITY_MATRIX_4,
  matrixApproximatelyEquals,
  matrixIsFinite,
  rotationMatrix4,
  transformPoint3,
  type Matrix4,
} from "@/core/fabrication/matrix";
import {
  isSimplePolygon,
  minimumEdgeLengthMm,
  minimumPolygonClearanceMm,
  pointInPolygon,
  polygonBounds,
  polygonCentroid,
  polygonPerimeterMm,
  polygonsInteriorOverlap,
  segmentIntersects,
  segmentsEquivalent,
  signedPolygonAreaMm2,
  triangulateSimplePolygon,
} from "@/core/fabrication/polygon";

const square = [
  { xMm: 0, yMm: 0 },
  { xMm: 10, yMm: 0 },
  { xMm: 10, yMm: 10 },
  { xMm: 0, yMm: 10 },
] as const;

describe("matrix boundary behavior", () => {
  it("applies a non-unit homogeneous coordinate and reports non-finite matrices", () => {
    const projective: Matrix4 = [
      1, 0, 0, 4, 0, 1, 0, 6, 0, 0, 1, 8, 0, 0, 0, 2,
    ];
    expect(transformPoint3(projective, { xMm: 2, yMm: 4, zMm: 6 })).toEqual({
      xMm: 3,
      yMm: 5,
      zMm: 7,
    });
    expect(
      transformPoint3([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], {
        xMm: 2,
        yMm: 4,
        zMm: 6,
      }),
    ).toEqual({ xMm: 2, yMm: 4, zMm: 6 });
    expect(
      matrixIsFinite([
        ...IDENTITY_MATRIX_4.slice(0, 15),
        Infinity,
      ] as unknown as Matrix4),
    ).toBe(false);
    expect(
      matrixApproximatelyEquals(IDENTITY_MATRIX_4, [
        2,
        ...IDENTITY_MATRIX_4.slice(1),
      ] as unknown as Matrix4),
    ).toBe(false);
    expect(rotationMatrix4({ x: 1, y: 0, z: 0 }, Number.NaN)).toBeNull();
  });
});

describe("polygon boundary behavior", () => {
  it("handles empty measurements, repeated vertices, and non-zero-area crossings", () => {
    expect(signedPolygonAreaMm2([])).toBe(0);
    expect(polygonPerimeterMm([])).toBe(0);
    expect(minimumEdgeLengthMm([])).toBe(Infinity);
    expect(polygonBounds([])).toEqual({
      minimumXmm: Infinity,
      minimumYmm: Infinity,
      maximumXmm: -Infinity,
      maximumYmm: -Infinity,
      widthMm: -Infinity,
      heightMm: -Infinity,
    });
    expect(polygonCentroid([])).toEqual({ xMm: 0, yMm: 0 });
    expect(
      isSimplePolygon([
        { xMm: 0, yMm: 0 },
        { xMm: 4, yMm: 0 },
        { xMm: 4, yMm: 0 },
        { xMm: 0, yMm: 4 },
      ]),
    ).toBe(false);
    expect(
      isSimplePolygon([
        { xMm: 0, yMm: 0 },
        { xMm: 5, yMm: 5 },
        { xMm: 0, yMm: 6 },
        { xMm: 6, yMm: 0 },
        { xMm: 6, yMm: 6 },
      ]),
    ).toBe(false);
  });

  it("covers collinear segment contact and strict polygon boundaries", () => {
    expect(
      segmentIntersects(
        { xMm: 0, yMm: 0 },
        { xMm: 10, yMm: 0 },
        { xMm: 5, yMm: 0 },
        { xMm: 15, yMm: 0 },
      ),
    ).toBe(true);
    expect(
      segmentIntersects(
        { xMm: 0, yMm: 0 },
        { xMm: 2, yMm: 0 },
        { xMm: 3, yMm: 0 },
        { xMm: 4, yMm: 0 },
      ),
    ).toBe(false);
    expect(pointInPolygon({ xMm: 0, yMm: 5 }, square)).toBe(true);
    expect(pointInPolygon({ xMm: 11, yMm: 11 }, [])).toBe(false);
  });

  it("detects proper crossings, containment, overlap clearance, and point segments", () => {
    const diamond = [
      { xMm: 5, yMm: -2 },
      { xMm: 12, yMm: 5 },
      { xMm: 5, yMm: 12 },
      { xMm: -2, yMm: 5 },
    ];
    expect(polygonsInteriorOverlap(square, diamond)).toBe(true);
    expect(Object.is(minimumPolygonClearanceMm(square, diamond), -0)).toBe(
      true,
    );

    const outer = square.map((point) => ({
      xMm: point.xMm * 3 - 10,
      yMm: point.yMm * 3 - 10,
    }));
    expect(polygonsInteriorOverlap(square, outer)).toBe(true);

    const touching = square.map((point) => ({
      xMm: point.xMm + 10,
      yMm: point.yMm,
    }));
    expect(minimumPolygonClearanceMm(square, touching)).toBe(0);
    expect(
      minimumPolygonClearanceMm(
        [
          { xMm: 0, yMm: 0 },
          { xMm: 0, yMm: 0 },
        ],
        [
          { xMm: 3, yMm: 0 },
          { xMm: 3, yMm: 0 },
        ],
      ),
    ).toBe(3);
  });

  it("triangulates clockwise contours and rejects invalid contours", () => {
    expect(triangulateSimplePolygon(square.toReversed())).toHaveLength(2);
    expect(
      triangulateSimplePolygon([
        { xMm: 0, yMm: 0 },
        { xMm: 1, yMm: 1 },
      ]),
    ).toEqual([]);
    expect(
      segmentsEquivalent(
        { xMm: 0, yMm: 0 },
        { xMm: 10, yMm: 0 },
        { xMm: 10, yMm: 0 },
        { xMm: 0, yMm: 0 },
        0,
      ),
    ).toBe(true);
    expect(
      segmentsEquivalent(
        { xMm: 0, yMm: 0 },
        { xMm: 10, yMm: 0 },
        { xMm: 0, yMm: 2 },
        { xMm: 10, yMm: 2 },
        0.1,
      ),
    ).toBe(false);
  });
});
