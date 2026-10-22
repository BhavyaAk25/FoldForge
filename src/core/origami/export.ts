import type { CreasePatternV1, Point2 } from "./crease-pattern";
import { applyIsometry, orientation, type Isometry } from "./fold-rules";
import type { FoldKeyframe } from "./animate";
import type { FoldLine } from "./sequence";

/**
 * Origami outputs: a printable crease pattern (SVG), the FOLD file with the
 * crease pattern and its flat-folded form, and step diagrams for printed
 * instructions. The browser draws its step diagrams with the same function.
 */

const STYLE = {
  M: 'stroke="#c0392b" stroke-width="0.6" stroke-dasharray="6 2 1 2"',
  V: 'stroke="#2463b5" stroke-width="0.6" stroke-dasharray="4 2"',
  B: 'stroke="#111" stroke-width="0.8"',
  F: 'stroke="#999" stroke-width="0.3"',
} as const;

const n = (value: number): string => String(Math.round(value * 1000) / 1000);
const xml = (text: string): string =>
  text.replace(/[<>&"]/gu, (c) => `&#${c.charCodeAt(0)};`);

/** Crease pattern at `sizeMm`, viewed from the front: mountains dash-dot red, valleys dashed blue. */
export const creasePatternSvg = (
  cp: CreasePatternV1,
  title: string,
  sizeMm = 150,
): string => {
  const margin = 10;
  const total = sizeMm + 2 * margin;
  const at = (p: Point2) =>
    `x1="${n(margin + p.x * sizeMm)}" y1="${n(margin + (1 - p.y) * sizeMm)}"`;
  const to = (p: Point2) =>
    `x2="${n(margin + p.x * sizeMm)}" y2="${n(margin + (1 - p.y) * sizeMm)}"`;
  const lines = cp.edges
    .map(
      (e) =>
        `<line ${at(cp.vertices[e.a]!)} ${to(cp.vertices[e.b]!)} ${STYLE[e.assignment]} fill="none"/>`,
    )
    .join("\n");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${total}mm" height="${total + 8}mm" viewBox="0 0 ${total} ${total + 8}">`,
    `<title>${xml(title)} crease pattern</title>`,
    lines,
    `<text x="${margin}" y="${total + 4}" font-family="sans-serif" font-size="3.5">${xml(title)}: red dash-dot = mountain, blue dashed = valley. Print at 100% on a ${sizeMm} mm square.</text>`,
    "</svg>",
  ].join("\n");
};

/** FOLD 1.1: the crease pattern, plus its flat-folded form as a second frame. */
export const foldFile = (
  cp: CreasePatternV1,
  title: string,
  transforms: readonly Isometry[],
): string => {
  const folded = cp.vertices.map((vertex, index) => {
    const face = cp.faces.findIndex((f) => f.includes(index));
    const p = face >= 0 ? applyIsometry(transforms[face]!, vertex) : vertex;
    return [Number(n(p.x)), Number(n(p.y))];
  });
  const angle = { M: -180, V: 180, B: 0, F: 0 } as const;
  return JSON.stringify(
    {
      file_spec: 1.1,
      file_creator: "FoldForge",
      file_title: title,
      file_classes: ["singleModel"],
      frame_classes: ["creasePattern"],
      frame_unit: "unit",
      vertices_coords: cp.vertices.map((v) => [Number(n(v.x)), Number(n(v.y))]),
      edges_vertices: cp.edges.map((e) => [e.a, e.b]),
      edges_assignment: cp.edges.map((e) => e.assignment),
      edges_foldAngle: cp.edges.map((e) => angle[e.assignment]),
      faces_vertices: cp.faces,
      file_frames: [
        {
          frame_classes: ["foldedForm"],
          frame_inherit: true,
          frame_parent: 0,
          vertices_coords: folded,
        },
      ],
    },
    null,
    1,
  );
};

export interface StepDiagram {
  /** Polygons back to front, as SVG point lists in a unit cell. */
  readonly polygons: readonly {
    readonly points: string;
    readonly front: boolean;
  }[];
  /** The fold line as an SVG point list, if the step has one. */
  readonly line: string | null;
}

/** The folded state before a step, fitted to a unit cell and turned upright. */
export const stepDiagram = (
  cp: CreasePatternV1,
  keyframe: FoldKeyframe,
  line: FoldLine | null,
  viewDeg: number,
): StepDiagram => {
  const r = (viewDeg * Math.PI) / 180;
  const turn = (p: Point2): Point2 => ({
    x: p.x * Math.cos(r) - p.y * Math.sin(r),
    y: p.x * Math.sin(r) + p.y * Math.cos(r),
  });
  const faces = cp.faces
    .map((face, index) => ({
      layer: keyframe.layers[index] ?? 0,
      points: face.map((v) =>
        turn(applyIsometry(keyframe.transforms[index]!, cp.vertices[v]!)),
      ),
      front: orientation(keyframe.transforms[index]!) > 0,
    }))
    .sort((a, b) => a.layer - b.layer);
  const all = faces.flatMap((face) => face.points);
  const [minX, maxX] = [
    Math.min(...all.map((p) => p.x)),
    Math.max(...all.map((p) => p.x)),
  ];
  const [minY, maxY] = [
    Math.min(...all.map((p) => p.y)),
    Math.max(...all.map((p) => p.y)),
  ];
  const scale = 0.84 / Math.max(maxX - minX, maxY - minY, 1e-6);
  const place = (q: Point2): string =>
    `${n(0.5 + (q.x - (minX + maxX) / 2) * scale)},${n(0.5 - (q.y - (minY + maxY) / 2) * scale)}`;
  return {
    polygons: faces.map((face) => ({
      points: face.points.map(place).join(" "),
      front: face.front,
    })),
    line: line ? `${place(turn(line.from))} ${place(turn(line.to))}` : null,
  };
};

/**
 * A 3D form (a box) seen from above and in front: its final face corners
 * (x, y, z per corner, faces in pattern order) projected at an angle and
 * painted back to front, fitted to a unit cell.
 */
export const formDiagram = (
  faces: readonly (readonly number[])[],
  positions: readonly number[],
): StepDiagram => {
  let k = 0;
  const projected = faces
    .map((face) => {
      const corners = face.map(() => {
        const [x, y, z] = [positions[k]!, positions[k + 1]!, positions[k + 2]!];
        k += 3;
        // Looking down at 35 degrees from the front (from -y).
        return { x, y: z * 0.82 + y * 0.57, depth: y * 0.82 - z * 0.57 };
      });
      return {
        points: corners,
        depth: corners.reduce((sum, c) => sum + c.depth, 0) / corners.length,
      };
    })
    .sort((a, b) => b.depth - a.depth);
  const all = projected.flatMap((face) => face.points);
  const [minX, maxX] = [
    Math.min(...all.map((p) => p.x)),
    Math.max(...all.map((p) => p.x)),
  ];
  const [minY, maxY] = [
    Math.min(...all.map((p) => p.y)),
    Math.max(...all.map((p) => p.y)),
  ];
  const scale = 0.84 / Math.max(maxX - minX, maxY - minY, 1e-6);
  return {
    polygons: projected.map((face) => ({
      points: face.points
        .map(
          (q) =>
            `${n(0.5 + (q.x - (minX + maxX) / 2) * scale)},${n(0.5 - (q.y - (minY + maxY) / 2) * scale)}`,
        )
        .join(" "),
      front: true,
    })),
    line: null,
  };
};

const stepDiagramSvg = (diagram: StepDiagram): string =>
  diagram.polygons
    .map(
      (polygon) =>
        `<polygon points="${polygon.points}" fill="${polygon.front ? "#f3e6cf" : "#d9b77a"}" stroke="#5b4a33" stroke-width="0.004"/>`,
    )
    .join("") +
  (diagram.line
    ? `<polyline points="${diagram.line}" fill="none" stroke="#2463b5" stroke-width="0.008" stroke-dasharray="0.03 0.015"/>`
    : "");

export interface InstructionStep {
  readonly instruction: string;
  /** The state the step starts from, or null for the first step from a flat sheet. */
  readonly before: FoldKeyframe | null;
  readonly line: FoldLine | null;
}

/** A printable sheet: the crease pattern, then one diagram per step, three to a row. */
export const instructionsSvg = (
  cp: CreasePatternV1,
  title: string,
  steps: readonly InstructionStep[],
  /** The finished model, drawn by `stepDiagram` or, for a 3D form, `formDiagram`. */
  finished: StepDiagram,
  viewDeg: number,
  paperMm: number,
  /** How to fold the base by hand, printed in full below the diagrams. */
  howTo: readonly string[] = [],
): string => {
  const cell = 60;
  const columns = 3;
  const flatSheet: FoldKeyframe = {
    transforms: cp.faces.map(() => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 })),
    layers: cp.faces.map(() => 0),
  };
  const cells = [
    ...steps.map((step, i) => ({
      caption: `${i + 1}. ${step.instruction}`,
      body: stepDiagramSvg(
        stepDiagram(
          cp,
          step.before ?? flatSheet,
          step.line,
          step.before ? viewDeg : 0,
        ),
      ),
    })),
    {
      caption: `${steps.length + 1}. Done: ${title}.`,
      body: stepDiagramSvg(finished),
    },
  ];
  const rows = Math.ceil(cells.length / columns);
  const wrap = (text: string, width = 42): string[] => {
    const words = text.split(" ");
    const lines: string[] = [""];
    for (const word of words) {
      if (`${lines.at(-1)} ${word}`.length > width) lines.push(word);
      else lines[lines.length - 1] = `${lines.at(-1)} ${word}`.trim();
    }
    return lines;
  };
  const body = cells
    .map(({ caption, body: diagram }, i) => {
      const x = (i % columns) * cell;
      const y = 14 + Math.floor(i / columns) * (cell + 16);
      const text = wrap(caption)
        .map(
          (line, j) =>
            `<text x="${x + 2}" y="${y + cell + 4 + j * 3.6}" font-family="sans-serif" font-size="3">${xml(line)}</text>`,
        )
        .join("");
      return `<g transform="translate(${x} ${y}) scale(${cell})">${diagram}</g>${text}`;
    })
    .join("\n");
  const width = columns * cell;
  const diagramsEnd = 14 + rows * (cell + 16);
  // The base by hand: a numbered list across the sheet's full width.
  const handLines = howTo.length
    ? [
        "Folding the base by hand:",
        ...howTo.flatMap((text, i) =>
          wrap(`${String.fromCharCode(97 + i)}. ${text}`, 120),
        ),
      ]
    : [];
  const hand = handLines
    .map(
      (line, j) =>
        `<text x="2" y="${diagramsEnd + 4 + j * 4.2}" font-family="sans-serif" font-size="3.2"${j === 0 ? ' font-weight="bold"' : ""}>${xml(line)}</text>`,
    )
    .join("");
  const height =
    diagramsEnd + (handLines.length ? 6 + handLines.length * 4.2 : 0);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#fff"/>`,
    `<text x="2" y="9" font-family="sans-serif" font-size="6" font-weight="bold">${xml(title)}: folding instructions (${paperMm} mm square)</text>`,
    body,
    hand,
    "</svg>",
  ].join("\n");
};
