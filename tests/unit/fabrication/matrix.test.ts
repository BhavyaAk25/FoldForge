import { describe, expect, it } from "vitest";

import {
  decomposeRigidMatrix4,
  IDENTITY_MATRIX_4,
  inverseRigidMatrix4,
  matrixApproximatelyEquals,
  matrixIsFinite,
  multiplyMatrices4,
  rotationAroundAxisMatrix4,
  rotationMatrix4,
  transformPoint3,
  translationMatrix4,
} from "@/core/fabrication/matrix";

describe("fabrication rigid transforms", () => {
  it("composes row-major transforms in application order", () => {
    const rotation = rotationMatrix4({ x: 0, y: 0, z: 1 }, 90);
    expect(rotation).not.toBeNull();
    if (!rotation) return;
    const composed = multiplyMatrices4(
      translationMatrix4(10, 20, 30),
      rotation,
    );
    expect(transformPoint3(composed, { xMm: 2, yMm: 0, zMm: 0 })).toEqual({
      xMm: 10,
      yMm: 22,
      zMm: 30,
    });
    expect(matrixIsFinite(composed)).toBe(true);
  });

  it("rotates around an offset hinge axis", () => {
    const matrix = rotationAroundAxisMatrix4(
      { xMm: 10, yMm: 0, zMm: 0 },
      { xMm: 10, yMm: 10, zMm: 0 },
      90,
    );
    expect(matrix).not.toBeNull();
    if (!matrix) return;
    const point = transformPoint3(matrix, { xMm: 20, yMm: 5, zMm: 0 });
    expect(point.xMm).toBeCloseTo(10);
    expect(point.yMm).toBeCloseTo(5);
    expect(point.zMm).toBeCloseTo(-10);
    const axisPoint = transformPoint3(matrix, { xMm: 10, yMm: 4, zMm: 0 });
    expect(axisPoint).toEqual({ xMm: 10, yMm: 4, zMm: 0 });
  });

  it("rejects a degenerate axis and preserves identity", () => {
    expect(rotationMatrix4({ x: 0, y: 0, z: 0 }, 20)).toBeNull();
    expect(
      rotationAroundAxisMatrix4(
        { xMm: 1, yMm: 1, zMm: 1 },
        { xMm: 1, yMm: 1, zMm: 1 },
        20,
      ),
    ).toBeNull();
    expect(
      matrixApproximatelyEquals(
        multiplyMatrices4(IDENTITY_MATRIX_4, IDENTITY_MATRIX_4),
        IDENTITY_MATRIX_4,
      ),
    ).toBe(true);
  });

  it("inverts and decomposes a rigid transform", () => {
    const rotation = rotationMatrix4({ x: 0, y: 0, z: 1 }, 90);
    expect(rotation).not.toBeNull();
    if (!rotation) return;
    const matrix = multiplyMatrices4(translationMatrix4(10, 20, 30), rotation);
    const inverse = inverseRigidMatrix4(matrix);
    expect(inverse).not.toBeNull();
    if (!inverse) return;
    expect(
      matrixApproximatelyEquals(
        multiplyMatrices4(inverse, matrix),
        IDENTITY_MATRIX_4,
      ),
    ).toBe(true);

    const components = decomposeRigidMatrix4(matrix);
    expect(components).not.toBeNull();
    expect(components?.translationMm).toEqual({
      xMm: 10,
      yMm: 20,
      zMm: 30,
    });
    expect(components?.rotation.x).toBeCloseTo(0);
    expect(components?.rotation.y).toBeCloseTo(0);
    expect(components?.rotation.z).toBeCloseTo(Math.SQRT1_2);
    expect(components?.rotation.w).toBeCloseTo(Math.SQRT1_2);
  });

  it("rejects non-finite rigid transforms", () => {
    const invalid = [...IDENTITY_MATRIX_4] as number[];
    invalid[0] = Number.NaN;
    expect(
      inverseRigidMatrix4(invalid as unknown as typeof IDENTITY_MATRIX_4),
    ).toBeNull();
    expect(
      decomposeRigidMatrix4(invalid as unknown as typeof IDENTITY_MATRIX_4),
    ).toBeNull();

    const finiteButUnbounded = [...IDENTITY_MATRIX_4] as number[];
    finiteButUnbounded[0] = Number.MAX_VALUE;
    finiteButUnbounded[5] = Number.MAX_VALUE;
    finiteButUnbounded[10] = Number.MAX_VALUE;
    expect(
      decomposeRigidMatrix4(
        finiteButUnbounded as unknown as typeof IDENTITY_MATRIX_4,
      ),
    ).toBeNull();
  });

  it.each([
    [{ x: 1, y: 0, z: 0 }, "x"],
    [{ x: 0, y: 1, z: 0 }, "y"],
    [{ x: 0, y: 0, z: 1 }, "z"],
  ] as const)("decomposes a half turn around %s", (axis, component) => {
    const matrix = rotationMatrix4(axis, 180);
    expect(matrix).not.toBeNull();
    if (!matrix) return;
    const decomposed = decomposeRigidMatrix4(matrix);
    expect(decomposed).not.toBeNull();
    expect(Math.abs(decomposed?.rotation[component] ?? 0)).toBeCloseTo(1);
    expect(decomposed?.rotation.w).toBeCloseTo(0);
  });

  it("normalizes the quaternion sign after a reflex rotation", () => {
    const matrix = rotationMatrix4({ x: 1, y: 0, z: 0 }, 200);
    expect(matrix).not.toBeNull();
    if (!matrix) return;
    const decomposed = decomposeRigidMatrix4(matrix);
    expect(decomposed).not.toBeNull();
    expect(decomposed?.rotation.w).toBeGreaterThanOrEqual(0);
  });
});
