import {
  createFabricationPatternLayout,
  type FabricationPatternPath,
} from "../pattern-layout";
import type { FabricationPathV1 } from "../types";
import {
  CALIBRATION_LENGTH_MM,
  createTextArtifact,
  fabricationExportOk,
  formatExportNumber,
  prepareExportSource,
  xmlEscape,
  type FabricationExportArtifact,
  type FabricationExportResult,
  type VerifiedFabricationExportSource,
} from "./artifact";

const SVG_LAYERS = ["CUT", "SCORE", "PERFORATION", "ENGRAVE"] as const;
type SvgLayer = (typeof SVG_LAYERS)[number];

const layerForPath = (path: FabricationPathV1): SvgLayer => {
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

const pathData = (path: FabricationPatternPath): string => {
  const [first, ...remaining] = path.points;
  if (!first) return "";
  const commands = [
    `M ${formatExportNumber(first.xMm)} ${formatExportNumber(first.yMm)}`,
    ...remaining.map(
      (point) =>
        `L ${formatExportNumber(point.xMm)} ${formatExportNumber(point.yMm)}`,
    ),
  ];
  if (path.path.closed) commands.push("Z");
  return commands.join(" ");
};

export const exportFabricationSvg = (
  source: VerifiedFabricationExportSource,
): FabricationExportResult<FabricationExportArtifact> => {
  const preparedResult = prepareExportSource(source);
  if (!preparedResult.ok) return preparedResult;
  const prepared = preparedResult.value;
  const patternLayout = createFabricationPatternLayout(prepared.ir);
  const layout = patternLayout.sheetLayout;
  const orderedPaths = [...patternLayout.paths].sort((left, right) =>
    left.path.pathId.localeCompare(right.path.pathId),
  );

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${formatExportNumber(layout.widthMm)}mm" height="${formatExportNumber(layout.heightMm)}mm" viewBox="0 0 ${formatExportNumber(layout.widthMm)} ${formatExportNumber(layout.heightMm)}" role="img" aria-labelledby="foldforge-title foldforge-description" data-source-candidate="${xmlEscape(prepared.sourceCandidateId)}" data-source-ir-sha256="${prepared.sourceIrHash}">`,
    `<title id="foldforge-title">FoldForge ${xmlEscape(prepared.sourceCandidateId)} fabrication pattern</title>`,
    '<desc id="foldforge-description">Print at 100 percent. Fabrication layers are CUT, SCORE, PERFORATION, and ENGRAVE. Verify the 50 mm calibration line.</desc>',
    `<metadata>${xmlEscape(
      JSON.stringify({
        exporter: "FoldForge",
        exporterVersion: "1",
        hashAlgorithm: "sha256",
        sourceCandidateId: prepared.sourceCandidateId,
        sourceIrHash: prepared.sourceIrHash,
      }),
    )}</metadata>`,
    "<style>",
    ".CUT{fill:none;stroke:#1f1f1f;stroke-width:.25}.SCORE{fill:none;stroke:#146b73;stroke-width:.2;stroke-dasharray:3 2}.PERFORATION{fill:none;stroke:#a05000;stroke-width:.2;stroke-dasharray:1 1}.ENGRAVE{fill:none;stroke:#555;stroke-width:.18}.sheet-label,.calibration-label{font:3px monospace;fill:#222;stroke:none}.sheet-boundary{stroke:#999;stroke-width:.12;stroke-dasharray:2 2;fill:none}",
    "</style>",
  ];

  for (const layer of SVG_LAYERS) {
    lines.push(`<g id="${layer}" data-layer="${layer}">`);
    if (layer === "ENGRAVE") {
      for (const sheet of layout.sheets) {
        lines.push(
          `<rect class="sheet-boundary" data-generated="sheet-boundary" data-sheet-id="${xmlEscape(sheet.sheetId)}" x="0" y="${formatExportNumber(sheet.offsetYmm)}" width="${formatExportNumber(sheet.widthMm)}" height="${formatExportNumber(sheet.heightMm)}" />`,
          `<text class="sheet-label" data-generated="sheet-label" data-sheet-id="${xmlEscape(sheet.sheetId)}" x="${formatExportNumber(sheet.printableMarginMm)}" y="${formatExportNumber(sheet.offsetYmm + Math.max(4, sheet.printableMarginMm))}">${xmlEscape(sheet.label)}</text>`,
        );
      }
    }

    for (const laidOutPath of orderedPaths) {
      const path = laidOutPath.path;
      if (layerForPath(path) !== layer) continue;
      lines.push(
        `<path id="${xmlEscape(path.pathId)}" class="${layer}" data-source-path-id="${xmlEscape(path.pathId)}" data-sheet-id="${xmlEscape(path.sheetId)}" data-panel-id="${path.panelId ? xmlEscape(path.panelId) : ""}" data-stroke-width-mm="${formatExportNumber(path.strokeWidthMm)}" d="${pathData(laidOutPath)}" />`,
      );
    }

    if (layer === "ENGRAVE") {
      const calibrationStartXmm = 5;
      const calibrationEndXmm = calibrationStartXmm + CALIBRATION_LENGTH_MM;
      lines.push(
        `<line id="calibration-50mm" class="ENGRAVE" data-generated="calibration" x1="${formatExportNumber(calibrationStartXmm)}" y1="${formatExportNumber(layout.calibrationYmm)}" x2="${formatExportNumber(calibrationEndXmm)}" y2="${formatExportNumber(layout.calibrationYmm)}" />`,
        `<text class="calibration-label" data-generated="calibration-label" x="${formatExportNumber(calibrationStartXmm)}" y="${formatExportNumber(layout.calibrationYmm - 2)}">50 mm calibration — print at 100%</text>`,
      );
    }
    lines.push("</g>");
  }

  lines.push("</svg>");
  const text = `${lines.join("\n")}\n`;
  return fabricationExportOk(
    createTextArtifact("svg", "svg", "image/svg+xml", text, prepared),
  );
};
