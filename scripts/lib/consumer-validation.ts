import DxfParser from "dxf-parser";
import fold from "fold";
import { validateBytes } from "gltf-validator";
import { z } from "zod";

import { canonicalSerialize } from "../../src/core/canonical";
import {
  CALIBRATION_LENGTH_MM,
  exportFabricationDxf,
  exportFabricationFold,
  exportFabricationGlb,
  exportFabricationSvg,
  type FabricationExportArtifact,
  type FoldOmissionReason,
  type VerifiedFabricationExportSource,
} from "../../src/core/fabrication/export";
import {
  CandidateProvenanceV2Schema,
  CandidateScoreV2Schema,
  FabricationIntentV1Schema,
  FabricationIRV1Schema,
  FabricationProgramV1Schema,
  VerificationReportV2Schema,
} from "../../src/core/fabrication/schemas";
import { sha256Hex, sha256HexBytes } from "../../src/core/sha256";

const REQUIRED_FORMATS = ["svg", "dxf", "glb", "json"] as const;
const REQUIRED_LAYERS = ["CUT", "SCORE", "PERFORATION", "ENGRAVE"] as const;
const REQUIRED_LAYER_SET: ReadonlySet<string> = new Set(REQUIRED_LAYERS);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

const GLTF_VALIDATION_REPORT_SCHEMA = z
  .object({
    validatorVersion: z.string().min(1),
    issues: z
      .object({
        numErrors: z.number().int().nonnegative(),
        numWarnings: z.number().int().nonnegative(),
        numInfos: z.number().int().nonnegative(),
        numHints: z.number().int().nonnegative(),
        messages: z.array(
          z
            .object({
              code: z.string(),
              severity: z.number().int().min(0).max(3),
              message: z.string(),
            })
            .passthrough(),
        ),
        truncated: z.boolean(),
      })
      .strict(),
  })
  .passthrough();

const GLB_DOCUMENT_SCHEMA = z
  .object({
    asset: z
      .object({
        version: z.literal("2.0"),
        extras: z
          .object({
            sourceCandidateId: z.string().min(1),
            sourceIrHash: z.string().regex(SHA256_PATTERN),
            fabricationPathCount: z.number().int().nonnegative(),
            motionSampleCount: z.number().int().nonnegative(),
          })
          .passthrough(),
      })
      .passthrough(),
    scenes: z
      .array(
        z
          .object({ nodes: z.array(z.number().int().nonnegative()) })
          .passthrough(),
      )
      .min(1),
    nodes: z.array(z.object({ name: z.string() }).passthrough()).min(1),
    meshes: z.array(z.object({ name: z.string() }).passthrough()).min(1),
    animations: z
      .array(
        z
          .object({
            name: z.string().min(1),
            channels: z.array(z.unknown()).min(1),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const FOLD_DOCUMENT_SCHEMA = z
  .object({
    file_spec: z.literal(1.2),
    frame_unit: z.literal("mm"),
    foldforge_sourceCandidateId: z.string().min(1),
    foldforge_sourceIrHash: z.string().regex(SHA256_PATTERN),
    foldforge_payloadSha256: z.string().regex(SHA256_PATTERN),
    vertices_coords: z.array(
      z.tuple([z.number().finite(), z.number().finite()]),
    ),
    edges_vertices: z.array(
      z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
    ),
    edges_assignment: z.array(z.enum(["B", "C", "F", "J", "M", "U", "V"])),
    edges_foldAngle: z.array(z.number().finite()).optional(),
    edges_foldforgePathId: z.array(z.string().min(1)),
  })
  .passthrough();

const FABRICATION_JSON_SCHEMA = z
  .object({
    format: z.literal("foldforge.fabrication"),
    version: z.literal("1"),
    hashAlgorithm: z.literal("sha256"),
    sourceCandidateId: z.string().min(1),
    sourceIrHash: z.string().regex(SHA256_PATTERN),
    artifactSha256: z.literal("external-metadata"),
    payloadSha256: z.string().regex(SHA256_PATTERN),
    hashes: z
      .object({
        intent: z.string().regex(SHA256_PATTERN),
        program: z.string().regex(SHA256_PATTERN),
        ir: z.string().regex(SHA256_PATTERN),
        verification: z.string().regex(SHA256_PATTERN),
        score: z.string().regex(SHA256_PATTERN),
        provenance: z.string().regex(SHA256_PATTERN),
      })
      .strict(),
    payload: z
      .object({
        intent: FabricationIntentV1Schema,
        program: FabricationProgramV1Schema,
        ir: FabricationIRV1Schema,
        verification: VerificationReportV2Schema,
        score: CandidateScoreV2Schema,
        provenance: CandidateProvenanceV2Schema,
      })
      .strict(),
  })
  .strict();

const POINT_SCHEMA = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite().optional(),
});

const DXF_LINE_SCHEMA = z
  .object({
    type: z.literal("LINE"),
    layer: z.string(),
    vertices: z.array(POINT_SCHEMA).length(2),
  })
  .passthrough();

export type ConsumerValidationErrorCode =
  | "artifact_set"
  | "artifact_binding"
  | "svg_invalid"
  | "dxf_invalid"
  | "glb_invalid"
  | "json_invalid"
  | "fold_invalid";

export class ConsumerValidationError extends Error {
  readonly code: ConsumerValidationErrorCode;

  constructor(code: ConsumerValidationErrorCode, message: string) {
    super(message);
    this.name = "ConsumerValidationError";
    this.code = code;
  }
}

export interface ConsumerValidationInput {
  readonly sourceCandidateId: string;
  readonly sourceIrHash: string;
  readonly artifacts: readonly FabricationExportArtifact[];
  readonly foldOmission: FoldOmissionReason | null;
}

export interface ConsumerValidationResult {
  readonly sourceCandidateId: string;
  readonly sourceIrHash: string;
  readonly artifactCount: number;
  readonly formats: readonly FabricationExportArtifact["format"][];
  readonly artifactMetadata: readonly FabricationExportArtifact["metadata"][];
  readonly svg: {
    readonly widthMm: number;
    readonly heightMm: number;
    readonly calibrationLengthMm: number;
    readonly layerCount: number;
    readonly sourcePathCount: number;
  };
  readonly dxf: {
    readonly entityCount: number;
    readonly layers: readonly string[];
    readonly calibrationLengthMm: number;
    readonly sourcePathCount: number;
  };
  readonly glb: {
    readonly errors: number;
    readonly warnings: number;
    readonly animationCount: number;
    readonly motionSampleCount: number;
    readonly sourcePathCount: number;
  };
  readonly json: {
    readonly payloadSha256: string;
    readonly sourcePathCount: number;
    readonly assemblyOperationCount: number;
  };
  readonly fold: {
    readonly edgeCount: number;
    readonly faceCount: number;
  } | null;
  readonly foldOmissionCode: FoldOmissionReason["code"] | null;
}

interface ValidatedJsonArtifact {
  readonly summary: ConsumerValidationResult["json"];
  readonly source: VerifiedFabricationExportSource;
}

const fail = (code: ConsumerValidationErrorCode, message: string): never => {
  throw new ConsumerValidationError(code, message);
};

const assertValidation: (
  condition: boolean,
  code: ConsumerValidationErrorCode,
  message: string,
) => asserts condition = (condition, code, message) => {
  if (!condition) fail(code, message);
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const asConsumerError = (
  code: ConsumerValidationErrorCode,
  label: string,
  error: unknown,
): ConsumerValidationError =>
  error instanceof ConsumerValidationError
    ? error
    : new ConsumerValidationError(code, `${label}: ${errorMessage(error)}`);

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength &&
  left.every((byte, index) => byte === right[index]);

const artifactText = (artifact: FabricationExportArtifact): string => {
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(artifact.bytes);
  } catch (error) {
    return fail(
      "artifact_binding",
      `${artifact.format.toUpperCase()} is not valid UTF-8: ${errorMessage(error)}`,
    );
  }
  assertValidation(
    artifact.text === undefined || artifact.text === decoded,
    "artifact_binding",
    `${artifact.format.toUpperCase()} text does not match its exported bytes.`,
  );
  return decoded;
};

const xmlAttributes = (tag: string): Readonly<Record<string, string>> => {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*"([^"]*)"/gu)) {
    const name = match[1];
    const value = match[2];
    if (name && value !== undefined) result[name] = value;
  }
  return result;
};

const numberAttribute = (
  attributes: Readonly<Record<string, string>>,
  name: string,
  code: ConsumerValidationErrorCode,
): number => {
  const value = Number(attributes[name]);
  assertValidation(
    Number.isFinite(value),
    code,
    `Attribute ${name} must be a finite number.`,
  );
  return value;
};

const validateJson = (
  artifact: FabricationExportArtifact,
  sourceCandidateId: string,
  sourceIrHash: string,
): ValidatedJsonArtifact => {
  try {
    const document = FABRICATION_JSON_SCHEMA.parse(
      JSON.parse(artifactText(artifact)) as unknown,
    );
    const { payload } = document;
    const calculated = {
      intent: sha256Hex(canonicalSerialize(payload.intent)),
      program: sha256Hex(canonicalSerialize(payload.program)),
      ir: sha256Hex(canonicalSerialize(payload.ir)),
      verification: sha256Hex(canonicalSerialize(payload.verification)),
      score: sha256Hex(canonicalSerialize(payload.score)),
      provenance: sha256Hex(canonicalSerialize(payload.provenance)),
    };
    assertValidation(
      document.sourceCandidateId === sourceCandidateId &&
        document.sourceIrHash === sourceIrHash &&
        document.hashes.ir === sourceIrHash &&
        calculated.ir === sourceIrHash,
      "json_invalid",
      "Fabrication JSON is not bound to the selected candidate and IR hash.",
    );
    assertValidation(
      Object.entries(calculated).every(
        ([name, hash]) =>
          document.hashes[name as keyof typeof document.hashes] === hash,
      ) && document.payloadSha256 === sha256Hex(canonicalSerialize(payload)),
      "json_invalid",
      "Fabrication JSON component or payload hashes do not match its canonical content.",
    );
    assertValidation(
      payload.program.intentId === payload.intent.intentId &&
        payload.ir.programId === payload.program.programId &&
        payload.verification.candidateId === sourceCandidateId &&
        payload.verification.irId === payload.ir.irId &&
        payload.verification.programId === payload.program.programId &&
        payload.verification.irHash === sourceIrHash &&
        payload.verification.valid &&
        payload.score.eligible &&
        payload.score.totalScore !== null &&
        payload.provenance.intentHash === calculated.intent &&
        payload.provenance.programHash === calculated.program &&
        payload.provenance.irHash === sourceIrHash,
      "json_invalid",
      "Fabrication JSON payload contracts do not describe one selected verified candidate.",
    );
    return {
      summary: {
        payloadSha256: document.payloadSha256,
        sourcePathCount: payload.ir.paths.length,
        assemblyOperationCount: payload.ir.assemblyOperations.length,
      },
      source: {
        ir: payload.ir,
        sourceCandidateId,
        selectionStatus: "selected",
        verification: payload.verification,
        provenance: payload.provenance,
      },
    };
  } catch (error) {
    throw asConsumerError(
      "json_invalid",
      "Fabrication JSON validation failed",
      error,
    );
  }
};

const validateSvg = (
  artifact: FabricationExportArtifact,
  sourceCandidateId: string,
  sourceIrHash: string,
  expectedSourcePathCount: number,
): ConsumerValidationResult["svg"] => {
  try {
    const text = artifactText(artifact);
    assertValidation(
      text.startsWith('<?xml version="1.0" encoding="UTF-8"?>') &&
        text.trimEnd().endsWith("</svg>") &&
        !/<(?:script|!DOCTYPE)\b/iu.test(text),
      "svg_invalid",
      "SVG must be a bounded XML document without scripts or external declarations.",
    );
    const rootTag = text.match(/<svg\b[^>]*>/u)?.[0];
    assertValidation(
      rootTag !== undefined,
      "svg_invalid",
      "SVG root element is missing.",
    );
    const root = xmlAttributes(rootTag);
    const widthMatch = root.width?.match(/^([0-9]+(?:\.[0-9]+)?)mm$/u);
    const heightMatch = root.height?.match(/^([0-9]+(?:\.[0-9]+)?)mm$/u);
    const widthMm = Number(widthMatch?.[1]);
    const heightMm = Number(heightMatch?.[1]);
    assertValidation(
      Number.isFinite(widthMm) &&
        widthMm > 0 &&
        Number.isFinite(heightMm) &&
        heightMm > 0 &&
        root["data-source-candidate"] === sourceCandidateId &&
        root["data-source-ir-sha256"] === sourceIrHash,
      "svg_invalid",
      "SVG physical dimensions or selected-source metadata are invalid.",
    );
    const viewBox = root.viewBox?.trim().split(/\s+/u).map(Number) ?? [];
    assertValidation(
      viewBox.length === 4 &&
        viewBox.every(Number.isFinite) &&
        viewBox[0] === 0 &&
        viewBox[1] === 0 &&
        viewBox[2] === widthMm &&
        viewBox[3] === heightMm,
      "svg_invalid",
      "SVG viewBox must preserve its declared millimetre scale.",
    );
    for (const layer of REQUIRED_LAYERS) {
      const count = [
        ...text.matchAll(new RegExp(`data-layer="${layer}"`, "gu")),
      ].length;
      assertValidation(
        count === 1 && text.includes(`<g id="${layer}" data-layer="${layer}">`),
        "svg_invalid",
        `SVG must contain exactly one ${layer} layer.`,
      );
    }
    const sourcePathTags = [
      ...text.matchAll(/<path\b[^>]*data-source-path-id="[^"]+"[^>]*>/gu),
    ].map((match) => match[0]);
    assertValidation(
      sourcePathTags.length === expectedSourcePathCount &&
        sourcePathTags.every((tag) => {
          const className = xmlAttributes(tag).class;
          return className !== undefined && REQUIRED_LAYER_SET.has(className);
        }),
      "svg_invalid",
      "SVG source paths do not match the canonical fabrication path count or layers.",
    );
    const calibrationTag = [...text.matchAll(/<line\b[^>]*>/gu)]
      .map((match) => match[0])
      .find((tag) => xmlAttributes(tag).id === "calibration-50mm");
    assertValidation(
      calibrationTag !== undefined,
      "svg_invalid",
      "SVG 50 mm calibration line is missing.",
    );
    const calibration = xmlAttributes(calibrationTag);
    const calibrationLengthMm = Math.hypot(
      numberAttribute(calibration, "x2", "svg_invalid") -
        numberAttribute(calibration, "x1", "svg_invalid"),
      numberAttribute(calibration, "y2", "svg_invalid") -
        numberAttribute(calibration, "y1", "svg_invalid"),
    );
    assertValidation(
      Math.abs(calibrationLengthMm - CALIBRATION_LENGTH_MM) <= 1e-9,
      "svg_invalid",
      "SVG calibration line is not exactly 50 mm.",
    );
    return {
      widthMm,
      heightMm,
      calibrationLengthMm,
      layerCount: REQUIRED_LAYERS.length,
      sourcePathCount: sourcePathTags.length,
    };
  } catch (error) {
    throw asConsumerError("svg_invalid", "SVG validation failed", error);
  }
};

const validateDxf = (
  artifact: FabricationExportArtifact,
  sourceCandidateId: string,
  sourceIrHash: string,
  expectedSourcePathCount: number,
): ConsumerValidationResult["dxf"] => {
  try {
    const text = artifactText(artifact);
    const parsed = new DxfParser().parseSync(text);
    assertValidation(parsed !== null, "dxf_invalid", "DXF did not parse.");
    assertValidation(
      parsed.header.$INSUNITS === 4 && parsed.header.$MEASUREMENT === 1,
      "dxf_invalid",
      "DXF must declare millimetres and metric measurement.",
    );
    assertValidation(
      text.includes(`source-candidate:${sourceCandidateId}`) &&
        text.includes(`source-ir-sha256:${sourceIrHash}`),
      "dxf_invalid",
      "DXF selected-source metadata is missing or mismatched.",
    );
    const layers = Object.keys(parsed.tables.layer.layers).toSorted();
    assertValidation(
      layers.length === REQUIRED_LAYERS.length &&
        REQUIRED_LAYERS.every((layer) => layers.includes(layer)) &&
        parsed.entities.every((entity) => REQUIRED_LAYER_SET.has(entity.layer)),
      "dxf_invalid",
      "DXF layers must be exactly CUT, SCORE, PERFORATION, and ENGRAVE.",
    );
    assertValidation(
      parsed.entities.length > 0 &&
        parsed.entities.every((entity) =>
          ["LINE", "LWPOLYLINE", "TEXT"].includes(entity.type),
        ),
      "dxf_invalid",
      "DXF contains no entities or an unsupported entity type.",
    );
    const sourcePathCount = [...text.matchAll(/\nsource-path:[^\n]+\n/gu)]
      .length;
    assertValidation(
      sourcePathCount === expectedSourcePathCount,
      "dxf_invalid",
      "DXF source path count does not match canonical fabrication JSON.",
    );
    const calibrationLine = parsed.entities
      .filter((entity) => entity.type === "LINE" && entity.layer === "ENGRAVE")
      .map((entity) => DXF_LINE_SCHEMA.safeParse(entity))
      .find((result) => {
        if (!result.success) return false;
        const [start, end] = result.data.vertices;
        if (!start || !end) return false;
        return (
          Math.abs(
            Math.hypot(end.x - start.x, end.y - start.y) -
              CALIBRATION_LENGTH_MM,
          ) <= 1e-9
        );
      });
    assertValidation(
      text.includes("generated:calibration-50mm") &&
        calibrationLine?.success === true,
      "dxf_invalid",
      "DXF 50 mm calibration entity is missing or incorrectly scaled.",
    );
    return {
      entityCount: parsed.entities.length,
      layers,
      calibrationLengthMm: CALIBRATION_LENGTH_MM,
      sourcePathCount,
    };
  } catch (error) {
    throw asConsumerError("dxf_invalid", "DXF validation failed", error);
  }
};

const parseGlbDocument = (bytes: Uint8Array): unknown => {
  assertValidation(bytes.byteLength >= 28, "glb_invalid", "GLB is truncated.");
  const copy = Uint8Array.from(bytes);
  const view = new DataView(copy.buffer);
  assertValidation(
    view.getUint32(0, true) === 0x46546c67 &&
      view.getUint32(4, true) === 2 &&
      view.getUint32(8, true) === copy.byteLength,
    "glb_invalid",
    "GLB header is invalid.",
  );
  const jsonLength = view.getUint32(12, true);
  assertValidation(
    view.getUint32(16, true) === 0x4e4f534a &&
      jsonLength > 0 &&
      20 + jsonLength <= copy.byteLength,
    "glb_invalid",
    "GLB JSON chunk is invalid.",
  );
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true })
      .decode(copy.slice(20, 20 + jsonLength))
      .trimEnd(),
  ) as unknown;
};

const validateGlb = async (
  artifact: FabricationExportArtifact,
  sourceCandidateId: string,
  sourceIrHash: string,
  expectedSourcePathCount: number,
): Promise<ConsumerValidationResult["glb"]> => {
  try {
    const report = GLTF_VALIDATION_REPORT_SCHEMA.parse(
      await validateBytes(artifact.bytes, {
        uri: artifact.metadata.fileName,
        format: "glb",
        maxIssues: 0,
        writeTimestamp: false,
      }),
    );
    const seriousMessages = report.issues.messages
      .filter((message) => message.severity <= 1)
      .map((message) => `${message.code}: ${message.message}`)
      .join("; ");
    assertValidation(
      report.issues.numErrors === 0 &&
        report.issues.numWarnings === 0 &&
        !report.issues.truncated,
      "glb_invalid",
      `Khronos validation reported ${report.issues.numErrors} errors and ${report.issues.numWarnings} warnings${seriousMessages ? `: ${seriousMessages}` : "."}`,
    );
    const document = GLB_DOCUMENT_SCHEMA.parse(
      parseGlbDocument(artifact.bytes),
    );
    const extras = document.asset.extras;
    const animationCount = document.animations?.length ?? 0;
    assertValidation(
      extras.sourceCandidateId === sourceCandidateId &&
        extras.sourceIrHash === sourceIrHash &&
        extras.fabricationPathCount === expectedSourcePathCount,
      "glb_invalid",
      "GLB metadata is not bound to the selected candidate, IR, and source paths.",
    );
    assertValidation(
      extras.motionSampleCount === 0
        ? animationCount === 0
        : extras.motionSampleCount === 11 &&
            animationCount === 1 &&
            document.animations?.[0]?.name === "FoldForge Open Close",
      "glb_invalid",
      "GLB motion metadata and the single playable animation clip disagree.",
    );
    return {
      errors: report.issues.numErrors,
      warnings: report.issues.numWarnings,
      animationCount,
      motionSampleCount: extras.motionSampleCount,
      sourcePathCount: extras.fabricationPathCount,
    };
  } catch (error) {
    throw asConsumerError("glb_invalid", "GLB validation failed", error);
  }
};

const validateFold = (
  artifact: FabricationExportArtifact,
  sourceCandidateId: string,
  sourceIrHash: string,
): NonNullable<ConsumerValidationResult["fold"]> => {
  try {
    const document = FOLD_DOCUMENT_SCHEMA.parse(
      JSON.parse(artifactText(artifact)) as unknown,
    );
    const edgeCount = document.edges_vertices.length;
    assertValidation(
      document.foldforge_sourceCandidateId === sourceCandidateId &&
        document.foldforge_sourceIrHash === sourceIrHash,
      "fold_invalid",
      "FOLD selected-source metadata is missing or mismatched.",
    );
    assertValidation(
      document.edges_assignment.length === edgeCount &&
        document.edges_foldforgePathId.length === edgeCount &&
        (document.edges_foldAngle === undefined ||
          document.edges_foldAngle.length === edgeCount) &&
        document.edges_vertices.every(
          ([start, end]) =>
            start !== end &&
            start < document.vertices_coords.length &&
            end < document.vertices_coords.length,
        ),
      "fold_invalid",
      "FOLD edge arrays or vertex references are inconsistent.",
    );
    const graph = {
      vertices_coords: document.vertices_coords,
      edges_vertices: document.edges_vertices,
      edges_assignment: document.edges_assignment,
      ...(document.edges_foldAngle
        ? { edges_foldAngle: document.edges_foldAngle }
        : {}),
      edges_foldforgePathId: document.edges_foldforgePathId,
    };
    assertValidation(
      document.foldforge_payloadSha256 === sha256Hex(canonicalSerialize(graph)),
      "fold_invalid",
      "FOLD graph hash does not match its canonical crease data.",
    );
    const populated = fold.convert.edges_vertices_to_faces_vertices(
      structuredClone(graph),
    );
    const populatedEdgeCount = fold.filter.numEdges(populated);
    const faceCount = fold.filter.numFaces(populated);
    const assignedEdgeCount = ["B", "C", "F", "J", "M", "U", "V"].reduce(
      (count, assignment) =>
        count + fold.filter.edgesAssigned(populated, assignment).length,
      0,
    );
    assertValidation(
      populatedEdgeCount === edgeCount &&
        faceCount > 0 &&
        assignedEdgeCount === edgeCount,
      "fold_invalid",
      "Official FOLD processing did not preserve every edge, assignment, and bounded face.",
    );
    return { edgeCount, faceCount };
  } catch (error) {
    throw asConsumerError("fold_invalid", "FOLD validation failed", error);
  }
};

const artifactsByFormat = (
  input: ConsumerValidationInput,
): ReadonlyMap<
  FabricationExportArtifact["format"],
  FabricationExportArtifact
> => {
  assertValidation(
    input.sourceCandidateId.trim().length > 0 &&
      SHA256_PATTERN.test(input.sourceIrHash),
    "artifact_binding",
    "A selected candidate ID and canonical IR SHA-256 are required.",
  );
  const byFormat = new Map<
    FabricationExportArtifact["format"],
    FabricationExportArtifact
  >();
  for (const artifact of input.artifacts) {
    assertValidation(
      !byFormat.has(artifact.format),
      "artifact_set",
      `Duplicate ${artifact.format.toUpperCase()} artifact.`,
    );
    assertValidation(
      artifact.metadata.format === artifact.format &&
        artifact.metadata.sourceCandidateId === input.sourceCandidateId &&
        artifact.metadata.sourceIrHash === input.sourceIrHash &&
        artifact.metadata.verified &&
        artifact.metadata.byteLength === artifact.bytes.byteLength &&
        artifact.metadata.sha256 === sha256HexBytes(artifact.bytes),
      "artifact_binding",
      `${artifact.format.toUpperCase()} metadata or bytes are not bound to the selected IR.`,
    );
    byFormat.set(artifact.format, artifact);
  }
  for (const format of REQUIRED_FORMATS) {
    assertValidation(
      byFormat.has(format),
      "artifact_set",
      `Required ${format.toUpperCase()} artifact is missing.`,
    );
  }
  const foldArtifact = byFormat.get("fold");
  if (input.foldOmission) {
    assertValidation(
      input.foldOmission.sourceCandidateId === input.sourceCandidateId &&
        input.foldOmission.sourceIrHash === input.sourceIrHash &&
        foldArtifact === undefined,
      "artifact_set",
      "FOLD omission evidence and generated artifacts disagree.",
    );
  } else {
    assertValidation(
      foldArtifact !== undefined,
      "artifact_set",
      "FOLD must be present when no omission reason was recorded.",
    );
  }
  assertValidation(
    byFormat.size === REQUIRED_FORMATS.length + (foldArtifact ? 1 : 0),
    "artifact_set",
    "The finalized artifact set contains an unexpected format.",
  );
  return byFormat;
};

const requiredArtifact = (
  artifacts: ReadonlyMap<
    FabricationExportArtifact["format"],
    FabricationExportArtifact
  >,
  format: (typeof REQUIRED_FORMATS)[number],
): FabricationExportArtifact => {
  const artifact = artifacts.get(format);
  return (
    artifact ??
    fail(
      "artifact_set",
      `Required ${format.toUpperCase()} artifact is missing.`,
    )
  );
};

export const validateFinalizedConsumerArtifacts = async (
  input: ConsumerValidationInput,
): Promise<ConsumerValidationResult> => {
  const artifacts = artifactsByFormat(input);
  const validatedJson = validateJson(
    requiredArtifact(artifacts, "json"),
    input.sourceCandidateId,
    input.sourceIrHash,
  );
  const json = validatedJson.summary;
  const regeneratedSvg = exportFabricationSvg(validatedJson.source);
  const regeneratedDxf = exportFabricationDxf(validatedJson.source);
  const regeneratedGlb = exportFabricationGlb(validatedJson.source);
  assertValidation(
    regeneratedSvg.ok &&
      bytesEqual(
        regeneratedSvg.value.bytes,
        requiredArtifact(artifacts, "svg").bytes,
      ),
    "svg_invalid",
    "SVG bytes are not the deterministic export of the canonical selected IR.",
  );
  assertValidation(
    regeneratedDxf.ok &&
      bytesEqual(
        regeneratedDxf.value.bytes,
        requiredArtifact(artifacts, "dxf").bytes,
      ),
    "dxf_invalid",
    "DXF bytes are not the deterministic export of the canonical selected IR.",
  );
  assertValidation(
    regeneratedGlb.ok &&
      bytesEqual(
        regeneratedGlb.value.bytes,
        requiredArtifact(artifacts, "glb").bytes,
      ),
    "glb_invalid",
    "GLB bytes are not the deterministic export of the canonical selected IR.",
  );
  const [svg, dxf, glb] = await Promise.all([
    Promise.resolve(
      validateSvg(
        requiredArtifact(artifacts, "svg"),
        input.sourceCandidateId,
        input.sourceIrHash,
        json.sourcePathCount,
      ),
    ),
    Promise.resolve(
      validateDxf(
        requiredArtifact(artifacts, "dxf"),
        input.sourceCandidateId,
        input.sourceIrHash,
        json.sourcePathCount,
      ),
    ),
    validateGlb(
      requiredArtifact(artifacts, "glb"),
      input.sourceCandidateId,
      input.sourceIrHash,
      json.sourcePathCount,
    ),
  ]);
  const foldArtifact = artifacts.get("fold");
  const regeneratedFold = exportFabricationFold(validatedJson.source);
  assertValidation(
    foldArtifact
      ? regeneratedFold.status === "generated" &&
          bytesEqual(regeneratedFold.artifact.bytes, foldArtifact.bytes)
      : regeneratedFold.status === "omitted" &&
          input.foldOmission?.code === regeneratedFold.reason.code,
    "fold_invalid",
    "FOLD bytes or omission reason are not the deterministic result for the canonical selected IR.",
  );
  const foldResult = foldArtifact
    ? validateFold(foldArtifact, input.sourceCandidateId, input.sourceIrHash)
    : null;
  return {
    sourceCandidateId: input.sourceCandidateId,
    sourceIrHash: input.sourceIrHash,
    artifactCount: artifacts.size,
    formats: [...artifacts.keys()],
    artifactMetadata: [...artifacts.values()].map(
      (artifact) => artifact.metadata,
    ),
    svg,
    dxf,
    glb,
    json,
    fold: foldResult,
    foldOmissionCode: input.foldOmission?.code ?? null,
  };
};
