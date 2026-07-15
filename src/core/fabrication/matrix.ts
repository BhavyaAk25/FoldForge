export interface Point3Like {
  readonly xMm: number;
  readonly yMm: number;
  readonly zMm: number;
}

export interface Vector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface QuaternionLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface RigidMatrixComponents {
  readonly translationMm: Point3Like;
  readonly rotation: QuaternionLike;
}

export type Matrix4 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const IDENTITY_MATRIX_4: Matrix4 = [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
];

export const multiplyMatrices4 = (left: Matrix4, right: Matrix4): Matrix4 => {
  const result = Array.from({ length: 16 }, () => 0);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      let value = 0;
      for (let inner = 0; inner < 4; inner += 1) {
        value += left[row * 4 + inner]! * right[inner * 4 + column]!;
      }
      result[row * 4 + column] = value;
    }
  }
  return [
    result[0]!,
    result[1]!,
    result[2]!,
    result[3]!,
    result[4]!,
    result[5]!,
    result[6]!,
    result[7]!,
    result[8]!,
    result[9]!,
    result[10]!,
    result[11]!,
    result[12]!,
    result[13]!,
    result[14]!,
    result[15]!,
  ];
};

export const translationMatrix4 = (
  xMm: number,
  yMm: number,
  zMm: number,
): Matrix4 => [1, 0, 0, xMm, 0, 1, 0, yMm, 0, 0, 1, zMm, 0, 0, 0, 1];

const normalizeVector3 = (vector: Vector3Like): Vector3Like | null => {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(length) || length <= 1e-12) return null;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
};

export const rotationMatrix4 = (
  axis: Vector3Like,
  angleDeg: number,
): Matrix4 | null => {
  const unit = normalizeVector3(axis);
  if (!unit || !Number.isFinite(angleDeg)) return null;
  const radians = (angleDeg * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const complement = 1 - cosine;
  const { x, y, z } = unit;

  return [
    cosine + x * x * complement,
    x * y * complement - z * sine,
    x * z * complement + y * sine,
    0,
    y * x * complement + z * sine,
    cosine + y * y * complement,
    y * z * complement - x * sine,
    0,
    z * x * complement - y * sine,
    z * y * complement + x * sine,
    cosine + z * z * complement,
    0,
    0,
    0,
    0,
    1,
  ];
};

export const rotationAroundAxisMatrix4 = (
  axisStartMm: Point3Like,
  axisEndMm: Point3Like,
  angleDeg: number,
): Matrix4 | null => {
  const rotation = rotationMatrix4(
    {
      x: axisEndMm.xMm - axisStartMm.xMm,
      y: axisEndMm.yMm - axisStartMm.yMm,
      z: axisEndMm.zMm - axisStartMm.zMm,
    },
    angleDeg,
  );
  if (!rotation) return null;
  return multiplyMatrices4(
    translationMatrix4(axisStartMm.xMm, axisStartMm.yMm, axisStartMm.zMm),
    multiplyMatrices4(
      rotation,
      translationMatrix4(-axisStartMm.xMm, -axisStartMm.yMm, -axisStartMm.zMm),
    ),
  );
};

export const transformPoint3 = (
  matrix: Matrix4,
  point: Point3Like,
): Point3Like => {
  const xMm =
    matrix[0] * point.xMm +
    matrix[1] * point.yMm +
    matrix[2] * point.zMm +
    matrix[3];
  const yMm =
    matrix[4] * point.xMm +
    matrix[5] * point.yMm +
    matrix[6] * point.zMm +
    matrix[7];
  const zMm =
    matrix[8] * point.xMm +
    matrix[9] * point.yMm +
    matrix[10] * point.zMm +
    matrix[11];
  const homogeneous =
    matrix[12] * point.xMm +
    matrix[13] * point.yMm +
    matrix[14] * point.zMm +
    matrix[15];
  if (Math.abs(homogeneous) <= 1e-12 || homogeneous === 1) {
    return { xMm, yMm, zMm };
  }
  return {
    xMm: xMm / homogeneous,
    yMm: yMm / homogeneous,
    zMm: zMm / homogeneous,
  };
};

export const matrixApproximatelyEquals = (
  left: Matrix4,
  right: Matrix4,
  tolerance = 1e-9,
): boolean =>
  left.every((value, index) => Math.abs(value - right[index]!) <= tolerance);

export const matrixIsFinite = (matrix: Matrix4): boolean =>
  matrix.every(Number.isFinite);

export const inverseRigidMatrix4 = (matrix: Matrix4): Matrix4 | null => {
  if (!matrixIsFinite(matrix)) return null;
  const translation = [matrix[3], matrix[7], matrix[11]] as const;
  const inverseTranslation = [
    -(
      matrix[0] * translation[0] +
      matrix[4] * translation[1] +
      matrix[8] * translation[2]
    ),
    -(
      matrix[1] * translation[0] +
      matrix[5] * translation[1] +
      matrix[9] * translation[2]
    ),
    -(
      matrix[2] * translation[0] +
      matrix[6] * translation[1] +
      matrix[10] * translation[2]
    ),
  ] as const;
  return [
    matrix[0],
    matrix[4],
    matrix[8],
    inverseTranslation[0],
    matrix[1],
    matrix[5],
    matrix[9],
    inverseTranslation[1],
    matrix[2],
    matrix[6],
    matrix[10],
    inverseTranslation[2],
    0,
    0,
    0,
    1,
  ];
};

export const decomposeRigidMatrix4 = (
  matrix: Matrix4,
): RigidMatrixComponents | null => {
  if (!matrixIsFinite(matrix)) return null;
  const trace = matrix[0] + matrix[5] + matrix[10];
  let x: number;
  let y: number;
  let z: number;
  let w: number;
  if (trace > 0) {
    const scale = 2 * Math.sqrt(trace + 1);
    w = 0.25 * scale;
    x = (matrix[9] - matrix[6]) / scale;
    y = (matrix[2] - matrix[8]) / scale;
    z = (matrix[4] - matrix[1]) / scale;
  } else if (matrix[0] > matrix[5] && matrix[0] > matrix[10]) {
    const scale = 2 * Math.sqrt(1 + matrix[0] - matrix[5] - matrix[10]);
    w = (matrix[9] - matrix[6]) / scale;
    x = 0.25 * scale;
    y = (matrix[1] + matrix[4]) / scale;
    z = (matrix[2] + matrix[8]) / scale;
  } else if (matrix[5] > matrix[10]) {
    const scale = 2 * Math.sqrt(1 + matrix[5] - matrix[0] - matrix[10]);
    w = (matrix[2] - matrix[8]) / scale;
    x = (matrix[1] + matrix[4]) / scale;
    y = 0.25 * scale;
    z = (matrix[6] + matrix[9]) / scale;
  } else {
    const scale = 2 * Math.sqrt(1 + matrix[10] - matrix[0] - matrix[5]);
    w = (matrix[4] - matrix[1]) / scale;
    x = (matrix[2] + matrix[8]) / scale;
    y = (matrix[6] + matrix[9]) / scale;
    z = 0.25 * scale;
  }
  const length = Math.hypot(x, y, z, w);
  if (!Number.isFinite(length) || length <= 1e-12) return null;
  const sign = w < 0 ? -1 : 1;
  return {
    translationMm: { xMm: matrix[3], yMm: matrix[7], zMm: matrix[11] },
    rotation: {
      x: (x / length) * sign,
      y: (y / length) * sign,
      z: (z / length) * sign,
      w: (w / length) * sign,
    },
  };
};
