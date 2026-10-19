import type { PapercraftModel } from "./model";
import type { Vec2 } from "./unfold";

/**
 * One printable SVG page at 1:1 scale. Faces are filled with their part's
 * colour; cut lines are solid, mountain folds dash-dot, valley folds dashed;
 * each glue tab and its partner edge carry the same number.
 */

const n = (v: number) => String(Math.round(v * 100) / 100);
const xml = (text: string) =>
  text.replace(/[<>&"]/gu, (c) => `&#${c.charCodeAt(0)};`);
const pts = (points: readonly Vec2[]) =>
  points.map(([x, y]) => `${n(x)},${n(y)}`).join(" ");

/** A label just inside a cut edge (on a y-down page, faces wind clockwise: inside is to the right). */
const edgeLabel = (
  from: Vec2,
  to: Vec2,
  text: string,
  size: number,
): string => {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const l = Math.hypot(dx, dy) || 1;
  const [x, y] = [
    (from[0] + to[0]) / 2 + (dy / l) * size * 0.9,
    (from[1] + to[1]) / 2 - (dx / l) * size * 0.9,
  ];
  return `<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" text-anchor="middle" dominant-baseline="middle">${text}</text>`;
};

const area = (points: readonly Vec2[]) =>
  points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return sum + (p[0] * q[1] - q[0] * p[1]) / 2;
  }, 0);

const partName = (model: PapercraftModel, id: string) =>
  model.parts.find((p) => p.id === id)?.name ?? id;

export const papercraftPageSvg = (
  model: PapercraftModel,
  page: number,
): string => {
  const { widthMm: W, heightMm: H } = model.sheet;
  const islands = model.pages[page] ?? [];
  const body = islands
    .map((island) => {
      const tabs = island.cuts
        .filter((c) => c.tab)
        .map(
          (c) =>
            `<polygon points="${pts(c.tab!)}" fill="#ececec" stroke="#222" stroke-width="0.25"/>`,
        )
        .join("");
      const faces = island.faces
        .map(
          (f) =>
            `<polygon points="${pts(f.points)}" fill="${island.color}" stroke="${island.color}" stroke-width="0.15"/>`,
        )
        .join("");
      const decals = island.decals
        .map(
          (d) =>
            `<circle cx="${n(d.centre[0])}" cy="${n(d.centre[1])}" r="${n(d.radiusMm)}" fill="${d.color}"/>`,
        )
        .join("");
      const folds = island.folds
        .map(
          (f) =>
            `<line x1="${n(f.from[0])}" y1="${n(f.from[1])}" x2="${n(f.to[0])}" y2="${n(f.to[1])}" stroke="#333" stroke-width="0.2" stroke-dasharray="${f.mountain ? "3 1 0.6 1" : "2 1"}"/>`,
        )
        .join("");
      const cuts = island.cuts
        .map(
          (c) =>
            `<line x1="${n(c.from[0])}" y1="${n(c.from[1])}" x2="${n(c.to[0])}" y2="${n(c.to[1])}" stroke="#111" stroke-width="0.3"/>`,
        )
        .join("");
      const labels = island.cuts
        .map((c) => edgeLabel(c.from, c.to, String(c.label), 2.2))
        .join("");
      // The part's name on its largest face, so pieces can be told apart.
      const largest = island.faces.reduce((a, b) =>
        Math.abs(area(b.points)) > Math.abs(area(a.points)) ? b : a,
      );
      const [cx, cy] = largest.points.reduce(
        ([x, y], p) => [
          x + p[0] / largest.points.length,
          y + p[1] / largest.points.length,
        ],
        [0, 0],
      );
      const name = `<text x="${n(cx)}" y="${n(cy)}" font-size="3" text-anchor="middle" dominant-baseline="middle" fill="#00000088">${xml(partName(model, island.part))}</text>`;
      return `<g>${tabs}${faces}${decals}${folds}${cuts}<g font-family="sans-serif" fill="#333">${labels}${name}</g></g>`;
    })
    .join("\n");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`,
    `<title>${xml(model.title)}: page ${page + 1} of ${model.pages.length}</title>`,
    `<rect width="${W}" height="${H}" fill="#fff"/>`,
    body,
    `<text x="10" y="${H - 6}" font-family="sans-serif" font-size="2.6" fill="#555">${xml(model.title)}, page ${page + 1} of ${model.pages.length}. Print at 100%. Cut solid lines; fold dash-dot lines away, dashed lines toward you.</text>`,
    `<text x="10" y="${H - 3}" font-family="sans-serif" font-size="2.6" fill="#555">Glue each grey tab under the edge with the same number.</text>`,
    "</svg>",
  ].join("\n");
};
