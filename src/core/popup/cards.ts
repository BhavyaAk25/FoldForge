import type { PopupCard, Vec2, VFold } from "./popup";

/**
 * Pop-up card designs: one V-fold piece per card, cut as a single outline
 * with coloured regions printed on it. Outlines are generated in the
 * piece's frame (s along the centre fold from the apex, t across it) and
 * stay inside the wedge between the fold and the tab line, so the piece
 * folds flat inside the closed card.
 */

const rad = (d: number) => (d * Math.PI) / 180;

/** Points of an n-petal flower round its centre on the fold, bottom to top. */
const petals = (
  centre: number,
  radius: number,
  count: number,
  from = 0.08,
): Vec2[] => {
  const points: Vec2[] = [];
  const samples = 48;
  for (let k = 0; k <= samples; k += 1) {
    const a = Math.PI * (1 - from) - (Math.PI * (1 - 2 * from) * k) / samples;
    const r = radius * (0.7 + 0.3 * Math.cos(count * a));
    points.push([centre + r * Math.cos(a), r * Math.sin(a)]);
  }
  return [...points, [centre + radius, 0]];
};

/** A half disc on the fold, for a flower's centre. */
const halfDisc = (centre: number, radius: number): Vec2[] =>
  Array.from({ length: 17 }, (_, k) => {
    const a = Math.PI * (1 - k / 16);
    return [centre + radius * Math.cos(a), radius * Math.sin(a)] as Vec2;
  });

/** Heart outline point-down on the fold, bottom to top. */
const heart = (centre: number, size: number): Vec2[] =>
  Array.from({ length: 41 }, (_, k) => {
    const u = Math.PI * (1 - k / 40);
    const x = 16 * Math.sin(u) ** 3;
    const y =
      13 * Math.cos(u) -
      5 * Math.cos(2 * u) -
      2 * Math.cos(3 * u) -
      Math.cos(4 * u);
    return [centre + (y / 17) * size, (x / 17) * size] as Vec2;
  });

export type CardDesign = "flower" | "heart";

export interface CardColors {
  readonly card: string;
  readonly main: string;
  readonly second: string;
}

/**
 * Designs are drawn at full size, then shrunk about the apex so the piece,
 * folded flat at 60 degrees to the spine, stays inside the closed card.
 */
const SCALE = 0.9;
const scaled = (piece: VFold): VFold => {
  const k = (points: readonly Vec2[]) =>
    points.map(([s, t]): Vec2 => [s * SCALE, t * SCALE]);
  return {
    ...piece,
    tabMm: piece.tabMm * SCALE,
    half: k(piece.half),
    prints: piece.prints.map((p) => ({ ...p, points: k(p.points) })),
  };
};

/** A card (100 x 140 mm folded; one A4 sheet holds it unfolded) with the named pop-up rising from its centre. */
export const popupCard = (
  design: CardDesign,
  colors: CardColors,
  title: string,
): PopupCard => {
  // Equal angles make the piece's halves open as wide as the card (it lies
  // flat when the card does), so the shape faces the viewer; 30 degrees
  // keeps it inside the closed card once drawn at SCALE.
  const [alphaDeg, phiDeg] = [30, 30];
  const tab = 24;
  const tabEnd: Vec2 = [
    tab * Math.cos(rad(phiDeg)),
    tab * Math.sin(rad(phiDeg)),
  ];
  // A stem with two leaves from the tab up to the shape, inside the wedge.
  const stem: Vec2[] = [
    [0, 0],
    tabEnd,
    [27, 12],
    [37, 19],
    [49, 21],
    [53, 14],
    [47, 9],
    [57, 4],
    [64, 3],
  ];
  if (design === "heart") {
    const shape = heart(92, 36);
    return {
      title,
      pageWidthMm: 100,
      pageHeightMm: 140,
      cardColor: colors.card,
      pieces: [
        scaled({
          id: "heart",
          name: "Heart",
          color: colors.main,
          apexMm: 18,
          alphaDeg,
          phiDeg,
          tabMm: tab,
          half: [
            ...stem,
            ...shape.filter(([, t]) => t > 0.5),
            [shape.at(-1)![0], 0],
          ],
          prints: [{ points: [...stem, [64, 0]], color: colors.second }],
        }),
      ],
    };
  }
  const flower = petals(92, 32, 5);
  return {
    title,
    pageWidthMm: 100,
    pageHeightMm: 140,
    cardColor: colors.card,
    pieces: [
      scaled({
        id: "flower",
        name: "Flower",
        color: colors.main,
        apexMm: 18,
        alphaDeg,
        phiDeg,
        tabMm: tab,
        half: [...stem, ...flower],
        prints: [
          { points: [...stem, [64, 0]], color: colors.second },
          // A lighter inner ring of petals, then the centre, for depth.
          {
            points: [...petals(92, 21, 5, 0.04), [92 - 21, 0]],
            color: "#f9c3d2",
          },
          { points: halfDisc(92, 9), color: "#f6c945" },
        ],
      }),
    ],
  };
};
