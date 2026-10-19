/**
 * Small, exact-enough 3D geometry for papercraft meshes, in millimetres.
 * A mesh is a closed surface of planar convex faces wound counter-clockwise
 * seen from outside, so every edge is shared by exactly two faces.
 */

export type Vec3 = readonly [number, number, number];

export interface Mesh {
  readonly vertices: readonly Vec3[];
  readonly faces: readonly (readonly number[])[];
}

export const add = (a: Vec3, b: Vec3): Vec3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
export const sub = (a: Vec3, b: Vec3): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
export const scale = (a: Vec3, s: number): Vec3 => [
  a[0] * s,
  a[1] * s,
  a[2] * s,
];
export const dot = (a: Vec3, b: Vec3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / (length(a) || 1));

/** Newell's method: robust for any planar polygon. */
export const faceNormal = (mesh: Mesh, face: number): Vec3 => {
  const points = mesh.faces[face]!.map((v) => mesh.vertices[v]!);
  let n: Vec3 = [0, 0, 0];
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]!;
    n = add(n, [
      (p[1] - q[1]) * (p[2] + q[2]),
      (p[2] - q[2]) * (p[0] + q[0]),
      (p[0] - q[0]) * (p[1] + q[1]),
    ]);
  });
  return normalize(n);
};

export const faceCentre = (mesh: Mesh, face: number): Vec3 => {
  const points = mesh.faces[face]!.map((v) => mesh.vertices[v]!);
  return scale(points.reduce(add, [0, 0, 0] as Vec3), 1 / points.length);
};

/** Signed volume: positive when faces wind counter-clockwise from outside. */
export const volume = (mesh: Mesh): number =>
  mesh.faces.reduce((total, face) => {
    const [a, ...rest] = face.map((v) => mesh.vertices[v]!);
    let sum = 0;
    for (let i = 0; i + 1 < rest.length; i += 1)
      sum += dot(a!, cross(rest[i]!, rest[i + 1]!));
    return total + sum / 6;
  }, 0);

/** Rotation from Euler angles in degrees, applied x, then y, then z. */
export const rotate = (p: Vec3, [rx, ry, rz]: Vec3): Vec3 => {
  const [ax, ay, az] = [rx, ry, rz].map((d) => (d * Math.PI) / 180) as [
    number,
    number,
    number,
  ];
  const x1: Vec3 = [
    p[0],
    p[1] * Math.cos(ax) - p[2] * Math.sin(ax),
    p[1] * Math.sin(ax) + p[2] * Math.cos(ax),
  ];
  const y1: Vec3 = [
    x1[0] * Math.cos(ay) + x1[2] * Math.sin(ay),
    x1[1],
    -x1[0] * Math.sin(ay) + x1[2] * Math.cos(ay),
  ];
  return [
    y1[0] * Math.cos(az) - y1[1] * Math.sin(az),
    y1[0] * Math.sin(az) + y1[1] * Math.cos(az),
    y1[2],
  ];
};

export const mapMesh = (mesh: Mesh, f: (p: Vec3) => Vec3): Mesh => ({
  vertices: mesh.vertices.map(f),
  faces: mesh.faces,
});

/** Edge key independent of direction. */
export const edgeKey = (a: number, b: number): string =>
  a < b ? `${a}-${b}` : `${b}-${a}`;
