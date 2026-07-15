import { describe, expect, it } from "vitest";

import {
  bounds3Overlap,
  pointTriangleDistanceMm,
  triangleBounds3,
  triangleMinimumDistanceMm,
  type Triangle3Like,
} from "@/core/fabrication/spatial";

const flat: Triangle3Like = {
  first: { xMm: 0, yMm: 0, zMm: 0 },
  second: { xMm: 10, yMm: 0, zMm: 0 },
  third: { xMm: 0, yMm: 10, zMm: 0 },
};

describe("spatial clearance primitives", () => {
  it("measures points above and outside a triangle", () => {
    expect(
      pointTriangleDistanceMm({ xMm: 2, yMm: 2, zMm: 3 }, flat),
    ).toBeCloseTo(3);
    expect(
      pointTriangleDistanceMm({ xMm: 10, yMm: 10, zMm: 0 }, flat),
    ).toBeCloseTo(Math.sqrt(50));
  });

  it("detects crossing and separated triangles", () => {
    const crossing: Triangle3Like = {
      first: { xMm: 2, yMm: 2, zMm: -5 },
      second: { xMm: 2, yMm: 2, zMm: 5 },
      third: { xMm: 4, yMm: 2, zMm: 0 },
    };
    expect(triangleMinimumDistanceMm(flat, crossing)).toBe(0);

    const elevated: Triangle3Like = {
      first: { xMm: 0, yMm: 0, zMm: 7 },
      second: { xMm: 10, yMm: 0, zMm: 7 },
      third: { xMm: 0, yMm: 10, zMm: 7 },
    };
    expect(triangleMinimumDistanceMm(flat, elevated)).toBeCloseTo(7);
  });

  it("computes finite bounds and tolerance overlap", () => {
    const bounds = triangleBounds3(flat);
    expect(bounds).toEqual({
      minimumXmm: 0,
      minimumYmm: 0,
      minimumZmm: 0,
      maximumXmm: 10,
      maximumYmm: 10,
      maximumZmm: 0,
    });
    expect(
      bounds3Overlap(bounds, { ...bounds, minimumZmm: 0.4, maximumZmm: 0.4 }),
    ).toBe(false);
    expect(
      bounds3Overlap(
        bounds,
        { ...bounds, minimumZmm: 0.4, maximumZmm: 0.4 },
        0.5,
      ),
    ).toBe(true);
  });
});
