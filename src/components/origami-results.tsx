"use client";

import { Canvas } from "@react-three/fiber";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  BackSide,
  BufferGeometry,
  Float32BufferAttribute,
  FrontSide,
} from "three";

import type { CreasePatternV1 } from "@/core/origami/crease-pattern";
import { stepDiagram } from "@/core/origami/export";
import { poseAt, stepCount, type PoseInput } from "@/core/origami/pose";
import type { OrigamiPayloadResponse } from "@/lib/origami-contract";

import styles from "./model-results.module.css";

const DOWNLOADS = [
  {
    format: "instructions",
    label: "Instructions",
    description: "Every step as a printable diagram sheet (SVG).",
  },
  {
    format: "svg",
    label: "Crease pattern",
    description: "Print at 100%: red dash-dot mountain, blue dashed valley.",
  },
  {
    format: "fold",
    label: "FOLD file",
    description:
      "The crease pattern and its folded form for Origami Simulator and other FOLD tools.",
  },
] as const;

/** Fan triangles per face, in face-corner indices. */
const triangleCorners = (faces: readonly (readonly number[])[]): number[] => {
  const indices: number[] = [];
  let start = 0;
  for (const face of faces) {
    for (let i = 1; i + 1 < face.length; i += 1)
      indices.push(start, start + i, start + i + 1);
    start += face.length;
  }
  return indices;
};

function FoldedPaper({
  input,
  at,
  viewDeg,
}: {
  readonly input: PoseInput;
  readonly at: number;
  readonly viewDeg: number;
}) {
  const indices = useMemo(() => triangleCorners(input.faces), [input.faces]);
  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    next.setIndex(indices);
    return next;
  }, [indices]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // Centre on the finished model so the view does not jump between steps.
  const centre = useMemo(() => {
    const finalPose = poseAt(input, stepCount(input));
    const xs = finalPose.filter((_, i) => i % 3 === 0);
    const ys = finalPose.filter((_, i) => i % 3 === 1);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  }, [input]);
  const positions = poseAt(input, at).map((value, i) =>
    i % 3 === 0 ? value - centre.x : i % 3 === 1 ? value - centre.y : value,
  );
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return (
    <group rotation={[0, 0, (viewDeg * Math.PI) / 180]}>
      {/* Paper faces are wound counter-clockwise from the front, so FrontSide is the coloured side. */}
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color="#e8d6b4"
          roughness={0.9}
          side={FrontSide}
        />
      </mesh>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#c0533f" roughness={0.9} side={BackSide} />
      </mesh>
    </group>
  );
}

function CreasePatternView({
  pattern,
  highlight,
  only,
}: {
  readonly pattern: CreasePatternV1;
  readonly highlight: ReadonlySet<number>;
  /** Draw only these creases (and the border). */
  readonly only?: ReadonlySet<number>;
}) {
  const color = {
    M: "#c0392b",
    V: "#2463b5",
    B: "#20201d",
    F: "#999",
  } as const;
  return (
    <svg
      className={styles.pattern}
      viewBox="-0.02 -0.02 1.04 1.04"
      role="img"
      aria-label="Crease pattern: red mountain folds, blue valley folds"
    >
      {pattern.edges.map((edge, i) => {
        if (only && edge.assignment !== "B" && !only.has(i)) return null;
        const a = pattern.vertices[edge.a]!;
        const b = pattern.vertices[edge.b]!;
        return (
          <line
            key={i}
            x1={a.x}
            y1={1 - a.y}
            x2={b.x}
            y2={1 - b.y}
            stroke={color[edge.assignment]}
            strokeWidth={highlight.has(i) ? 0.012 : 0.005}
            strokeDasharray={
              edge.assignment === "M"
                ? "0.03 0.012 0.006 0.012"
                : edge.assignment === "V"
                  ? "0.02 0.01"
                  : undefined
            }
          />
        );
      })}
    </svg>
  );
}

export function OrigamiResults({
  payload,
  paperMm,
  aiReason,
}: {
  readonly payload: OrigamiPayloadResponse;
  readonly paperMm: number;
  readonly aiReason: string | null;
}) {
  const input: PoseInput = useMemo(
    () => ({
      vertices: payload.pattern.vertices,
      faces: payload.pattern.faces,
      collapse: payload.animation.collapse,
      keyframes: payload.animation.keyframes,
      moves: payload.animation.moves,
    }),
    [payload],
  );
  const total = stepCount(input);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [turn, setTurn] = useState({ yaw: 0.55, pitch: -0.35 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [payload.id]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    let position = at >= total ? 0 : at;
    const tick = (now: number) => {
      position = Math.min(total, position + ((now - last) / 1000) * 0.6);
      last = now;
      setAt(position);
      if (position >= total) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Restart the loop only when play starts or stops; `at` advances inside it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, total]);

  const hasBase = payload.animation.collapse !== null;
  const current = Math.min(payload.steps.length - 1, Math.floor(at));
  const diagrams = useMemo(
    () =>
      payload.steps.map((_, index) => {
        const move = hasBase ? index - 1 : index;
        const keyframe = move < 0 ? null : payload.animation.keyframes[move];
        return keyframe
          ? stepDiagram(
              payload.pattern,
              keyframe,
              payload.animation.moves[move]?.line ?? null,
              payload.viewDeg,
            )
          : null;
      }),
    [hasBase, payload],
  );
  const highlight = useMemo(
    () => new Set(payload.steps[current]?.added ?? []),
    [current, payload.steps],
  );

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
  };
  const continueDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current = { x: event.clientX, y: event.clientY };
    setTurn((t) => ({
      yaw: t.yaw + dx * 0.01,
      pitch: Math.max(-1.5, Math.min(1.5, t.pitch + dy * 0.01)),
    }));
  };

  return (
    <section
      ref={sectionRef}
      className={styles.results}
      aria-labelledby="origami-title"
    >
      <header className={styles.heading}>
        <p className={styles.kicker}>Origami from one square</p>
        <h2 id="origami-title">{payload.name}</h2>
        <p>{payload.summary}</p>
        {aiReason ? (
          <p className={styles.aiChoice}>
            <strong>AI choice:</strong> {aiReason} The folds and checks below
            are computed, not generated.
          </p>
        ) : null}
        <p>Fold it from a {paperMm} mm square of paper.</p>
        <p className={styles.checks}>
          Checked at every one of {payload.verification.stepsChecked} steps:
          Maekawa and Kawasaki at all {payload.verification.interiorVertices}{" "}
          inner vertices, every face lands in one consistent flat-folded place,
          and the layers stack with no paper passing through paper.{" "}
          {payload.verification.mountains} mountain and{" "}
          {payload.verification.valleys} valley creases.
          {payload.animation.collapseStrain !== null
            ? ` The base was collapsed in a bar-and-hinge simulation and lands within ${(payload.animation.collapseStrain * 100).toFixed(2)}% stretch of flat paper.`
            : payload.animation.collapse
              ? " The base collapse animation turns faces about their creases to show the order; only its end state is checked."
              : ""}
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
          aria-label={`3D folding animation of the ${payload.name.toLowerCase()}. Drag to turn it.`}
        >
          <Canvas
            camera={{ position: [0, 0, 1.45], fov: 40, near: 0.05, far: 20 }}
            dpr={[1, 2]}
          >
            <ambientLight intensity={0.7} />
            <directionalLight position={[1.5, 2, 3]} intensity={1.2} />
            <directionalLight position={[-2, -1, -3]} intensity={0.5} />
            <group rotation={[turn.pitch, turn.yaw, 0]}>
              <FoldedPaper input={input} at={at} viewDeg={payload.viewDeg} />
            </group>
          </Canvas>
        </div>
        <div className={styles.timeline}>
          <button type="button" onClick={() => setPlaying(!playing)}>
            {playing ? "Pause" : at >= total ? "Replay" : "Play"}
          </button>
          <input
            type="range"
            min={0}
            max={total}
            step={0.01}
            value={at}
            aria-label="Folding progress"
            onChange={(event) => {
              setPlaying(false);
              setAt(Number(event.target.value));
            }}
          />
          <span>
            Step {Math.min(payload.steps.length, current + 1)} of{" "}
            {payload.steps.length}
          </span>
        </div>
        <p className={styles.nowFolding}>
          {payload.steps[current]?.instruction}
        </p>
      </div>

      <div className={styles.columns}>
        <section className={styles.panel}>
          <h3>Step by step</h3>
          <ol className={styles.steps}>
            {payload.steps.map((step, index) => (
              <li
                key={index}
                className={index === current ? styles.activeStep : undefined}
              >
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setAt(index);
                  }}
                >
                  {diagrams[index] ? (
                    <svg viewBox="0 0 1 1" aria-hidden="true">
                      {diagrams[index].polygons.map((polygon, i) => (
                        <polygon
                          key={i}
                          points={polygon.points}
                          fill={polygon.front ? "#f3e6cf" : "#d9b77a"}
                          stroke="#5b4a33"
                          strokeOpacity={0.35}
                          strokeWidth={0.003}
                        />
                      ))}
                      {diagrams[index].line ? (
                        <polyline
                          points={diagrams[index].line}
                          fill="none"
                          stroke="#2463b5"
                          strokeWidth={0.012}
                          strokeDasharray="0.03 0.015"
                        />
                      ) : null}
                    </svg>
                  ) : (
                    <CreasePatternView
                      pattern={payload.pattern}
                      highlight={new Set()}
                      only={new Set(step.added)}
                    />
                  )}
                  <span>
                    <strong>{index + 1}.</strong> {step.instruction}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
        <section className={styles.panel}>
          <h3>Crease pattern</h3>
          <CreasePatternView pattern={payload.pattern} highlight={highlight} />
          <p className={styles.note}>
            Creases made in the current step are drawn thicker.
          </p>
          <h3>Downloads</h3>
          <ul className={styles.downloads}>
            {DOWNLOADS.map((download) => (
              <li key={download.format}>
                <a
                  href={`/api/origami/${payload.id}/${download.format}?paper=${paperMm}`}
                  download
                >
                  {download.label}
                </a>
                <span>{download.description}</span>
              </li>
            ))}
          </ul>
          <p className={styles.note}>
            FoldForge checks the fold rules and shows each fold turning rigidly.
            It does not check that layers never pass through each other, which
            no fast method can decide in general.
          </p>
        </section>
      </div>
    </section>
  );
}
