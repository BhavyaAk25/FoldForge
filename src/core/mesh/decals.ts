import type { Vec2 } from "./unfold";

/**
 * Printed decal outlines on a unit scale (about -1..1), counter-clockwise,
 * "up" along +y. A decal is scaled by its radius and laid on a face.
 */

export const DECAL_SHAPES = [
  "circle",
  "square",
  "heart",
  "diamond",
  "spade",
  "club",
] as const;
export type DecalShape = (typeof DECAL_SHAPES)[number];

const ring = (
  count: number,
  r: (a: number) => number,
  centre: Vec2 = [0, 0],
): Vec2[] =>
  Array.from({ length: count }, (_, i) => {
    const a = (2 * Math.PI * i) / count;
    return [centre[0] + r(a) * Math.cos(a), centre[1] + r(a) * Math.sin(a)];
  });

/** The classic heart curve, point down, counter-clockwise. */
const heart = (): Vec2[] =>
  Array.from({ length: 36 }, (_, i) => {
    const u = (2 * Math.PI * i) / 36;
    const x = 16 * Math.sin(u) ** 3;
    const y =
      13 * Math.cos(u) -
      5 * Math.cos(2 * u) -
      2 * Math.cos(3 * u) -
      Math.cos(4 * u);
    return [x / 17, (y + 2) / 17] as Vec2;
  }).reverse();

/** A short flared stem below y = top, from the left side to the right. */
const stem = (top: number): Vec2[] => [
  [-0.12, top],
  [-0.35, -1],
  [0.35, -1],
  [0.12, top],
];

/**
 * Lobes for a spade or club as one arc, from just right of the stem round
 * over the top to just left of it, so lobes plus stem make a simple polygon.
 */
const spadeLobes = (): Vec2[] =>
  Array.from({ length: 33 }, (_, i) => {
    const u = 0.25 + ((2 * Math.PI - 0.5) * i) / 32;
    const x = 16 * Math.sin(u) ** 3;
    const y =
      13 * Math.cos(u) -
      5 * Math.cos(2 * u) -
      2 * Math.cos(3 * u) -
      Math.cos(4 * u);
    // Flipped so the point is up; the dip, where the stem joins, is at the bottom.
    return [(x / 17) * 0.9, (-(y + 2) / 17) * 0.9 + 0.15] as Vec2;
  });

const clubLobes = (): Vec2[] =>
  Array.from({ length: 37 }, (_, i) => {
    const a = -Math.PI / 2 + 0.35 + ((2 * Math.PI - 0.7) * i) / 36;
    const r = 0.62 + 0.38 * Math.cos(3 * (a - Math.PI / 2));
    return [r * Math.cos(a), 0.12 + r * Math.sin(a)] as Vec2;
  });

export const decalOutline = (shape: DecalShape): Vec2[] => {
  switch (shape) {
    case "circle":
      return ring(24, () => 1);
    case "square":
      return [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
    case "heart":
      return heart();
    case "diamond":
      return [
        [0, -1],
        [0.7, 0],
        [0, 1],
        [-0.7, 0],
      ];
    case "spade":
      return [...spadeLobes(), ...stem(-0.4)];
    case "club":
      return [...clubLobes(), ...stem(-0.42)];
  }
};
