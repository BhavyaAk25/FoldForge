import { mkdirSync, writeFileSync } from "node:fs";

import sharp from "sharp";

import { compileFabricationProgram } from "../src/core/fabrication/compiler";
import { homeMotionState } from "../src/core/fabrication/kinematics";
import { intentFromPromptKeywords } from "../src/core/fabrication/prompt-intent";
import { matchOrigamiModel } from "../src/core/origami/catalog";
import { poseAt, stepCount } from "../src/core/origami/pose";
import { templateFallback } from "../src/server/fabrication-ai/plan-response";
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

type Engine = "origami" | "papercraft" | "none";

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
}

const PAPER = "#e8d6b4";
const CELL = 300;

const run = (prompt: BenchPrompt): BenchResult => {
  const start = performance.now();
  const done = (
    engine: Engine,
    detail: string,
    faces: Face[],
  ): BenchResult => ({
    prompt,
    engine,
    detail,
    ms: Math.round(performance.now() - start),
    faces,
  });
  const origamiId = matchOrigamiModel(prompt.text);
  if (origamiId) {
    const payload = origamiPayload(origamiId);
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
      color: PAPER,
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

/** Shaded isometric view (z up), painter-sorted, fitted to one cell. */
const renderSvg = (faces: readonly Face[]): string => {
  const yaw = (-35 * Math.PI) / 180;
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
    .sort(
      (a, b) =>
        Math.min(...a.points.map((p) => p.depth)) -
        Math.min(...b.points.map((p) => p.depth)),
    )
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
      return `<polygon points="${d}" fill="${face.color}" fill-opacity="${shade.toFixed(2)}" stroke="#4a3f30" stroke-width="0.6"/>`;
    })
    .join("");
};

const escape = (text: string) =>
  text.replace(/[<>&"]/gu, (c) => `&#${c.charCodeAt(0)};`);

const main = async () => {
  const results = BENCH_PROMPTS.map(run);
  const outDir = "artifacts/bench";
  mkdirSync(outDir, { recursive: true });
  const columns = 4;
  const rowHeight = CELL + 70;
  const tiles = await Promise.all(
    results.map(async (result) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${rowHeight}"><rect width="100%" height="100%" fill="#fbf8f1"/>${renderSvg(result.faces)}<text x="8" y="${CELL + 18}" font-family="sans-serif" font-size="13" font-weight="bold">${escape(result.prompt.text.slice(0, 44))}</text><text x="8" y="${CELL + 38}" font-family="sans-serif" font-size="12" fill="${result.engine === result.prompt.expect ? "#247a4a" : "#b43a32"}">${result.engine} (want ${result.prompt.expect}) · ${result.ms} ms</text><text x="8" y="${CELL + 56}" font-family="sans-serif" font-size="11" fill="#6e6a62">${escape(result.detail.slice(0, 48))}</text></svg>`;
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
      results.map(({ faces: _faces, ...rest }) => rest),
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
