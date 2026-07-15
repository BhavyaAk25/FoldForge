import { canonicalSerialize } from "@/core/canonical";
import { sha256Hex, sha256HexBytes } from "@/core/sha256";

import type {
  CandidateProvenanceV2,
  ExportArtifactMetadataV1,
  ExportFormat,
  FabricationIRV1,
  VerificationReportV2,
} from "../types";

export const FABRICATION_EXPORTER_VERSION = "1";
export const CALIBRATION_LENGTH_MM = 50;

export type ExportErrorCode =
  | "invalid_source"
  | "invalid_geometry"
  | "invalid_animation"
  | "unsupported_geometry";

export interface FabricationExportError {
  readonly code: ExportErrorCode;
  readonly message: string;
  readonly sourceCandidateId: string;
  readonly geometryIds: readonly string[];
}

export type FabricationExportResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: FabricationExportError };

export interface VerifiedFabricationExportSource {
  readonly ir: FabricationIRV1;
  readonly sourceCandidateId: string;
  readonly selectionStatus: "selected";
  readonly verification: Pick<
    VerificationReportV2,
    "candidateId" | "irHash" | "irId" | "programId" | "valid"
  >;
  readonly provenance?: CandidateProvenanceV2;
  readonly fileStem?: string;
}

export interface PreparedFabricationExportSource {
  readonly ir: FabricationIRV1;
  readonly sourceCandidateId: string;
  readonly sourceIrHash: string;
  readonly provenance?: CandidateProvenanceV2;
  readonly fileStem: string;
}

export interface FabricationExportArtifact {
  readonly format: ExportFormat;
  readonly bytes: Uint8Array;
  readonly text?: string;
  readonly metadata: ExportArtifactMetadataV1;
}

export interface SheetLayoutEntry {
  readonly sheetId: string;
  readonly label: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly offsetYmm: number;
  readonly printableMarginMm: number;
}

export interface FabricationSheetLayout {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly calibrationYmm: number;
  readonly sheets: readonly SheetLayoutEntry[];
}

export const fabricationExportError = (
  code: ExportErrorCode,
  sourceCandidateId: string,
  message: string,
  geometryIds: readonly string[] = [],
): FabricationExportResult<never> => ({
  ok: false,
  error: { code, message, sourceCandidateId, geometryIds },
});

export const fabricationExportOk = <T>(
  value: T,
): FabricationExportResult<T> => ({ ok: true, value });

const unique = (values: readonly string[]): boolean =>
  new Set(values).size === values.length;

const safeFileStem = (candidateId: string, supplied?: string): string => {
  const normalized = (supplied ?? candidateId)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return normalized.length > 0 ? normalized : "fabrication";
};

export const sourceIrHash = (ir: FabricationIRV1): string =>
  sha256Hex(canonicalSerialize(ir));

export const prepareExportSource = (
  source: VerifiedFabricationExportSource,
): FabricationExportResult<PreparedFabricationExportSource> => {
  const candidateId = source.sourceCandidateId;
  if (candidateId.trim().length === 0) {
    return fabricationExportError(
      "invalid_source",
      candidateId,
      "A selected source candidate identifier is required.",
    );
  }
  if (source.selectionStatus !== "selected") {
    return fabricationExportError(
      "invalid_source",
      candidateId,
      "Only the explicitly selected candidate may be exported.",
    );
  }

  const computedIrHash = sourceIrHash(source.ir);
  const verification = source.verification;
  if (
    !verification.valid ||
    verification.candidateId !== candidateId ||
    verification.irId !== source.ir.irId ||
    verification.programId !== source.ir.programId ||
    verification.irHash !== computedIrHash
  ) {
    return fabricationExportError(
      "invalid_source",
      candidateId,
      "The verification stamp does not match the selected canonical IR.",
      [source.ir.irId],
    );
  }
  if (source.provenance && source.provenance.irHash !== computedIrHash) {
    return fabricationExportError(
      "invalid_source",
      candidateId,
      "Candidate provenance does not match the selected canonical IR.",
      [source.ir.irId],
    );
  }

  const sheetIds = source.ir.sheets.map((sheet) => sheet.sheetId);
  const panelIds = source.ir.panels.map((panel) => panel.panelId);
  const bodyIds = source.ir.bodies.map((body) => body.bodyId);
  const pathIds = source.ir.paths.map((path) => path.pathId);
  if (
    source.ir.unit !== "mm" ||
    !unique(sheetIds) ||
    !unique(panelIds) ||
    !unique(bodyIds) ||
    !unique(pathIds)
  ) {
    return fabricationExportError(
      "invalid_source",
      candidateId,
      "The selected IR has invalid units or duplicate structural identifiers.",
      [source.ir.irId],
    );
  }

  const sheetIdSet = new Set(sheetIds);
  const panelIdSet = new Set(panelIds);
  const bodyIdSet = new Set(bodyIds);
  const invalidPath = source.ir.paths.find(
    (path) =>
      !sheetIdSet.has(path.sheetId) ||
      (path.panelId !== null && !panelIdSet.has(path.panelId)),
  );
  const invalidPanel = source.ir.panels.find(
    (panel) => !sheetIdSet.has(panel.sheetId) || !bodyIdSet.has(panel.bodyId),
  );
  const invalidBody = source.ir.bodies.find((body) =>
    body.panelIds.some((panelId) => !panelIdSet.has(panelId)),
  );
  if (invalidPath || invalidPanel || invalidBody) {
    const invalidId =
      invalidPath?.pathId ?? invalidPanel?.panelId ?? invalidBody?.bodyId;
    return fabricationExportError(
      "invalid_source",
      candidateId,
      "The selected IR contains an unresolved sheet, panel, or body reference.",
      invalidId ? [invalidId] : [],
    );
  }

  const base = {
    ir: source.ir,
    sourceCandidateId: candidateId,
    sourceIrHash: computedIrHash,
    fileStem: safeFileStem(candidateId, source.fileStem),
  };
  return fabricationExportOk(
    source.provenance ? { ...base, provenance: source.provenance } : base,
  );
};

const artifactMetadata = (
  format: ExportFormat,
  fileName: string,
  mimeType: string,
  bytes: Uint8Array,
  source: PreparedFabricationExportSource,
): ExportArtifactMetadataV1 => ({
  format,
  fileName,
  mimeType,
  sha256: sha256HexBytes(bytes),
  byteLength: bytes.byteLength,
  sourceIrHash: source.sourceIrHash,
  sourceCandidateId: source.sourceCandidateId,
  verified: true,
});

export const createTextArtifact = (
  format: Exclude<ExportFormat, "glb">,
  extension: string,
  mimeType: string,
  text: string,
  source: PreparedFabricationExportSource,
): FabricationExportArtifact => {
  const bytes = new TextEncoder().encode(text);
  const fileName = `${source.fileStem}.${extension}`;
  return {
    format,
    bytes,
    text,
    metadata: artifactMetadata(format, fileName, mimeType, bytes, source),
  };
};

export const createBinaryArtifact = (
  format: "glb",
  extension: string,
  mimeType: string,
  bytes: Uint8Array,
  source: PreparedFabricationExportSource,
): FabricationExportArtifact => {
  const fileName = `${source.fileStem}.${extension}`;
  return {
    format,
    bytes,
    metadata: artifactMetadata(format, fileName, mimeType, bytes, source),
  };
};

const SHEET_GAP_MM = 12;
const CALIBRATION_FOOTER_MM = 14;
const MINIMUM_CALIBRATION_CANVAS_WIDTH_MM = CALIBRATION_LENGTH_MM + 10;

export const createSheetLayout = (
  ir: FabricationIRV1,
): FabricationSheetLayout => {
  const orderedSheets = [...ir.sheets].sort((left, right) =>
    left.sheetId.localeCompare(right.sheetId),
  );
  let offsetYmm = 0;
  const entries: SheetLayoutEntry[] = orderedSheets.map((sheet, index) => {
    const entry = {
      sheetId: sheet.sheetId,
      label: `Sheet ${index + 1}: ${sheet.sheetId}`,
      widthMm: sheet.widthMm,
      heightMm: sheet.heightMm,
      offsetYmm,
      printableMarginMm: sheet.printableMarginMm,
    };
    offsetYmm += sheet.heightMm;
    if (index < orderedSheets.length - 1) offsetYmm += SHEET_GAP_MM;
    return entry;
  });
  const maximumSheetWidthMm = orderedSheets.reduce(
    (maximum, sheet) => Math.max(maximum, sheet.widthMm),
    0,
  );
  const widthMm = Math.max(
    maximumSheetWidthMm,
    MINIMUM_CALIBRATION_CANVAS_WIDTH_MM,
  );
  const calibrationYmm = offsetYmm + CALIBRATION_FOOTER_MM / 2;
  return {
    widthMm,
    heightMm: offsetYmm + CALIBRATION_FOOTER_MM,
    calibrationYmm,
    sheets: entries,
  };
};

export const formatExportNumber = (value: number): string => {
  if (!Number.isFinite(value)) return "0";
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? "0" : String(rounded);
};

export const xmlEscape = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
