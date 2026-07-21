import { describe, expect, it } from "vitest";

import {
  exportFabricationDxf,
  exportFabricationSvg,
  sourceIrHash,
  type VerifiedFabricationExportSource,
} from "@/core/fabrication/export";
import { createFabricationPatternLayout } from "@/core/fabrication/pattern-layout";
import type {
  FabricationIRV1,
  FabricationPathV1,
  PanelV1,
  RigidBodyV1,
  SheetV1,
} from "@/core/fabrication/types";

const material = {
  materialId: "pattern-layout-card",
  label: "Pattern layout card",
  thicknessMm: 0.4,
  grainDirection: "none",
} as const;

const sheetA = {
  sheetId: "sheet-a",
  widthMm: 100,
  heightMm: 80,
  printableMarginMm: 5,
  material,
} as const satisfies SheetV1;

const sheetB = {
  sheetId: "sheet-b",
  widthMm: 120,
  heightMm: 70,
  printableMarginMm: 5,
  material,
} as const satisfies SheetV1;

const identityTransform = {
  translationMm: { xMm: 0, yMm: 0, zMm: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
} as const;

const panel = (
  panelId: string,
  sheetId: string,
  bodyId: string,
  xMm: number,
  yMm: number,
): PanelV1 => ({
  panelId,
  sheetId,
  bodyId,
  label: panelId,
  role: "structural",
  contour: {
    vertices: [
      { xMm: 0, yMm: 0 },
      { xMm: 30, yMm: 0 },
      { xMm: 30, yMm: 20 },
      { xMm: 0, yMm: 20 },
    ],
  },
  innerCutContours: [],
  thicknessMm: material.thicknessMm,
  flatTransform: {
    translationMm: { xMm, yMm },
    rotationDeg: 0,
  },
  semanticPartIds: [],
});

const body = (bodyId: string, panelId: string): RigidBodyV1 => ({
  bodyId,
  label: bodyId,
  panelIds: [panelId],
  initialTransform: identityTransform,
  grounded: true,
  semanticPartIds: [],
});

const path = (
  pathId: string,
  sheetId: string,
  panelId: string,
  yMm: number,
): FabricationPathV1 => ({
  pathId,
  sheetId,
  panelId,
  kind: "cut",
  points: [
    { xMm: 12, yMm },
    { xMm: 42, yMm },
  ],
  closed: false,
  strokeWidthMm: 0.25,
});

const twoSheetIr = {
  version: "1",
  irId: "ir-two-sheet-pattern-layout",
  programId: "program-two-sheet-pattern-layout",
  unit: "mm",
  behavior: "static",
  requestedSize: { widthMm: 120, heightMm: 70, depthMm: null },
  // Deliberately reversed: the canonical layout orders sheets by stable ID.
  sheets: [sheetB, sheetA],
  paths: [
    path("path-a", sheetA.sheetId, "panel-a", 10),
    path("path-b", sheetB.sheetId, "panel-b", 15),
  ],
  panels: [
    panel("panel-a", sheetA.sheetId, "body-a", 8, 10),
    panel("panel-b", sheetB.sheetId, "body-b", 9, 20),
  ],
  bodies: [body("body-a", "panel-a"), body("body-b", "panel-b")],
  joints: [],
  connectors: [],
  driver: null,
  outputs: [],
  couplings: [],
  semanticParts: [],
  semanticConstraints: [],
  assemblyOperations: [],
} as const satisfies FabricationIRV1;

const source: VerifiedFabricationExportSource = {
  ir: twoSheetIr,
  sourceCandidateId: "candidate-two-sheet-pattern-layout",
  selectionStatus: "selected",
  verification: {
    candidateId: "candidate-two-sheet-pattern-layout",
    irHash: sourceIrHash(twoSheetIr),
    irId: twoSheetIr.irId,
    programId: twoSheetIr.programId,
    valid: true,
  },
};

const textFrom = (result: ReturnType<typeof exportFabricationSvg>): string => {
  if (!result.ok || result.value.text === undefined) {
    throw new Error("Expected a text export artifact.");
  }
  return result.value.text;
};

const dxfEntityCoordinates = (
  text: string,
  identifier: string,
): readonly { readonly xMm: number; readonly yMm: number }[] => {
  const lines = text.trim().split("\n");
  const commentIndex = lines.findIndex(
    (line, index) => line === "999" && lines[index + 1] === identifier,
  );
  if (commentIndex < 0) throw new Error(`Missing DXF entity ${identifier}.`);
  const coordinates: { xMm: number; yMm: number }[] = [];
  let pendingX: number | null = null;
  for (let index = commentIndex + 2; index < lines.length - 1; index += 2) {
    const code = lines[index];
    const value = Number(lines[index + 1]);
    if (code === "999" || (code === "0" && coordinates.length > 0)) break;
    if (code === "10") pendingX = value;
    if (code === "20" && pendingX !== null) {
      coordinates.push({ xMm: pendingX, yMm: value });
      pendingX = null;
    }
  }
  return coordinates;
};

describe("canonical multi-sheet pattern layout", () => {
  it("omits malformed panel and path references to unknown sheets", () => {
    const layout = createFabricationPatternLayout({
      ...twoSheetIr,
      panels: [
        ...twoSheetIr.panels,
        {
          ...twoSheetIr.panels[0]!,
          panelId: "panel-orphan",
          sheetId: "missing",
        },
      ],
      paths: [
        ...twoSheetIr.paths,
        {
          ...twoSheetIr.paths[0]!,
          pathId: "path-orphan",
          sheetId: "missing",
        },
      ],
    });

    expect(layout.panels.map((entry) => entry.panel.panelId)).not.toContain(
      "panel-orphan",
    );
    expect(layout.paths.map((entry) => entry.path.pathId)).not.toContain(
      "path-orphan",
    );
  });

  it("places preview panels and paths in one non-overlapping sheet space", () => {
    const preview = createFabricationPatternLayout(twoSheetIr);

    expect(preview.sheetLayout.sheets).toMatchObject([
      { sheetId: "sheet-a", offsetYmm: 0 },
      { sheetId: "sheet-b", offsetYmm: 92 },
    ]);
    expect(
      preview.panels.find(({ panel }) => panel.panelId === "panel-a")
        ?.points[0],
    ).toEqual({ xMm: 8, yMm: 10 });
    expect(
      preview.panels.find(({ panel }) => panel.panelId === "panel-b")
        ?.points[0],
    ).toEqual({ xMm: 9, yMm: 112 });
    expect(
      preview.paths.find(({ path }) => path.pathId === "path-b")?.points,
    ).toEqual([
      { xMm: 12, yMm: 107 },
      { xMm: 42, yMm: 107 },
    ]);
  });

  it("uses those exact preview path coordinates in SVG and DXF exports", () => {
    const preview = createFabricationPatternLayout(twoSheetIr);
    const previewPath = preview.paths.find(
      ({ path: candidatePath }) => candidatePath.pathId === "path-b",
    );
    if (!previewPath) throw new Error("Missing second-sheet preview path.");

    const svg = textFrom(exportFabricationSvg(source));
    expect(svg).toContain(
      'id="path-b" class="CUT" data-source-path-id="path-b" data-sheet-id="sheet-b"',
    );
    expect(svg).toContain('d="M 12 107 L 42 107"');

    const dxfResult = exportFabricationDxf(source);
    if (!dxfResult.ok || dxfResult.value.text === undefined) {
      throw new Error("Expected a DXF text artifact.");
    }
    expect(
      dxfEntityCoordinates(dxfResult.value.text, "source-path:path-b"),
    ).toEqual(previewPath.points);
    expect(
      dxfEntityCoordinates(
        dxfResult.value.text,
        "generated:sheet-boundary:sheet-b",
      ),
    ).toEqual([
      { xMm: 0, yMm: 92 },
      { xMm: 120, yMm: 92 },
      { xMm: 120, yMm: 162 },
      { xMm: 0, yMm: 162 },
    ]);
  });
});
