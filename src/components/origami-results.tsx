"use client";

import { Canvas, useThree } from "@react-three/fiber";
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

const PAPER_BACK = "#f6f1e7";

/** Colours of the paper's starting face up (front) and face down (back). */
interface Sides {
  readonly front: string;
  readonly back: string;
}

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

/** Centre and scale that fit a pose's outline into the view. */
const frame = (pose: readonly number[]) => {
  const xs = pose.filter((_, i) => i % 3 === 0);
  const ys = pose.filter((_, i) => i % 3 === 1);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  const y = (Math.min(...ys) + Math.max(...ys)) / 2;
  const radius = Math.max(...xs.map((px, i) => Math.hypot(px - x, ys[i]! - y)));
  return { x, y, scale: Math.min(1.4, 0.45 / radius) };
};

/** Each face's outline as line-segment pairs, in face-corner indices. */
const outlineCorners = (faces: readonly (readonly number[])[]): number[] => {
  const indices: number[] = [];
  let start = 0;
  for (const face of faces) {
    face.forEach((_, i) =>
      indices.push(start + i, start + ((i + 1) % face.length)),
    );
    start += face.length;
  }
  return indices;
};

function FoldedPaper({
  input,
  at,
  viewDeg,
  colors,
}: {
  readonly input: PoseInput;
  readonly at: number;
  readonly viewDeg: number;
  readonly colors: Sides;
}) {
  const [geometry, outline] = useMemo(() => {
    const surface = new BufferGeometry();
    surface.setIndex(triangleCorners(input.faces));
    const edges = new BufferGeometry();
    edges.setIndex(outlineCorners(input.faces));
    return [surface, edges] as const;
  }, [input.faces]);
  useEffect(
    () => () => {
      geometry.dispose();
      outline.dispose();
    },
    [geometry, outline],
  );
  // Frame each step's flat state, and blend between the two around the
  // current moment, so every intermediate shape fits (a bird base is longer
  // than the crane it becomes).
  const frames = useMemo(() => {
    const flat = Array.from({ length: stepCount(input) + 1 }, (_, i) =>
      frame(poseAt(input, i)),
    );
    // A step's scale also fits its neighbours, so a flap swinging between
    // two states always fits and the zoom never jumps at a step boundary.
    return flat.map((f, i) => ({
      ...f,
      scale: Math.min(
        f.scale,
        flat[i - 1]?.scale ?? f.scale,
        flat[i + 1]?.scale ?? f.scale,
      ),
    }));
  }, [input]);
  const step = Math.max(0, Math.min(frames.length - 1, at));
  const [a, b] = [
    frames[Math.floor(step)]!,
    frames[Math.min(frames.length - 1, Math.floor(step) + 1)]!,
  ];
  const t = step - Math.floor(step);
  // A tall, narrow canvas (a phone) fits the model by its width instead.
  const narrow = useThree((state) =>
    Math.min(1, state.size.width / state.size.height),
  );
  const view = {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    scale: (a.scale + (b.scale - a.scale) * t) * narrow,
  };
  const positions = poseAt(input, at).map((value, i) =>
    i % 3 === 0 ? value - view.x : i % 3 === 1 ? value - view.y : value,
  );
  const position = new Float32BufferAttribute(positions, 3);
  geometry.setAttribute("position", position);
  geometry.computeVertexNormals();
  outline.setAttribute("position", position);
  return (
    <group
      // A 3D form (a box) is laid back so its walls stand up toward the
      // top of the view, seen from the front and above like on a table.
      rotation={[input.formed ? 1.05 : 0, 0, (viewDeg * Math.PI) / 180]}
      scale={view.scale}
    >
      {/* Paper faces are wound counter-clockwise from the front, so FrontSide is the paper's starting face up. */}
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={colors.front}
          roughness={0.9}
          side={FrontSide}
        />
      </mesh>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={colors.back}
          roughness={0.9}
          side={BackSide}
        />
      </mesh>
      {/* Face edges, faint, so folds and layers read like a paper model. */}
      <lineSegments geometry={outline}>
        <lineBasicMaterial color="#3d3226" transparent opacity={0.28} />
      </lineSegments>
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

/** Drag-to-turn for a model view. */
const useTurn = () => {
  const [turn, setTurn] = useState({ yaw: 0.55, pitch: -0.35 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const handlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, y: event.clientY };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!drag.current) return;
      const dx = event.clientX - drag.current.x;
      const dy = event.clientY - drag.current.y;
      drag.current = { x: event.clientX, y: event.clientY };
      setTurn((t) => ({
        yaw: t.yaw + dx * 0.01,
        pitch: Math.max(-1.5, Math.min(1.5, t.pitch + dy * 0.01)),
      }));
    },
    onPointerUp: () => (drag.current = null),
    onPointerCancel: () => (drag.current = null),
  };
  return { turn, handlers };
};

const poseInput = (payload: OrigamiPayloadResponse): PoseInput => ({
  vertices: payload.pattern.vertices,
  faces: payload.pattern.faces,
  collapse: payload.animation.collapse,
  keyframes: payload.animation.keyframes,
  moves: payload.animation.moves,
  formed: payload.animation.formed,
});

/** White origami paper's back is the face up when a model starts colour down. */
const sidesFor = (payload: OrigamiPayloadResponse, paper: string): Sides =>
  payload.colorDown
    ? { front: PAPER_BACK, back: paper }
    : { front: paper, back: PAPER_BACK };

function Lights() {
  return (
    <>
      {/* Without tone mapping, ambient plus a face-on key light sum to
          about 1, so paper shows its true colour and folds still shade. */}
      <ambientLight intensity={1.1} />
      <directionalLight position={[1.5, 2, 3]} intensity={1.3} />
      <directionalLight position={[-2, -1, -3]} intensity={0.9} />
    </>
  );
}

function Checks({ payload }: { readonly payload: OrigamiPayloadResponse }) {
  return (
    <p className={styles.checks}>
      {payload.animation.formed ? (
        <>
          Checked in 3D: every crease reaches its angle and every loop of faces
          closes, so rigid paper holds this shape with nothing stretched or cut.{" "}
          {payload.verification.mountains} mountain and{" "}
          {payload.verification.valleys} valley creases.
        </>
      ) : (
        <>
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
        </>
      )}
    </p>
  );
}

/** One finished sheet, upright and placed: its faces and corner positions. */
const placedSheet = (
  payload: OrigamiPayloadResponse,
  place: { scale: number; dx: number; dy: number },
  lift: number,
) => {
  const input = poseInput(payload);
  const pose = poseAt(input, stepCount(input));
  const turn = (payload.viewDeg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  const positions = pose.map((value, i) => {
    const base = i - (i % 3);
    const [x, y, z] = [pose[base]!, pose[base + 1]!, pose[base + 2]!];
    if (i % 3 === 0) return place.scale * (x * cos - y * sin) + place.dx;
    if (i % 3 === 1) return place.scale * (x * sin + y * cos) + place.dy;
    return place.scale * z + lift;
  });
  return { faces: payload.pattern.faces, positions };
};

function PlacedPaper({
  faces,
  positions,
  colors,
}: {
  readonly faces: readonly (readonly number[])[];
  readonly positions: readonly number[];
  readonly colors: Sides;
}) {
  const [geometry, outline] = useMemo(() => {
    const position = new Float32BufferAttribute(positions, 3);
    const surface = new BufferGeometry();
    surface.setIndex(triangleCorners(faces));
    surface.setAttribute("position", position);
    surface.computeVertexNormals();
    const edges = new BufferGeometry();
    edges.setIndex(outlineCorners(faces));
    edges.setAttribute("position", position);
    return [surface, edges] as const;
  }, [faces, positions]);
  useEffect(
    () => () => {
      geometry.dispose();
      outline.dispose();
    },
    [geometry, outline],
  );
  return (
    <>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={colors.front}
          roughness={0.9}
          side={FrontSide}
        />
      </mesh>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={colors.back}
          roughness={0.9}
          side={BackSide}
        />
      </mesh>
      <lineSegments geometry={outline}>
        <lineBasicMaterial color="#3d3226" transparent opacity={0.28} />
      </lineSegments>
    </>
  );
}

/** A two-sheet model put together: the second sheet tucked into the first. */
function AssembledModel({
  first,
  second,
  paperColor,
  name,
}: {
  readonly first: OrigamiPayloadResponse;
  readonly second: OrigamiPayloadResponse;
  readonly paperColor: string;
  readonly name: string;
}) {
  const { turn, handlers } = useTurn();
  const sheets = useMemo(() => {
    const place = first.assembly!;
    // The second sheet lies between the first's layers, at their middle.
    const placed = [
      placedSheet(first, { scale: 1, dx: 0, dy: 0 }, 0),
      placedSheet(second, place, 0),
    ];
    const all = placed.flatMap((s) => s.positions);
    const view = frame(all);
    return placed.map((s) => ({
      faces: s.faces,
      positions: s.positions.map(
        (value, i) =>
          (i % 3 === 0
            ? value - view.x
            : i % 3 === 1
              ? value - view.y
              : value) * view.scale,
      ),
    }));
  }, [first, second]);
  return (
    <div className={styles.stage}>
      <div
        className={styles.canvas}
        {...handlers}
        role="img"
        aria-label={`The finished ${name.toLowerCase()}, both sheets together. Drag to turn it.`}
      >
        <Canvas
          camera={{ position: [0, 0, 1.45], fov: 40, near: 0.05, far: 20 }}
          dpr={[1, 2]}
          flat
        >
          <Lights />
          <group rotation={[turn.pitch, turn.yaw, 0]}>
            {sheets.map((sheet, i) => (
              <PlacedPaper
                key={i}
                faces={sheet.faces}
                positions={sheet.positions}
                colors={sidesFor(i === 0 ? first : second, paperColor)}
              />
            ))}
          </group>
        </Canvas>
      </div>
      <p className={styles.nowFolding}>
        Finished: the {first.assembly!.secondLabel.toLowerCase()} tucked into
        the {first.assembly!.label.toLowerCase()}. Each sheet folds below.
      </p>
    </div>
  );
}

/** One square: its folding animation, steps, crease pattern, and downloads. */
function OrigamiSheet({
  payload,
  paperMm,
  paperColor,
  title,
  label,
  part,
}: {
  readonly payload: OrigamiPayloadResponse;
  readonly paperMm: number;
  readonly paperColor: string;
  /** Names the downloads after the subject. */
  readonly title: string | null;
  /** The sheet's place in a two-sheet model, shown above it. */
  readonly label: string | null;
  /** The part this sheet makes ("Neck and head"), added to download names. */
  readonly part: string | null;
}) {
  const name = title ?? payload.name;
  const colors = sidesFor(payload, paperColor);
  const input = useMemo(() => poseInput(payload), [payload]);
  const total = stepCount(input);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(true);
  const { turn, handlers } = useTurn();

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
  const downloadTitle =
    title && part ? `${title} ${part.toLowerCase()}` : title;

  return (
    <>
      {label ? (
        <header className={styles.heading}>
          <p className={styles.kicker}>{label}</p>
          <p>
            Fold it from a {paperMm} mm square. {payload.summary}
          </p>
          <Checks payload={payload} />
        </header>
      ) : null}
      <div className={styles.stage}>
        <div
          className={styles.canvas}
          {...handlers}
          role="img"
          aria-label={`3D folding animation of the ${name.toLowerCase()}. Drag to turn it.`}
        >
          <Canvas
            camera={{ position: [0, 0, 1.45], fov: 40, near: 0.05, far: 20 }}
            dpr={[1, 2]}
            flat
          >
            <Lights />
            <group rotation={[turn.pitch, turn.yaw, 0]}>
              <FoldedPaper
                input={input}
                at={at}
                viewDeg={payload.viewDeg}
                colors={colors}
              />
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
          {payload.steps.some((step) => step.howTo.length > 0) ? (
            <details className={styles.howTo} open>
              <summary>Folding the base by hand</summary>
              <ol>
                {payload.steps
                  .flatMap((step) => step.howTo)
                  .map((sub, i) => (
                    <li key={i}>
                      {sub.diagram ? (
                        <svg viewBox="0 0 1 1" aria-hidden="true">
                          {sub.diagram.polygons.map((polygon, j) => (
                            <polygon
                              key={j}
                              points={polygon.points}
                              fill={polygon.front ? colors.front : colors.back}
                              stroke="#5b4a33"
                              strokeOpacity={0.35}
                              strokeWidth={0.004}
                            />
                          ))}
                          {sub.diagram.creases.map((crease, j) => (
                            <polyline
                              key={j}
                              points={crease.points}
                              fill="none"
                              stroke={crease.mountain ? "#c0392b" : "#2463b5"}
                              strokeWidth={0.012}
                              strokeDasharray={
                                crease.mountain
                                  ? "0.03 0.012 0.006 0.012"
                                  : "0.02 0.01"
                              }
                            />
                          ))}
                        </svg>
                      ) : (
                        <span
                          className={styles.howToBlank}
                          aria-hidden="true"
                        />
                      )}
                      <span>
                        <strong>{String.fromCharCode(97 + i)}.</strong>{" "}
                        {sub.text}
                      </span>
                    </li>
                  ))}
              </ol>
            </details>
          ) : null}
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
                          fill={polygon.front ? colors.front : colors.back}
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
                  href={`/api/origami/${payload.id}/${download.format}?paper=${paperMm}${downloadTitle ? `&title=${encodeURIComponent(downloadTitle)}` : ""}`}
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
    </>
  );
}

export function OrigamiResults({
  payload,
  second = null,
  paperMm,
  paperColor,
  aiReason,
  title,
  note = null,
  children,
}: {
  readonly payload: OrigamiPayloadResponse;
  /** A two-sheet model's second sheet, named by `payload.assembly`. */
  readonly second?: OrigamiPayloadResponse | null;
  /** Why this is not the design asked for, shown plainly (not as an AI choice). */
  readonly note?: string | null;
  /** Shown under the heading: the cut-and-glue offer, when there is one. */
  readonly children?: React.ReactNode;
  /** The subject a generated design was made for; null for library models. */
  readonly title: string | null;
  readonly paperMm: number;
  /** The paper's coloured side; the back is white. */
  readonly paperColor: string;
  readonly aiReason: string | null;
}) {
  const pair = payload.assembly && second ? payload.assembly : null;
  const name = title ?? (pair ? "Standing animal" : payload.name);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [payload.id]);

  return (
    <section
      ref={sectionRef}
      className={styles.results}
      aria-labelledby="origami-title"
    >
      <header className={styles.heading}>
        <p className={styles.kicker}>
          {pair
            ? "New origami design · two squares"
            : title
              ? `New origami design · ${payload.name.toLowerCase()}`
              : "Origami from one square"}
        </p>
        <h2 id="origami-title">{name}</h2>
        {pair ? null : <p>{payload.summary}</p>}
        {note ? (
          <p className={styles.aiChoice}>
            <strong>Note:</strong> {note}
          </p>
        ) : null}
        {aiReason ? (
          <p className={styles.aiChoice}>
            <strong>AI choice:</strong> {aiReason} The folds and checks below
            are computed, not generated.
          </p>
        ) : null}
        {pair ? (
          <p>
            Folded from two squares, as classic origami animals often are: a{" "}
            {paperMm} mm square for the {pair.label.toLowerCase()} and a{" "}
            {Math.round(paperMm * pair.scale)} mm square for the{" "}
            {pair.secondLabel.toLowerCase()}, whose wide end tucks into the
            front of the body. Each square is checked at every step; the tuck
            itself is placed, not checked.
          </p>
        ) : (
          <p>Fold it from a {paperMm} mm square of paper.</p>
        )}
        {children}
        {pair ? null : <Checks payload={payload} />}
      </header>
      {pair && second ? (
        <>
          <AssembledModel
            first={payload}
            second={second}
            paperColor={paperColor}
            name={name}
          />
          <OrigamiSheet
            payload={payload}
            paperMm={paperMm}
            paperColor={paperColor}
            title={title}
            label={`Square 1 of 2 · ${pair.label}`}
            part={pair.label}
          />
          <OrigamiSheet
            payload={second}
            paperMm={Math.round(paperMm * pair.scale)}
            paperColor={paperColor}
            title={title}
            label={`Square 2 of 2 · ${pair.secondLabel}`}
            part={pair.secondLabel}
          />
        </>
      ) : (
        <OrigamiSheet
          payload={payload}
          paperMm={paperMm}
          paperColor={paperColor}
          title={title}
          label={null}
          part={null}
        />
      )}
    </section>
  );
}
