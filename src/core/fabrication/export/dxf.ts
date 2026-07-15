import type {
  CandidateProvenanceV2,
  FabricationIRV1,
  FabricationPathV1,
} from "../types";
import {
  CALIBRATION_LENGTH_MM,
  createSheetLayout,
  createTextArtifact,
  fabricationExportOk,
  formatExportNumber,
  prepareExportSource,
  sourceIrHash,
  type FabricationExportArtifact,
  type FabricationExportResult,
  type VerifiedFabricationExportSource,
} from "./artifact";

const DXF_LAYERS = ["CUT", "SCORE", "PERFORATION", "ENGRAVE"] as const;
type DxfLayer = (typeof DXF_LAYERS)[number];

const layerForPath = (path: FabricationPathV1): DxfLayer => {
  switch (path.kind) {
    case "cut":
      return "CUT";
    case "score":
      return "SCORE";
    case "perforation":
      return "PERFORATION";
    case "engrave":
      return "ENGRAVE";
  }
};

const layerColor = (layer: DxfLayer): number => {
  switch (layer) {
    case "CUT":
      return 7;
    case "SCORE":
      return 4;
    case "PERFORATION":
      return 30;
    case "ENGRAVE":
      return 8;
  }
};

const asciiText = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "-")
    .replace(/[\r\n]+/g, " ");

const pair = (lines: string[], code: number, value: string | number): void => {
  lines.push(String(code), String(value));
};

const addPolyline = (
  lines: string[],
  identifier: string,
  layer: DxfLayer,
  points: readonly { readonly xMm: number; readonly yMm: number }[],
  closed: boolean,
  strokeWidthMm: number,
  offsetYmm: number,
): void => {
  pair(lines, 999, asciiText(identifier));
  pair(lines, 0, "LWPOLYLINE");
  pair(lines, 100, "AcDbEntity");
  pair(lines, 8, layer);
  pair(lines, 100, "AcDbPolyline");
  pair(lines, 90, points.length);
  pair(lines, 70, closed ? 1 : 0);
  pair(lines, 43, formatExportNumber(strokeWidthMm));
  for (const point of points) {
    pair(lines, 10, formatExportNumber(point.xMm));
    pair(lines, 20, formatExportNumber(point.yMm + offsetYmm));
  }
};

const addText = (
  lines: string[],
  identifier: string,
  text: string,
  xMm: number,
  yMm: number,
): void => {
  pair(lines, 999, asciiText(identifier));
  pair(lines, 0, "TEXT");
  pair(lines, 100, "AcDbEntity");
  pair(lines, 8, "ENGRAVE");
  pair(lines, 100, "AcDbText");
  pair(lines, 10, formatExportNumber(xMm));
  pair(lines, 20, formatExportNumber(yMm));
  pair(lines, 30, 0);
  pair(lines, 40, 3);
  pair(lines, 1, asciiText(text));
};

export const exportFabricationDxf = (
  source: VerifiedFabricationExportSource,
): FabricationExportResult<FabricationExportArtifact> => {
  const preparedResult = prepareExportSource(source);
  if (!preparedResult.ok) return preparedResult;
  const prepared = preparedResult.value;
  const layout = createSheetLayout(prepared.ir);
  const layoutBySheetId = new Map(
    layout.sheets.map((sheet) => [sheet.sheetId, sheet]),
  );
  const lines: string[] = [];

  pair(lines, 0, "SECTION");
  pair(lines, 2, "HEADER");
  pair(lines, 999, "FoldForge ASCII DXF");
  pair(lines, 999, `source-candidate:${asciiText(prepared.sourceCandidateId)}`);
  pair(lines, 999, `source-ir-sha256:${prepared.sourceIrHash}`);
  pair(lines, 999, "artifact-sha256:external-metadata");
  pair(lines, 9, "$ACADVER");
  pair(lines, 1, "AC1015");
  pair(lines, 9, "$INSUNITS");
  pair(lines, 70, 4);
  pair(lines, 9, "$MEASUREMENT");
  pair(lines, 70, 1);
  pair(lines, 9, "$EXTMIN");
  pair(lines, 10, 0);
  pair(lines, 20, 0);
  pair(lines, 30, 0);
  pair(lines, 9, "$EXTMAX");
  pair(lines, 10, formatExportNumber(layout.widthMm));
  pair(lines, 20, formatExportNumber(layout.heightMm));
  pair(lines, 30, 0);
  pair(lines, 0, "ENDSEC");

  pair(lines, 0, "SECTION");
  pair(lines, 2, "TABLES");
  pair(lines, 0, "TABLE");
  pair(lines, 2, "LAYER");
  pair(lines, 70, DXF_LAYERS.length);
  for (const layer of DXF_LAYERS) {
    pair(lines, 0, "LAYER");
    pair(lines, 100, "AcDbSymbolTableRecord");
    pair(lines, 100, "AcDbLayerTableRecord");
    pair(lines, 2, layer);
    pair(lines, 70, 0);
    pair(lines, 62, layerColor(layer));
    pair(lines, 6, "CONTINUOUS");
  }
  pair(lines, 0, "ENDTAB");
  pair(lines, 0, "ENDSEC");

  pair(lines, 0, "SECTION");
  pair(lines, 2, "ENTITIES");

  for (const sheet of layout.sheets) {
    addPolyline(
      lines,
      `generated:sheet-boundary:${sheet.sheetId}`,
      "ENGRAVE",
      [
        { xMm: 0, yMm: 0 },
        { xMm: sheet.widthMm, yMm: 0 },
        { xMm: sheet.widthMm, yMm: sheet.heightMm },
        { xMm: 0, yMm: sheet.heightMm },
      ],
      true,
      0.12,
      sheet.offsetYmm,
    );
    addText(
      lines,
      `generated:sheet-label:${sheet.sheetId}`,
      sheet.label,
      sheet.printableMarginMm,
      sheet.offsetYmm + Math.max(4, sheet.printableMarginMm),
    );
  }

  for (const path of [...prepared.ir.paths].sort((left, right) =>
    left.pathId.localeCompare(right.pathId),
  )) {
    const sheet = layoutBySheetId.get(path.sheetId);
    if (!sheet) continue;
    addPolyline(
      lines,
      `source-path:${path.pathId}`,
      layerForPath(path),
      path.points,
      path.closed,
      path.strokeWidthMm,
      sheet.offsetYmm,
    );
  }

  const calibrationStartXmm = 5;
  const calibrationEndXmm = calibrationStartXmm + CALIBRATION_LENGTH_MM;
  pair(lines, 999, "generated:calibration-50mm");
  pair(lines, 0, "LINE");
  pair(lines, 100, "AcDbEntity");
  pair(lines, 8, "ENGRAVE");
  pair(lines, 100, "AcDbLine");
  pair(lines, 10, formatExportNumber(calibrationStartXmm));
  pair(lines, 20, formatExportNumber(layout.calibrationYmm));
  pair(lines, 30, 0);
  pair(lines, 11, formatExportNumber(calibrationEndXmm));
  pair(lines, 21, formatExportNumber(layout.calibrationYmm));
  pair(lines, 31, 0);
  addText(
    lines,
    "generated:calibration-label",
    "50 mm CALIBRATION - PRINT AT 100%",
    calibrationStartXmm,
    layout.calibrationYmm - 2,
  );

  pair(lines, 0, "ENDSEC");
  pair(lines, 0, "EOF");

  const text = `${lines.join("\n")}\n`;
  return fabricationExportOk(
    createTextArtifact("dxf", "dxf", "application/dxf", text, prepared),
  );
};

/** Byte-for-byte regeneration binds DXF units, layers, paths, calibration, and
 * source metadata to the exact selected IR. */
export const dxfArtifactMatchesSource = (
  bytes: Uint8Array,
  ir: FabricationIRV1,
  sourceCandidateId: string,
  provenance?: CandidateProvenanceV2,
): boolean => {
  const expected = exportFabricationDxf({
    ir,
    sourceCandidateId,
    selectionStatus: "selected",
    verification: {
      candidateId: sourceCandidateId,
      irHash: sourceIrHash(ir),
      irId: ir.irId,
      programId: ir.programId,
      valid: true,
    },
    ...(provenance ? { provenance } : {}),
  });
  return (
    expected.ok &&
    expected.value.bytes.byteLength === bytes.byteLength &&
    expected.value.bytes.every((byte, index) => byte === bytes[index])
  );
};
