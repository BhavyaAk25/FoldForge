import type { Mesh, Vec3 } from "./geometry";

/**
 * Low-poly closed solids centred on the origin, z up, faces counter-
 * clockwise from outside. Every face is planar and convex: affine scaling
 * keeps that true, which is why ellipsoids are scaled spheres.
 */

/** Ring of `n` points at height z with radii rx, ry (first point on +x). */
const ring = (n: number, rx: number, ry: number, z: number, turn = 0): Vec3[] =>
  Array.from({ length: n }, (_, i) => {
    const a = ((i + turn) / n) * 2 * Math.PI;
    return [rx * Math.cos(a), ry * Math.sin(a), z] as Vec3;
  });

/**
 * A stack of rings joined by quads, closed by caps. Rings must share a
 * point count; a ring of radius 0 is collapsed to one apex point.
 */
const loft = (
  rings: readonly {
    readonly rx: number;
    readonly ry: number;
    readonly z: number;
  }[],
  n: number,
): Mesh => {
  const vertices: Vec3[] = [];
  const index: number[][] = [];
  for (const r of rings) {
    if (r.rx === 0 && r.ry === 0) {
      vertices.push([0, 0, r.z]);
      index.push(Array.from({ length: n }, () => vertices.length - 1));
    } else {
      index.push(ring(n, r.rx, r.ry, r.z).map((p) => vertices.push(p) - 1));
    }
  }
  const faces: number[][] = [];
  for (let k = 0; k + 1 < index.length; k += 1) {
    const [low, high] = [index[k]!, index[k + 1]!];
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const quad = [low[i]!, low[j]!, high[j]!, high[i]!];
      const unique = quad.filter((v, at) => quad.indexOf(v) === at);
      if (unique.length >= 3) faces.push(unique);
    }
  }
  const first = index[0]!;
  const last = index[index.length - 1]!;
  if (new Set(first).size > 1) faces.push([...first].reverse());
  if (new Set(last).size > 1) faces.push([...last]);
  return { vertices, faces };
};

/** Box of size w (x), d (y), h (z). */
export const box = (w: number, d: number, h: number): Mesh => {
  const [x, y, z] = [w / 2, d / 2, h / 2];
  return {
    vertices: [
      [-x, -y, -z],
      [x, -y, -z],
      [x, y, -z],
      [-x, y, -z],
      [-x, -y, z],
      [x, -y, z],
      [x, y, z],
      [-x, y, z],
    ],
    faces: [
      [3, 2, 1, 0],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ],
  };
};

/**
 * Frustum with an n-sided elliptical cross-section; the top is `top` times
 * the bottom (0 makes a cone, 1 a prism).
 */
export const frustum = (
  n: number,
  rx: number,
  ry: number,
  top: number,
  h: number,
): Mesh =>
  loft(
    [
      { rx, ry, z: -h / 2 },
      { rx: rx * top, ry: ry * top, z: h / 2 },
    ],
    n,
  );

/**
 * Low-poly ellipsoid: `segments` around, `rings` from pole to pole. Five
 * rings and eight segments give the faceted look of the example duck.
 */
export const ellipsoid = (
  rx: number,
  ry: number,
  rz: number,
  segments = 8,
  rings = 5,
): Mesh =>
  loft(
    Array.from({ length: rings + 1 }, (_, k) => {
      const polar = Math.PI * (1 - k / rings);
      const r = Math.sin(polar);
      return {
        rx: k === 0 || k === rings ? 0 : rx * r,
        ry: k === 0 || k === rings ? 0 : ry * r,
        z: rz * Math.cos(polar),
      };
    }),
    segments,
  );
