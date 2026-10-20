import type { PopupCard, Vec2, VFold } from "./popup";

/**
 * The printable A4 page for a pop-up card: the card unfolded at the top with
 * its spine fold and a glue guide for each tab, and every pop-up piece laid
 * flat below it (both halves, centre fold, and glue tabs).
 */

const A4 = { width: 210, height: 297 } as const;
const MARGIN = 5;
const TAB_WIDTH = 8;
const rad = (d: number) => (d * Math.PI) / 180;
const n = (v: number) => String(Math.round(v * 100) / 100);
const xml = (text: string) =>
  text.replace(/[<>&"]/gu, (c) => `&#${c.charCodeAt(0)};`);
const pts = (points: readonly Vec2[]) =>
  points.map(([x, y]) => `${n(x)},${n(y)}`).join(" ");

/** The glue tab beyond the tab line of the right half, in the half's frame. */
export const tabPolygon = (piece: VFold): Vec2[] => {
  const [c, s] = [Math.cos(rad(piece.phiDeg)), Math.sin(rad(piece.phiDeg))];
  // Out of the wedge: rotate the tab direction away from the fold.
  const [ox, oy] = [-s * TAB_WIDTH, c * TAB_WIDTH];
  const end: Vec2 = [piece.tabMm * c, piece.tabMm * s];
  const inset = Math.min(TAB_WIDTH, piece.tabMm / 3);
  return [
    [0, 0],
    end,
    [end[0] + ox - c * inset, end[1] + oy - s * inset],
    [ox + c * inset, oy + s * inset],
  ];
};

/** Lays one half (or its mirror) at an origin with the fold pointing up the page. */
const placeHalf = (
  points: readonly Vec2[],
  origin: Vec2,
  mirror: boolean,
): Vec2[] =>
  points.map(([s, t]) => [origin[0] + (mirror ? -t : t), origin[1] - s]);

export const popupPageSvg = (card: PopupCard): string => {
  const [W, H] = [card.pageWidthMm, card.pageHeightMm];
  const left = (A4.width - 2 * W) / 2;
  const spineX = left + W;
  const top = MARGIN + 6;
  // The card: printed side up, spine down the middle; y on the page grows
  // downward, the card's y (from its bottom edge) grows upward.
  const cardY = (y: number) => top + H - y;
  const guides = card.pieces
    .map((piece, i) =>
      ([1, -1] as const)
        .map((side) => {
          const end: Vec2 = [
            spineX + side * piece.tabMm * Math.sin(rad(piece.alphaDeg)),
            cardY(piece.apexMm + piece.tabMm * Math.cos(rad(piece.alphaDeg))),
          ];
          return `<line x1="${n(spineX)}" y1="${n(cardY(piece.apexMm))}" x2="${n(end[0])}" y2="${n(end[1])}" stroke="#777" stroke-width="0.3" stroke-dasharray="1 1"/><text x="${n(end[0] + side * 2)}" y="${n(end[1])}" font-size="3" text-anchor="${side > 0 ? "start" : "end"}" fill="#777">${String.fromCharCode(65 + i)}</text>`;
        })
        .join(""),
    )
    .join("");
  let y = top + H + 8;
  const pieces = card.pieces
    .map((piece, i) => {
      const length = Math.max(...piece.half.map(([s]) => s));
      const origin: Vec2 = [A4.width / 2, y + length];
      y += length + 10;
      const halves = ([false, true] as const).map((mirror) => {
        const tab = placeHalf(tabPolygon(piece), origin, mirror);
        const outline = placeHalf(piece.half, origin, mirror);
        const prints = piece.prints
          .map(
            (p) =>
              `<polygon points="${pts(placeHalf(p.points, origin, mirror))}" fill="${p.color}"/>`,
          )
          .join("");
        return `<polygon points="${pts(tab)}" fill="#ececec" stroke="#222" stroke-width="0.25"/><text x="${n(tab[2]![0])}" y="${n(tab[2]![1])}" font-size="3" fill="#555">${String.fromCharCode(65 + i)}</text><polygon points="${pts(outline)}" fill="${piece.color}" stroke="#222" stroke-width="0.3"/>${prints}<line x1="${n(origin[0])}" y1="${n(origin[1])}" x2="${n(tab[1]![0])}" y2="${n(tab[1]![1])}" stroke="#333" stroke-width="0.2" stroke-dasharray="2 1"/>`;
      });
      return `${halves.join("")}<line x1="${n(origin[0])}" y1="${n(origin[1])}" x2="${n(origin[0])}" y2="${n(origin[1] - length)}" stroke="#333" stroke-width="0.25" stroke-dasharray="3 1 0.6 1"/><text x="${n(origin[0] - 40)}" y="${n(origin[1] - length / 2)}" font-size="3.2" fill="#333" text-anchor="end">${xml(piece.name)}</text>`;
    })
    .join("\n");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${A4.width}mm" height="${A4.height}mm" viewBox="0 0 ${A4.width} ${A4.height}">`,
    `<title>${xml(card.title)}: pop-up card</title>`,
    `<rect width="${A4.width}" height="${A4.height}" fill="#fff"/>`,
    `<rect x="${n(left)}" y="${n(top)}" width="${n(2 * W)}" height="${n(H)}" fill="${card.cardColor}" stroke="#111" stroke-width="0.3"/>`,
    `<line x1="${n(spineX)}" y1="${n(top)}" x2="${n(spineX)}" y2="${n(top + H)}" stroke="#333" stroke-width="0.25" stroke-dasharray="2 1"/>`,
    guides,
    pieces,
    `<text x="${MARGIN}" y="${A4.height - 6}" font-family="sans-serif" font-size="2.6" fill="#555">${xml(card.title)}. Print at 100% on card. Cut solid lines. Fold the card's spine toward you; fold each piece's centre so its face points out.</text>`,
    `<text x="${MARGIN}" y="${A4.height - 3}" font-family="sans-serif" font-size="2.6" fill="#555">Fold the grey tabs back, glue them on the dotted guides with the same letter, centre fold on the spine.</text>`,
    "</svg>",
  ].join("\n");
};
