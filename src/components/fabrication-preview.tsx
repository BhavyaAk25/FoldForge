"use client";

import { Canvas } from "@react-three/fiber";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from "three";

import { evaluateMotionState } from "@/core/fabrication/kinematics";
import {
  createFabricationPatternLayout,
  type FabricationPatternPanel,
} from "@/core/fabrication/pattern-layout";
import type {
  FabricationIRV1,
  PanelV1,
  Point2Mm,
  Point3Mm,
} from "@/core/fabrication/types";

import styles from "./fabrication-preview.module.css";

export type FabricationPreviewMode = "assembled" | "pattern";

interface ScenePanel {
  readonly color: string;
  readonly panelId: string;
  readonly positions: Float32Array;
}

interface SceneData {
  readonly driverValue: number | null;
  readonly fitScale: number;
  readonly panels: readonly ScenePanel[];
  readonly stateSignature: string;
}

interface DragState {
  readonly lastClientX: number;
  readonly lastClientY: number;
  readonly mode: "orbit" | "pan";
  readonly pointerId: number;
}

interface FabricationPreviewProps {
  readonly ir: FabricationIRV1;
  readonly mode: FabricationPreviewMode;
  readonly motionPosition: number;
  readonly onRotationChange: (rotationDeg: number) => void;
  readonly rotationDeg: number;
  readonly highlightedPanelIds?: readonly string[];
  readonly label: string;
}

const DEFAULT_ROTATION_DEG = -18;
const DEFAULT_PITCH_DEG = -20;
const MINIMUM_ZOOM = 0.55;
const MAXIMUM_ZOOM = 2.4;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

const wrapRotation = (rotationDeg: number): number => {
  const wrapped = (((rotationDeg + 180) % 360) + 360) % 360;
  return wrapped - 180;
};

const homeDriverValue = (
  ir: FabricationIRV1,
  position: number,
): number | undefined => {
  if (!ir.driver) return undefined;
  const bounded = clamp(position, 0, 1);
  return (
    ir.driver.minimumValue +
    (ir.driver.maximumValue - ir.driver.minimumValue) * bounded
  );
};

interface ViewBox {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

const viewBoxFor = (polygons: readonly FabricationPatternPanel[]): ViewBox => {
  const points = polygons.flatMap((polygon) => polygon.points);
  if (points.length === 0) return { x: 0, y: 0, width: 100, height: 100 };
  const minimumX = Math.min(...points.map((point) => point.xMm));
  const maximumX = Math.max(...points.map((point) => point.xMm));
  const minimumY = Math.min(...points.map((point) => point.yMm));
  const maximumY = Math.max(...points.map((point) => point.yMm));
  const width = Math.max(1, maximumX - minimumX);
  const height = Math.max(1, maximumY - minimumY);
  const padding = Math.max(8, Math.max(width, height) * 0.12);
  return {
    x: minimumX - padding,
    y: minimumY - padding,
    width: width + padding * 2,
    height: height + padding * 2,
  };
};

const transformedViewBox = (
  base: ViewBox,
  zoom: number,
  panX: number,
  panY: number,
): string => {
  const width = base.width / zoom;
  const height = base.height / zoom;
  const centerX = base.x + base.width / 2 + panX * base.width;
  const centerY = base.y + base.height / 2 + panY * base.height;
  return `${centerX - width / 2} ${centerY - height / 2} ${width} ${height}`;
};

const polygonPoints = (points: readonly Point2Mm[]): string =>
  points.map((point) => `${point.xMm},${point.yMm}`).join(" ");

const pathSegment = (points: readonly Point2Mm[]): string =>
  points.length === 0
    ? ""
    : `M ${points.map((point) => `${point.xMm} ${point.yMm}`).join(" L ")} Z`;

const polygonPath = (polygon: FabricationPatternPanel): string =>
  [polygon.points, ...polygon.holes].map(pathSegment).join(" ");

const roleClass = (role: PanelV1["role"]): string => {
  switch (role) {
    case "driver":
      return styles.driver ?? "";
    case "output":
      return styles.output ?? "";
    case "decorative":
      return styles.decorative ?? "";
    case "guide":
    case "slider":
      return styles.mechanism ?? "";
    case "structural":
      return styles.structural ?? "";
  }
};

const roleColor = (role: PanelV1["role"], highlighted: boolean): string => {
  if (highlighted) return "#ef796f";
  switch (role) {
    case "driver":
      return "#e9b567";
    case "output":
      return "#d99b75";
    case "decorative":
      return "#b9c8aa";
    case "guide":
    case "slider":
      return "#9db8b2";
    case "structural":
      return "#ded2b8";
  }
};

const sceneCoordinates = (
  point: Point3Mm,
  center: Point3Mm,
): readonly [number, number, number] => [
  point.xMm - center.xMm,
  point.zMm - center.zMm,
  center.yMm - point.yMm,
];

const buildSceneData = (
  ir: FabricationIRV1,
  motionPosition: number,
  highlightedPanelIds: readonly string[],
): SceneData | null => {
  const evaluated = evaluateMotionState(
    ir,
    homeDriverValue(ir, motionPosition),
  );
  if (!evaluated.ok) return null;

  const allPoints = ir.panels.flatMap(
    (panel) => evaluated.value.panelVertices[panel.panelId] ?? [],
  );
  if (allPoints.length === 0) return null;
  const minimumX = Math.min(...allPoints.map((point) => point.xMm));
  const maximumX = Math.max(...allPoints.map((point) => point.xMm));
  const minimumY = Math.min(...allPoints.map((point) => point.yMm));
  const maximumY = Math.max(...allPoints.map((point) => point.yMm));
  const minimumZ = Math.min(...allPoints.map((point) => point.zMm));
  const maximumZ = Math.max(...allPoints.map((point) => point.zMm));
  const center = {
    xMm: (minimumX + maximumX) / 2,
    yMm: (minimumY + maximumY) / 2,
    zMm: (minimumZ + maximumZ) / 2,
  };
  const maximumExtentMm = Math.max(
    maximumX - minimumX,
    maximumY - minimumY,
    maximumZ - minimumZ,
    1,
  );
  const highlighted = new Set(highlightedPanelIds);
  let checksum = 0;
  let coordinateIndex = 1;
  const panels = ir.panels.flatMap((panel): readonly ScenePanel[] => {
    const triangles = evaluated.value.panelTriangles[panel.panelId];
    if (!triangles || triangles.length === 0) return [];
    const positions: number[] = [];
    for (const triangle of triangles) {
      for (const point of triangle) {
        const coordinates = sceneCoordinates(point, center);
        positions.push(...coordinates);
        checksum +=
          coordinateIndex *
          (coordinates[0] * 0.73 +
            coordinates[1] * 1.31 +
            coordinates[2] * 1.91);
        coordinateIndex += 1;
      }
    }
    return [
      {
        color: roleColor(panel.role, highlighted.has(panel.panelId)),
        panelId: panel.panelId,
        positions: new Float32Array(positions),
      },
    ];
  });

  return {
    driverValue: evaluated.value.driverValue,
    fitScale: 3.2 / maximumExtentMm,
    panels,
    stateSignature: checksum.toFixed(4),
  };
};

function ScenePanelMesh({ panel }: { readonly panel: ScenePanel }) {
  const geometry = useMemo(() => {
    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(panel.positions, 3),
    );
    nextGeometry.computeVertexNormals();
    return nextGeometry;
  }, [panel.positions]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} userData={{ panelId: panel.panelId }}>
      <meshStandardMaterial
        color={panel.color}
        metalness={0}
        roughness={0.82}
        side={DoubleSide}
      />
    </mesh>
  );
}

interface AssembledPreviewProps {
  readonly highlightedPanelIds: readonly string[];
  readonly ir: FabricationIRV1;
  readonly label: string;
  readonly motionPosition: number;
  readonly onRotationChange: (rotationDeg: number) => void;
  readonly rotationDeg: number;
}

function AssembledPreview({
  highlightedPanelIds,
  ir,
  label,
  motionPosition,
  onRotationChange,
  rotationDeg,
}: AssembledPreviewProps) {
  const [pitchDeg, setPitchDeg] = useState(DEFAULT_PITCH_DEG);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewAnnouncement, setViewAnnouncement] = useState("3D view ready.");
  const dragRef = useRef<DragState | null>(null);
  const hintId = useId();
  const scene = useMemo(
    () => buildSceneData(ir, motionPosition, highlightedPanelIds),
    [highlightedPanelIds, ir, motionPosition],
  );

  const resetView = () => {
    onRotationChange(DEFAULT_ROTATION_DEG);
    setPitchDeg(DEFAULT_PITCH_DEG);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setViewAnnouncement("3D view reset.");
  };

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      mode: event.shiftKey || event.button === 1 ? "pan" : "orbit",
    };
  };

  const continueDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.lastClientX;
    const deltaY = event.clientY - drag.lastClientY;
    dragRef.current = {
      ...drag,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
    };
    if (drag.mode === "orbit") {
      onRotationChange(wrapRotation(rotationDeg + deltaX * 0.55));
      setPitchDeg((current) => clamp(current + deltaY * 0.4, -75, 75));
      return;
    }
    setPan((current) => ({
      x: clamp(current.x + deltaX * 0.006, -1.6, 1.6),
      y: clamp(current.y - deltaY * 0.006, -1.2, 1.2),
    }));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setViewAnnouncement(
      drag.mode === "orbit" ? "3D view rotated." : "3D view panned.",
    );
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((current) =>
      clamp(
        current * (event.deltaY > 0 ? 0.9 : 1.1),
        MINIMUM_ZOOM,
        MAXIMUM_ZOOM,
      ),
    );
    setViewAnnouncement(event.deltaY > 0 ? "3D zoomed out." : "3D zoomed in.");
  };

  if (!scene) {
    return (
      <div className={styles.previewUnavailable} role="status">
        The verified 3D state could not be drawn.
      </div>
    );
  }

  return (
    <div className={styles.previewStack}>
      <div
        className={styles.canvasFrame}
        role="img"
        aria-label={label}
        aria-describedby={hintId}
        data-testid="fabrication-3d-preview"
        data-driver-value={scene.driverValue ?? "static"}
        data-pan-x={pan.x}
        data-pan-y={pan.y}
        data-rotation-deg={rotationDeg}
        data-state-signature={scene.stateSignature}
        onPointerDown={startDrag}
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={handleWheel}
      >
        <Canvas
          aria-hidden="true"
          camera={{ position: [0, 0, 6.5], fov: 42, near: 0.1, far: 100 }}
          dpr={[1, 1.6]}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        >
          <ambientLight intensity={1.35} />
          <directionalLight position={[3, 5, 4]} intensity={2.3} />
          <directionalLight position={[-4, 1, -2]} intensity={0.75} />
          <gridHelper
            args={[8, 16, "#b8ab93", "#ddd4c2"]}
            position={[0, -2.05, 0]}
          />
          <group
            position={[pan.x, pan.y, 0]}
            rotation={[
              (pitchDeg * Math.PI) / 180,
              (rotationDeg * Math.PI) / 180,
              0,
            ]}
            scale={scene.fitScale * zoom}
          >
            {scene.panels.map((panel) => (
              <ScenePanelMesh key={panel.panelId} panel={panel} />
            ))}
          </group>
        </Canvas>
      </div>
      <div className={styles.viewControls} aria-label="3D view controls">
        <span>Orbit</span>
        <button
          type="button"
          aria-label="Rotate view left"
          onClick={() => {
            onRotationChange(wrapRotation(rotationDeg - 15));
            setViewAnnouncement("3D view rotated left 15 degrees.");
          }}
        >
          Left
        </button>
        <button
          type="button"
          aria-label="Rotate view right"
          onClick={() => {
            onRotationChange(wrapRotation(rotationDeg + 15));
            setViewAnnouncement("3D view rotated right 15 degrees.");
          }}
        >
          Right
        </button>
        <button
          type="button"
          aria-label="Tilt view up"
          onClick={() => {
            setPitchDeg((current) => clamp(current - 10, -75, 75));
            setViewAnnouncement("3D view tilted up 10 degrees.");
          }}
        >
          Up
        </button>
        <button
          type="button"
          aria-label="Tilt view down"
          onClick={() => {
            setPitchDeg((current) => clamp(current + 10, -75, 75));
            setViewAnnouncement("3D view tilted down 10 degrees.");
          }}
        >
          Down
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => {
            setZoom((current) =>
              clamp(current / 1.15, MINIMUM_ZOOM, MAXIMUM_ZOOM),
            );
            setViewAnnouncement("3D zoomed out.");
          }}
        >
          Zoom −
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => {
            setZoom((current) =>
              clamp(current * 1.15, MINIMUM_ZOOM, MAXIMUM_ZOOM),
            );
            setViewAnnouncement("3D zoomed in.");
          }}
        >
          Zoom +
        </button>
        <button type="button" onClick={resetView}>
          Reset view
        </button>
        <span>Pan</span>
        <button
          type="button"
          aria-label="Pan 3D view left"
          onClick={() => {
            setPan((current) => ({
              ...current,
              x: clamp(current.x - 0.16, -1.6, 1.6),
            }));
            setViewAnnouncement("3D view panned left.");
          }}
        >
          Left
        </button>
        <button
          type="button"
          aria-label="Pan 3D view right"
          onClick={() => {
            setPan((current) => ({
              ...current,
              x: clamp(current.x + 0.16, -1.6, 1.6),
            }));
            setViewAnnouncement("3D view panned right.");
          }}
        >
          Right
        </button>
        <button
          type="button"
          aria-label="Pan 3D view up"
          onClick={() => {
            setPan((current) => ({
              ...current,
              y: clamp(current.y + 0.16, -1.2, 1.2),
            }));
            setViewAnnouncement("3D view panned up.");
          }}
        >
          Up
        </button>
        <button
          type="button"
          aria-label="Pan 3D view down"
          onClick={() => {
            setPan((current) => ({
              ...current,
              y: clamp(current.y - 0.16, -1.2, 1.2),
            }));
            setViewAnnouncement("3D view panned down.");
          }}
        >
          Down
        </button>
      </div>
      <p className={styles.interactionHint} id={hintId}>
        Drag to orbit. Shift-drag to pan. Scroll to zoom.
      </p>
      <p className={styles.visuallyHidden} aria-live="polite">
        {viewAnnouncement}
      </p>
    </div>
  );
}

interface PatternPreviewProps {
  readonly highlightedPanelIds: readonly string[];
  readonly ir: FabricationIRV1;
  readonly label: string;
}

function PatternPreview({
  highlightedPanelIds,
  ir,
  label,
}: PatternPreviewProps) {
  const patternLayout = useMemo(() => createFabricationPatternLayout(ir), [ir]);
  const polygons = patternLayout.panels;
  const baseViewBox = useMemo(() => viewBoxFor(polygons), [polygons]);
  const highlighted = useMemo(
    () => new Set(highlightedPanelIds),
    [highlightedPanelIds],
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showCuts, setShowCuts] = useState(true);
  const [showFolds, setShowFolds] = useState(true);
  const [viewAnnouncement, setViewAnnouncement] = useState(
    "Pattern view ready.",
  );
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setViewAnnouncement("Pattern fitted to the view.");
  };

  return (
    <div className={styles.previewStack}>
      <svg
        className={styles.patternPreview}
        viewBox={transformedViewBox(baseViewBox, zoom, pan.x, pan.y)}
        role="img"
        aria-label={label}
        preserveAspectRatio="xMidYMid meet"
        data-testid="fabrication-pattern-preview"
      >
        <title>{label}</title>
        <g className={styles.paperShadow} aria-hidden="true">
          {polygons.map((polygon) => (
            <path
              key={`shadow-${polygon.panel.panelId}`}
              d={polygonPath(polygon)}
              fillRule="evenodd"
            />
          ))}
        </g>
        <g>
          {polygons.map((polygon) => (
            <path
              key={polygon.panel.panelId}
              className={`${styles.panel ?? ""} ${roleClass(polygon.panel.role)} ${
                highlighted.has(polygon.panel.panelId)
                  ? (styles.highlighted ?? "")
                  : ""
              }`}
              d={polygonPath(polygon)}
              fillRule="evenodd"
              data-inner-cut-count={polygon.holes.length}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        {showCuts ? (
          <g
            className={styles.cutLines}
            aria-hidden="true"
            data-testid="pattern-cut-lines"
          >
            {patternLayout.paths
              .filter(
                ({ path }) =>
                  path.kind === "cut" || path.kind === "perforation",
              )
              .map(({ path, points }) => (
                <polyline
                  key={path.pathId}
                  points={polygonPoints(points)}
                  data-sheet-id={path.sheetId}
                  data-source-path-id={path.pathId}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
          </g>
        ) : null}
        {showFolds ? (
          <g
            className={styles.scoreLines}
            aria-hidden="true"
            data-testid="pattern-fold-lines"
          >
            {patternLayout.paths
              .filter(({ path }) => path.kind === "score")
              .map(({ path, points }) => (
                <polyline
                  key={path.pathId}
                  points={polygonPoints(points)}
                  data-sheet-id={path.sheetId}
                  data-source-path-id={path.pathId}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
          </g>
        ) : null}
      </svg>
      <div className={styles.viewControls} aria-label="Pattern view controls">
        <button
          type="button"
          aria-label="Pan pattern left"
          onClick={() => {
            setPan((current) => ({ ...current, x: current.x - 0.08 }));
            setViewAnnouncement("Pattern panned left.");
          }}
        >
          Left
        </button>
        <button
          type="button"
          aria-label="Pan pattern right"
          onClick={() => {
            setPan((current) => ({ ...current, x: current.x + 0.08 }));
            setViewAnnouncement("Pattern panned right.");
          }}
        >
          Right
        </button>
        <button
          type="button"
          aria-label="Pan pattern up"
          onClick={() => {
            setPan((current) => ({ ...current, y: current.y - 0.08 }));
            setViewAnnouncement("Pattern panned up.");
          }}
        >
          Up
        </button>
        <button
          type="button"
          aria-label="Pan pattern down"
          onClick={() => {
            setPan((current) => ({ ...current, y: current.y + 0.08 }));
            setViewAnnouncement("Pattern panned down.");
          }}
        >
          Down
        </button>
        <button
          type="button"
          aria-label="Zoom pattern out"
          onClick={() => {
            setZoom((current) => clamp(current / 1.2, 0.65, 4));
            setViewAnnouncement("Pattern zoomed out.");
          }}
        >
          Zoom −
        </button>
        <button
          type="button"
          aria-label="Zoom pattern in"
          onClick={() => {
            setZoom((current) => clamp(current * 1.2, 0.65, 4));
            setViewAnnouncement("Pattern zoomed in.");
          }}
        >
          Zoom +
        </button>
        <button type="button" onClick={resetView}>
          Fit pattern
        </button>
        <label>
          <input
            type="checkbox"
            checked={showCuts}
            onChange={(event) => {
              setShowCuts(event.currentTarget.checked);
              setViewAnnouncement(
                `Cut lines ${event.currentTarget.checked ? "shown" : "hidden"}.`,
              );
            }}
          />
          Cut lines
        </label>
        <label>
          <input
            type="checkbox"
            checked={showFolds}
            onChange={(event) => {
              setShowFolds(event.currentTarget.checked);
              setViewAnnouncement(
                `Fold lines ${event.currentTarget.checked ? "shown" : "hidden"}.`,
              );
            }}
          />
          Fold lines
        </label>
      </div>
      <p className={styles.visuallyHidden} aria-live="polite">
        {viewAnnouncement}
      </p>
    </div>
  );
}

export function FabricationPreview({
  ir,
  mode,
  motionPosition,
  onRotationChange,
  rotationDeg,
  highlightedPanelIds = [],
  label,
}: FabricationPreviewProps) {
  return mode === "assembled" ? (
    <AssembledPreview
      ir={ir}
      motionPosition={motionPosition}
      rotationDeg={rotationDeg}
      onRotationChange={onRotationChange}
      highlightedPanelIds={highlightedPanelIds}
      label={label}
    />
  ) : (
    <PatternPreview
      ir={ir}
      highlightedPanelIds={highlightedPanelIds}
      label={label}
    />
  );
}
