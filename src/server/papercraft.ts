import { canonicalSerialize } from "@/core/canonical";
import { papercraftPageSvg } from "@/core/mesh/export";
import { buildPapercraft, type PapercraftModel } from "@/core/mesh/model";
import { rigSpec, type FigureSpec } from "@/core/mesh/rigs";
import { verifyPapercraft } from "@/core/mesh/verify";
import type { PapercraftPayload } from "@/lib/papercraft-contract";

/**
 * Builds a figure on the server and returns what the page shows: the 3D
 * parts, printable pages, and instructions. A figure that fails its checks
 * is never returned; rigs are built so that does not happen (the tests and
 * the visual bench build every preset).
 */

const cache = new Map<string, PapercraftPayload>();
const CACHE_LIMIT = 64;

const instructionsFor = (model: PapercraftModel): string[] => {
  const [first, ...rest] = model.parts;
  const largest =
    [...model.parts].sort(
      (a, b) => b.mesh.faces.length - a.mesh.faces.length,
    )[0] ?? first;
  return [
    `Print all ${model.pages.length} pages at 100% (no "fit to page") on A4 card, about 160 to 220 gsm.`,
    "Score every dashed and dash-dot line with a blunt point and a ruler, then cut along the solid lines.",
    "Fold dash-dot lines away from you and dashed lines toward you, so the printed side stays outside.",
    // One line per kind of part: "Build the 2 wings".
    ...[...new Set(model.parts.map((p) => p.name))].map((name) => {
      const count = model.parts.filter((p) => p.name === name).length;
      const what =
        count > 1 ? `${count} ${name.toLowerCase()}s` : name.toLowerCase();
      return `Build the ${what}: glue each grey tab under the edge with the same number, closing the last seam from inside with a pencil end.`;
    }),
    ...(rest.length > 0 && largest
      ? [
          `Glue the other parts onto the ${largest.name.toLowerCase()} where they overlap in the 3D view, smallest last.`,
        ]
      : []),
  ];
};

export type FigureBuild =
  | { readonly ok: true; readonly payload: PapercraftPayload }
  | { readonly ok: false; readonly reason: string };

export const buildFigure = (figure: FigureSpec): FigureBuild => {
  const key = canonicalSerialize(figure);
  const cached = cache.get(key);
  if (cached) return { ok: true, payload: cached };
  const built = buildPapercraft(rigSpec(figure));
  if (!built.ok) return { ok: false, reason: built.error.kind };
  const failures = verifyPapercraft(built.value);
  if (failures.length > 0) return { ok: false, reason: failures[0]!.check };
  const model = built.value;
  const round = (v: number) => Math.round(v * 100) / 100;
  const payload: PapercraftPayload = {
    title: model.title,
    sizeMm: figure.sizeMm,
    parts: model.parts.map((part) => ({
      name: part.name,
      color: part.color,
      vertices: part.mesh.vertices.flatMap((v) => v.map(round)),
      faces: part.mesh.faces.map((f) => [...f]),
    })),
    decals: model.decals.map((d) => ({
      centre: [round(d.centre[0]), round(d.centre[1]), round(d.centre[2])],
      normal: [round(d.normal[0]), round(d.normal[1]), round(d.normal[2])],
      radiusMm: d.radiusMm,
      color: d.color,
    })),
    pages: model.pages.map((_, page) => papercraftPageSvg(model, page)),
    instructions: instructionsFor(model),
    checks: {
      pieces: model.pages.flat().length,
      seams: new Set(
        model.pages.flat().flatMap((island) => island.cuts.map((c) => c.label)),
      ).size,
      faces: model.parts.reduce((sum, p) => sum + p.mesh.faces.length, 0),
    },
  };
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, payload);
  return { ok: true, payload };
};
