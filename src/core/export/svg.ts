import { round } from "../math";
import type { Candidate, Point2, Segment2 } from "../types";
import type { DesignConstraint } from "../schemas";
import { EXPORT_FOOTER_HEIGHT_MM } from "../constants";

const pointList = (
  points: readonly Point2[],
  offsetX: number,
  offsetY: number,
): string =>
  points
    .map(
      (point) =>
        `${round(point.xMm + offsetX, 3)},${round(point.yMm + offsetY, 3)}`,
    )
    .join(" ");

const line = (
  segment: Segment2,
  className: string,
  offsetX: number,
  offsetY: number,
): string =>
  `<line id="${segment.id}" class="${className}" x1="${round(segment.start.xMm + offsetX, 3)}" y1="${round(segment.start.yMm + offsetY, 3)}" x2="${round(segment.end.xMm + offsetX, 3)}" y2="${round(segment.end.yMm + offsetY, 3)}" />`;

export const exportSvg = (
  candidate: Candidate,
  constraint: DesignConstraint,
): string => {
  const { geometry } = candidate;
  const marginMm = constraint.printableMarginMm;
  const sheetWidthMm = constraint.sheetWidthMm;
  const sheetHeightMm = constraint.sheetHeightMm;
  const offsetX = marginMm;
  const offsetY = marginMm;
  const footerStartY = sheetHeightMm - marginMm - EXPORT_FOOTER_HEIGHT_MM;
  const calibrationY = footerStartY + 4;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidthMm}mm" height="${sheetHeightMm}mm" viewBox="0 0 ${sheetWidthMm} ${sheetHeightMm}" role="img" aria-labelledby="title desc">`,
    `<title id="title">FoldForge ${candidate.id} printable pattern</title>`,
    `<desc id="desc">Cut solid graphite lines, score dashed teal lines, and verify the 50 millimetre calibration line before folding.</desc>`,
    `<style>.cut{fill:none;stroke:#20201d;stroke-width:.35}.crease{fill:none;stroke:#315f63;stroke-width:.25;stroke-dasharray:3 2}.slot{stroke:#b43a32;stroke-width:.45}.calibration{stroke:#20201d;stroke-width:.5}.label{font:3.2px monospace;fill:#20201d}</style>`,
    `<g id="pattern" data-candidate="${candidate.id}">`,
    `<polygon id="perimeter" class="cut" points="${pointList(geometry.flat.outline.points, offsetX, offsetY)}" />`,
    ...geometry.flat.creases.map((crease) =>
      line(crease, "crease", offsetX, offsetY),
    ),
    ...geometry.flat.slots.map((slot) => line(slot, "slot", offsetX, offsetY)),
    `</g>`,
    `<g id="scale-check"><line id="calibration-50mm" class="calibration" x1="${marginMm}" y1="${calibrationY}" x2="${marginMm + 50}" y2="${calibrationY}" /><text class="label" x="${marginMm}" y="${calibrationY - 2}">50 mm calibration — print at 100%</text></g>`,
    `<text class="label" x="${marginMm}" y="${sheetHeightMm - 2}">CUT solid · SCORE dashed · physical validation pending</text>`,
    `</svg>`,
  ].join("\n");
};

export const verifySvgScale = (
  svg: string,
  constraint: DesignConstraint,
  candidate: Candidate,
): { readonly valid: boolean; readonly errorMm: number } => {
  const widthMatch = svg.match(/<svg[^>]*width="([\d.]+)mm"/);
  const heightMatch = svg.match(/<svg[^>]*height="([\d.]+)mm"/);
  const calibrationMatch = svg.match(
    /id="calibration-50mm"[^>]*x1="([\d.]+)"[^>]*x2="([\d.]+)"/,
  );
  const viewBoxMatch = svg.match(
    /<svg[^>]*viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/,
  );

  if (
    !widthMatch?.[1] ||
    !heightMatch?.[1] ||
    !calibrationMatch?.[1] ||
    !calibrationMatch[2] ||
    !viewBoxMatch?.[1] ||
    !viewBoxMatch[2] ||
    !viewBoxMatch[3] ||
    !viewBoxMatch[4]
  ) {
    return { valid: false, errorMm: Number.POSITIVE_INFINITY };
  }

  const widthErrorMm = Math.abs(
    Number(widthMatch[1]) - constraint.sheetWidthMm,
  );
  const heightErrorMm = Math.abs(
    Number(heightMatch[1]) - constraint.sheetHeightMm,
  );
  const scaleErrorMm = Math.abs(
    Number(calibrationMatch[2]) - Number(calibrationMatch[1]) - 50,
  );
  const viewBoxErrorMm = Math.max(
    Math.abs(Number(viewBoxMatch[1])),
    Math.abs(Number(viewBoxMatch[2])),
    Math.abs(Number(viewBoxMatch[3]) - constraint.sheetWidthMm),
    Math.abs(Number(viewBoxMatch[4]) - constraint.sheetHeightMm),
  );
  const sourceEquivalent = svg === exportSvg(candidate, constraint);
  const errorMm = sourceEquivalent
    ? Math.max(widthErrorMm, heightErrorMm, scaleErrorMm, viewBoxErrorMm)
    : Number.POSITIVE_INFINITY;
  return { valid: errorMm <= 0.01, errorMm };
};
