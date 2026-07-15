import { canonicalSerialize } from "@/core/canonical";
import { sha256Hex, sha256HexBytes } from "@/core/sha256";

import { panelMaterialHoles } from "../connector-geometry";
import { evaluateMotionState } from "../kinematics";
import {
  decomposeRigidMatrix4,
  inverseRigidMatrix4,
  multiplyMatrices4,
} from "../matrix";
import { transformPoint2, triangulatePolygonWithHoles } from "../polygon";
import { buildDirectedBodyTopology } from "../topology";
import type {
  CandidateProvenanceV2,
  FabricationIRV1,
  Point3Mm,
  Quaternion,
} from "../types";
import {
  createBinaryArtifact,
  fabricationExportError,
  fabricationExportOk,
  prepareExportSource,
  type FabricationExportArtifact,
  type FabricationExportResult,
  type PreparedFabricationExportSource,
  type VerifiedFabricationExportSource,
} from "./artifact";

interface GlbAnimationKeyframe {
  readonly timeSeconds: number;
  readonly translationMm?: Point3Mm;
  readonly rotation?: Quaternion;
}

interface GlbAnimationTrack {
  readonly trackId: string;
  readonly targetBodyId: string;
  readonly keyframes: readonly GlbAnimationKeyframe[];
}

interface BinarySlice {
  readonly byteOffset: number;
  readonly byteLength: number;
}

interface GltfBufferView {
  readonly buffer: 0;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly target?: 34962 | 34963;
}

interface GltfAccessor {
  readonly bufferView: number;
  readonly componentType: 5123 | 5126;
  readonly count: number;
  readonly type: "SCALAR" | "VEC3" | "VEC4";
  readonly min?: readonly number[];
  readonly max?: readonly number[];
}

interface GltfPrimitive {
  readonly attributes: { readonly POSITION: number };
  readonly indices: number;
  readonly material: number;
  readonly mode: 1 | 4;
}

interface GltfMesh {
  readonly name: string;
  readonly primitives: readonly GltfPrimitive[];
  readonly extras: Readonly<Record<string, string | number>>;
}

interface GltfMaterial {
  readonly name: string;
  readonly pbrMetallicRoughness: {
    readonly baseColorFactor: readonly [number, number, number, number];
    readonly metallicFactor: number;
    readonly roughnessFactor: number;
  };
  readonly doubleSided: boolean;
  readonly extras: Readonly<Record<string, string | number>>;
}

interface GltfNode {
  readonly name: string;
  readonly mesh?: number;
  readonly children?: readonly number[];
  readonly translation?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number, number];
  readonly extras: Readonly<Record<string, string | number | boolean>>;
}

interface GltfAnimationSampler {
  readonly input: number;
  readonly output: number;
  readonly interpolation: "LINEAR";
}

interface GltfAnimationChannel {
  readonly sampler: number;
  readonly target: {
    readonly node: number;
    readonly path: "translation" | "rotation";
  };
}

interface GltfAnimation {
  readonly name: string;
  readonly samplers: readonly GltfAnimationSampler[];
  readonly channels: readonly GltfAnimationChannel[];
  readonly extras: Readonly<Record<string, string>>;
}

class BinaryBuilder {
  private readonly values: number[] = [];

  append(bytes: Uint8Array, alignment = 4): BinarySlice {
    while (this.values.length % alignment !== 0) this.values.push(0);
    const byteOffset = this.values.length;
    for (const byte of bytes) this.values.push(byte);
    return { byteOffset, byteLength: bytes.byteLength };
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.values);
  }
}

const finitePoint3 = (point: Point3Mm): boolean =>
  Number.isFinite(point.xMm) &&
  Number.isFinite(point.yMm) &&
  Number.isFinite(point.zMm);

const finiteQuaternion = (rotation: Quaternion): boolean =>
  Number.isFinite(rotation.x) &&
  Number.isFinite(rotation.y) &&
  Number.isFinite(rotation.z) &&
  Number.isFinite(rotation.w) &&
  Math.abs(Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w) - 1) <=
    1e-6;

const meters = (millimetres: number): number => millimetres / 1_000;

const float32Bytes = (values: readonly number[]): Uint8Array => {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return bytes;
};

const uint16Bytes = (values: readonly number[]): Uint8Array => {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint16(index * 2, value, true));
  return bytes;
};

const padded = (bytes: Uint8Array, byte: number): Uint8Array => {
  const paddingLength = (4 - (bytes.byteLength % 4)) % 4;
  if (paddingLength === 0) return bytes;
  const result = new Uint8Array(bytes.byteLength + paddingLength);
  result.set(bytes);
  result.fill(byte, bytes.byteLength);
  return result;
};

const colorForMaterial = (
  materialId: string,
): readonly [number, number, number, 1] => {
  const hash = sha256Hex(materialId);
  const component = (offset: number): number => {
    const byte = Number.parseInt(hash.slice(offset, offset + 2), 16);
    return Number((0.35 + (byte / 255) * 0.5).toFixed(6));
  };
  return [component(0), component(2), component(4), 1];
};

const createGlbBytes = (json: string, binary: Uint8Array): Uint8Array => {
  const jsonBytes = padded(new TextEncoder().encode(json), 0x20);
  const binaryBytes = padded(binary, 0);
  const totalLength =
    12 + 8 + jsonBytes.byteLength + 8 + binaryBytes.byteLength;
  const result = new Uint8Array(totalLength);
  const view = new DataView(result.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  result.set(jsonBytes, 20);
  const binaryHeaderOffset = 20 + jsonBytes.byteLength;
  view.setUint32(binaryHeaderOffset, binaryBytes.byteLength, true);
  view.setUint32(binaryHeaderOffset + 4, 0x004e4942, true);
  result.set(binaryBytes, binaryHeaderOffset + 8);
  return result;
};

const invalidGeometry = (
  prepared: PreparedFabricationExportSource,
  message: string,
  geometryIds: readonly string[],
): FabricationExportResult<never> =>
  fabricationExportError(
    "invalid_geometry",
    prepared.sourceCandidateId,
    message,
    geometryIds,
  );

const glbFabricationProfile = (ir: FabricationIRV1) => ({
  version: "1" as const,
  unit: ir.unit,
  behavior: ir.behavior,
  panels: ir.panels,
  bodies: ir.bodies,
  joints: ir.joints,
  paths: ir.paths,
  connectors: ir.connectors,
  driver: ir.driver,
  outputs: ir.outputs,
  couplings: ir.couplings,
});

export const exportFabricationGlb = (
  source: VerifiedFabricationExportSource,
): FabricationExportResult<FabricationExportArtifact> => {
  const preparedResult = prepareExportSource(source);
  if (!preparedResult.ok) return preparedResult;
  const prepared = preparedResult.value;
  const panelOrder = [...prepared.ir.panels].sort((left, right) =>
    left.panelId.localeCompare(right.panelId),
  );
  const bodyOrder = [...prepared.ir.bodies].sort((left, right) =>
    left.bodyId.localeCompare(right.bodyId),
  );
  if (panelOrder.length === 0 || bodyOrder.length === 0) {
    return invalidGeometry(
      prepared,
      "GLB export requires at least one panel and one rigid body.",
      [prepared.ir.irId],
    );
  }
  const topologyResult = buildDirectedBodyTopology(
    bodyOrder.map((body) => body.bodyId),
    prepared.ir.joints,
  );
  if (!topologyResult.ok) {
    return invalidGeometry(
      prepared,
      `GLB export requires the verified connected rigid-body tree: ${topologyResult.error.id}.`,
      bodyOrder.map((body) => body.bodyId),
    );
  }
  const topology = topologyResult.value;
  const builder = new BinaryBuilder();
  const bufferViews: GltfBufferView[] = [];
  const accessors: GltfAccessor[] = [];

  const addAccessor = (
    bytes: Uint8Array,
    componentType: 5123 | 5126,
    count: number,
    type: GltfAccessor["type"],
    target: 34962 | 34963 | null,
    minimum?: readonly number[],
    maximum?: readonly number[],
  ): number => {
    const slice = builder.append(bytes);
    const bufferViewIndex = bufferViews.length;
    bufferViews.push(
      target === null
        ? {
            buffer: 0,
            byteOffset: slice.byteOffset,
            byteLength: slice.byteLength,
          }
        : {
            buffer: 0,
            byteOffset: slice.byteOffset,
            byteLength: slice.byteLength,
            target,
          },
    );
    const accessorIndex = accessors.length;
    const base = { bufferView: bufferViewIndex, componentType, count, type };
    accessors.push(
      minimum && maximum ? { ...base, min: minimum, max: maximum } : base,
    );
    return accessorIndex;
  };

  const sheetOrder = [...prepared.ir.sheets].sort((left, right) =>
    left.sheetId.localeCompare(right.sheetId),
  );
  const materialIndexBySheetId = new Map<string, number>();
  const materials: GltfMaterial[] = sheetOrder.map((sheet, index) => {
    materialIndexBySheetId.set(sheet.sheetId, index);
    return {
      name: `material:${sheet.material.materialId}:${sheet.sheetId}`,
      pbrMetallicRoughness: {
        baseColorFactor: colorForMaterial(sheet.material.materialId),
        metallicFactor: 0,
        roughnessFactor: 0.9,
      },
      doubleSided: true,
      extras: {
        sourceSheetId: sheet.sheetId,
        materialId: sheet.material.materialId,
        thicknessMm: sheet.material.thicknessMm,
      },
    };
  });
  const pathMaterialIndex = new Map<
    FabricationIRV1["paths"][number]["kind"],
    number
  >();
  const pathColors = {
    cut: [0.08, 0.08, 0.08, 1],
    score: [0.03, 0.42, 0.46, 1],
    perforation: [0.63, 0.27, 0.02, 1],
    engrave: [0.33, 0.33, 0.33, 1],
  } as const;
  for (const kind of ["cut", "score", "perforation", "engrave"] as const) {
    pathMaterialIndex.set(kind, materials.length);
    materials.push({
      name: `fabrication-path:${kind}`,
      pbrMetallicRoughness: {
        baseColorFactor: pathColors[kind],
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      doubleSided: true,
      extras: { fabricationPathKind: kind },
    });
  }

  const meshes: GltfMesh[] = [];
  const meshIndexByPanelId = new Map<string, number>();
  for (const panel of panelOrder) {
    const triangulation = triangulatePolygonWithHoles(
      panel.contour.vertices,
      panelMaterialHoles(panel, prepared.ir.connectors).map(
        (hole) => hole.vertices,
      ),
    );
    if (
      triangulation.triangles.length === 0 ||
      !Number.isFinite(triangulation.relativeAreaDeviation) ||
      triangulation.relativeAreaDeviation > 1e-10 ||
      triangulation.vertices.length > 65_535
    ) {
      return invalidGeometry(
        prepared,
        "Panel triangulation did not produce a complete source-equivalent mesh.",
        [panel.panelId],
      );
    }
    const placedVertices = triangulation.vertices.map((point) =>
      transformPoint2(point, panel.flatTransform),
    );
    const positions = placedVertices.flatMap((point) => [
      meters(point.xMm),
      meters(point.yMm),
      0,
    ]);
    const xValues = placedVertices.map((point) => meters(point.xMm));
    const yValues = placedVertices.map((point) => meters(point.yMm));
    const positionAccessor = addAccessor(
      float32Bytes(positions),
      5126,
      triangulation.vertices.length,
      "VEC3",
      34962,
      [Math.min(...xValues), Math.min(...yValues), 0],
      [Math.max(...xValues), Math.max(...yValues), 0],
    );
    const indices = triangulation.triangles.flatMap((triangle) => [
      triangle.a,
      triangle.b,
      triangle.c,
    ]);
    const indexAccessor = addAccessor(
      uint16Bytes(indices),
      5123,
      indices.length,
      "SCALAR",
      34963,
      [Math.min(...indices)],
      [Math.max(...indices)],
    );
    const materialIndex = materialIndexBySheetId.get(panel.sheetId)!;
    const meshIndex = meshes.length;
    meshIndexByPanelId.set(panel.panelId, meshIndex);
    meshes.push({
      name: `panel-mesh:${panel.panelId}`,
      primitives: [
        {
          attributes: { POSITION: positionAccessor },
          indices: indexAccessor,
          material: materialIndex,
          mode: 4,
        },
      ],
      extras: {
        sourcePanelId: panel.panelId,
        sourceBodyId: panel.bodyId,
        sourceSheetId: panel.sheetId,
        thicknessMm: panel.thicknessMm,
      },
    });
  }

  const pathOrder = [...prepared.ir.paths].sort((left, right) =>
    left.pathId.localeCompare(right.pathId),
  );
  const meshIndexByPathId = new Map<string, number>();
  for (const path of pathOrder) {
    const segmentCount = path.closed
      ? path.points.length
      : Math.max(0, path.points.length - 1);
    const segmentPoints = Array.from(
      { length: segmentCount },
      (_, index) =>
        [
          path.points[index]!,
          path.points[(index + 1) % path.points.length]!,
        ] as const,
    ).flat();
    if (segmentPoints.length < 2 || segmentPoints.length > 65_535) {
      return invalidGeometry(
        prepared,
        "Fabrication paths require at least one finite line segment.",
        [path.pathId],
      );
    }
    const positions = segmentPoints.flatMap((point) => [
      meters(point.xMm),
      meters(point.yMm),
      0.0002,
    ]);
    if (positions.some((value) => !Number.isFinite(value))) {
      return invalidGeometry(
        prepared,
        "Fabrication path coordinates must be finite.",
        [path.pathId],
      );
    }
    const xValues = segmentPoints.map((point) => meters(point.xMm));
    const yValues = segmentPoints.map((point) => meters(point.yMm));
    const positionAccessor = addAccessor(
      float32Bytes(positions),
      5126,
      segmentPoints.length,
      "VEC3",
      34962,
      [Math.min(...xValues), Math.min(...yValues), 0.0002],
      [Math.max(...xValues), Math.max(...yValues), 0.0002],
    );
    const indices = segmentPoints.map((_, index) => index);
    const indexAccessor = addAccessor(
      uint16Bytes(indices),
      5123,
      indices.length,
      "SCALAR",
      34963,
      [0],
      [indices.length - 1],
    );
    const meshIndex = meshes.length;
    meshIndexByPathId.set(path.pathId, meshIndex);
    meshes.push({
      name: `path-mesh:${path.pathId}`,
      primitives: [
        {
          attributes: { POSITION: positionAccessor },
          indices: indexAccessor,
          material: pathMaterialIndex.get(path.kind)!,
          mode: 1,
        },
      ],
      extras: {
        sourcePathId: path.pathId,
        sourcePanelId: path.panelId ?? "",
        sourceSheetId: path.sheetId,
        fabricationPathKind: path.kind,
        closed: path.closed ? 1 : 0,
      },
    });
  }

  const bodyNodeIndex = new Map<string, number>();
  bodyOrder.forEach((body, index) => bodyNodeIndex.set(body.bodyId, index));
  const panelNodeIndex = new Map<string, number>();
  panelOrder.forEach((panel, index) =>
    panelNodeIndex.set(panel.panelId, bodyOrder.length + index),
  );
  const pathNodeIndex = new Map<string, number>();
  pathOrder.forEach((path, index) =>
    pathNodeIndex.set(
      path.pathId,
      bodyOrder.length + panelOrder.length + index,
    ),
  );

  const bodyNodes: GltfNode[] = [];
  for (const body of bodyOrder) {
    const transform = body.initialTransform;
    if (
      !finitePoint3(transform.translationMm) ||
      !finiteQuaternion(transform.rotation)
    ) {
      return invalidGeometry(
        prepared,
        "Rigid-body transforms must contain finite millimetre translations and unit quaternions.",
        [body.bodyId],
      );
    }
    const panelChildren = panelOrder
      .filter((panel) => panel.bodyId === body.bodyId)
      .map((panel) => panelNodeIndex.get(panel.panelId))
      .filter((index): index is number => index !== undefined);
    const pathChildren = pathOrder
      .filter((path) => {
        if (path.panelId === null) return body.bodyId === topology.rootBodyId;
        return panelOrder.some(
          (panel) =>
            panel.panelId === path.panelId && panel.bodyId === body.bodyId,
        );
      })
      .map((path) => pathNodeIndex.get(path.pathId))
      .filter((index): index is number => index !== undefined);
    const bodyChildren = topology.childJointIdsByBodyId[body.bodyId]!.map(
      (jointId) =>
        prepared.ir.joints.find((joint) => joint.jointId === jointId),
    ).map((joint) => bodyNodeIndex.get(joint!.childBodyId)!);
    bodyNodes.push({
      name: `body:${body.bodyId}`,
      children: [...bodyChildren, ...panelChildren, ...pathChildren],
      translation: [
        meters(transform.translationMm.xMm),
        meters(transform.translationMm.yMm),
        meters(transform.translationMm.zMm),
      ],
      rotation: [
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
        transform.rotation.w,
      ],
      extras: {
        sourceBodyId: body.bodyId,
        grounded: body.grounded,
      },
    });
  }

  const panelNodes: GltfNode[] = [];
  for (const panel of panelOrder) {
    const mesh = meshIndexByPanelId.get(panel.panelId)!;
    panelNodes.push({
      name: `panel:${panel.panelId}`,
      mesh,
      extras: {
        sourcePanelId: panel.panelId,
        sourceBodyId: panel.bodyId,
        sourceSheetId: panel.sheetId,
        role: panel.role,
      },
    });
  }
  const pathNodes: GltfNode[] = pathOrder.map((path) => ({
    name: `path:${path.pathId}`,
    mesh: meshIndexByPathId.get(path.pathId)!,
    extras: {
      sourcePathId: path.pathId,
      sourcePanelId: path.panelId ?? "",
      sourceSheetId: path.sheetId,
      fabricationPathKind: path.kind,
    },
  }));
  const nodes = [...bodyNodes, ...panelNodes, ...pathNodes];

  const motionSampleCount =
    prepared.ir.driver && prepared.ir.behavior !== "static" ? 11 : 0;
  const motionStates = Array.from({ length: motionSampleCount }, (_, index) => {
    // A populated motion sequence always has the fixed eleven-sample profile.
    const ratio = index / (motionSampleCount - 1);
    const driver = prepared.ir.driver!;
    return {
      ratio,
      state: evaluateMotionState(
        prepared.ir,
        driver.minimumValue +
          ratio * (driver.maximumValue - driver.minimumValue),
      ),
    };
  });
  const invalidState = motionStates.find(({ state }) => !state.ok);
  if (invalidState) {
    return fabricationExportError(
      "invalid_animation",
      prepared.sourceCandidateId,
      "Verified motion could not be reevaluated for deterministic GLB keyframes.",
      [prepared.ir.driver?.driverId ?? prepared.ir.irId],
    );
  }
  const tracks: GlbAnimationTrack[] = bodyOrder.flatMap((body) => {
    if (motionStates.length === 0) return [];
    const parentJointId = topology.parentJointByBodyId[body.bodyId];
    const parentBodyId = parentJointId
      ? prepared.ir.joints.find((joint) => joint.jointId === parentJointId)
          ?.parentBodyId
      : undefined;
    const keyframes = motionStates.flatMap(({ ratio, state }) => {
      if (!state.ok) return [];
      const globalMatrix = state.value.bodyMatrices[body.bodyId];
      if (!globalMatrix) return [];
      const localMatrix = (() => {
        if (!parentBodyId) return globalMatrix;
        const parentMatrix = state.value.bodyMatrices[parentBodyId];
        if (!parentMatrix) return null;
        const inverseParent = inverseRigidMatrix4(parentMatrix);
        return inverseParent
          ? multiplyMatrices4(inverseParent, globalMatrix)
          : null;
      })();
      const components = localMatrix
        ? decomposeRigidMatrix4(localMatrix)
        : null;
      return components
        ? [
            {
              timeSeconds: ratio * 4,
              translationMm: components.translationMm,
              rotation: components.rotation,
            },
          ]
        : [];
    });
    return keyframes.length === motionSampleCount
      ? [
          {
            trackId: `deterministic:${body.bodyId}`,
            targetBodyId: body.bodyId,
            keyframes,
          },
        ]
      : [];
  });
  if (motionSampleCount > 0 && tracks.length !== bodyOrder.length) {
    return fabricationExportError(
      "invalid_animation",
      prepared.sourceCandidateId,
      "Deterministic body transforms could not be decomposed into GLB keyframes.",
      bodyOrder.map((body) => body.bodyId),
    );
  }
  if (new Set(tracks.map((track) => track.trackId)).size !== tracks.length) {
    return fabricationExportError(
      "invalid_animation",
      prepared.sourceCandidateId,
      "Animation track identifiers must be unique.",
      tracks.map((track) => track.trackId),
    );
  }
  const animations: GltfAnimation[] = [];
  for (const track of tracks) {
    const node = bodyNodeIndex.get(track.targetBodyId);
    const frames = track.keyframes;
    const hasTranslations = frames.every(
      (frame) => frame.translationMm !== undefined,
    );
    const hasRotations = frames.every((frame) => frame.rotation !== undefined);
    const mixedTranslations = frames.some(
      (frame) => frame.translationMm !== undefined,
    );
    const mixedRotations = frames.some((frame) => frame.rotation !== undefined);
    const orderedTimes = frames.every(
      (frame, index) =>
        Number.isFinite(frame.timeSeconds) &&
        frame.timeSeconds >= 0 &&
        (index === 0 || frame.timeSeconds > frames[index - 1]!.timeSeconds),
    );
    const validTranslations = frames.every(
      (frame) => !frame.translationMm || finitePoint3(frame.translationMm),
    );
    const validRotations = frames.every(
      (frame) => !frame.rotation || finiteQuaternion(frame.rotation),
    );
    if (
      node === undefined ||
      frames.length < 2 ||
      !orderedTimes ||
      (!hasTranslations && mixedTranslations) ||
      (!hasRotations && mixedRotations) ||
      (!hasTranslations && !hasRotations) ||
      !validTranslations ||
      !validRotations
    ) {
      return fabricationExportError(
        "invalid_animation",
        prepared.sourceCandidateId,
        "Animation tracks require a known body, two ordered frames, and complete finite translation or unit-quaternion samples.",
        [track.trackId, track.targetBodyId],
      );
    }

    const times = frames.map((frame) => frame.timeSeconds);
    const timeAccessor = addAccessor(
      float32Bytes(times),
      5126,
      times.length,
      "SCALAR",
      null,
      [times[0]!],
      [times[times.length - 1]!],
    );
    const samplers: GltfAnimationSampler[] = [];
    const channels: GltfAnimationChannel[] = [];
    if (hasTranslations) {
      const translations = frames.flatMap((frame) => {
        const translation = frame.translationMm!;
        return [
          meters(translation.xMm),
          meters(translation.yMm),
          meters(translation.zMm),
        ];
      });
      const translationAccessor = addAccessor(
        float32Bytes(translations),
        5126,
        frames.length,
        "VEC3",
        null,
      );
      const sampler = samplers.length;
      samplers.push({
        input: timeAccessor,
        output: translationAccessor,
        interpolation: "LINEAR",
      });
      channels.push({
        sampler,
        target: { node, path: "translation" },
      });
    }
    if (hasRotations) {
      const rotations = frames.flatMap((frame) => {
        const rotation = frame.rotation!;
        return [rotation.x, rotation.y, rotation.z, rotation.w];
      });
      const rotationAccessor = addAccessor(
        float32Bytes(rotations),
        5126,
        frames.length,
        "VEC4",
        null,
      );
      const sampler = samplers.length;
      samplers.push({
        input: timeAccessor,
        output: rotationAccessor,
        interpolation: "LINEAR",
      });
      channels.push({ sampler, target: { node, path: "rotation" } });
    }
    animations.push({
      name: `motion:${track.trackId}`,
      samplers,
      channels,
      extras: {
        sourceTrackId: track.trackId,
        targetBodyId: track.targetBodyId,
      },
    });
  }

  const binary = builder.toBytes();
  const fabricationProfile = glbFabricationProfile(prepared.ir);
  const assetExtras = {
    sourceCandidateId: prepared.sourceCandidateId,
    sourceIrId: prepared.ir.irId,
    sourceProgramId: prepared.ir.programId,
    sourceIrHash: prepared.sourceIrHash,
    binaryPayloadSha256: sha256HexBytes(binary),
    hashAlgorithm: "sha256",
    exporterVersion: "1",
    fabricationProfileSha256: sha256Hex(canonicalSerialize(fabricationProfile)),
    fabricationPathCount: prepared.ir.paths.length,
    connectorFeatureCount: prepared.ir.connectors.length,
    motionSampleCount,
    motionSourceSha256: sha256Hex(
      canonicalSerialize({
        driver: prepared.ir.driver,
        joints: prepared.ir.joints,
        couplings: prepared.ir.couplings,
        tracks,
      }),
    ),
    provenance: prepared.provenance ?? null,
  };
  const document = {
    asset: {
      version: "2.0",
      generator: "FoldForge fabrication exporter",
      extras: assetExtras,
    },
    scene: 0,
    scenes: [
      {
        name: `fabrication:${prepared.sourceCandidateId}`,
        nodes: [bodyNodeIndex.get(topology.rootBodyId)!],
      },
    ],
    nodes,
    meshes,
    materials,
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews,
    accessors,
    extras: { fabricationProfile },
    ...(animations.length > 0 ? { animations } : {}),
  };
  const bytes = createGlbBytes(canonicalSerialize(document), binary);
  return fabricationExportOk(
    createBinaryArtifact("glb", "glb", "model/gltf-binary", bytes, prepared),
  );
};

/**
 * Regenerates the complete canonical GLB and compares every byte. This binds
 * panel and path geometry, scene nodes, animation accessors/channels, metadata,
 * and the binary payload to the exact verified source instead of trusting
 * mutable self-declared hashes inside the artifact.
 */
export const glbArtifactMatchesSource = (
  bytes: Uint8Array,
  ir: FabricationIRV1,
  sourceCandidateId: string,
  provenance?: CandidateProvenanceV2,
): boolean => {
  const source: VerifiedFabricationExportSource = {
    ir,
    sourceCandidateId,
    selectionStatus: "selected",
    verification: {
      candidateId: sourceCandidateId,
      irHash: sha256Hex(canonicalSerialize(ir)),
      irId: ir.irId,
      programId: ir.programId,
      valid: true,
    },
    ...(provenance ? { provenance } : {}),
  };
  const expected = exportFabricationGlb(source);
  if (!expected.ok || expected.value.bytes.byteLength !== bytes.byteLength) {
    return false;
  }
  return expected.value.bytes.every((byte, index) => byte === bytes[index]);
};
