import { describe, expect, it } from "vitest";

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
  transformPoint2,
  triangulatePolygonWithHoles,
  triangulateSimplePolygon,
} from "@/core/fabrication/polygon";

const square = [
  { xMm: 0, yMm: 0 },
  { xMm: 10, yMm: 0 },
  { xMm: 10, yMm: 10 },
  { xMm: 0, yMm: 10 },
] as const;

describe("fabrication polygon primitives", () => {
  it("measures a simple polygon", () => {
    expect(isSimplePolygon(square)).toBe(true);
    expect(signedPolygonAreaMm2(square)).toBe(100);
    expect(polygonPerimeterMm(square)).toBe(40);
    expect(minimumEdgeLengthMm(square)).toBe(10);
    expect(polygonBounds(square)).toEqual({
      minimumXmm: 0,
      minimumYmm: 0,
      maximumXmm: 10,
      maximumYmm: 10,
      widthMm: 10,
      heightMm: 10,
    });
    expect(polygonCentroid(square)).toEqual({ xMm: 5, yMm: 5 });
  });

  it("rejects degenerate and self-intersecting contours", () => {
    expect(isSimplePolygon(square.slice(0, 2))).toBe(false);
    expect(
      isSimplePolygon([
        { xMm: 0, yMm: 0 },
        { xMm: 10, yMm: 10 },
        { xMm: 0, yMm: 10 },
        { xMm: 10, yMm: 0 },
      ]),
    ).toBe(false);
    expect(
      isSimplePolygon([
        { xMm: 0, yMm: 0 },
        { xMm: Number.NaN, yMm: 1 },
        { xMm: 1, yMm: 0 },
      ]),
    ).toBe(false);
  });

  it("classifies segment and polygon relationships", () => {
    expect(
      segmentIntersects(
        { xMm: 0, yMm: 0 },
        { xMm: 10, yMm: 10 },
        { xMm: 0, yMm: 10 },
        { xMm: 10, yMm: 0 },
      ),
    ).toBe(true);
    expect(pointInPolygon({ xMm: 5, yMm: 5 }, square)).toBe(true);
    expect(pointInPolygon({ xMm: 0, yMm: 5 }, square, false)).toBe(false);
    expect(pointInPolygon({ xMm: 12, yMm: 5 }, square)).toBe(false);

    const touching = square.map((point) => ({
      xMm: point.xMm + 10,
      yMm: point.yMm,
    }));
    const overlapping = square.map((point) => ({
      xMm: point.xMm + 9,
      yMm: point.yMm,
    }));
    const separated = square.map((point) => ({
      xMm: point.xMm + 13,
      yMm: point.yMm,
    }));
    expect(polygonsInteriorOverlap(square, touching)).toBe(false);
    expect(polygonsInteriorOverlap(square, overlapping)).toBe(true);
    expect(minimumPolygonClearanceMm(square, separated)).toBe(3);
  });

  it("transforms, compares, and triangulates contours", () => {
    expect(
      transformPoint2(
        { xMm: 2, yMm: 1 },
        {
          translationMm: { xMm: 10, yMm: 20 },
          rotationDeg: 90,
        },
      ),
    ).toEqual({ xMm: 9, yMm: 22 });
    expect(
      segmentsEquivalent(
        { xMm: 0, yMm: 0 },
        { xMm: 10, yMm: 0 },
        { xMm: 10, yMm: 0.001 },
        { xMm: 0, yMm: 0.001 },
        0.01,
      ),
    ).toBe(true);

    const concave = [
      { xMm: 0, yMm: 0 },
      { xMm: 10, yMm: 0 },
      { xMm: 10, yMm: 10 },
      { xMm: 5, yMm: 5 },
      { xMm: 0, yMm: 10 },
    ];
    const triangles = triangulateSimplePolygon(concave);
    expect(triangles).toHaveLength(3);
    const triangleArea = triangles.reduce((total, triangle) => {
      const first = concave[triangle.a];
      const second = concave[triangle.b];
      const third = concave[triangle.c];
      if (!first || !second || !third) return total;
      return (
        total +
        Math.abs(
          (first.xMm * (second.yMm - third.yMm) +
            second.xMm * (third.yMm - first.yMm) +
            third.xMm * (first.yMm - second.yMm)) /
            2,
        )
      );
    }, 0);
    expect(triangleArea).toBeCloseTo(Math.abs(signedPolygonAreaMm2(concave)));
  });

  it("triangulates cutouts without filling their area", () => {
    const hole = [
      { xMm: 2, yMm: 2 },
      { xMm: 8, yMm: 2 },
      { xMm: 8, yMm: 8 },
      { xMm: 2, yMm: 8 },
    ] as const;
    const triangulation = triangulatePolygonWithHoles(square, [hole]);
    const areaMm2 = triangulation.triangles.reduce((total, triangle) => {
      const first = triangulation.vertices[triangle.a]!;
      const second = triangulation.vertices[triangle.b]!;
      const third = triangulation.vertices[triangle.c]!;
      return (
        total +
        Math.abs(
          (first.xMm * (second.yMm - third.yMm) +
            second.xMm * (third.yMm - first.yMm) +
            third.xMm * (first.yMm - second.yMm)) /
            2,
        )
      );
    }, 0);

    expect(triangulation.vertices).toHaveLength(8);
    expect(triangulation.triangles).toHaveLength(8);
    expect(areaMm2).toBe(64);
  });

  it("rejects outer and inner contours that cannot form triangles", () => {
    expect(
      triangulatePolygonWithHoles([
        { xMm: 0, yMm: 0 },
        { xMm: 1, yMm: 0 },
      ]),
    ).toEqual({ vertices: [], triangles: [], relativeAreaDeviation: 1 });
    expect(
      triangulatePolygonWithHoles(square, [
        [
          { xMm: 2, yMm: 2 },
          { xMm: 3, yMm: 2 },
        ],
      ]),
    ).toEqual({ vertices: [], triangles: [], relativeAreaDeviation: 1 });
  });
});
