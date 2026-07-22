import { describe, expect, it } from "vitest";

import { synthesizeFabricationDesign } from "@/core/fabrication/design-synthesis";
import {
  MAX_SYNTHESIZABLE_THICKNESS_MM,
  normalizeFabricationIntentFeasibility,
  stripRedundantSpecRelations,
} from "@/core/fabrication/feasibility-normalization";
import type { FabricationIntentV1 } from "@/core/fabrication/types";
import type { FabricationDesignSpecV3 } from "@/core/fabrication/design-spec";

// An over-constrained playing-card box like GPT-5.6 Sol emits live: A4 stock,
// 0.5 mm cardstock, a touch between every adjacent wall, and a tab-slot lock on
// all seven seams. Before normalization this exhausts the synthesis budget.
const overConstrainedIntent = (): FabricationIntentV1 => ({
  version: "1",
  intentId: "intent-card-box",
  sourcePrompt: "Playing card box 70x95x25 mm, cardstock, tab lid, no glue.",
  title: "Playing Card Box",
  objectLabel: "playing card box",
  functionalGoal: "A glue-free cardstock box with a tab-locked lid.",
  visualDescription: "Rectangular tuck box with a hinged, tab-locked lid.",
  behavior: "open_close",
  requestedSize: { widthMm: 70, heightMm: 95, depthMm: 25 },
  stockOptions: [
    {
      sheetId: "sheet-a4",
      widthMm: 210,
      heightMm: 297,
      printableMarginMm: 5,
      material: {
        materialId: "cardstock-050",
        label: "Cardstock",
        thicknessMm: 0.5,
        grainDirection: "none",
      },
    },
  ],
  fabricationBudget: {
    maximumSheets: 1,
    maximumPanels: 24,
    maximumJointAndConnectorCount: 24,
    cutsAllowed: true,
    glueAllowed: false,
  },
  semanticConstraints: [],
  priorities: ["mechanical_simplicity", "fabrication_efficiency"],
  scopeStatus: "supported",
  clarificationQuestion: null,
  unsupportedReason: null,
});

const wall = (
  key: string,
  role: FabricationDesignSpecV3["parts"][number]["role"],
  w: number,
  h: number,
) => ({
  key,
  label: key,
  role,
  width: { minimumMm: w - 1, preferredMm: w, maximumMm: w + 1 },
  height: { minimumMm: h - 1, preferredMm: h, maximumMm: h + 1 },
  shapePreference: "rectangle" as const,
});

const overConstrainedSpec = (): FabricationDesignSpecV3 => ({
  version: "3",
  label: "Card box",
  summary: "One-sheet cardstock card box.",
  parts: [
    wall("front", "wall", 70, 95),
    wall("back", "wall", 70, 95),
    wall("leftSide", "wall", 25, 95),
    wall("rightSide", "wall", 25, 95),
    wall("base", "support", 70, 25),
    wall("lid", "moving", 70, 25),
  ],
  relations: [
    { key: "bF", partAKey: "base", partBKey: "front", kind: "touch" },
    { key: "bB", partAKey: "base", partBKey: "back", kind: "touch" },
    { key: "bL", partAKey: "base", partBKey: "leftSide", kind: "touch" },
    { key: "bR", partAKey: "base", partBKey: "rightSide", kind: "touch" },
    { key: "fL", partAKey: "front", partBKey: "leftSide", kind: "touch" },
    { key: "fR", partAKey: "front", partBKey: "rightSide", kind: "touch" },
    { key: "kL", partAKey: "back", partBKey: "leftSide", kind: "touch" },
    { key: "kR", partAKey: "back", partBKey: "rightSide", kind: "touch" },
    {
      key: "lidMotion",
      partAKey: "back",
      partBKey: "lid",
      kind: "open_close",
      angleRangeDeg: { minimum: 0, home: 90, maximum: 90 },
    },
    {
      key: "lidLock",
      partAKey: "lid",
      partBKey: "front",
      kind: "lock",
      lockStyle: "tab_slot",
    },
    {
      key: "fLLock",
      partAKey: "front",
      partBKey: "leftSide",
      kind: "lock",
      lockStyle: "tab_slot",
    },
    {
      key: "fRLock",
      partAKey: "front",
      partBKey: "rightSide",
      kind: "lock",
      lockStyle: "tab_slot",
    },
    {
      key: "bFLock",
      partAKey: "base",
      partBKey: "front",
      kind: "lock",
      lockStyle: "tab_slot",
    },
  ],
  materialConstraints: {
    materialLabel: "Cardstock",
    thickness: { minimumMm: 0.5, preferredMm: 0.5, maximumMm: 0.5 },
  },
  sheetConstraints: { minimumSheets: 1, maximumSheets: 1 },
  glueAllowed: false,
  driver: {
    relationKey: "lidMotion",
    label: "Open or close the lid",
    control: "fold",
  },
  outputs: [
    { key: "lidOut", relationKey: "lidMotion", partKey: "lid", label: "Lid" },
  ],
  visibleLandmarks: [
    {
      key: "baseLm",
      label: "Base",
      partKeys: ["base"],
      importance: "required",
    },
    { key: "lidLm", label: "Lid", partKeys: ["lid"], importance: "required" },
  ],
  aestheticPreferences: ["Rectangular card box"],
  priorities: ["mechanical_simplicity"],
  tolerances: { dimensionMm: 1, clearanceMm: 0.6, angleDeg: 3 },
});

describe("feasibility normalization", () => {
  it("clamps stock thickness and enlarges the sheet for the unfolded net", () => {
    const normalized = normalizeFabricationIntentFeasibility(
      overConstrainedIntent(),
    );
    const stock = normalized.stockOptions[0]!;
    expect(stock.material.thicknessMm).toBe(MAX_SYNTHESIZABLE_THICKNESS_MM);
    // A 70x95x25 box unfolds to a net far larger than A4's 210 mm width.
    expect(stock.widthMm).toBeGreaterThan(210);
    expect(stock.heightMm).toBeGreaterThanOrEqual(stock.widthMm);
  });

  it("drops redundant wall-to-wall relations and surplus seam locks", () => {
    const stripped = stripRedundantSpecRelations(overConstrainedSpec());
    const locks = stripped.relations.filter((r) => r.kind === "lock");
    expect(locks).toHaveLength(1);
    expect(locks[0]!.key).toBe("lidLock");
    // No touch relation may connect two non-base walls after stripping.
    const wallWall = stripped.relations.filter(
      (r) =>
        r.kind === "touch" && r.partAKey !== "base" && r.partBKey !== "base",
    );
    expect(wallWall).toHaveLength(0);
  });

  it("synthesizes a verified design from the normalized over-constrained box", () => {
    const result = synthesizeFabricationDesign(
      normalizeFabricationIntentFeasibility(overConstrainedIntent()),
      overConstrainedSpec(),
      1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.valid).toBe(true);
      expect(result.value.blueprint.connectors.length).toBeGreaterThan(0);
    }
  });
});
