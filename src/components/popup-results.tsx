"use client";

import { Canvas } from "@react-three/fiber";
import earcut from "earcut";
import { useEffect, useMemo, useRef, useState } from "react";
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from "three";

import {
  pagePoint,
  piecePoint,
  type Vec2,
  type VFold,
} from "@/core/popup/popup";
import type { PopupPayload } from "@/lib/papercraft-contract";

import styles from "./model-results.module.css";

/** Triangles of a flat polygon, mapped into 3D by `place`. */
const surface = (
  outline: readonly Vec2[],
  place: (p: Vec2) => readonly number[],
): BufferGeometry => {
  const index = earcut(outline.flatMap((p) => [p[0], p[1]]));
  const positions = [...index].flatMap((i) => [...place(outline[i]!)]);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
};

/** The card at opening angle theta; spine vertical (y), opening toward the viewer (+z). */
function Card({
  payload,
  theta,
}: {
  readonly payload: PopupPayload;
  readonly theta: number;
}) {
  const { card } = payload;
  const geometries = useMemo(() => {
    const [W, H] = [card.pageWidthMm, card.pageHeightMm];
    const pages = ([1, -1] as const).map((side) =>
      surface(
        [
          [0, 0],
          [W, 0],
          [W, H],
          [0, H],
        ],
        ([r, y]) => pagePoint(theta, side, r, y),
      ),
    );
    const pieces = card.pieces.flatMap((piece) =>
      ([1, -1] as const).flatMap((side) => [
        {
          color: piece.color,
          geometry: surface(piece.half, (p) =>
            piecePoint(piece as VFold, theta, side, p),
          ),
          lift: 0,
        },
        // Printed regions sit a hair in front of the piece so they never flicker.
        ...piece.prints.map((print, k) => ({
          color: print.color,
          geometry: surface(print.points, (p) =>
            piecePoint(piece as VFold, theta, side, p),
          ),
          lift: k + 1,
        })),
      ]),
    );
    return { pages, pieces };
  }, [card, theta]);
  useEffect(
    () => () =>
      [
        ...geometries.pages,
        ...geometries.pieces.map((p) => p.geometry),
      ].forEach((g) => g.dispose()),
    [geometries],
  );
  const s = 1.4 / card.pageHeightMm;
  return (
    <group scale={s} position={[0, -card.pageHeightMm * s * 0.5, 0]}>
      {geometries.pages.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial
            color={card.cardColor}
            roughness={0.9}
            side={DoubleSide}
          />
        </mesh>
      ))}
      {geometries.pieces.map((p, i) => (
        <mesh key={`p${i}`} geometry={p.geometry} renderOrder={p.lift}>
          <meshStandardMaterial
            color={p.color}
            roughness={0.8}
            side={DoubleSide}
            polygonOffset
            polygonOffsetFactor={-p.lift}
            polygonOffsetUnits={-p.lift}
          />
        </mesh>
      ))}
    </group>
  );
}

const download = (svg: string, filename: string) => {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const print = (payload: PopupPayload) => {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(
    `<!doctype html><title>${payload.card.title}</title><style>@page{size:A4;margin:0}body{margin:0}svg{display:block;width:210mm;height:297mm}</style>${payload.page}`,
  );
  win.document.close();
  win.focus();
  win.print();
};

export function PopupResults({
  payload,
  aiReason,
}: {
  readonly payload: PopupPayload;
  readonly aiReason: string | null;
}) {
  const [theta, setTheta] = useState(110);
  const [playing, setPlaying] = useState(true);
  const section = useRef<HTMLElement>(null);
  const slug = payload.card.title.toLowerCase().replace(/[^a-z0-9]+/gu, "-");

  useEffect(() => {
    section.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [payload.card.title]);

  // Opens and closes the card on a loop until the reader takes the slider.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const phase = ((now - start) / 4000) % 1;
      setTheta(5 + 165 * (0.5 - 0.5 * Math.cos(phase * 2 * Math.PI)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  return (
    <section
      ref={section}
      className={styles.results}
      aria-labelledby="popup-title"
    >
      <header className={styles.heading}>
        <p className={styles.kicker}>Pop-up card · print, cut, fold, glue</p>
        <h2 id="popup-title">{payload.card.title}</h2>
        <p>
          A {payload.card.pageWidthMm} × {payload.card.pageHeightMm} mm card
          from one A4 sheet of card.
        </p>
        {aiReason ? (
          <p className={styles.aiChoice}>
            <strong>AI choice:</strong> {aiReason} The card and its checks are
            computed, not generated.
          </p>
        ) : null}
        <p className={styles.checks}>
          Checked through the whole swing: the pop-up lies flat inside the
          closed card, rises as it opens, and never passes through a page or
          another piece.
        </p>
      </header>

      <div className={styles.stage}>
        <div
          className={styles.canvas}
          role="img"
          aria-label={`3D view of the ${payload.card.title.toLowerCase()} opening and closing.`}
        >
          <Canvas
            camera={{ position: [0, 0.45, 2.7], fov: 38 }}
            dpr={[1, 2]}
            flat
          >
            {/* Viewed face-on at the spine, like the card on a table. */}
            <hemisphereLight args={["#fffaf0", "#e6dccb", 2.4]} />
            <directionalLight position={[1.5, 2.5, 3]} intensity={1.2} />
            <Card payload={payload} theta={theta} />
          </Canvas>
        </div>
        <div className={styles.timeline}>
          <button type="button" onClick={() => setPlaying(!playing)}>
            {playing ? "Pause" : "Play"}
          </button>
          <input
            type="range"
            min={0}
            max={180}
            step={1}
            value={Math.round(theta)}
            aria-label="Open the card"
            onChange={(event) => {
              setPlaying(false);
              setTheta(Number(event.target.value));
            }}
          />
          <span>{Math.round(theta)}° open</span>
        </div>
      </div>

      <div className={styles.columns}>
        <section className={styles.panel}>
          <h3>Page to print</h3>
          <button
            type="button"
            className={styles.primaryAction}
            onClick={() => print(payload)}
          >
            Print the page
          </button>
          <ol className={styles.pages}>
            <li>
              {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG, not an optimisable asset */}
              <img
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(payload.page)}`}
                alt={`Printable page for the ${payload.card.title.toLowerCase()}`}
              />
              <button
                type="button"
                onClick={() => download(payload.page, `${slug}.svg`)}
              >
                Download page
              </button>
            </li>
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
