import { describe, expect, it } from "vitest";
import { z } from "zod";

import { canonicalSerialize } from "@/core/canonical";
import { compileFabricationProgram } from "@/core/fabrication/compiler";
import {
  createFacetedDuckGiftBoxShowcase,
  createModularCableOrganizerShowcase,
  createPullTabPopUpFlowerShowcase,
} from "@/core/fabrication/examples";
import {
  CALIBRATION_LENGTH_MM,
  dxfArtifactMatchesSource,
  exportFabricationDxf,
  exportFabricationFold,
  exportFabricationGlb,
  exportFabricationJson,
  exportFabricationSvg,
  foldArtifactMatchesSource,
  glbArtifactMatchesSource,
  inspectFabricationFoldCompatibility,
  sourceIrHash,
  type FabricationExportArtifact,
  type FabricationExportResult,
  type FabricationJsonExportSource,
  type VerifiedFabricationExportSource,
} from "@/core/fabrication/export";
import { homeMotionState } from "@/core/fabrication/kinematics";
import {
  decomposeRigidMatrix4,
  inverseRigidMatrix4,
  multiplyMatrices4,
} from "@/core/fabrication/matrix";
import type {
  CandidateProvenanceV2,
  CandidateScoreV2,
  FabricationIRV1,
  FabricationIntentV1,
  FabricationProgramV1,
  FoldJointV1,
  RigidBodyV1,
  SheetV1,
  VerificationReportV2,
} from "@/core/fabrication/types";
import { sha256Hex, sha256HexBytes } from "@/core/sha256";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

const sheetA = {
  sheetId: "sheet-a",
  widthMm: 216,
  heightMm: 279,
  printableMarginMm: 6,
  material: {
    materialId: "card-a",
    label: "Card stock A",
    thicknessMm: 0.3,
    grainDirection: "y",
  },
} as const satisfies SheetV1;

const sheetB = {
  sheetId: "sheet-b",
  widthMm: 297,
  heightMm: 210,
  printableMarginMm: 5,
  material: {
    materialId: "card-b",
    label: "Card stock B",
    thicknessMm: 0.4,
    grainDirection: "x",
  },
} as const satisfies SheetV1;

const identityRotation = { x: 0, y: 0, z: 0, w: 1 } as const;

const bodyA = {
  bodyId: "body-a",
  label: "Body A",
  panelIds: ["panel-a"],
  initialTransform: {
    translationMm: { xMm: 0, yMm: 0, zMm: 0 },
    rotation: identityRotation,
  },
  grounded: true,
  semanticPartIds: [],
} as const satisfies RigidBodyV1;

const bodyB = {
  bodyId: "body-b",
  label: "Body B",
  panelIds: ["panel-b"],
  initialTransform: {
    translationMm: { xMm: 120, yMm: 0, zMm: 10 },
    rotation: identityRotation,
  },
  grounded: false,
  semanticPartIds: [],
} as const satisfies RigidBodyV1;

const foldJoint = {
  jointId: "joint-fold-a",
  kind: "fold",
  parentBodyId: bodyA.bodyId,
  childBodyId: bodyB.bodyId,
  axis: {
    startMm: { xMm: 20, yMm: 40, zMm: 0 },
    endMm: { xMm: 100, yMm: 40, zMm: 0 },
  },
  creasePathId: "score-a",
  foldDirection: "mountain",
  homeAngleDeg: 45,
  minAngleDeg: 0,
  maxAngleDeg: 90,
} as const satisfies FoldJointV1;

const mainIr = {
  version: "1",
  irId: "ir-export-main",
  programId: "program-export-main",
  unit: "mm",
  behavior: "static",
  requestedSize: { widthMm: 200, heightMm: 120, depthMm: null },
  sheets: [sheetA, sheetB],
  paths: [
    {
      pathId: "cut-a",
      sheetId: sheetA.sheetId,
      panelId: "panel-a",
      kind: "cut",
      points: [
        { xMm: 10, yMm: 10 },
        { xMm: 110, yMm: 10 },
        { xMm: 110, yMm: 90 },
        { xMm: 10, yMm: 90 },
      ],
      closed: true,
      strokeWidthMm: 0.25,
    },
    {
      pathId: "score-a",
      sheetId: sheetA.sheetId,
      panelId: "panel-a",
      kind: "score",
      points: [
        { xMm: 20, yMm: 40 },
        { xMm: 100, yMm: 40 },
      ],
      closed: false,
      strokeWidthMm: 0.2,
    },
    {
      pathId: "perforation-b",
      sheetId: sheetB.sheetId,
      panelId: "panel-b",
      kind: "perforation",
      points: [
        { xMm: 20, yMm: 15 },
        { xMm: 140, yMm: 15 },
      ],
      closed: false,
      strokeWidthMm: 0.2,
    },
    {
      pathId: "engrave-b",
      sheetId: sheetB.sheetId,
      panelId: "panel-b",
      kind: "engrave",
      points: [
        { xMm: 20, yMm: 30 },
        { xMm: 100, yMm: 30 },
      ],
      closed: false,
      strokeWidthMm: 0.18,
    },
  ],
  panels: [
    {
      panelId: "panel-a",
      sheetId: sheetA.sheetId,
      bodyId: bodyA.bodyId,
      label: "Panel A",
      role: "structural",
      contour: {
        vertices: [
          { xMm: 0, yMm: 0 },
          { xMm: 100, yMm: 0 },
          { xMm: 100, yMm: 80 },
          { xMm: 0, yMm: 80 },
        ],
      },
      innerCutContours: [],
      thicknessMm: sheetA.material.thicknessMm,
      flatTransform: {
        translationMm: { xMm: 10, yMm: 10 },
        rotationDeg: 0,
      },
      semanticPartIds: [],
    },
    {
      panelId: "panel-b",
      sheetId: sheetB.sheetId,
      bodyId: bodyB.bodyId,
      label: "Panel B",
      role: "output",
      contour: {
        vertices: [
          { xMm: 0, yMm: 0 },
          { xMm: 120, yMm: 0 },
          { xMm: 120, yMm: 60 },
          { xMm: 0, yMm: 60 },
        ],
      },
      innerCutContours: [],
      thicknessMm: sheetB.material.thicknessMm,
      flatTransform: {
        translationMm: { xMm: 20, yMm: 15 },
        rotationDeg: 0,
      },
      semanticPartIds: [],
    },
  ],
  bodies: [bodyA, bodyB],
  joints: [foldJoint],
  connectors: [],
  driver: null,
  outputs: [],
  couplings: [],
  semanticParts: [],
  semanticConstraints: [],
  assemblyOperations: [],
} as const satisfies FabricationIRV1;

const verificationFor = (
  ir: FabricationIRV1,
  candidateId: string,
): VerificationReportV2 => ({
  version: "2",
  reportId: `report-${candidateId}`,
  candidateId,
  programId: ir.programId,
  irId: ir.irId,
  irHash: sourceIrHash(ir),
  valid: true,
  completedStage: "scoring",
  failedAtStage: null,
  checks: [],
  failures: [],
  metrics: [],
  motionSummary: null,
  exportEquivalence: [],
});

const verifiedSourceFor = (
  ir: FabricationIRV1,
  candidateId = "candidate-export-main",
): VerifiedFabricationExportSource => ({
  ir,
  sourceCandidateId: candidateId,
  selectionStatus: "selected",
  verification: verificationFor(ir, candidateId),
});

const intent = {
  version: "1",
  intentId: "intent-export-main",
  sourcePrompt: "Create a two-sheet static fabrication sample.",
  title: "Exporter sample",
  objectLabel: "sample",
  functionalGoal: "Exercise every fabrication path layer.",
  visualDescription: "Two rectangular panels.",
  behavior: "static",
  requestedSize: { widthMm: 200, heightMm: 120, depthMm: null },
  stockOptions: [sheetA, sheetB],
  fabricationBudget: {
    maximumSheets: 2,
    maximumPanels: 4,
    maximumJointAndConnectorCount: 4,
    cutsAllowed: true,
    glueAllowed: false,
  },
  semanticConstraints: [],
  priorities: ["mechanical_simplicity"],
  scopeStatus: "supported",
  clarificationQuestion: null,
  unsupportedReason: null,
} as const satisfies FabricationIntentV1;

const program = {
  version: "1",
  programId: mainIr.programId,
  intentId: intent.intentId,
  candidateLabel: "Exporter sample",
  topologyId: "export-test-topology",
  topologyVersion: 1,
  behavior: "static",
  sheets: [sheetA, sheetB],
  modules: [],
  connections: [],
  blueprint: {
    panels: [
      {
        panelId: "panel-a",
        sheetId: sheetA.sheetId,
        bodyId: bodyA.bodyId,
        label: "Panel A",
        role: "structural",
        widthMm: 100,
        heightMm: 80,
        contour: {
          vertices: [
            { u: 0, v: 0 },
            { u: 1, v: 0 },
            { u: 1, v: 1 },
            { u: 0, v: 1 },
          ],
        },
        innerCutContours: [],
        flatTransform: {
          translationMm: { xMm: 10, yMm: 10 },
          rotationDeg: 0,
        },
        semanticPartIds: [],
      },
      {
        panelId: "panel-b",
        sheetId: sheetB.sheetId,
        bodyId: bodyB.bodyId,
        label: "Panel B",
        role: "output",
        widthMm: 120,
        heightMm: 60,
        contour: {
          vertices: [
            { u: 0, v: 0 },
            { u: 1, v: 0 },
            { u: 1, v: 1 },
            { u: 0, v: 1 },
          ],
        },
        innerCutContours: [],
        flatTransform: {
          translationMm: { xMm: 20, yMm: 15 },
          rotationDeg: 0,
        },
        semanticPartIds: [],
      },
    ],
    bodies: [bodyA, bodyB],
    joints: [foldJoint],
    connectors: [],
    driver: null,
    outputs: [],
    couplings: [],
    semanticParts: [],
    assemblyOperations: [],
  },
  semanticConstraints: [],
  assemblyStrategy: "fold_only",
  designSummary: "A deterministic exporter fixture.",
} as const satisfies FabricationProgramV1;

const score = {
  eligible: true,
  totalScore: 90,
  components: [],
  rankingReason: "Selected for exporter equivalence testing.",
} as const satisfies CandidateScoreV2;

const candidateId = "candidate-export-main";
const verification = verificationFor(mainIr, candidateId);
const provenance = {
  provenanceId: "provenance-export-main",
  compilerVersion: "test-1",
  inputHash: sha256Hex("export-test-input"),
  intentHash: sha256Hex(canonicalSerialize(intent)),
  programHash: sha256Hex(canonicalSerialize(program)),
  irHash: sourceIrHash(mainIr),
  modelId: null,
  modelResponseId: null,
  generatedAtIso: "2026-07-14T12:00:00.000Z",
  deterministicSeed: 20260714,
  parentCandidateId: null,
  appliedPatchIds: [],
  repairCycle: 0,
} as const satisfies CandidateProvenanceV2;

const mainSource = {
  ir: mainIr,
  sourceCandidateId: candidateId,
  selectionStatus: "selected",
  verification,
  provenance,
} as const satisfies VerifiedFabricationExportSource;

const jsonSource = {
  ...mainSource,
  intent,
  program,
  score,
} as const satisfies FabricationJsonExportSource;

const foldBodyB = {
  ...bodyB,
  panelIds: ["panel-fold-b"],
  initialTransform: {
    translationMm: { xMm: 80, yMm: 0, zMm: 0 },
    rotation: identityRotation,
  },
} as const satisfies RigidBodyV1;

const foldIr = {
  ...mainIr,
  irId: "ir-fold-representable",
  programId: "program-fold-representable",
  sheets: [sheetA],
  paths: [mainIr.paths[0], mainIr.paths[1]],
  panels: [
    mainIr.panels[0],
    {
      ...mainIr.panels[1],
      panelId: "panel-fold-b",
      sheetId: sheetA.sheetId,
      bodyId: foldBodyB.bodyId,
      thicknessMm: sheetA.material.thicknessMm,
    },
  ],
  bodies: [bodyA, foldBodyB],
  joints: [
    {
      ...foldJoint,
      childBodyId: foldBodyB.bodyId,
    },
  ],
} as const satisfies FabricationIRV1;

const artifactFrom = (
  result: FabricationExportResult<FabricationExportArtifact>,
): FabricationExportArtifact => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const textFrom = (artifact: FabricationExportArtifact): string => {
  if (artifact.text === undefined) throw new Error("Expected a text artifact.");
  return artifact.text;
};

interface DxfPair {
  readonly code: number;
  readonly value: string;
}

const parseDxf = (text: string): readonly DxfPair[] => {
  const lines = text.trimEnd().split("\n");
  if (lines.length % 2 !== 0) throw new Error("DXF group pairs are uneven.");
  const pairs: DxfPair[] = [];
  for (let index = 0; index < lines.length; index += 2) {
    const code = Number(lines[index]);
    const value = lines[index + 1];
    if (!Number.isSafeInteger(code) || value === undefined) {
      throw new Error("DXF group pair is invalid.");
    }
    pairs.push({ code, value });
  }
  return pairs;
};

const entityAfterComment = (
  pairs: readonly DxfPair[],
  comment: string,
): readonly DxfPair[] => {
  const commentIndex = pairs.findIndex(
    (entry) => entry.code === 999 && entry.value === comment,
  );
  const entityStart = pairs.findIndex(
    (entry, index) => index > commentIndex && entry.code === 0,
  );
  const entityEnd = pairs.findIndex(
    (entry, index) => index > entityStart && entry.code === 0,
  );
  if (commentIndex < 0 || entityStart < 0) return [];
  return pairs.slice(entityStart, entityEnd < 0 ? pairs.length : entityEnd);
};

const GltfSchema = z
  .object({
    asset: z.object({
      version: z.literal("2.0"),
      generator: z.string(),
      extras: z.object({
        sourceCandidateId: z.string(),
        sourceIrHash: z.string().length(64),
        binaryPayloadSha256: z.string().length(64),
        fabricationPathCount: z.number().int().nonnegative(),
        connectorFeatureCount: z.number().int().nonnegative(),
        motionSampleCount: z.number().int().nonnegative(),
      }),
    }),
    buffers: z.array(z.object({ byteLength: z.number().int().nonnegative() })),
    scenes: z.array(
      z.object({ nodes: z.array(z.number().int().nonnegative()) }),
    ),
    bufferViews: z.array(
      z.object({
        buffer: z.literal(0),
        byteOffset: z.number().int().nonnegative(),
        byteLength: z.number().int().nonnegative(),
        target: z.union([z.literal(34962), z.literal(34963)]).optional(),
      }),
    ),
    accessors: z.array(
      z.object({
        bufferView: z.number().int().nonnegative(),
        componentType: z.union([z.literal(5123), z.literal(5126)]),
        count: z.number().int().positive(),
        type: z.enum(["SCALAR", "VEC3", "VEC4"]),
      }),
    ),
    nodes: z.array(
      z.object({
        name: z.string(),
        mesh: z.number().int().nonnegative().optional(),
        children: z.array(z.number().int().nonnegative()).optional(),
        translation: z.array(z.number()).length(3).optional(),
        rotation: z.array(z.number()).length(4).optional(),
      }),
    ),
    meshes: z.array(
      z.object({
        name: z.string(),
        primitives: z.array(
          z.object({
            attributes: z.object({ POSITION: z.number().int().nonnegative() }),
            indices: z.number().int().nonnegative(),
            material: z.number().int().nonnegative(),
            mode: z.union([z.literal(1), z.literal(4)]),
          }),
        ),
        extras: z
          .object({ sourcePathId: z.string().optional() })
          .passthrough()
          .optional(),
      }),
    ),
    materials: z.array(z.object({ name: z.string() })),
    animations: z
      .array(
        z.object({
          name: z.string(),
          samplers: z.array(
            z.object({
              input: z.number().int().nonnegative(),
              output: z.number().int().nonnegative(),
              interpolation: z.literal("LINEAR"),
            }),
          ),
          channels: z.array(
            z.object({
              sampler: z.number().int().nonnegative(),
              target: z.object({
                node: z.number().int().nonnegative(),
                path: z.enum(["translation", "rotation"]),
              }),
            }),
          ),
          extras: z.object({
            sourceDriverId: z.string(),
            sourceTrackIds: z.string(),
            behavior: z.string(),
          }),
        }),
      )
      .optional(),
    extras: z.object({ fabricationProfile: z.unknown() }),
  })
  .passthrough();

const parseGlb = (
  bytes: Uint8Array,
): {
  readonly json: z.infer<typeof GltfSchema>;
  readonly binary: Uint8Array;
} => {
  const copy = Uint8Array.from(bytes);
  const view = new DataView(copy.buffer);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  expect(view.getUint32(4, true)).toBe(2);
  expect(view.getUint32(8, true)).toBe(copy.byteLength);
  const jsonLength = view.getUint32(12, true);
  expect(view.getUint32(16, true)).toBe(0x4e4f534a);
  const jsonText = new TextDecoder()
    .decode(copy.slice(20, 20 + jsonLength))
    .trimEnd();
  const parsedJson: unknown = JSON.parse(jsonText);
  const binaryHeader = 20 + jsonLength;
  const binaryLength = view.getUint32(binaryHeader, true);
  expect(view.getUint32(binaryHeader + 4, true)).toBe(0x004e4942);
  return {
    json: GltfSchema.parse(parsedJson),
    binary: copy.slice(binaryHeader + 8, binaryHeader + 8 + binaryLength),
  };
};

const floatAccessorValues = (
  parsed: ReturnType<typeof parseGlb>,
  accessorIndex: number,
): readonly number[] => {
  const accessor = parsed.json.accessors[accessorIndex];
  if (!accessor || accessor.componentType !== 5126) {
    throw new Error("Expected a float GLB accessor.");
  }
  const componentCount = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
  const bufferView = parsed.json.bufferViews[accessor.bufferView];
  if (!bufferView) throw new Error("GLB accessor buffer view is missing.");
  const view = new DataView(
    parsed.binary.buffer,
    parsed.binary.byteOffset + bufferView.byteOffset,
    bufferView.byteLength,
  );
  return Array.from({ length: accessor.count * componentCount }, (_, index) =>
    view.getFloat32(index * 4, true),
  );
};

const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected a GLB JSON record.");
  }
  return value as Record<string, unknown>;
};

const rebuildGlbWithJson = (
  bytes: Uint8Array,
  document: unknown,
): Uint8Array => {
  const source = Uint8Array.from(bytes);
  const sourceView = new DataView(source.buffer);
  const sourceJsonLength = sourceView.getUint32(12, true);
  const sourceBinaryHeader = 20 + sourceJsonLength;
  const sourceBinaryLength = sourceView.getUint32(sourceBinaryHeader, true);
  const binary = source.slice(
    sourceBinaryHeader + 8,
    sourceBinaryHeader + 8 + sourceBinaryLength,
  );
  const encodedJson = new TextEncoder().encode(JSON.stringify(document));
  const jsonPadding = (4 - (encodedJson.byteLength % 4)) % 4;
  const paddedJson = new Uint8Array(encodedJson.byteLength + jsonPadding);
  paddedJson.set(encodedJson);
  paddedJson.fill(0x20, encodedJson.byteLength);
  const binaryPadding = (4 - (binary.byteLength % 4)) % 4;
  const paddedBinary = new Uint8Array(binary.byteLength + binaryPadding);
  paddedBinary.set(binary);
  const totalLength = 12 + 8 + paddedJson.byteLength + 8 + paddedBinary.length;
  const rebuilt = new Uint8Array(totalLength);
  const view = new DataView(rebuilt.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, paddedJson.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  rebuilt.set(paddedJson, 20);
  const binaryHeader = 20 + paddedJson.byteLength;
  view.setUint32(binaryHeader, paddedBinary.byteLength, true);
  view.setUint32(binaryHeader + 4, 0x004e4942, true);
  rebuilt.set(paddedBinary, binaryHeader + 8);
  return rebuilt;
};

const mutateGlbJson = (
  bytes: Uint8Array,
  mutate: (document: Record<string, unknown>) => void,
): Uint8Array => {
  const source = Uint8Array.from(bytes);
  const view = new DataView(source.buffer);
  const jsonLength = view.getUint32(12, true);
  const parsed: unknown = JSON.parse(
    new TextDecoder().decode(source.slice(20, 20 + jsonLength)).trim(),
  );
  const document = record(parsed);
  mutate(document);
  return rebuildGlbWithJson(source, document);
};

describe("fabrication exporters", () => {
  it("emits byte-stable print-scale SVG with exact layers and source hash", () => {
    const first = artifactFrom(exportFabricationSvg(mainSource));
    const second = artifactFrom(exportFabricationSvg(mainSource));
    const text = textFrom(first);

    expect(first.bytes).toEqual(second.bytes);
    expect(first.metadata.sha256).toBe(sha256HexBytes(first.bytes));
    expect(first.metadata.sourceIrHash).toBe(sourceIrHash(mainIr));
    expect(first.metadata.sourceCandidateId).toBe(candidateId);
    expect(text).toContain('width="297mm" height="515mm"');
    expect(text).toContain('viewBox="0 0 297 515"');
    expect(text).toContain(`data-source-ir-sha256="${sourceIrHash(mainIr)}"`);
    for (const layer of ["CUT", "SCORE", "PERFORATION", "ENGRAVE"]) {
      expect(text).toContain(`<g id="${layer}" data-layer="${layer}">`);
    }
    expect(text).toContain('id="cut-a"');
    expect(text).toContain('d="M 10 10 L 110 10 L 110 90 L 10 90 Z"');
    expect(text).toContain('d="M 20 306 L 140 306"');
    expect(text).toContain("Sheet 1: sheet-a");
    expect(text).toContain("Sheet 2: sheet-b");
    const calibration = text.match(
      /id="calibration-50mm"[^>]*x1="([\d.]+)"[^>]*x2="([\d.]+)"/,
    );
    expect(Number(calibration?.[2]) - Number(calibration?.[1])).toBe(
      CALIBRATION_LENGTH_MM,
    );
  });

  it("emits parseable ASCII DXF with millimetre units and equivalent paths", () => {
    const first = artifactFrom(exportFabricationDxf(mainSource));
    const second = artifactFrom(exportFabricationDxf(mainSource));
    const text = textFrom(first);
    const pairs = parseDxf(text);

    expect(first.bytes).toEqual(second.bytes);
    expect([...text].every((character) => character.charCodeAt(0) < 128)).toBe(
      true,
    );
    const unitsIndex = pairs.findIndex(
      (entry) => entry.code === 9 && entry.value === "$INSUNITS",
    );
    expect(pairs[unitsIndex + 1]).toEqual({ code: 70, value: "4" });
    expect(
      pairs.some(
        (entry) =>
          entry.code === 999 &&
          entry.value === `source-ir-sha256:${sourceIrHash(mainIr)}`,
      ),
    ).toBe(true);
    for (const layer of ["CUT", "SCORE", "PERFORATION", "ENGRAVE"]) {
      expect(
        pairs.some((entry) => entry.code === 2 && entry.value === layer),
      ).toBe(true);
    }
    const perforation = entityAfterComment(pairs, "source-path:perforation-b");
    expect(
      perforation.some(
        (entry) => entry.code === 8 && entry.value === "PERFORATION",
      ),
    ).toBe(true);
    expect(
      perforation
        .filter((entry) => entry.code === 10)
        .map((entry) => entry.value),
    ).toEqual(["20", "140"]);
    expect(
      perforation
        .filter((entry) => entry.code === 20)
        .map((entry) => entry.value),
    ).toEqual(["306", "306"]);
    const calibration = entityAfterComment(pairs, "generated:calibration-50mm");
    const startX = Number(
      calibration.find((entry) => entry.code === 10)?.value,
    );
    const endX = Number(calibration.find((entry) => entry.code === 11)?.value);
    expect(endX - startX).toBe(CALIBRATION_LENGTH_MM);
    expect(first.metadata.sha256).toBe(sha256HexBytes(first.bytes));
    expect(
      dxfArtifactMatchesSource(first.bytes, mainIr, candidateId, provenance),
    ).toBe(true);
    const corrupted = Uint8Array.from(first.bytes);
    const cutLayerOffset = text.indexOf("CUT");
    expect(cutLayerOffset).toBeGreaterThanOrEqual(0);
    corrupted[cutLayerOffset] = "X".charCodeAt(0);
    expect(
      dxfArtifactMatchesSource(corrupted, mainIr, candidateId, provenance),
    ).toBe(false);
  });

  it("emits canonical fabrication JSON and rejects a mismatched verification hash", () => {
    const first = artifactFrom(exportFabricationJson(jsonSource));
    const second = artifactFrom(exportFabricationJson(jsonSource));
    const text = textFrom(first);
    const parsed: unknown = JSON.parse(text);

    expect(first.bytes).toEqual(second.bytes);
    expect(text).toBe(`${canonicalSerialize(parsed)}\n`);
    expect(parsed).toHaveProperty("format", "foldforge.fabrication");
    expect(parsed).toHaveProperty("sourceCandidateId", candidateId);
    expect(parsed).toHaveProperty("sourceIrHash", sourceIrHash(mainIr));
    expect(parsed).toHaveProperty("hashes.ir", sourceIrHash(mainIr));
    expect(parsed).toHaveProperty("payload.ir.irId", mainIr.irId);
    expect(parsed).toHaveProperty("payload.verification.valid", true);
    expect(first.metadata.fileName).toBe(
      "candidate-export-main.fabrication.json",
    );
    expect(first.metadata.sha256).toBe(sha256HexBytes(first.bytes));

    const mismatched = exportFabricationJson({
      ...jsonSource,
      verification: { ...verification, irHash: "0".repeat(64) },
    });
    expect(mismatched.ok).toBe(false);
    if (!mismatched.ok) expect(mismatched.error.code).toBe("invalid_source");
  });

  it("emits a valid source-bound GLB with triangulated metre meshes and path primitives", () => {
    const first = artifactFrom(exportFabricationGlb(mainSource));
    const second = artifactFrom(exportFabricationGlb(mainSource));
    const parsed = parseGlb(first.bytes);
    const gltf = parsed.json;

    expect(first.bytes).toEqual(second.bytes);
    expect(first.metadata.sha256).toBe(sha256HexBytes(first.bytes));
    expect(
      glbArtifactMatchesSource(first.bytes, mainIr, candidateId, provenance),
    ).toBe(true);
    expect(gltf.asset.extras.sourceCandidateId).toBe(candidateId);
    expect(gltf.asset.extras.sourceIrHash).toBe(sourceIrHash(mainIr));
    expect(gltf.asset.extras.binaryPayloadSha256).toBe(
      sha256HexBytes(parsed.binary.slice(0, gltf.buffers[0]?.byteLength)),
    );
    expect(gltf.nodes.map((node) => node.name)).toEqual(
      expect.arrayContaining([
        "body:body-a",
        "body:body-b",
        "panel:panel-a",
        "panel:panel-b",
      ]),
    );
    const bodyANodeIndex = gltf.nodes.findIndex(
      (node) => node.name === "body:body-a",
    );
    const bodyBNodeIndex = gltf.nodes.findIndex(
      (node) => node.name === "body:body-b",
    );
    const panelANodeIndex = gltf.nodes.findIndex(
      (node) => node.name === "panel:panel-a",
    );
    expect(gltf.scenes[0]?.nodes).toEqual([bodyANodeIndex]);
    expect(gltf.nodes[bodyANodeIndex]?.children).toEqual(
      expect.arrayContaining([bodyBNodeIndex, panelANodeIndex]),
    );
    const home = homeMotionState(mainIr);
    if (!home.ok) throw new Error(JSON.stringify(home.error));
    const parentMatrix = home.value.bodyMatrices[bodyA.bodyId];
    const childMatrix = home.value.bodyMatrices[bodyB.bodyId];
    if (!parentMatrix || !childMatrix) {
      throw new Error("Static GLB home transforms are missing.");
    }
    const inverseParent = inverseRigidMatrix4(parentMatrix);
    if (!inverseParent) throw new Error("Static GLB parent is not invertible.");
    const expectedLocal = decomposeRigidMatrix4(
      multiplyMatrices4(inverseParent, childMatrix),
    );
    if (!expectedLocal) throw new Error("Static GLB local pose is invalid.");
    expect(gltf.nodes[bodyBNodeIndex]?.translation).toEqual(
      [
        expectedLocal.translationMm.xMm,
        expectedLocal.translationMm.yMm,
        expectedLocal.translationMm.zMm,
      ].map((value) => value / 1_000),
    );
    expect(gltf.nodes[bodyBNodeIndex]?.rotation).toEqual([
      expectedLocal.rotation.x,
      expectedLocal.rotation.y,
      expectedLocal.rotation.z,
      expectedLocal.rotation.w,
    ]);
    expect(
      gltf.materials.some(
        (material) => material.name === "fabrication-path:cut",
      ),
    ).toBe(true);
    const mesh = gltf.meshes.find(
      (candidate) => candidate.name === "panel-mesh:panel-a",
    );
    if (!mesh) throw new Error("Panel A mesh is missing.");
    const positionAccessor =
      gltf.accessors[mesh.primitives[0]?.attributes.POSITION ?? -1];
    if (!positionAccessor) throw new Error("Position accessor is missing.");
    const positionView = gltf.bufferViews[positionAccessor.bufferView];
    if (!positionView) throw new Error("Position buffer view is missing.");
    const binaryView = new DataView(
      parsed.binary.buffer,
      parsed.binary.byteOffset + positionView.byteOffset,
      positionView.byteLength,
    );
    expect(binaryView.getFloat32(0, true)).toBeCloseTo(0.01, 7);
    expect(binaryView.getFloat32(4, true)).toBeCloseTo(0.01, 7);
    expect(binaryView.getFloat32(12, true)).toBeCloseTo(0.11, 7);
    expect(positionAccessor.count).toBe(4);
    expect(mesh.primitives[0]?.mode).toBe(4);
    const pathMesh = gltf.meshes.find(
      (candidate) => candidate.extras?.sourcePathId === "cut-a",
    );
    expect(pathMesh?.primitives[0]?.mode).toBe(1);
    expect(gltf.animations).toBeUndefined();
    expect(gltf.extras.fabricationProfile).toHaveProperty(
      "paths.0.pathId",
      "cut-a",
    );

    const corruptedBinary = Uint8Array.from(first.bytes);
    const corruptedView = new DataView(corruptedBinary.buffer);
    const jsonLength = corruptedView.getUint32(12, true);
    const binaryStart = 20 + jsonLength + 8;
    corruptedBinary[binaryStart] = corruptedBinary[binaryStart]! ^ 1;
    expect(
      glbArtifactMatchesSource(
        corruptedBinary,
        mainIr,
        candidateId,
        provenance,
      ),
    ).toBe(false);
  });

  it("derives bounded GLB animation from verified IR and rejects unrelated bytes", () => {
    const compiled = compileFabricationProgram(
      fixtureIntent(),
      fixtureProgram(),
    );
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
    const dynamicCandidateId = "candidate-deterministic-motion";
    const source = verifiedSourceFor(compiled.value, dynamicCandidateId);
    const artifact = artifactFrom(exportFabricationGlb(source));
    const gltf = parseGlb(artifact.bytes).json;

    expect(gltf.asset.extras.motionSampleCount).toBe(11);
    expect(gltf.animations).toHaveLength(1);
    expect(gltf.animations?.[0]?.name).toBe("FoldForge Open Close");
    expect(gltf.animations?.[0]?.extras.sourceDriverId).toBe(
      compiled.value.driver?.driverId,
    );
    expect(gltf.animations?.[0]?.channels).toHaveLength(
      compiled.value.bodies.length * 2,
    );
    expect(
      new Set(
        gltf.animations?.[0]?.channels.map((channel) => channel.target.node),
      ).size,
    ).toBe(compiled.value.bodies.length);
    expect(
      ["translation", "rotation"].every((path) =>
        gltf.animations?.[0]?.channels.some(
          (channel) => channel.target.path === path,
        ),
      ),
    ).toBe(true);
    expect(
      glbArtifactMatchesSource(
        artifact.bytes,
        compiled.value,
        dynamicCandidateId,
      ),
    ).toBe(true);
    const corrupted = Uint8Array.from(artifact.bytes);
    corrupted[0] = 0;
    expect(
      glbArtifactMatchesSource(corrupted, compiled.value, dynamicCandidateId),
    ).toBe(false);
  });

  it("round-trips one externally playable clip with exact flower travel", () => {
    const showcase = createPullTabPopUpFlowerShowcase();
    const compiled = compileFabricationProgram(
      showcase.intent,
      showcase.program,
    );
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
    const sourceCandidateId = "candidate-flower-glb-round-trip";
    const artifact = artifactFrom(
      exportFabricationGlb(
        verifiedSourceFor(compiled.value, sourceCandidateId),
      ),
    );
    const parsed = parseGlb(artifact.bytes);
    const animation = parsed.json.animations?.[0];
    const crownNode = parsed.json.nodes.findIndex(
      (node) => node.name === "body:body-flower-crown",
    );
    expect(parsed.json.nodes[crownNode]?.translation?.[2]).toBeCloseTo(
      0.0015,
      7,
    );
    const translationChannel = animation?.channels.find(
      (channel) =>
        channel.target.node === crownNode &&
        channel.target.path === "translation",
    );
    const sampler = animation?.samplers[translationChannel?.sampler ?? -1];
    if (!animation || !sampler) {
      throw new Error("Flower GLB translation animation is missing.");
    }
    const times = floatAccessorValues(parsed, sampler.input);
    const translations = floatAccessorValues(parsed, sampler.output);

    expect(animation.name).toBe("FoldForge Open Close");
    expect(times).toHaveLength(11);
    expect(times[0]).toBeCloseTo(0, 7);
    expect(times[5]).toBeCloseTo(2, 7);
    expect(times[10]).toBeCloseTo(4, 7);
    expect(translations).toHaveLength(33);
    expect(translations[2]).toBeCloseTo(0.0015, 7);
    expect(translations[17]).toBeCloseTo(0.0165, 7);
    expect(translations[32]).toBeCloseTo(0.0315, 7);
    expect(translations[32]! - translations[2]!).toBeCloseTo(0.03, 7);
    expect(
      glbArtifactMatchesSource(
        artifact.bytes,
        compiled.value,
        sourceCandidateId,
      ),
    ).toBe(true);
  });

  it("rejects malformed GLB containers and JSON roots", () => {
    const artifact = artifactFrom(exportFabricationGlb(mainSource));
    expect(
      glbArtifactMatchesSource(
        new Uint8Array(19),
        mainIr,
        candidateId,
        provenance,
      ),
    ).toBe(false);
    expect(
      glbArtifactMatchesSource(artifact.bytes, mainIr, candidateId, {
        ...provenance,
        irHash: "0".repeat(64),
      }),
    ).toBe(false);

    for (const [offset, value] of [
      [0, 0],
      [4, 1],
      [8, artifact.bytes.byteLength - 1],
      [16, 0],
    ] as const) {
      const corrupted = Uint8Array.from(artifact.bytes);
      new DataView(corrupted.buffer).setUint32(offset, value, true);
      expect(
        glbArtifactMatchesSource(corrupted, mainIr, candidateId, provenance),
      ).toBe(false);
    }

    for (const jsonLength of [0, artifact.bytes.byteLength] as const) {
      const corrupted = Uint8Array.from(artifact.bytes);
      new DataView(corrupted.buffer).setUint32(12, jsonLength, true);
      expect(
        glbArtifactMatchesSource(corrupted, mainIr, candidateId, provenance),
      ).toBe(false);
    }

    const invalidJson = Uint8Array.from(artifact.bytes);
    invalidJson.fill(0x78, 20, 24);
    expect(
      glbArtifactMatchesSource(invalidJson, mainIr, candidateId, provenance),
    ).toBe(false);
    expect(
      glbArtifactMatchesSource(
        rebuildGlbWithJson(artifact.bytes, []),
        mainIr,
        candidateId,
        provenance,
      ),
    ).toBe(false);
  });

  it("rejects every mismatched embedded GLB source binding", () => {
    const artifact = artifactFrom(exportFabricationGlb(mainSource));
    const mutations: Array<(document: Record<string, unknown>) => void> = [
      (document) => {
        delete document.asset;
      },
      (document) => {
        delete record(document.asset).extras;
      },
      (document) => {
        record(record(document.asset).extras).sourceCandidateId = "other";
      },
      (document) => {
        record(record(document.asset).extras).sourceIrHash = "0".repeat(64);
      },
      (document) => {
        record(record(document.asset).extras).fabricationProfileSha256 =
          "0".repeat(64);
      },
      (document) => {
        record(record(document.asset).extras).fabricationPathCount = 0;
      },
      (document) => {
        record(record(document.asset).extras).connectorFeatureCount = 1;
      },
      (document) => {
        record(document.extras).fabricationProfile = null;
      },
      (document) => {
        delete document.meshes;
      },
      (document) => {
        document.meshes = [null];
      },
      (document) => {
        const meshes = document.meshes as unknown[];
        const pathMesh = meshes.find(
          (meshValue) =>
            typeof record(record(meshValue).extras).sourcePathId === "string",
        );
        delete record(pathMesh).primitives;
      },
      (document) => {
        const meshes = document.meshes as unknown[];
        for (const meshValue of meshes) {
          const mesh = record(meshValue);
          const primitives = Array.isArray(mesh.primitives)
            ? mesh.primitives
            : [];
          for (const primitiveValue of primitives) {
            record(primitiveValue).mode = 4;
          }
        }
      },
      (document) => {
        const meshes = document.meshes as unknown[];
        meshes.push({
          extras: { sourcePathId: "unknown-path" },
          primitives: [{ mode: 1 }],
        });
      },
      (document) => {
        const meshes = document.meshes as unknown[];
        const panelMesh = meshes.find(
          (meshValue) =>
            typeof record(record(meshValue).extras).sourcePanelId ===
              "string" &&
            typeof record(record(meshValue).extras).sourcePathId !== "string",
        );
        delete record(panelMesh).extras;
      },
      (document) => {
        const meshes = document.meshes as unknown[];
        const panelMesh = meshes.find(
          (meshValue) =>
            typeof record(record(meshValue).extras).sourcePanelId ===
              "string" &&
            typeof record(record(meshValue).extras).sourcePathId !== "string",
        );
        const primitive = (record(panelMesh).primitives as unknown[])[0];
        record(primitive).mode = 1;
      },
      (document) => {
        const meshes = document.meshes as unknown[];
        const panelMesh = meshes.find(
          (meshValue) =>
            typeof record(record(meshValue).extras).sourcePanelId ===
              "string" &&
            typeof record(record(meshValue).extras).sourcePathId !== "string",
        );
        const primitive = record(
          (record(panelMesh).primitives as unknown[])[0],
        );
        const positionAccessorIndex = record(primitive.attributes).POSITION;
        const accessors = document.accessors as unknown[];
        record(accessors[positionAccessorIndex as number]).componentType = 5123;
      },
      (document) => {
        const bufferViews = document.bufferViews as unknown[];
        record(bufferViews[0]).byteOffset = -1;
      },
      (document) => {
        const nodes = document.nodes as unknown[];
        const pathNode = nodes.find(
          (nodeValue) =>
            typeof record(record(nodeValue).extras).sourcePathId === "string",
        );
        record(pathNode).mesh = 0;
      },
    ];
    for (const mutation of mutations) {
      expect(
        glbArtifactMatchesSource(
          mutateGlbJson(artifact.bytes, mutation),
          mainIr,
          candidateId,
          provenance,
        ),
      ).toBe(false);
    }
  });

  it("rejects incomplete or mismatched GLB motion bindings", () => {
    const compiled = compileFabricationProgram(
      fixtureIntent(),
      fixtureProgram(),
    );
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
    const dynamicCandidateId = "candidate-motion-binding";
    const artifact = artifactFrom(
      exportFabricationGlb(
        verifiedSourceFor(compiled.value, dynamicCandidateId),
      ),
    );
    const mutations: Array<(document: Record<string, unknown>) => void> = [
      (document) => {
        record(record(document.asset).extras).motionSampleCount = 0;
      },
      (document) => {
        delete document.animations;
      },
      (document) => {
        document.animations = [{}];
      },
      (document) => {
        const animations = document.animations as unknown[];
        record(record(animations[0]).extras).sourceDriverId = "wrong-driver";
      },
      (document) => {
        const animations = document.animations as unknown[];
        const channels = record(animations[0]).channels as unknown[];
        record(record(channels[0]).target).node = 9_999;
      },
      (document) => {
        const animations = document.animations as unknown[];
        const samplers = record(animations[0]).samplers as unknown[];
        record(samplers[0]).output = 9_999;
      },
    ];
    for (const mutation of mutations) {
      expect(
        glbArtifactMatchesSource(
          mutateGlbJson(artifact.bytes, mutation),
          compiled.value,
          dynamicCandidateId,
        ),
      ).toBe(false);
    }
  });

  it("embeds connector definitions and their fabrication cuts in the GLB profile", () => {
    const showcase = createModularCableOrganizerShowcase();
    const compiled = compileFabricationProgram(
      showcase.intent,
      showcase.program,
    );
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
    const connectorCandidateId = "candidate-connector-profile";
    const artifact = artifactFrom(
      exportFabricationGlb(
        verifiedSourceFor(compiled.value, connectorCandidateId),
      ),
    );
    const gltf = parseGlb(artifact.bytes).json;
    expect(gltf.asset.extras.connectorFeatureCount).toBe(2);
    expect(gltf.extras.fabricationProfile).toHaveProperty(
      "connectors.0.connectorId",
      "connector-organizer-tab",
    );
    expect(gltf.extras.fabricationProfile).toHaveProperty(
      "connectors.1.connectorId",
      "connector-organizer-slot",
    );
    expect(
      gltf.meshes.some(
        (mesh) =>
          mesh.extras?.sourcePathId === "connector-organizer-slot.cut" &&
          mesh.primitives[0]?.mode === 1,
      ),
    ).toBe(true);
    const panelMesh = gltf.meshes.find(
      (mesh) => mesh.name === "panel-mesh:panel-organizer-module",
    );
    const panelPrimitive = panelMesh?.primitives[0];
    expect(
      gltf.accessors[panelPrimitive?.attributes.POSITION ?? -1]?.count,
    ).toBe(24);
    expect(gltf.accessors[panelPrimitive?.indices ?? -1]?.count).toBe(78);
    expect(
      glbArtifactMatchesSource(
        artifact.bytes,
        compiled.value,
        connectorCandidateId,
      ),
    ).toBe(true);
  });

  it("exports source-equivalent GLB meshes without filling panel holes", () => {
    const holeIr = {
      ...mainIr,
      irId: "ir-with-hole",
      panels: mainIr.panels.map((panel, index) =>
        index === 0
          ? {
              ...panel,
              innerCutContours: [
                {
                  vertices: [
                    { xMm: 10, yMm: 10 },
                    { xMm: 20, yMm: 10 },
                    { xMm: 15, yMm: 20 },
                  ],
                },
              ],
            }
          : panel,
      ),
    } satisfies FabricationIRV1;
    const artifact = artifactFrom(
      exportFabricationGlb(verifiedSourceFor(holeIr, "candidate-with-hole")),
    );
    const gltf = parseGlb(artifact.bytes).json;
    const mesh = gltf.meshes.find(
      (candidate) => candidate.name === "panel-mesh:panel-a",
    );
    if (!mesh) throw new Error("Panel A mesh is missing.");
    const primitive = mesh.primitives[0];
    if (!primitive) throw new Error("Panel A primitive is missing.");
    expect(gltf.accessors[primitive.attributes.POSITION]?.count).toBe(7);
    expect(gltf.accessors[primitive.indices]?.count).toBe(21);
  });

  it("generates FOLD only for a lossless all-fold single-sheet profile", () => {
    const source = verifiedSourceFor(foldIr, "candidate-fold");
    expect(
      inspectFabricationFoldCompatibility({
        ir: source.ir,
        sourceCandidateId: source.sourceCandidateId,
        sourceIrHash: source.verification.irHash,
      }),
    ).toMatchObject({ status: "available" });
    const first = exportFabricationFold(source);
    const second = exportFabricationFold(source);
    expect(first.status).toBe("generated");
    expect(second.status).toBe("generated");
    if (first.status !== "generated" || second.status !== "generated") return;
    const firstText = textFrom(first.artifact);
    const parsedSchema = z
      .object({
        file_spec: z.literal(1.2),
        frame_unit: z.literal("mm"),
        file_description: z.string(),
        foldforge_sourceIrHash: z.string().length(64),
        foldforge_payloadSha256: z.string().length(64),
        vertices_coords: z.array(z.tuple([z.number(), z.number()])),
        edges_vertices: z.array(z.tuple([z.number().int(), z.number().int()])),
        edges_assignment: z.array(z.enum(["C", "M", "V"])),
        edges_foldAngle: z.array(z.number()),
        edges_foldforgePathId: z.array(z.string()),
      })
      .parse(JSON.parse(firstText) as unknown);

    expect(first.artifact.bytes).toEqual(second.artifact.bytes);
    expect(parsedSchema.foldforge_sourceIrHash).toBe(sourceIrHash(foldIr));
    expect(parsedSchema.file_description).toContain(sourceIrHash(foldIr));
    expect(parsedSchema.edges_vertices).toHaveLength(5);
    expect(parsedSchema.edges_assignment).toEqual(["C", "C", "C", "C", "M"]);
    expect(parsedSchema.edges_foldAngle.at(-1)).toBe(-45);
    expect(parsedSchema.edges_vertices.length).toBe(
      parsedSchema.edges_assignment.length,
    );
    expect(parsedSchema.edges_vertices.length).toBe(
      parsedSchema.edges_foldAngle.length,
    );
    expect(first.artifact.metadata.sha256).toBe(
      sha256HexBytes(first.artifact.bytes),
    );
    expect(
      foldArtifactMatchesSource(first.artifact.bytes, foldIr, "candidate-fold"),
    ).toBe(true);
    const corrupted = Uint8Array.from(first.artifact.bytes);
    corrupted[corrupted.byteLength - 2] = " ".charCodeAt(0);
    expect(foldArtifactMatchesSource(corrupted, foldIr, "candidate-fold")).toBe(
      false,
    );

    const omitted = exportFabricationFold(mainSource);
    expect(omitted.status).toBe("omitted");
    if (omitted.status === "omitted") {
      expect(omitted.reason.code).toBe("multiple_sheets");
      expect(omitted.reason.sourceIrHash).toBe(sourceIrHash(mainIr));
    }
  });

  it("emits a shared hinge once as a fold and never as a cut", () => {
    const compiled = compileFabricationProgram(
      fixtureIntent(),
      fixtureProgram(),
    );
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
    const staticFoldIr: FabricationIRV1 = {
      ...compiled.value,
      behavior: "static",
      driver: null,
      outputs: [],
      couplings: [],
    };
    const result = exportFabricationFold(
      verifiedSourceFor(staticFoldIr, "candidate-integral-hinge"),
    );
    expect(result.status).toBe("generated");
    if (result.status !== "generated") return;
    const parsed = z
      .object({
        vertices_coords: z.array(z.tuple([z.number(), z.number()])),
        edges_vertices: z.array(z.tuple([z.number().int(), z.number().int()])),
        edges_assignment: z.array(z.enum(["C", "M", "V"])),
        edges_foldforgePathId: z.array(z.string()),
      })
      .parse(JSON.parse(textFrom(result.artifact)) as unknown);
    const hingeIndices = parsed.edges_foldforgePathId.flatMap(
      (pathId, index) => (pathId === "crease-wing" ? [index] : []),
    );
    expect(hingeIndices).toHaveLength(1);
    expect(parsed.edges_assignment[hingeIndices[0]!]).toBe("V");
    const hingeEndpoints = new Set(["160,90", "160,150"]);
    const duplicateCuts = parsed.edges_vertices.filter((edge, index) => {
      if (parsed.edges_assignment[index] !== "C") return false;
      const endpoints = new Set(
        edge.map((vertexIndex) =>
          parsed.vertices_coords[vertexIndex]!.join(","),
        ),
      );
      return (
        endpoints.size === hingeEndpoints.size &&
        [...endpoints].every((point) => hingeEndpoints.has(point))
      );
    });
    expect(duplicateCuts).toEqual([]);
  });

  it("omits FOLD when zero-angle and explicit-angle creases are mixed", () => {
    const showcase = createFacetedDuckGiftBoxShowcase();
    const compiled = compileFabricationProgram(
      showcase.intent,
      showcase.program,
    );
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
    const mixedAngleIr: FabricationIRV1 = {
      ...compiled.value,
      joints: compiled.value.joints.map((joint) =>
        joint.kind === "fold" && joint.jointId === "joint-duck-lid"
          ? { ...joint, homeAngleDeg: 45 }
          : joint,
      ),
    };
    const candidateId = "candidate-mixed-fold-angles";
    const source = verifiedSourceFor(mixedAngleIr, candidateId);

    expect(
      inspectFabricationFoldCompatibility({
        ir: mixedAngleIr,
        sourceCandidateId: candidateId,
        sourceIrHash: source.verification.irHash,
      }),
    ).toMatchObject({
      status: "omitted",
      reason: {
        code: "mixed_fold_angle_semantics",
        geometryIds: ["joint-duck-lid", "joint-duck-beak"],
      },
    });
    expect(exportFabricationFold(source)).toMatchObject({
      status: "omitted",
      reason: { code: "mixed_fold_angle_semantics" },
    });
  });
});
