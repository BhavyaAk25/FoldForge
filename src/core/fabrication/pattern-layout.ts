import { transformPoint2 } from "./polygon";
import type {
  FabricationIRV1,
  FabricationPathV1,
  PanelV1,
  Point2Mm,
} from "./types";

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

export interface FabricationPatternPanel {
  readonly panel: PanelV1;
  readonly points: readonly Point2Mm[];
  readonly holes: readonly (readonly Point2Mm[])[];
}

export interface FabricationPatternPath {
  readonly path: FabricationPathV1;
  readonly points: readonly Point2Mm[];
}

export interface FabricationPatternLayout {
  readonly sheetLayout: FabricationSheetLayout;
  readonly panels: readonly FabricationPatternPanel[];
  readonly paths: readonly FabricationPatternPath[];
}

const SHEET_GAP_MM = 12;
const CALIBRATION_FOOTER_MM = 14;
export const CALIBRATION_LENGTH_MM = 50;
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

export const placePointOnSheet = (
  point: Point2Mm,
  sheet: Pick<SheetLayoutEntry, "offsetYmm">,
): Point2Mm => ({
  xMm: point.xMm,
  yMm: point.yMm + sheet.offsetYmm,
});

export const placePointsOnSheet = (
  points: readonly Point2Mm[],
  sheet: Pick<SheetLayoutEntry, "offsetYmm">,
): readonly Point2Mm[] =>
  points.map((point) => placePointOnSheet(point, sheet));

/**
 * Produces the one canonical two-dimensional pattern coordinate space used by
 * the browser preview and print/CAD exporters. Panel transforms remain local
 * to their source sheet; this function adds the deterministic inter-sheet
 * offset exactly once.
 */
export const createFabricationPatternLayout = (
  ir: FabricationIRV1,
): FabricationPatternLayout => {
  const sheetLayout = createSheetLayout(ir);
  const sheetById = new Map(
    sheetLayout.sheets.map((sheet) => [sheet.sheetId, sheet]),
  );
  const panels = ir.panels.flatMap((panel) => {
    const sheet = sheetById.get(panel.sheetId);
    if (!sheet) return [];
    return [
      {
        panel,
        points: placePointsOnSheet(
          panel.contour.vertices.map((point) =>
            transformPoint2(point, panel.flatTransform),
          ),
          sheet,
        ),
        holes: panel.innerCutContours.map((contour) =>
          placePointsOnSheet(
            contour.vertices.map((point) =>
              transformPoint2(point, panel.flatTransform),
            ),
            sheet,
          ),
        ),
      },
    ];
  });
  const paths = ir.paths.flatMap((path) => {
    const sheet = sheetById.get(path.sheetId);
    return sheet
      ? [{ path, points: placePointsOnSheet(path.points, sheet) }]
      : [];
  });
  return { sheetLayout, panels, paths };
};
