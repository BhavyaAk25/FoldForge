import { describe, expect, it } from "vitest";

import { compileFabricationProgram } from "@/core/fabrication/compiler";
import {
  createBinaryArtifact,
  createSheetLayout,
  createTextArtifact,
  formatExportNumber,
  prepareExportSource,
  xmlEscape,
  type VerifiedFabricationExportSource,
} from "@/core/fabrication/export/artifact";
import {
  exportFabricationFold,
  exportFabricationGlb,
  sourceIrHash,
} from "@/core/fabrication/export";
import type {
  FabricationIRV1,
  FoldJointV1,
  RevoluteJointV1,
  VerificationReportV2,
} from "@/core/fabrication/types";
import { sha256HexBytes } from "@/core/sha256";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

const compiledFixture = (): FabricationIRV1 => {
  const result = compileFabricationProgram(fixtureIntent(), fixtureProgram());
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

const sourceFor = (
  ir: FabricationIRV1,
  candidateId = "candidate-export-boundary",
): VerifiedFabricationExportSource => ({
  ir,
  sourceCandidateId: candidateId,
  selectionStatus: "selected",
  verification: {
    candidateId,
    programId: ir.programId,
    irId: ir.irId,
    irHash: sourceIrHash(ir),
    valid: true,
  },
});

describe("fabrication export source boundaries", () => {
  it("rejects missing selection, stale verification fields, and stale provenance", () => {
    const ir = compiledFixture();
    const valid = sourceFor(ir);
    expect(
      prepareExportSource({ ...valid, sourceCandidateId: " " }),
    ).toMatchObject({ ok: false, error: { code: "invalid_source" } });
    expect(
      prepareExportSource({
        ...valid,
        selectionStatus: "eligible",
      } as unknown as VerifiedFabricationExportSource),
    ).toMatchObject({ ok: false, error: { code: "invalid_source" } });

    const staleCases: VerificationReportV2[] = [
      { ...valid.verification, valid: false } as VerificationReportV2,
      {
        ...valid.verification,
        candidateId: "candidate-other",
      } as VerificationReportV2,
      { ...valid.verification, irId: "ir-other" } as VerificationReportV2,
      {
        ...valid.verification,
        programId: "program-other",
      } as VerificationReportV2,
      { ...valid.verification, irHash: "0".repeat(64) } as VerificationReportV2,
    ];
    for (const verification of staleCases) {
      expect(prepareExportSource({ ...valid, verification })).toMatchObject({
        ok: false,
        error: { code: "invalid_source" },
      });
    }

    expect(
      prepareExportSource({
        ...valid,
        provenance: {
          provenanceId: "provenance-stale",
          compilerVersion: "test",
          inputHash: "0".repeat(64),
          intentHash: "0".repeat(64),
          programHash: "0".repeat(64),
          irHash: "0".repeat(64),
          modelId: null,
          modelResponseId: null,
          generatedAtIso: "2026-07-14T12:00:00.000Z",
          deterministicSeed: 0,
          parentCandidateId: null,
          appliedPatchIds: [],
          repairCycle: 0,
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid_source" } });
  });

  it("rejects units, duplicate structural IDs, and unresolved references", () => {
    const ir = compiledFixture();
    const firstSheet = ir.sheets[0];
    const firstPanel = ir.panels[0];
    const firstBody = ir.bodies[0];
    const firstPath = ir.paths[0];
    if (!firstSheet || !firstPanel || !firstBody || !firstPath) {
      throw new Error("Export fixture is incomplete.");
    }
    const invalidSources: FabricationIRV1[] = [
      { ...ir, unit: "cm" as "mm" },
      { ...ir, sheets: [firstSheet, firstSheet] },
      { ...ir, panels: [firstPanel, firstPanel] },
      { ...ir, bodies: [firstBody, firstBody] },
      { ...ir, paths: [firstPath, firstPath] },
      {
        ...ir,
        paths: [
          { ...firstPath, sheetId: "sheet-missing" },
          ...ir.paths.slice(1),
        ],
      },
      {
        ...ir,
        panels: [
          { ...firstPanel, bodyId: "body-missing" },
          ...ir.panels.slice(1),
        ],
      },
      {
        ...ir,
        bodies: [
          { ...firstBody, panelIds: ["panel-missing"] },
          ...ir.bodies.slice(1),
        ],
      },
    ];
    for (const invalidIr of invalidSources) {
      expect(prepareExportSource(sourceFor(invalidIr))).toMatchObject({
        ok: false,
        error: { code: "invalid_source" },
      });
    }
  });

  it("sanitizes file names and creates hash-bound text and binary artifacts", () => {
    const ir = compiledFixture();
    const prepared = prepareExportSource({
      ...sourceFor(ir, "candidate-fallback"),
      fileStem: " ** unsafe / name ** ",
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.fileStem).toBe("unsafe-name");

    const fallback = prepareExportSource({
      ...sourceFor(ir, "---"),
      fileStem: "---",
    });
    expect(fallback.ok).toBe(true);
    if (!fallback.ok) return;
    expect(fallback.value.fileStem).toBe("fabrication");

    const textArtifact = createTextArtifact(
      "svg",
      "svg",
      "image/svg+xml",
      "<svg/>",
      prepared.value,
    );
    expect(textArtifact.text).toBe("<svg/>");
    expect(textArtifact.metadata).toMatchObject({
      format: "svg",
      fileName: "unsafe-name.svg",
      verified: true,
      sha256: sha256HexBytes(textArtifact.bytes),
    });

    const bytes = Uint8Array.of(1, 2, 3);
    const binaryArtifact = createBinaryArtifact(
      "glb",
      "glb",
      "model/gltf-binary",
      bytes,
      prepared.value,
    );
    expect(binaryArtifact).not.toHaveProperty("text");
    expect(binaryArtifact.metadata.sha256).toBe(sha256HexBytes(bytes));
  });

  it("lays out sorted sheets and formats hostile export values safely", () => {
    const ir = compiledFixture();
    const sheet = ir.sheets[0];
    if (!sheet) throw new Error("Sheet fixture missing.");
    const layout = createSheetLayout({
      ...ir,
      sheets: [
        { ...sheet, sheetId: "sheet-z", widthMm: 40, heightMm: 20 },
        { ...sheet, sheetId: "sheet-a", widthMm: 50, heightMm: 30 },
      ],
    });
    expect(layout.widthMm).toBe(60);
    expect(layout.heightMm).toBe(76);
    expect(layout.sheets.map((entry) => entry.sheetId)).toEqual([
      "sheet-a",
      "sheet-z",
    ]);
    expect(layout.sheets[1]?.offsetYmm).toBe(42);
    expect(createSheetLayout({ ...ir, sheets: [] })).toMatchObject({
      widthMm: 60,
      heightMm: 14,
    });
    expect(formatExportNumber(Number.NaN)).toBe("0");
    expect(formatExportNumber(-0.00000001)).toBe("0");
    expect(formatExportNumber(1.23456789)).toBe("1.234568");
    expect(xmlEscape('&"<>')).toBe("&amp;&quot;&lt;&gt;");
  });
});

describe("conditional FOLD export boundaries", () => {
  const staticFoldIr = (): FabricationIRV1 => {
    const ir = compiledFixture();
    return {
      ...ir,
      behavior: "static",
      driver: null,
      outputs: [],
      couplings: [],
    };
  };

  it("fails on an invalid source and generates the strict fold-only profile", () => {
    const invalid = sourceFor(staticFoldIr());
    const failed = exportFabricationFold({
      ...invalid,
      verification: { ...invalid.verification, irHash: "0".repeat(64) },
    });
    expect(failed).toMatchObject({
      status: "failed",
      error: { code: "invalid_source" },
    });

    const generated = exportFabricationFold(sourceFor(staticFoldIr()));
    expect(generated.status).toBe("generated");
    if (generated.status === "generated") {
      expect(generated.artifact.format).toBe("fold");
      expect(generated.artifact.text).toContain('"frame_unit":"mm"');
    }
  });

  it("reports each semantic omission before emitting a lossy FOLD file", () => {
    const base = staticFoldIr();
    const sheet = base.sheets[0];
    const fold = base.joints[0];
    const path = base.paths[0];
    if (!sheet || !fold || fold.kind !== "fold" || !path) {
      throw new Error("Fold fixture is incomplete.");
    }
    const revolute: RevoluteJointV1 = {
      jointId: "joint-revolute",
      kind: "revolute",
      parentBodyId: fold.parentBodyId,
      childBodyId: fold.childBodyId,
      axis: fold.axis,
      connectorIds: [],
      homeAngleDeg: 0,
      minAngleDeg: 0,
      maxAngleDeg: 90,
    };
    const cases: readonly [FabricationIRV1, string][] = [
      [
        {
          ...base,
          sheets: [sheet, { ...sheet, sheetId: "sheet-second" }],
        },
        "multiple_sheets",
      ],
      [{ ...base, joints: [revolute] }, "non_fold_joint"],
      [
        {
          ...base,
          connectors: [
            {
              connectorId: "tab-one",
              kind: "tab",
              panelId: base.panels[0]?.panelId ?? "panel-base",
              mateConnectorId: "tab-two",
              contour: {
                vertices: [
                  { xMm: 0, yMm: 0 },
                  { xMm: 2, yMm: 0 },
                  { xMm: 1, yMm: 2 },
                ],
              },
              rootEdge: {
                start: { xMm: 0, yMm: 0 },
                end: { xMm: 2, yMm: 0 },
              },
              insertionDirection: { x: 1, y: 0, z: 0 },
              clearanceMm: 0.4,
            },
          ],
        },
        "connector_semantics",
      ],
      [
        { ...base, couplings: compiledFixture().couplings },
        "coupling_semantics",
      ],
      [{ ...base, behavior: "open_close" }, "motion_semantics"],
      [
        {
          ...base,
          paths: [{ ...path, kind: "engrave" }, ...base.paths.slice(1)],
        },
        "unsupported_path_semantics",
      ],
      [
        {
          ...base,
          joints: [
            fold,
            {
              ...fold,
              jointId: "joint-duplicate-crease",
            } as FoldJointV1,
          ],
        },
        "unmapped_score_path",
      ],
      [{ ...base, joints: [] }, "unmapped_score_path"],
      [
        {
          ...base,
          joints: [{ ...fold, creasePathId: "crease-missing" }],
        },
        "unmapped_score_path",
      ],
    ];
    for (const [ir, code] of cases) {
      expect(exportFabricationFold(sourceFor(ir))).toMatchObject({
        status: "omitted",
        reason: { code },
      });
    }
  });
});

describe("GLB export boundaries", () => {
  it("fails closed for stale sources, empty geometry, topology, contours, and transforms", () => {
    const ir = compiledFixture();
    const stale = sourceFor(ir);
    expect(
      exportFabricationGlb({
        ...stale,
        verification: { ...stale.verification, irHash: "0".repeat(64) },
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid_source" } });

    const empty: FabricationIRV1 = {
      ...ir,
      paths: [],
      panels: [],
      bodies: [],
      joints: [],
      connectors: [],
      driver: null,
      outputs: [],
      couplings: [],
      semanticParts: [],
      semanticConstraints: [],
      assemblyOperations: [],
    };
    expect(exportFabricationGlb(sourceFor(empty))).toMatchObject({
      ok: false,
      error: { code: "invalid_geometry" },
    });

    const disconnected: FabricationIRV1 = {
      ...ir,
      bodies: [
        ...ir.bodies,
        {
          bodyId: "body-disconnected",
          label: "Disconnected",
          panelIds: [],
          initialTransform: {
            translationMm: { xMm: 0, yMm: 0, zMm: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
          grounded: false,
          semanticPartIds: [],
        },
      ],
    };
    expect(exportFabricationGlb(sourceFor(disconnected))).toMatchObject({
      ok: false,
      error: { code: "invalid_geometry" },
    });

    const panel = ir.panels[0];
    const body = ir.bodies[0];
    if (!panel || !body) throw new Error("GLB fixture is incomplete.");
    const crossedContour: FabricationIRV1 = {
      ...ir,
      panels: [
        {
          ...panel,
          contour: {
            vertices: [
              { xMm: 0, yMm: 0 },
              { xMm: 10, yMm: 10 },
              { xMm: 0, yMm: 10 },
              { xMm: 10, yMm: 0 },
            ],
          },
        },
        ...ir.panels.slice(1),
      ],
    };
    expect(exportFabricationGlb(sourceFor(crossedContour))).toMatchObject({
      ok: false,
      error: { code: "invalid_geometry" },
    });

    const invalidTransform: FabricationIRV1 = {
      ...ir,
      bodies: [
        {
          ...body,
          initialTransform: {
            ...body.initialTransform,
            rotation: { x: 0, y: 0, z: 0, w: 2 },
          },
        },
        ...ir.bodies.slice(1),
      ],
    };
    expect(exportFabricationGlb(sourceFor(invalidTransform))).toMatchObject({
      ok: false,
      error: { code: "invalid_geometry" },
    });
  });

  it("rejects source motion that cannot produce deterministic keyframes", () => {
    const ir = compiledFixture();
    const driver = ir.driver;
    if (!driver) throw new Error("Dynamic fixture driver missing.");
    const invalidMotion: FabricationIRV1 = {
      ...ir,
      driver: { ...driver, maximumValue: driver.maximumValue + 1_000 },
    };
    expect(exportFabricationGlb(sourceFor(invalidMotion))).toMatchObject({
      ok: false,
      error: { code: "invalid_animation" },
    });
  });
});
