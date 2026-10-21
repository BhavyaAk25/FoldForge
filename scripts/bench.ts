import { mkdirSync, writeFileSync } from "node:fs";

import sharp from "sharp";

import { compileFabricationProgram } from "../src/core/fabrication/compiler";
import { homeMotionState } from "../src/core/fabrication/kinematics";
import { intentFromPromptKeywords } from "../src/core/fabrication/prompt-intent";
import { buildPapercraft } from "../src/core/mesh/model";
import { rigSpec } from "../src/core/mesh/rigs";
import { popupCard } from "../src/core/popup/cards";
import { halfTriangles, pagePoint, piecePoint } from "../src/core/popup/popup";
import { poseAt, stepCount } from "../src/core/origami/pose";
import { templateFallback } from "../src/server/fabrication-ai/plan-response";
import { routePrompt } from "../src/server/fabrication-ai/router";
import { origamiPayload } from "../src/server/origami";
import { BENCH_PROMPTS, type BenchPrompt } from "./bench-prompts";

/**
 * Visual bench: runs the fixed prompt set through the same server code the
 * site uses with no AI, renders each result, and writes a contact sheet with
 * the example photos beside their prompts.
 *
 *   tsx scripts/bench.ts          writes artifacts/bench/contact-sheet.png
 *   tsx scripts/bench.ts --check  also fails if a prompt misses its engine
 */

type Engine = "origami" | "figure" | "popup" | "papercraft" | "none";

interface Face {
  readonly points: readonly (readonly [number, number, number])[];
  readonly color: string;
}

interface BenchResult {
  readonly prompt: BenchPrompt;
  readonly engine: Engine;
  readonly detail: string;
  readonly ms: number;
  readonly faces: readonly Face[];
  /** Bench view turn about the vertical, in degrees. */
  readonly yawDeg: number;
}

const PAPER = "#e8d6b4";
const CELL = 300;

const run = async (prompt: BenchPrompt): Promise<BenchResult> => {
  const start = performance.now();
  const done = (
    engine: Engine,
    detail: string,
    faces: Face[],
    yawDeg = -35,
  ): BenchResult => ({
    prompt,
    engine,
    detail,
    ms: Math.round(performance.now() - start),
    faces,
    yawDeg,
  });
  const route = await routePrompt(prompt.text);
  if (route.engine === "figure") {
    const built = buildPapercraft(rigSpec(route.figure));
    if (!built.ok)
      return done("none", `figure failed: ${built.error.kind}`, []);
    const faces: Face[] = built.value.parts.flatMap((part) =>
      part.mesh.faces.map((face) => ({
        color: part.color,
        points: face.map((v) => part.mesh.vertices[v]!),
      })),
    );
    // Printed decals, lifted off their face so they sort in front of it.
    for (const decal of built.value.decals)
      faces.push({
        color: decal.color,
        points: decal.points.map(
          (p) =>
            [
              p[0] + decal.normal[0] * 0.5,
              p[1] + decal.normal[1] * 0.5,
              p[2] + decal.normal[2] * 0.5,
            ] as const,
        ),
      });
    return done(
      "figure",
      `${route.figure.title}, ${built.value.pages.length} pages`,
      faces,
    );
  }
  if (route.engine === "popup") {
    // The card standing open at 110 degrees, spine up.
    const card = popupCard(
      route.card.design,
      route.card.colors,
      route.card.title,
    );
    const theta = 110;
    // Turned half round about the spine so the opening faces the bench view.
    const toBench = ([x, y, z]: readonly [number, number, number]) =>
      [-x, z, y] as const;
    const faces: Face[] = ([1, -1] as const).map((side) => ({
      color: card.cardColor,
      points: [
        [0, 0],
        [card.pageWidthMm, 0],
        [card.pageWidthMm, card.pageHeightMm],
        [0, card.pageHeightMm],
      ].map(([r, y]) => toBench(pagePoint(theta, side, r!, y!))),
    }));
    for (const piece of card.pieces) {
      for (const side of [1, -1] as const) {
        for (const tri of halfTriangles(piece))
          faces.push({
            color: piece.color,
            points: tri.map((p) => toBench(piecePoint(piece, theta, side, p))),
          });
        for (const print of piece.prints)
          faces.push({
            color: print.color,
            points: print.points.map((p) =>
              toBench(piecePoint(piece, theta, side, p)),
            ),
          });
      }
    }
    // Face-on, as the page shows it.
    return done("popup", `${card.title}, 1 page`, faces, 0);
  }
  if (route.engine === "origami") {
    const payload = origamiPayload(route.modelId);
    if (!payload) return done("none", `no origami ${route.modelId}`, []);
    const input = {
      ...payload.animation,
      vertices: payload.pattern.vertices,
      faces: payload.pattern.faces,
    };
    const pose = poseAt(input, stepCount(input));
    const r = (payload.viewDeg * Math.PI) / 180;
    let k = 0;
    // Origami lies in x-y with z toward the viewer; stand it up (y up, z depth).
    const faces = payload.pattern.faces.map((face) => ({
      color: route.paperColor,
      points: face.map(() => {
        const [x, y, z] = [pose[k]!, pose[k + 1]!, pose[k + 2]!];
        k += 3;
        return [
          x * Math.cos(r) - y * Math.sin(r),
          z,
          x * Math.sin(r) + y * Math.cos(r),
        ] as const;
      }),
    }));
    return done(
      "origami",
      `${payload.name}, ${payload.steps.length} steps`,
      faces,
    );
  }
  const intent = intentFromPromptKeywords(prompt.text);
  if (!intent)
    return done("none", "no engine recognises this prompt without AI", []);
  const templated = templateFallback(intent, 1);
  if (!templated) return done("none", "no verified template", []);
  const compiled = compileFabricationProgram(
    templated.intent,
    templated.proposal.program,
  );
  if (!compiled.ok)
    return done("none", `compile failed: ${compiled.error.kind}`, []);
  const state = homeMotionState(compiled.value);
  if (!state.ok) return done("none", "no home pose", []);
  const faces = Object.values(state.value.panelVertices).map((points) => ({
    color: PAPER,
    points: points.map((p) => [p.xMm, p.yMm, p.zMm] as const),
  }));
  return done(
    "papercraft",
    `template ${templated.proposal.program.topologyId.slice(0, 40)}`,
    faces,
  );
};

/** A colour darkened toward black by 1 - k. */
const darken = (hex: string, k: number) =>
  `#${[1, 3, 5]
    .map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;

/** Shaded isometric view (z up), painter-sorted, fitted to one cell. */
const renderSvg = (faces: readonly Face[], yawDeg: number): string => {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (25 * Math.PI) / 180;
  const view = ([x, y, z]: readonly [number, number, number]) => {
    const [rx, ry] = [
      x * Math.cos(yaw) - y * Math.sin(yaw),
      x * Math.sin(yaw) + y * Math.cos(yaw),
    ];
    return {
      u: rx,
      v: z * Math.cos(pitch) - ry * Math.sin(pitch),
      depth: ry * Math.cos(pitch) + z * Math.sin(pitch),
    };
  };
  const projected = faces.map((face) => ({
    face,
    points: face.points.map(view),
  }));
  const all = projected.flatMap((f) => f.points);
  if (all.length === 0) return "";
  const [minU, maxU] = [
    Math.min(...all.map((p) => p.u)),
    Math.max(...all.map((p) => p.u)),
  ];
  const [minV, maxV] = [
    Math.min(...all.map((p) => p.v)),
    Math.max(...all.map((p) => p.v)),
  ];
  const scale = (CELL * 0.8) / Math.max(maxU - minU, maxV - minV, 1e-9);
  const light = { x: 0.4, y: -0.5, z: 0.75 };
  return projected
    .sort((a, b) => {
      const mean = (f: typeof a) =>
        f.points.reduce((sum, p) => sum + p.depth, 0) / f.points.length;
      return mean(a) - mean(b);
    })
    .map(({ face, points }) => {
      const [a, b, c] = face.points;
      let shade = 0.75;
      if (a && b && c) {
        const n = [
          (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
          (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
          (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
        ];
        const length = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
        shade =
          0.55 +
          0.45 *
            Math.abs(
              (n[0]! * light.x + n[1]! * light.y + n[2]! * light.z) / length,
            );
      }
      const d = points
        .map(
          (p) =>
            `${(CELL / 2 + (p.u - (minU + maxU) / 2) * scale).toFixed(1)},${(CELL / 2 - (p.v - (minV + maxV) / 2) * scale).toFixed(1)}`,
        )
        .join(" ");
      const fill = darken(face.color, shade);
      return `<polygon points="${d}" fill="${fill}" stroke="${darken(face.color, shade * 0.7)}" stroke-width="0.5" stroke-linejoin="round"/>`;
    })
    .join("");
};

const escape = (text: string) =>
  text.replace(/[<>&"]/gu, (c) => `&#${c.charCodeAt(0)};`);

const main = async () => {
  const results: BenchResult[] = [];
  for (const prompt of BENCH_PROMPTS) results.push(await run(prompt));
  const outDir = "artifacts/bench";
  mkdirSync(outDir, { recursive: true });
  const columns = 4;
  const rowHeight = CELL + 70;
  const tiles = await Promise.all(
    results.map(async (result) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${rowHeight}"><rect width="100%" height="100%" fill="#fbf8f1"/>${renderSvg(result.faces, result.yawDeg)}<text x="8" y="${CELL + 18}" font-family="sans-serif" font-size="13" font-weight="bold">${escape(result.prompt.text.slice(0, 44))}</text><text x="8" y="${CELL + 38}" font-family="sans-serif" font-size="12" fill="${result.engine === result.prompt.expect ? "#247a4a" : "#b43a32"}">${result.engine} (want ${result.prompt.expect}) · ${result.ms} ms</text><text x="8" y="${CELL + 56}" font-family="sans-serif" font-size="11" fill="#6e6a62">${escape(result.detail.slice(0, 48))}</text></svg>`;
      let tile = sharp(Buffer.from(svg));
      if (result.prompt.photo) {
        const photo = await sharp(`public/examples/${result.prompt.photo}`)
          .resize(110, 110, { fit: "cover" })
          .toBuffer();
        tile = sharp(await tile.png().toBuffer()).composite([
          { input: photo, top: 8, left: CELL - 118 },
        ]);
      }
      return tile.png().toBuffer();
    }),
  );
  const rows = Math.ceil(tiles.length / columns);
  await sharp({
    create: {
      width: columns * CELL,
      height: rows * rowHeight,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite(
      tiles.map((input, i) => ({
        input,
        left: (i % columns) * CELL,
        top: Math.floor(i / columns) * rowHeight,
      })),
    )
    .png()
    .toFile(`${outDir}/contact-sheet.png`);
  writeFileSync(
    `${outDir}/results.json`,
    JSON.stringify(
      results.map(({ faces: _faces, yawDeg: _yaw, ...rest }) => rest),
      null,
      1,
    ),
  );

  const misses = results.filter((r) => r.engine !== r.prompt.expect);
  for (const r of results) {
    console.log(
      `${r.engine === r.prompt.expect ? "ok  " : "MISS"} ${r.prompt.text.padEnd(44)} ${r.engine.padEnd(10)} ${String(r.ms).padStart(6)} ms  ${r.detail}`,
    );
  }
  console.log(
    `\n${results.length - misses.length}/${results.length} on the expected engine; contact sheet: ${outDir}/contact-sheet.png`,
  );
  if (process.argv.includes("--check") && misses.length > 0)
    process.exitCode = 1;
};

void main();
