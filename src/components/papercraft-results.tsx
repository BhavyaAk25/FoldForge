"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import earcut from "earcut";
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  Vector3,
  type Group,
} from "three";

import type { PapercraftPayload } from "@/lib/papercraft-contract";

import styles from "./model-results.module.css";

/** Model space is mm with z up; the scene is y up. */
const toScene = (x: number, y: number, z: number): [number, number, number] => [
  x,
  z,
  -y,
];

const partGeometry = (
  part: PapercraftPayload["parts"][number],
): BufferGeometry => {
  const v = part.vertices;
  const positions: number[] = [];
  for (const face of part.faces) {
    for (let i = 1; i + 1 < face.length; i += 1) {
      for (const k of [face[0]!, face[i]!, face[i + 1]!])
        positions.push(...toScene(v[3 * k]!, v[3 * k + 1]!, v[3 * k + 2]!));
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
};

/**
 * A decal outline as a flat mesh lifted just off its face; each decal sits
 * a little above the ones printed before it on the same face.
 */
const decalGeometry = (
  decal: PapercraftPayload["decals"][number],
  index: number,
  all: PapercraftPayload["decals"],
): BufferGeometry => {
  const [nx, ny, nz] = decal.normal;
  const below = all
    .slice(0, index)
    .filter(
      (d) =>
        d.part === decal.part &&
        d.normal.every((v, i) => Math.abs(v - decal.normal[i]!) < 1e-6),
    ).length;
  const h = 0.3 + 0.2 * below;
  const lift = (p: readonly number[]) =>
    toScene(p[0]! + nx * h, p[1]! + ny * h, p[2]! + nz * h);
  // Triangulate in the face's own plane.
  const o = decal.points[0]!;
  const u = new Vector3(...decal.points[1]!).sub(new Vector3(...o)).normalize();
  const w = new Vector3(nx, ny, nz).cross(u);
  const flat = decal.points.flatMap((p) => {
    const d = new Vector3(...p).sub(new Vector3(...o));
    return [d.dot(u), d.dot(w)];
  });
  const positions = [...earcut(flat)].flatMap((i) => lift(decal.points[i]!));
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
};

function Model({
  payload,
  turn,
  slide,
}: {
  readonly payload: PapercraftPayload;
  readonly turn: { yaw: number; pitch: number };
  /** 0 to 1 along each moving part's travel. */
  readonly slide: number;
}) {
  const group = useRef<Group>(null);
  const spin = useRef(0);
  const geometries = useMemo(() => payload.parts.map(partGeometry), [payload]);
  const decals = useMemo(
    () => payload.decals.map((d, k, all) => decalGeometry(d, k, all)),
    [payload],
  );
  useEffect(
    () => () => [...geometries, ...decals].forEach((g) => g.dispose()),
    [geometries, decals],
  );
  // Centre on the model and fill the wide view: the footprint's diagonal
  // (what it sweeps as it turns) across, the height (z) up, whichever is
  // tighter.
  const { centre, scale } = useMemo(() => {
    // Sliding parts count at both ends of their travel.
    const all = payload.parts.flatMap((p) => [
      ...p.vertices,
      ...(p.slide ? p.vertices.map((v, k) => v + p.slide![k % 3]!) : []),
    ]);
    const axis = (i: number) => all.filter((_, k) => k % 3 === i);
    const mid = [0, 1, 2].map(
      (i) => (Math.min(...axis(i)) + Math.max(...axis(i))) / 2,
    ) as [number, number, number];
    const [x, y, z] = [0, 1, 2].map(
      (i) => Math.max(...axis(i)) - Math.min(...axis(i)),
    ) as [number, number, number];
    return {
      centre: toScene(...mid),
      scale: Math.min(1.9 / Math.hypot(x, y), 1.45 / z),
    };
  }, [payload]);
  useFrame((_, delta) => {
    // A slow swing about the three-quarter view keeps the face in sight;
    // dragging turns the model any way round.
    spin.current += delta * 0.6;
    if (group.current)
      group.current.rotation.set(
        turn.pitch,
        turn.yaw + 0.7 * Math.sin(spin.current),
        0,
      );
  });
  return (
    <group ref={group}>
      <group
        scale={scale}
        position={[-centre[0] * scale, -centre[1] * scale, -centre[2] * scale]}
      >
        {payload.parts.map((part, i) => {
          const offset = part.slide
            ? toScene(
                ...(part.slide.map((v) => v * slide) as [
                  number,
                  number,
                  number,
                ]),
              )
            : [0, 0, 0];
          return (
            <group key={part.id} position={offset as [number, number, number]}>
              <mesh geometry={geometries[i]!} castShadow>
                <meshStandardMaterial
                  color={part.color}
                  roughness={0.85}
                  flatShading
                  side={part.open ? DoubleSide : FrontSide}
                />
              </mesh>
              {payload.decals.map((decal, k) =>
                decal.part === part.id ? (
                  <mesh key={k} geometry={decals[k]!}>
                    <meshStandardMaterial color={decal.color} roughness={0.6} />
                  </mesh>
                ) : null,
              )}
            </group>
          );
        })}
      </group>
    </group>
  );
}

const svgUrl = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const download = (svg: string, filename: string) => {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

/** Opens every page in one print dialog, one A4 sheet each, at true scale. */
const printAll = (payload: PapercraftPayload) => {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(
    `<!doctype html><title>${payload.title}</title><style>@page{size:A4;margin:0}body{margin:0}svg{display:block;width:210mm;height:297mm;page-break-after:always}</style>${payload.pages.join("")}`,
  );
  win.document.close();
  win.focus();
  win.print();
};

export function PapercraftResults({
  payload,
  aiReason,
}: {
  readonly payload: PapercraftPayload;
  readonly aiReason: string | null;
}) {
  const [turn, setTurn] = useState({ yaw: -0.6, pitch: 0.25 });
  const [slide, setSlide] = useState(0.45);
  const moving = payload.parts.find((p) => p.slide);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const section = useRef<HTMLElement>(null);
  const slug = payload.title.toLowerCase().replace(/[^a-z0-9]+/gu, "-");

  useEffect(() => {
    section.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [payload.title]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
  };
  const continueDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const [dx, dy] = [
      event.clientX - drag.current.x,
      event.clientY - drag.current.y,
    ];
    drag.current = { x: event.clientX, y: event.clientY };
    setTurn((t) => ({
      yaw: t.yaw + dx * 0.01,
      pitch: Math.max(-0.6, Math.min(1.2, t.pitch + dy * 0.01)),
    }));
  };

  return (
    <section
      ref={section}
      className={styles.results}
      aria-labelledby="papercraft-title"
    >
      <header className={styles.heading}>
        <p className={styles.kicker}>3D papercraft · print, cut, fold, glue</p>
        <h2 id="papercraft-title">{payload.title}</h2>
        <p>
          About {Math.round(payload.sizeMm / 10)} cm long, from{" "}
          {payload.pages.length} A4 sheets of card in {payload.checks.pieces}{" "}
          pieces.
        </p>
        {aiReason ? (
          <p className={styles.aiChoice}>
            <strong>AI choice:</strong> {aiReason} The model, its pieces, and
            the checks are computed, not generated.
          </p>
        ) : null}
        <p className={styles.checks}>
          Checked: every printed piece refolds into the 3D model within 0.1 mm,
          all {payload.checks.seams} seams pair a numbered edge with a glue tab,
          and nothing overlaps or runs off a page.
        </p>
      </header>

      <div className={styles.stage}>
        <div
          className={styles.canvas}
          onPointerDown={startDrag}
          onPointerMove={continueDrag}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          role="img"
          aria-label={`3D view of the papercraft ${payload.title.toLowerCase()}. Drag to turn it.`}
        >
          <Canvas
            camera={{ position: [0, 0.35, 2.6], fov: 38 }}
            dpr={[1, 2]}
            flat
          >
            {/* No tone mapping: card shows its printed colour, facets shade. */}
            <hemisphereLight args={["#fffaf0", "#e6dccb", 1.6]} />
            <directionalLight position={[2, 3, 2]} intensity={1.4} />
            <directionalLight position={[-2, 1, -2]} intensity={0.6} />
            <Model payload={payload} turn={turn} slide={slide} />
          </Canvas>
        </div>
        {moving ? (
          <div className={styles.timeline}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={slide}
              aria-label={`Slide the ${moving.name.toLowerCase()} out`}
              onChange={(event) => setSlide(Number(event.target.value))}
            />
            <span>Slide the {moving.name.toLowerCase()}</span>
          </div>
        ) : null}
      </div>

      <div className={styles.columns}>
        <section className={styles.panel}>
          <h3>Pages to print</h3>
          <button
            type="button"
            className={styles.primaryAction}
            onClick={() => printAll(payload)}
          >
            Print all {payload.pages.length} pages
          </button>
          <ol className={styles.pages}>
            {payload.pages.map((page, i) => (
              <li key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG, not an optimisable asset */}
                <img
                  src={svgUrl(page)}
                  alt={`Page ${i + 1} of the ${payload.title.toLowerCase()} pattern`}
                />
                <button
                  type="button"
                  onClick={() => download(page, `${slug}-page-${i + 1}.svg`)}
                >
                  Download page {i + 1}
                </button>
              </li>
            ))}
          </ol>
        </section>
        <section className={styles.panel}>
          <h3>How to build it</h3>
          <ol className={styles.instructions}>
            {payload.instructions.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      </div>
    </section>
  );
}
