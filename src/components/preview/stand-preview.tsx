"use client";

import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

import type {
  CandidateData,
  CandidateWithReportData,
} from "@/lib/api-contracts";

import styles from "./stand-preview.module.css";

interface StandPreviewProps {
  readonly entry: CandidateWithReportData;
  readonly mode: "folded" | "flat";
  readonly rotationDeg: number;
  readonly failureRefs: readonly string[];
}

interface PanelMeshProps {
  readonly candidate: CandidateData;
  readonly panel: CandidateData["geometry"]["folded"]["panels"][number];
  readonly highlighted: boolean;
}

const SCALE = 0.016;

function PanelMesh({ candidate, panel, highlighted }: PanelMeshProps) {
  const geometry = useMemo(() => {
    const centerXMm = candidate.parameters.baseDepthMm / 2;
    const vertices = panel.points.flatMap((point) => [
      (point.xMm - centerXMm) * SCALE,
      point.zMm * SCALE,
      point.yMm * SCALE,
    ]);
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    result.setIndex([0, 1, 2, 0, 2, 3]);
    result.computeVertexNormals();
    return result;
  }, [candidate, panel]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={highlighted ? "#b43a32" : "#eee6d5"}
        emissive={highlighted ? "#5f100b" : "#000000"}
        emissiveIntensity={highlighted ? 0.16 : 0}
        metalness={0}
        roughness={0.82}
        side={THREE.DoubleSide}
      />
      <lineSegments>
        <edgesGeometry args={[geometry]} />
        <lineBasicMaterial color={highlighted ? "#7f201a" : "#315f63"} />
      </lineSegments>
    </mesh>
  );
}

const pointsAttribute = (
  points: readonly { readonly xMm: number; readonly yMm: number }[],
): string => points.map((point) => `${point.xMm},${point.yMm}`).join(" ");

function FlatPreview({
  candidate,
  failureRefs,
}: {
  readonly candidate: CandidateData;
  readonly failureRefs: readonly string[];
}) {
  const flat = candidate.geometry.flat;
  const refs = new Set(failureRefs);
  const paddingMm = 8;
  return (
    <svg
      className={styles.flatSvg}
      viewBox={`${-paddingMm} ${-paddingMm} ${flat.widthMm + paddingMm * 2} ${flat.lengthMm + paddingMm * 2}`}
      role="img"
      aria-label={`Flat pattern for ${candidate.strategy} candidate`}
    >
      <polygon
        points={pointsAttribute(flat.outline.points)}
        className={`${styles.outline} ${refs.has("perimeter") ? styles.failed : ""}`}
      />
      {flat.creases.map((crease) => (
        <line
          key={crease.id}
          x1={crease.start.xMm}
          y1={crease.start.yMm}
          x2={crease.end.xMm}
          y2={crease.end.yMm}
          className={`${styles.crease} ${refs.has(crease.id) ? styles.failed : ""}`}
        />
      ))}
      {flat.slots.map((slot) => (
        <line
          key={slot.id}
          x1={slot.start.xMm}
          y1={slot.start.yMm}
          x2={slot.end.xMm}
          y2={slot.end.yMm}
          className={`${styles.slot} ${refs.has(slot.id) ? styles.failed : ""}`}
        />
      ))}
    </svg>
  );
}

export function StandPreview({
  entry,
  mode,
  rotationDeg,
  failureRefs,
}: StandPreviewProps) {
  const refs = new Set(failureRefs);

  if (mode === "flat") {
    return (
      <div
        className={styles.preview}
        data-preview-mode="flat"
        role="img"
        aria-label={`Flat cutting and crease pattern for ${entry.candidate.strategy} candidate`}
      >
        <FlatPreview candidate={entry.candidate} failureRefs={failureRefs} />
      </div>
    );
  }

  return (
    <div
      className={styles.preview}
      data-preview-mode="folded"
      role="img"
      aria-label={`Folded preview for ${entry.candidate.strategy} candidate at ${entry.candidate.parameters.backrestAngleDeg} degrees`}
    >
      <Canvas
        camera={{ position: [2.3, 1.65, 2.4], fov: 36, near: 0.1, far: 100 }}
        dpr={[1, 1.5]}
        frameloop="demand"
        aria-hidden="true"
      >
        <color attach="background" args={["#f8f3e9"]} />
        <ambientLight intensity={2.1} />
        <directionalLight position={[3, 5, 4]} intensity={3} />
        <group rotation={[0, (rotationDeg * Math.PI) / 180, 0]}>
          {entry.candidate.geometry.folded.panels.map((panel) => (
            <PanelMesh
              key={panel.id}
              candidate={entry.candidate}
              panel={panel}
              highlighted={refs.has(panel.id)}
            />
          ))}
        </group>
        <gridHelper
          args={[4, 16, "#b8ac99", "#ded6c8"]}
          position={[0, -0.012, 0]}
        />
      </Canvas>
    </div>
  );
}
