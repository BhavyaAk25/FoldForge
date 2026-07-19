import { describe, expect, it } from "vitest";

import { canonicalSerialize } from "@/core/canonical";
import {
  buildFabricationCandidate,
  finalizeFabricationCandidate,
} from "@/core/fabrication/candidate";
import { compileFabricationProgram } from "@/core/fabrication/compiler";
import {
  dxfArtifactMatchesSource,
  glbArtifactMatchesSource,
} from "@/core/fabrication/export";
import { evaluateMotionState } from "@/core/fabrication/kinematics";
import { fabricationPlanFromProgram } from "@/core/fabrication/planning";
import {
  expandSemanticFabricationPlan,
  semanticPlanToFabricationPlanV1,
} from "@/core/fabrication/semantic-plan-expansion";
import { FabricationPlanV2Schema } from "@/core/fabrication/semantic-plan";
import type {
  FabricationPlanV2,
  SemanticPrismaticJointV2,
} from "@/core/fabrication/semantic-plan";
import type { FabricationIntentV1, Point3Mm } from "@/core/fabrication/types";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";
import {
  fixtureLiveAcceptancePlan,
  fixtureSemanticPlan,
} from "../../fixtures/semantic-plan";

const staticPlan = (): FabricationPlanV2 => {
  const source = fixtureSemanticPlan();
  return {
    ...source,
    topologyKey: "static-panel",
    panels: [source.panels[0]!],
    bodies: [source.bodies[0]!],
    joints: [],
    connectorRelationships: [],
    driver: null,
    outputs: [],
    couplings: [],
    landmarks: [],
    assemblyStrategy: "fold_only",
    designSummary: "One static panel.",
  };
};

const connectorPlan = (): FabricationPlanV2 => {
  const source = fixtureSemanticPlan();
  const panel = source.panels[0]!;
  return {
    ...source,
    topologyKey: "static-tab-slot",
    panels: [
      {
        ...panel,
        key: "tab",
        bodyKey: "assembly",
        widthMm: 50,
        heightMm: 40,
      },
      {
        ...panel,
        key: "slot",
        bodyKey: "assembly",
        widthMm: 50,
        heightMm: 40,
      },
    ],
    bodies: [
      {
        key: "assembly",
        label: "Assembly",
        panelKeys: ["tab", "slot"],
        grounded: true,
      },
    ],
    joints: [],
    connectorRelationships: [
      {
        key: "lock",
        tabAttachment: { panelKey: "tab", edgeIndex: 0 },
        slotAttachment: { panelKey: "slot", edgeIndex: 0 },
        spanMm: 12,
        tabDepthMm: 6,
        slotInsetMm: 8,
        clearanceMm: 0.5,
      },
    ],
    driver: null,
    outputs: [],
    couplings: [],
    landmarks: [],
    assemblyStrategy: "tab_slot",
    designSummary: "A static reciprocal tab and slot test article.",
  };
};

const guidedSliderPlan = (
  travelDirection: SemanticPrismaticJointV2["travelDirection"] = "sheet_normal",
): FabricationPlanV2 => {
  const source = fixtureSemanticPlan();
  const panels = source.panels.map((panel, index) => ({
    ...panel,
    key: index === 0 ? "base" : "slider",
    bodyKey: index === 0 ? "base" : "slider",
    widthMm: 60,
    heightMm: 40,
  }));
  return {
    ...source,
    topologyKey: "guided-slider",
    panels,
    bodies: [
      { key: "base", label: "Base", panelKeys: ["base"], grounded: true },
      {
        key: "slider",
        label: "Slider",
        panelKeys: ["slider"],
        grounded: false,
      },
    ],
    joints: [
      {
        key: "slide",
        kind: "prismatic",
        parentBodyKey: "base",
        childBodyKey: "slider",
        parentAttachment: { panelKey: "base", edgeIndex: 0 },
        childAttachment: { panelKey: "slider", edgeIndex: 0 },
        travelDirection,
        guideRelationshipKeys: ["guide"],
        homeTravelMm: 0,
        minimumTravelMm: 0,
        maximumTravelMm: 20,
      },
    ],
    connectorRelationships: [
      {
        key: "guide",
        tabAttachment: { panelKey: "slider", edgeIndex: 0 },
        slotAttachment: { panelKey: "base", edgeIndex: 0 },
        spanMm: 10,
        tabDepthMm: 3,
        slotInsetMm: 2,
        clearanceMm: 0.5,
      },
    ],
    driver: {
      key: "pull",
      jointKey: "slide",
      label: "Pull slider",
      control: "pull_tab",
      minimumValue: 0,
      maximumValue: 20,
      homeValue: 0,
      direction: 1,
    },
    outputs: [
      {
        key: "slide",
        jointKey: "slide",
        bodyKey: "slider",
        label: "Slider travel",
        minimumValue: 0,
        maximumValue: 20,
        direction: 1,
      },
    ],
    couplings: [],
    landmarks: [],
    assemblyStrategy: "articulated_tab_slot",
    designSummary: "A guided panel with one bounded prismatic motion.",
  };
};

const expectMappingError = (
  intent: unknown,
  plan: unknown,
  code: string,
): void => {
  expect(semanticPlanToFabricationPlanV1(intent, plan)).toMatchObject({
    ok: false,
    error: { kind: "semantic_plan_mapping", code },
  });
};

describe("semantic FabricationPlanV2", () => {
  it("strictly excludes model-authored global and reciprocal geometry", () => {
    const plan = fixtureSemanticPlan();
    expect(FabricationPlanV2Schema.safeParse(plan).success).toBe(true);
    for (const forbidden of [
      "flatTransform",
      "initialTransform",
      "quaternion",
      "axis",
      "originMm",
      "mateConnectorId",
      "centerline",
      "packing",
    ]) {
      expect(canonicalSerialize(plan)).not.toContain(forbidden);
    }
    expect(
      FabricationPlanV2Schema.safeParse({ ...plan, flatTransform: {} }).success,
    ).toBe(false);
  });

  it.each([
    ["triangle-top", { kind: "triangle", apexSide: "top" }, 3],
    ["triangle-right", { kind: "triangle", apexSide: "right" }, 3],
    ["triangle-bottom", { kind: "triangle", apexSide: "bottom" }, 3],
    ["triangle-left", { kind: "triangle", apexSide: "left" }, 3],
    [
      "trapezoid-top",
      { kind: "trapezoid", shortSide: "top", shortSideRatio: 0.5 },
      4,
    ],
    [
      "trapezoid-right",
      { kind: "trapezoid", shortSide: "right", shortSideRatio: 0.5 },
      4,
    ],
    [
      "trapezoid-bottom",
      { kind: "trapezoid", shortSide: "bottom", shortSideRatio: 0.5 },
      4,
    ],
    [
      "trapezoid-left",
      { kind: "trapezoid", shortSide: "left", shortSideRatio: 0.5 },
      4,
    ],
  ] as const)(
    "maps the %s outline deterministically",
    (_name, outline, count) => {
      const source = staticPlan();
      const plan = {
        ...source,
        panels: [{ ...source.panels[0]!, outline }],
      };
      const result = semanticPlanToFabricationPlanV1(
        { ...fixtureIntent(), behavior: "static" },
        plan,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.panels[0]?.contour.vertices).toHaveLength(count);
      }
    },
  );

  it("rejects duplicate semantic keys and the derived joint-connector limit", () => {
    const source = fixtureSemanticPlan();
    const relationship = {
      key: "lock",
      tabAttachment: { panelKey: "base", edgeIndex: 0 },
      slotAttachment: { panelKey: "wing", edgeIndex: 0 },
      spanMm: 10,
      tabDepthMm: 4,
      slotInsetMm: 4,
      clearanceMm: 0.5,
    } as const;
    const duplicateCollections = [
      { ...source, panels: [source.panels[0]!, source.panels[0]!] },
      { ...source, bodies: [source.bodies[0]!, source.bodies[0]!] },
      { ...source, joints: [source.joints[0]!, source.joints[0]!] },
      {
        ...source,
        connectorRelationships: [relationship, relationship],
      },
      { ...source, outputs: [source.outputs[0]!, source.outputs[0]!] },
      { ...source, couplings: [source.couplings[0]!, source.couplings[0]!] },
      { ...source, landmarks: [source.landmarks[0]!, source.landmarks[0]!] },
    ];
    for (const invalid of duplicateCollections) {
      expect(FabricationPlanV2Schema.safeParse(invalid).success).toBe(false);
    }
    const overDerivedLimit = {
      ...source,
      connectorRelationships: Array.from({ length: 12 }, (_, index) => ({
        ...relationship,
        key: `lock-${index}`,
      })),
    };
    const parsed = FabricationPlanV2Schema.safeParse(overDerivedLimit);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.code === "custom")).toBe(
        true,
      );
    }
  });

  it("returns typed contract errors for malformed intent and semantic plan input", () => {
    expectMappingError({}, fixtureSemanticPlan(), "contract_invalid");
    expectMappingError(fixtureIntent(), {}, "contract_invalid");
  });

  it.each([
    [
      "self-intersecting outer polygon",
      {
        kind: "polygon",
        vertices: [
          { u: 0, v: 0 },
          { u: 1, v: 1 },
          { u: 0, v: 1 },
          { u: 1, v: 0 },
        ],
      },
      [],
    ],
    [
      "sub-square-millimetre outer polygon",
      {
        kind: "polygon",
        vertices: [
          { u: 0, v: 0 },
          { u: 0.001, v: 0 },
          { u: 0, v: 0.001 },
        ],
      },
      [],
    ],
    [
      "self-intersecting inner cut",
      { kind: "rectangle" },
      [
        {
          vertices: [
            { u: 0.2, v: 0.2 },
            { u: 0.8, v: 0.8 },
            { u: 0.2, v: 0.8 },
            { u: 0.8, v: 0.2 },
          ],
        },
      ],
    ],
    [
      "out-of-panel inner cut",
      { kind: "rectangle" },
      [
        {
          vertices: [
            { u: 0, v: 0.2 },
            { u: 0.4, v: 0.2 },
            { u: 0.4, v: 0.4 },
          ],
        },
      ],
    ],
  ] as const)("rejects a %s", (_name, outline, innerCutContours) => {
    const source = staticPlan();
    const plan = {
      ...source,
      panels: [{ ...source.panels[0]!, outline, innerCutContours }],
    };
    expectMappingError(
      { ...fixtureIntent(), behavior: "static" },
      plan,
      "invalid_outline",
    );
  });

  it("rejects inconsistent panel-body ownership and grounding", () => {
    const source = fixtureSemanticPlan();
    expectMappingError(
      fixtureIntent(),
      {
        ...source,
        panels: source.panels.map((panel, index) =>
          index === 0 ? { ...panel, bodyKey: "missing" } : panel,
        ),
      },
      "invalid_reference",
    );
    expectMappingError(
      fixtureIntent(),
      {
        ...source,
        bodies: source.bodies.map((body, index) =>
          index === 0
            ? { ...body, panelKeys: [...body.panelKeys, "missing"] }
            : body,
        ),
      },
      "invalid_reference",
    );
    expectMappingError(
      fixtureIntent(),
      {
        ...source,
        bodies: source.bodies.map((body) => ({ ...body, grounded: false })),
      },
      "ambiguous_ground",
    );
    expectMappingError(
      fixtureIntent(),
      {
        ...source,
        bodies: source.bodies.map((body) => ({ ...body, grounded: true })),
      },
      "ambiguous_ground",
    );
  });

  it("is smaller than the legacy geometric plan and expands byte-stably", () => {
    const intent = fixtureIntent();
    const plan = fixtureSemanticPlan();
    const first = expandSemanticFabricationPlan(intent, plan, 1);
    const repeated = expandSemanticFabricationPlan(intent, plan, 1);
    expect(first).toEqual(repeated);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value).toMatchObject({
      topologyId: "topology-two-panel-fold",
      blueprint: {
        panels: [{ panelId: "panel-base" }, { panelId: "panel-wing" }],
        joints: [{ jointId: "joint-wing", kind: "fold" }],
      },
    });
    expect(Buffer.byteLength(canonicalSerialize(plan), "utf8")).toBeLessThan(
      Buffer.byteLength(
        canonicalSerialize(fabricationPlanFromProgram(fixtureProgram())),
        "utf8",
      ),
    );
  });

  it("maps a static rectangular box without model-authored placement", () => {
    const intent = { ...fixtureIntent(), behavior: "static" as const };
    const plan = {
      ...fixtureSemanticPlan(),
      candidateLabel: "Five-panel open box",
      topologyKey: "open-box",
      panels: [
        ["base", "base", 70, 95],
        ["front", "front", 70, 25],
        ["back", "back", 70, 25],
        ["left", "left", 95, 25],
        ["right", "right", 95, 25],
      ].map(([key, bodyKey, widthMm, heightMm]) => ({
        key: String(key),
        sheetIndex: 0,
        bodyKey: String(bodyKey),
        label: String(key),
        role: "structural" as const,
        widthMm: Number(widthMm),
        heightMm: Number(heightMm),
        outline: { kind: "rectangle" as const },
        innerCutContours: [],
      })),
      bodies: ["base", "front", "back", "left", "right"].map((key, index) => ({
        key,
        label: key,
        panelKeys: [key],
        grounded: index === 0,
      })),
      joints: [
        ["front", 0, 0],
        ["back", 2, 0],
        ["left", 3, 0],
        ["right", 1, 0],
      ].map(([key, parentEdge, childEdge]) => ({
        key: String(key),
        kind: "fold" as const,
        parentBodyKey: "base",
        childBodyKey: String(key),
        parentAttachment: {
          panelKey: "base",
          edgeIndex: Number(parentEdge),
        },
        childAttachment: {
          panelKey: String(key),
          edgeIndex: Number(childEdge),
        },
        foldDirection: "valley" as const,
        homeAngleDeg: 90,
        minimumAngleDeg: 0,
        maximumAngleDeg: 90,
      })),
      connectorRelationships: [],
      driver: null,
      outputs: [],
      couplings: [],
      landmarks: [],
      assemblyStrategy: "fold_only" as const,
      designSummary: "An open rectangular box with four folded walls.",
    };
    const result = semanticPlanToFabricationPlanV1(intent, plan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.panels).toHaveLength(5);
      expect(result.value.joints).toHaveLength(4);
      expect(
        result.value.panels.every(
          (panel) => panel.flatTransform.translationMm.xMm >= 0,
        ),
      ).toBe(true);
    }
  });

  it("expands the sealed six-panel box into exact verified source-equivalent exports", () => {
    const panelIds = ["base", "front", "back", "left", "right", "lid"];
    const intent: FabricationIntentV1 = {
      version: "1",
      intentId: "intent-live-sol-acceptance-box",
      sourcePrompt:
        "Make a static playing-card box from one 210 by 297 mm sheet of 0.4 mm cardstock. The assembled box must be exactly 70 mm wide, 95 mm high, and 25 mm deep. Use a bottom, four walls, and a fixed closed top panel secured by a tab and slot.",
      title: "Playing-card box",
      objectLabel: "rectangular cardstock box",
      functionalGoal: "Statically enclose a deck with a tab-locked top panel.",
      visualDescription: "A clean six-panel rectangular enclosure.",
      behavior: "static",
      requestedSize: { widthMm: 70, heightMm: 95, depthMm: 25 },
      stockOptions: [
        {
          sheetId: "sheet-box",
          widthMm: 210,
          heightMm: 297,
          printableMarginMm: 5,
          material: {
            materialId: "card-040",
            label: "0.4 mm cardstock",
            thicknessMm: 0.4,
            grainDirection: "y",
          },
        },
      ],
      fabricationBudget: {
        maximumSheets: 1,
        maximumPanels: 6,
        maximumJointAndConnectorCount: 7,
        cutsAllowed: true,
        glueAllowed: false,
      },
      semanticConstraints: [],
      priorities: ["mechanical_simplicity", "fabrication_efficiency"],
      scopeStatus: "supported",
      clarificationQuestion: null,
      unsupportedReason: null,
    };
    const panel = (key: string, widthMm: number, heightMm: number) => ({
      key,
      sheetIndex: 0,
      bodyKey: key,
      label: key,
      role: key === "lid" ? ("output" as const) : ("structural" as const),
      widthMm,
      heightMm,
      outline: { kind: "rectangle" as const },
      innerCutContours: [],
    });
    const fold = (
      key: string,
      parentBodyKey: string,
      parentPanelKey: string,
      parentEdgeIndex: number,
      childPanelKey: string,
      childEdgeIndex: number,
    ) => ({
      key,
      kind: "fold" as const,
      parentBodyKey,
      childBodyKey: childPanelKey,
      parentAttachment: {
        panelKey: parentPanelKey,
        edgeIndex: parentEdgeIndex,
      },
      childAttachment: {
        panelKey: childPanelKey,
        edgeIndex: childEdgeIndex,
      },
      foldDirection: "valley" as const,
      homeAngleDeg: 90,
      minimumAngleDeg: 90,
      maximumAngleDeg: 90,
    });
    const plan = {
      version: "2" as const,
      candidateLabel: "One-sheet tab-locked enclosure",
      topologyKey: "six-panel-box",
      panels: [
        panel("base", 70, 95),
        panel("front", 70, 25),
        panel("back", 70, 25),
        panel("left", 25, 95),
        panel("right", 25, 95),
        panel("lid", 70, 95),
      ],
      bodies: panelIds.map((key, index) => ({
        key,
        label: `${key} body`,
        panelKeys: [key],
        grounded: index === 0,
      })),
      joints: [
        fold("front", "base", "base", 0, "front", 2),
        fold("back", "base", "base", 2, "back", 0),
        fold("left", "base", "base", 3, "left", 1),
        fold("right", "base", "base", 1, "right", 3),
        fold("lid", "back", "back", 2, "lid", 0),
      ],
      connectorRelationships: [
        {
          key: "lid-lock",
          tabAttachment: { panelKey: "lid", edgeIndex: 2 },
          slotAttachment: { panelKey: "front", edgeIndex: 0 },
          spanMm: 14,
          tabDepthMm: 6,
          slotInsetMm: 2,
          clearanceMm: 0.6,
        },
      ],
      driver: null,
      outputs: [],
      couplings: [],
      landmarks: panelIds.map((key) => ({
        key,
        label: key,
        role: key === "lid" ? "fixed closed top" : "enclosure panel",
        geometryRefs: [{ kind: "panel" as const, key }],
      })),
      assemblyStrategy: "tab_slot" as const,
      designSummary:
        "A continuous cross net folded into a static closed enclosure. The top crease is fixed at the assembled rest angle and has no open-close driver.",
    };

    const mapped = semanticPlanToFabricationPlanV1(intent, plan);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const expanded = expandSemanticFabricationPlan(intent, plan, 1);
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return;
    expect(
      expanded.value.blueprint.panels.map((value) => value.flatTransform),
    ).toEqual(mapped.value.panels.map((value) => value.flatTransform));
    expect(
      expanded.value.blueprint.joints.map((value) =>
        value.kind === "prismatic" ? null : value.axis,
      ),
    ).toEqual(
      mapped.value.joints.map((value) =>
        value.kind === "prismatic" ? null : value.axis,
      ),
    );
    const compiled = compileFabricationProgram(intent, expanded.value);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.value.semanticConstraints).toEqual([]);
    const home = evaluateMotionState(compiled.value);
    expect(home.ok).toBe(true);
    if (!home.ok) return;
    const points = Object.values(home.value.panelVertices).flat() as Point3Mm[];
    const spans = ["xMm", "yMm", "zMm"].map(
      (coordinate) =>
        Math.max(
          ...points.map((point) => point[coordinate as keyof Point3Mm]),
        ) -
        Math.min(...points.map((point) => point[coordinate as keyof Point3Mm])),
    );
    expect([...spans].sort((left, right) => left - right)).toEqual([
      expect.closeTo(25, 9),
      expect.closeTo(70, 9),
      expect.closeTo(95, 9),
    ]);
    const candidateId = "candidate-semantic-box";
    const report = verifyFabricationIr(compiled.value, candidateId);
    expect(report.failures).toEqual([]);
    expect(report.valid).toBe(true);
    const candidate = buildFabricationCandidate({
      candidateId,
      intent,
      program: expanded.value,
      selectionStatus: "selected",
      provenance: {
        compilerVersion: "semantic-plan-v2-test",
        generatedAtIso: "2026-07-18T00:00:00.000Z",
        deterministicSeed: 20260718,
        modelId: null,
        modelResponseId: null,
        modelPlanHash: null,
        planExpanderVersion: "3",
        parentCandidateId: null,
        appliedPatchIds: [],
        repairCycle: 0,
      },
    });
    expect(candidate.ok).toBe(true);
    if (!candidate.ok) return;
    const finalized = finalizeFabricationCandidate({
      candidate: candidate.value,
      requestedFormats: ["svg", "dxf", "glb", "json"],
    });
    expect(finalized.ok).toBe(true);
    if (!finalized.ok) return;
    const dxf = finalized.value.artifacts.find(
      (artifact) => artifact.format === "dxf",
    );
    const glb = finalized.value.artifacts.find(
      (artifact) => artifact.format === "glb",
    );
    const svg = finalized.value.artifacts.find(
      (artifact) => artifact.format === "svg",
    );
    const json = finalized.value.artifacts.find(
      (artifact) => artifact.format === "json",
    );
    expect(
      finalized.value.artifacts.map((artifact) => artifact.format),
    ).toEqual(["svg", "dxf", "glb", "json"]);
    const svgText = svg ? new TextDecoder().decode(svg.bytes) : "";
    expect(svgText).toContain('id="calibration-50mm"');
    expect(svgText).toContain(
      `data-source-ir-sha256="${candidate.value.provenance.irHash}"`,
    );
    const jsonDocument = JSON.parse(
      json ? new TextDecoder().decode(json.bytes) : "null",
    ) as {
      readonly sourceCandidateId?: string;
      readonly sourceIrHash?: string;
      readonly payload?: { readonly program?: { readonly programId?: string } };
    } | null;
    expect(jsonDocument).toMatchObject({
      sourceCandidateId: candidateId,
      sourceIrHash: candidate.value.provenance.irHash,
      payload: { program: { programId: expanded.value.programId } },
    });
    expect(
      dxf &&
        dxfArtifactMatchesSource(
          dxf.bytes,
          compiled.value,
          candidateId,
          finalized.value.candidate.provenance,
        ),
    ).toBe(true);
    expect(
      glb &&
        glbArtifactMatchesSource(
          glb.bytes,
          compiled.value,
          candidateId,
          finalized.value.candidate.provenance,
        ),
    ).toBe(true);
  });

  it("rejects a static two-panel interior overlap without semantic constraints", () => {
    const intent: FabricationIntentV1 = {
      ...fixtureIntent(),
      behavior: "static",
      semanticConstraints: [],
    };
    const source = fixtureSemanticPlan();
    const plan: FabricationPlanV2 = {
      ...source,
      joints: source.joints.map((joint) => ({
        ...joint,
        homeAngleDeg: 180,
        minimumAngleDeg: 180,
        maximumAngleDeg: 180,
      })),
      driver: null,
      outputs: [],
      couplings: [],
      landmarks: [],
      designSummary:
        "A deliberately invalid fixed fold that lays one panel over the other.",
    };
    const expanded = expandSemanticFabricationPlan(intent, plan, 1);
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return;
    const compiled = compileFabricationProgram(intent, expanded.value);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.value.panels).toHaveLength(2);
    expect(compiled.value.driver).toBeNull();
    expect(compiled.value.semanticConstraints).toEqual([]);

    const report = verifyFabricationIr(
      compiled.value,
      "candidate-static-two-panel-interior-overlap",
    );
    expect(report.failedAtStage).toBe("collision");
    expect(report.failures[0]).toMatchObject({
      failureId: "collision.minimum_clearance",
      geometryRefs: expect.arrayContaining([
        { kind: "panel", id: "panel-base" },
        { kind: "panel", id: "panel-wing" },
      ]),
    });
  });

  it("rejects a concave static intersection between separated seam fragments", () => {
    const baseIntent = fixtureIntent();
    const intent: FabricationIntentV1 = {
      ...baseIntent,
      behavior: "static",
      requestedSize: { widthMm: 75, heightMm: 95, depthMm: 25 },
      stockOptions: [
        {
          ...baseIntent.stockOptions[0]!,
          widthMm: 210,
          heightMm: 297,
          printableMarginMm: 5,
          material: {
            ...baseIntent.stockOptions[0]!.material,
            thicknessMm: 0.4,
          },
        },
      ],
      fabricationBudget: {
        ...baseIntent.fabricationBudget,
        maximumPanels: 6,
        maximumJointAndConnectorCount: 7,
      },
      semanticConstraints: [],
    };
    const source = fixtureLiveAcceptancePlan();
    const plan: FabricationPlanV2 = {
      ...source,
      panels: source.panels.map((panel) =>
        panel.key === "lid"
          ? {
              ...panel,
              widthMm: 80,
              outline: {
                kind: "polygon" as const,
                vertices: [
                  { u: 0.0625, v: 0 },
                  { u: 0.9375, v: 0 },
                  { u: 0.9375, v: 1 },
                  { u: 0.0625, v: 1 },
                  { u: 0.0625, v: 15 / 19 },
                  { u: 0, v: 15 / 19 },
                  { u: 0, v: 4 / 19 },
                  { u: 0.0625, v: 4 / 19 },
                ],
              },
            }
          : panel,
      ),
    };
    const expanded = expandSemanticFabricationPlan(intent, plan, 1);
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return;
    const compiled = compileFabricationProgram(intent, expanded.value);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const report = verifyFabricationIr(
      compiled.value,
      "candidate-concave-interior-line",
    );
    expect(report.failedAtStage).toBe("collision");
    expect(report.failures[0]).toMatchObject({
      failureId: "collision.minimum_clearance",
      geometryRefs: expect.arrayContaining([
        { kind: "panel", id: "panel-left" },
        { kind: "panel", id: "panel-lid" },
      ]),
    });
  });

  it("preserves an arbitrary normalized polygon escape hatch", () => {
    const intent = { ...fixtureIntent(), behavior: "static" as const };
    const plan = {
      ...fixtureSemanticPlan(),
      topologyKey: "faceted-sign",
      panels: [
        {
          ...fixtureSemanticPlan().panels[0]!,
          widthMm: 60,
          heightMm: 50,
          outline: {
            kind: "polygon" as const,
            vertices: [
              { u: 0.5, v: 0 },
              { u: 1, v: 0.4 },
              { u: 0.8, v: 1 },
              { u: 0.2, v: 1 },
              { u: 0, v: 0.4 },
            ],
          },
        },
      ],
      bodies: [fixtureSemanticPlan().bodies[0]!],
      joints: [],
      connectorRelationships: [],
      driver: null,
      outputs: [],
      couplings: [],
      landmarks: [],
    };
    const result = semanticPlanToFabricationPlanV1(intent, plan);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.panels[0]?.contour.vertices).toHaveLength(5);
  });

  it("derives reciprocal tab-slot geometry from one semantic relationship", () => {
    const intent = { ...fixtureIntent(), behavior: "static" as const };
    const first = fixtureSemanticPlan().panels[0]!;
    const plan = {
      ...fixtureSemanticPlan(),
      topologyKey: "tab-slot-card",
      panels: [
        {
          ...first,
          key: "tab",
          bodyKey: "assembly",
          widthMm: 50,
          heightMm: 40,
        },
        {
          ...first,
          key: "slot",
          bodyKey: "assembly",
          widthMm: 50,
          heightMm: 40,
        },
      ],
      bodies: [
        {
          key: "assembly",
          label: "Assembly",
          panelKeys: ["tab", "slot"],
          grounded: true,
        },
      ],
      joints: [],
      connectorRelationships: [
        {
          key: "lock",
          tabAttachment: { panelKey: "tab", edgeIndex: 0 },
          slotAttachment: { panelKey: "slot", edgeIndex: 0 },
          spanMm: 12,
          tabDepthMm: 6,
          slotInsetMm: 8,
          clearanceMm: 0.5,
        },
      ],
      driver: null,
      outputs: [],
      couplings: [],
      landmarks: [
        {
          key: "lock",
          label: "Lock",
          role: "closure",
          geometryRefs: [
            { kind: "connector_relationship" as const, key: "lock" },
          ],
        },
      ],
      assemblyStrategy: "tab_slot" as const,
    };
    const result = semanticPlanToFabricationPlanV1(intent, plan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.connectors).toEqual([
        expect.objectContaining({
          connectorId: "connector-lock-tab",
          kind: "tab",
          mateConnectorId: "connector-lock-slot",
        }),
        expect.objectContaining({
          connectorId: "connector-lock-slot",
          kind: "slot",
          mateConnectorId: "connector-lock-tab",
        }),
      ]);
    }
  });

  it("derives connectors for clockwise panels and material thicker than the minimum slot width", () => {
    const source = connectorPlan();
    const clockwise = {
      kind: "polygon" as const,
      vertices: [
        { u: 0, v: 0 },
        { u: 0, v: 1 },
        { u: 1, v: 1 },
        { u: 1, v: 0 },
      ],
    };
    const intent = {
      ...fixtureIntent(),
      behavior: "static" as const,
      stockOptions: fixtureIntent().stockOptions.map((sheet) => ({
        ...sheet,
        material: { ...sheet.material, thicknessMm: 2 },
      })),
    };
    const result = semanticPlanToFabricationPlanV1(intent, {
      ...source,
      panels: source.panels.map((panel) => ({ ...panel, outline: clockwise })),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const slot = result.value.connectors.find(
        (connector) => connector.kind === "slot",
      );
      expect(slot?.kind === "slot" ? slot.widthMm : 0).toBeCloseTo(2.51);
    }
  });

  it("rejects invalid connector references, edges, sizing, and local geometry", () => {
    const intent = { ...fixtureIntent(), behavior: "static" as const };
    const source = connectorPlan();
    const relationship = source.connectorRelationships[0]!;
    const withRelationship = (
      replacement: FabricationPlanV2["connectorRelationships"][number],
    ) => ({ ...source, connectorRelationships: [replacement] });
    expectMappingError(
      intent,
      withRelationship({
        ...relationship,
        tabAttachment: { panelKey: "missing", edgeIndex: 0 },
      }),
      "invalid_reference",
    );
    expectMappingError(
      intent,
      withRelationship({
        ...relationship,
        tabAttachment: { panelKey: "tab", edgeIndex: 9 },
      }),
      "invalid_edge",
    );
    expectMappingError(
      intent,
      withRelationship({
        ...relationship,
        slotAttachment: { panelKey: "slot", edgeIndex: 9 },
      }),
      "invalid_edge",
    );
    expectMappingError(
      intent,
      withRelationship({ ...relationship, spanMm: 49 }),
      "unsupported_mapping",
    );
    expectMappingError(
      intent,
      withRelationship({ ...relationship, tabDepthMm: 40 }),
      "unsupported_mapping",
    );
    expectMappingError(
      intent,
      withRelationship({ ...relationship, slotInsetMm: 100 }),
      "unsupported_mapping",
    );
  });

  it("derives an exact non-origin diagonal revolute home transform", () => {
    const intent = { ...fixtureIntent(), behavior: "rotate" as const };
    const source = fixtureSemanticPlan();
    const relationship = {
      key: "hinge",
      tabAttachment: { panelKey: "wing", edgeIndex: 2 },
      slotAttachment: { panelKey: "base", edgeIndex: 2 },
      spanMm: 10,
      tabDepthMm: 5,
      slotInsetMm: 6,
      clearanceMm: 0.5,
    };
    const plan = {
      ...source,
      panels: source.panels.map((panel) => ({
        ...panel,
        widthMm: 60,
        heightMm: 40,
        outline: {
          kind: "trapezoid" as const,
          shortSide: "top" as const,
          shortSideRatio: 0.5,
        },
      })),
      joints: [
        {
          key: "wing",
          kind: "revolute" as const,
          parentBodyKey: "base",
          childBodyKey: "wing",
          parentAttachment: { panelKey: "base", edgeIndex: 1 },
          childAttachment: { panelKey: "wing", edgeIndex: 3 },
          connectorRelationshipKeys: ["hinge"],
          homeAngleDeg: 45,
          minimumAngleDeg: 0,
          maximumAngleDeg: 90,
        },
      ],
      connectorRelationships: [relationship],
      driver: { ...source.driver!, control: "rotate" as const, homeValue: 45 },
      assemblyStrategy: "articulated_tab_slot" as const,
    };
    const expanded = expandSemanticFabricationPlan(intent, plan, 1);
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return;
    const joint = expanded.value.blueprint.joints[0]!;
    expect(joint.kind).toBe("revolute");
    if (joint.kind !== "revolute") return;
    expect(Math.abs(joint.axis.startMm.xMm)).toBeGreaterThan(0);
    expect(Math.abs(joint.axis.startMm.yMm)).toBeGreaterThan(0);
    expect(
      Math.abs(joint.axis.endMm.xMm - joint.axis.startMm.xMm),
    ).toBeGreaterThan(0);
    expect(
      Math.abs(joint.axis.endMm.yMm - joint.axis.startMm.yMm),
    ).toBeGreaterThan(0);
    const compiled = compileFabricationProgram(intent, expanded.value);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const home = evaluateMotionState(compiled.value, 45);
    expect(home.ok).toBe(true);
    if (home.ok) expect(home.value.maximumClosureResidualMm).toBeLessThan(1e-8);
  });

  it("derives a prismatic guide axis, home alignment, pull-tab, and cam-slot couplings", () => {
    const intent = { ...fixtureIntent(), behavior: "slide" as const };
    const source = fixtureSemanticPlan();
    const panels = source.panels.map((panel, index) => ({
      ...panel,
      key: index === 0 ? "base" : "slider",
      bodyKey: index === 0 ? "base" : "slider",
      widthMm: 60,
      heightMm: 40,
    }));
    const plan = {
      ...source,
      topologyKey: "guided-slider",
      panels,
      bodies: [
        { key: "base", label: "Base", panelKeys: ["base"], grounded: true },
        {
          key: "slider",
          label: "Slider",
          panelKeys: ["slider"],
          grounded: false,
        },
      ],
      joints: [
        {
          key: "slide",
          kind: "prismatic" as const,
          parentBodyKey: "base",
          childBodyKey: "slider",
          parentAttachment: { panelKey: "base", edgeIndex: 0 },
          childAttachment: { panelKey: "slider", edgeIndex: 0 },
          travelDirection: "sheet_normal" as const,
          guideRelationshipKeys: ["guide"],
          homeTravelMm: 0,
          minimumTravelMm: 0,
          maximumTravelMm: 20,
        },
      ],
      connectorRelationships: [
        {
          key: "guide",
          tabAttachment: { panelKey: "slider", edgeIndex: 0 },
          slotAttachment: { panelKey: "base", edgeIndex: 0 },
          spanMm: 10,
          tabDepthMm: 3,
          slotInsetMm: 2,
          clearanceMm: 0.5,
        },
      ],
      driver: {
        key: "pull",
        jointKey: "slide",
        label: "Pull slider",
        control: "pull_tab" as const,
        minimumValue: 0,
        maximumValue: 20,
        homeValue: 0,
        direction: 1 as const,
      },
      outputs: [
        {
          key: "slide",
          jointKey: "slide",
          bodyKey: "slider",
          label: "Slider travel",
          minimumValue: 0,
          maximumValue: 20,
          direction: 1 as const,
        },
      ],
      couplings: [
        {
          key: "pull",
          kind: "pull_tab" as const,
          driverKey: "pull",
          sliderJointKey: "slide",
          outputJointKeys: ["slide"],
          ratio: 1,
        },
        {
          key: "cam",
          kind: "cam_slot" as const,
          driverKey: "pull",
          connectorRelationshipKey: "guide",
          outputJointKey: "slide",
          branch: "positive" as const,
          phaseOffsetMm: 0,
        },
      ],
      landmarks: [],
      assemblyStrategy: "articulated_tab_slot" as const,
    };
    const mapped = semanticPlanToFabricationPlanV1(intent, plan);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.value.joints).toEqual([
      expect.objectContaining({
        kind: "prismatic",
        axis: { x: 0, y: 0, z: 1 },
      }),
    ]);
    expect(mapped.value.couplings.map((coupling) => coupling.kind)).toEqual([
      "pull_tab",
      "cam_slot",
    ]);
    const expanded = expandSemanticFabricationPlan(intent, plan, 1);
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return;
    const compiled = compileFabricationProgram(intent, expanded.value);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const state = evaluateMotionState(compiled.value, 10);
    expect(state.ok).toBe(true);
    if (state.ok)
      expect(state.value.maximumClosureResidualMm).toBeLessThan(1e-8);
  });

  it.each([
    ["edge_tangent", { x: 1, y: 0, z: 0 }],
    ["edge_normal_inward", { x: -0, y: 1, z: 0 }],
    ["edge_normal_outward", { x: 0, y: -1, z: 0 }],
    ["sheet_normal", { x: 0, y: 0, z: 1 }],
  ] as const)("derives the %s prismatic axis", (direction, expectedAxis) => {
    const mapped = semanticPlanToFabricationPlanV1(
      { ...fixtureIntent(), behavior: "slide" },
      guidedSliderPlan(direction),
    );
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.value.joints[0]).toMatchObject({
        kind: "prismatic",
        axis: expectedAxis,
      });
    }
  });

  it("rejects invalid joint ownership, ranges, and connector relationships", () => {
    const source = fixtureSemanticPlan();
    expectMappingError(
      fixtureIntent(),
      {
        ...source,
        joints: source.joints.map((joint) => ({
          ...joint,
          childBodyKey: "base",
        })),
      },
      "invalid_reference",
    );
    expectMappingError(
      fixtureIntent(),
      {
        ...source,
        joints: source.joints.map((joint) => ({
          ...joint,
          parentBodyKey: "wing",
          childBodyKey: "base",
        })),
      },
      "invalid_reference",
    );
    expectMappingError(
      fixtureIntent(),
      {
        ...source,
        joints: source.joints.map((joint) => ({
          ...joint,
          homeAngleDeg: 100,
        })),
      },
      "invalid_motion",
    );
    expectMappingError(
      { ...fixtureIntent(), behavior: "rotate" },
      {
        ...source,
        joints: source.joints.map((joint) => {
          if (joint.kind !== "fold") throw new Error("fixture invariant");
          const { foldDirection: _foldDirection, ...angular } = joint;
          return {
            ...angular,
            kind: "revolute" as const,
            connectorRelationshipKeys: ["missing"],
          };
        }),
        driver: { ...source.driver!, control: "rotate" as const },
      },
      "invalid_reference",
    );

    const slider = guidedSliderPlan();
    const slideJoint = slider.joints[0]!;
    if (slideJoint.kind !== "prismatic") throw new Error("fixture invariant");
    expectMappingError(
      { ...fixtureIntent(), behavior: "slide" },
      {
        ...slider,
        joints: [{ ...slideJoint, homeTravelMm: 30 }],
      },
      "invalid_motion",
    );
    expectMappingError(
      { ...fixtureIntent(), behavior: "slide" },
      {
        ...slider,
        joints: [{ ...slideJoint, guideRelationshipKeys: ["missing"] }],
      },
      "invalid_reference",
    );
    expectMappingError(
      { ...fixtureIntent(), behavior: "slide" },
      {
        ...slider,
        connectorRelationships: slider.connectorRelationships.map(
          (relationship) => ({
            ...relationship,
            tabAttachment: { panelKey: "slider", edgeIndex: 0 },
            slotAttachment: { panelKey: "slider", edgeIndex: 1 },
          }),
        ),
      },
      "unsupported_mapping",
    );
  });

  it("uses an identity prismatic home transform when the guide has no child-body connector", () => {
    const slider = guidedSliderPlan();
    const plan = {
      ...slider,
      connectorRelationships: slider.connectorRelationships.map(
        (relationship) => ({
          ...relationship,
          tabAttachment: { panelKey: "base", edgeIndex: 2 },
          slotAttachment: { panelKey: "base", edgeIndex: 0 },
        }),
      ),
    };
    const mapped = semanticPlanToFabricationPlanV1(
      { ...fixtureIntent(), behavior: "slide" },
      plan,
    );
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(
        mapped.value.bodies.find((body) => body.bodyId === "body-slider"),
      ).toMatchObject({
        initialTransform: {
          translationMm: { xMm: 0, yMm: 0, zMm: 0 },
        },
      });
    }
  });

  it("selects the declared prismatic guide when unrelated connectors precede it", () => {
    const slider = guidedSliderPlan();
    const guide = slider.connectorRelationships[0]!;
    const mapped = semanticPlanToFabricationPlanV1(
      { ...fixtureIntent(), behavior: "slide" },
      {
        ...slider,
        connectorRelationships: [
          {
            ...guide,
            key: "unrelated",
            spanMm: 8,
          },
          guide,
        ],
      },
    );
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.value.joints[0]).toMatchObject({
        kind: "prismatic",
        guideConnectorIds: ["connector-guide-tab", "connector-guide-slot"],
      });
    }
  });

  it("maps a mirrored-pair coupling to canonical joint identifiers", () => {
    const source = fixtureSemanticPlan();
    const keys = ["base", "input", "left", "right"];
    const panels = keys.map((key, index) => ({
      ...source.panels[index === 0 ? 0 : 1]!,
      key,
      bodyKey: key,
      widthMm: index === 0 ? 60 : 20,
      heightMm: 60,
    }));
    const fold = (
      key: string,
      parentEdgeIndex: number,
      childEdgeIndex: number,
    ) => ({
      key,
      kind: "fold" as const,
      parentBodyKey: "base",
      childBodyKey: key,
      parentAttachment: { panelKey: "base", edgeIndex: parentEdgeIndex },
      childAttachment: { panelKey: key, edgeIndex: childEdgeIndex },
      foldDirection: "valley" as const,
      homeAngleDeg: 0,
      minimumAngleDeg: -90,
      maximumAngleDeg: 90,
    });
    const plan = {
      ...source,
      topologyKey: "mirrored-folds",
      panels,
      bodies: keys.map((key, index) => ({
        key,
        label: key,
        panelKeys: [key],
        grounded: index === 0,
      })),
      joints: [fold("input", 0, 3), fold("left", 3, 1), fold("right", 1, 3)],
      connectorRelationships: [],
      driver: { ...source.driver!, jointKey: "input" },
      outputs: [
        {
          ...source.outputs[0]!,
          key: "left",
          jointKey: "left",
          bodyKey: "left",
        },
        {
          ...source.outputs[0]!,
          key: "right",
          jointKey: "right",
          bodyKey: "right",
        },
      ],
      couplings: [
        {
          key: "mirrored",
          kind: "mirrored_pair" as const,
          inputJointKey: "input",
          leftOutputJointKey: "left",
          rightOutputJointKey: "right",
          ratio: 1,
          phaseOffsetDeg: 0,
        },
      ],
      landmarks: [],
    };
    const mapped = semanticPlanToFabricationPlanV1(
      { ...fixtureIntent(), behavior: "flap" as const },
      plan,
    );
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.value.couplings).toEqual([
        expect.objectContaining({
          kind: "mirrored_pair",
          inputJointId: "joint-input",
          leftOutputJointId: "joint-left",
          rightOutputJointId: "joint-right",
        }),
      ]);
    }
  });

  it("shelf-packs independent components and rejects both oversize and exhausted layouts", () => {
    const source = staticPlan();
    const panel = source.panels[0]!;
    const panels = ["one", "two", "three"].map((key) => ({
      ...panel,
      key,
      bodyKey: "assembly",
      widthMm: 140,
      heightMm: 100,
    }));
    const plan = {
      ...source,
      panels,
      bodies: [
        {
          key: "assembly",
          label: "Assembly",
          panelKeys: panels.map((value) => value.key),
          grounded: true,
        },
      ],
    };
    const mapped = semanticPlanToFabricationPlanV1(
      { ...fixtureIntent(), behavior: "static" },
      plan,
    );
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.value.panels[2]?.flatTransform.translationMm.yMm).toBe(107);
    }
    expectMappingError(
      { ...fixtureIntent(), behavior: "static" },
      {
        ...source,
        panels: [{ ...panel, widthMm: 400 }],
      },
      "packing_failed",
    );
    expectMappingError(
      { ...fixtureIntent(), behavior: "static" },
      {
        ...plan,
        panels: panels.map((value) => ({ ...value, heightMm: 115 })),
      },
      "packing_failed",
    );
  });

  it("rejects unavailable or excessive sheet selection and cross-sheet folds", () => {
    const source = fixtureSemanticPlan();
    const secondSheet = {
      ...fixtureIntent().stockOptions[0]!,
      sheetId: "sheet-b",
    };
    expectMappingError(
      fixtureIntent(),
      {
        ...staticPlan(),
        panels: [
          {
            ...staticPlan().panels[0]!,
            sheetIndex: 1,
          },
        ],
      },
      "invalid_reference",
    );
    expectMappingError(
      {
        ...fixtureIntent(),
        stockOptions: [...fixtureIntent().stockOptions, secondSheet],
      },
      {
        ...source,
        panels: source.panels.map((panel, index) => ({
          ...panel,
          sheetIndex: index,
        })),
      },
      "unsupported_mapping",
    );
    expectMappingError(
      {
        ...fixtureIntent(),
        stockOptions: [...fixtureIntent().stockOptions, secondSheet],
        fabricationBudget: {
          ...fixtureIntent().fabricationBudget,
          maximumSheets: 2,
        },
      },
      {
        ...source,
        panels: source.panels.map((panel, index) => ({
          ...panel,
          sheetIndex: index,
        })),
      },
      "unsupported_mapping",
    );
  });

  it("rejects duplicate child attachments, missing attachment panels, and attachment cycles", () => {
    const source = fixtureSemanticPlan();
    const secondJoint = {
      ...source.joints[0]!,
      key: "wing-again",
    };
    expectMappingError(
      fixtureIntent(),
      { ...source, joints: [source.joints[0]!, secondJoint] },
      "duplicate_reference",
    );
    expectMappingError(
      fixtureIntent(),
      {
        ...source,
        joints: source.joints.map((joint) => ({
          ...joint,
          childAttachment: { panelKey: "missing", edgeIndex: 0 },
        })),
      },
      "invalid_reference",
    );
    expectMappingError(
      fixtureIntent(),
      {
        ...source,
        joints: [
          source.joints[0]!,
          {
            ...source.joints[0]!,
            key: "base",
            parentBodyKey: "wing",
            childBodyKey: "base",
            parentAttachment: { panelKey: "wing", edgeIndex: 3 },
            childAttachment: { panelKey: "base", edgeIndex: 1 },
          },
        ],
      },
      "unsupported_mapping",
    );
  });

  it("rejects nonexistent, undersized, and mismatched joint attachment edges", () => {
    const source = fixtureSemanticPlan();
    expectMappingError(
      fixtureIntent(),
      {
        ...source,
        joints: source.joints.map((joint) => ({
          ...joint,
          parentAttachment: { ...joint.parentAttachment, edgeIndex: 9 },
        })),
      },
      "invalid_edge",
    );
    expectMappingError(
      fixtureIntent(),
      {
        ...source,
        panels: source.panels.map((panel) => ({ ...panel, widthMm: 0.5 })),
        joints: source.joints.map((joint) => ({
          ...joint,
          parentAttachment: { ...joint.parentAttachment, edgeIndex: 0 },
          childAttachment: { ...joint.childAttachment, edgeIndex: 0 },
        })),
      },
      "invalid_edge",
    );
    expectMappingError(
      fixtureIntent(),
      {
        ...source,
        joints: source.joints.map((joint) => ({
          ...joint,
          childAttachment: { ...joint.childAttachment, edgeIndex: 0 },
        })),
      },
      "edge_length_mismatch",
    );
  });

  it("rejects disconnected body graphs and a grounded non-root body", () => {
    const source = fixtureSemanticPlan();
    const extraPanel = {
      ...source.panels[1]!,
      key: "free",
      bodyKey: "free",
    };
    expectMappingError(
      fixtureIntent(),
      {
        ...source,
        panels: [...source.panels, extraPanel],
        bodies: [
          ...source.bodies,
          {
            key: "free",
            label: "Free body",
            panelKeys: ["free"],
            grounded: false,
          },
        ],
      },
      "unsupported_mapping",
    );
    expectMappingError(
      fixtureIntent(),
      {
        ...source,
        bodies: source.bodies.map((body) => ({
          ...body,
          grounded: body.key === "wing",
        })),
      },
      "ambiguous_ground",
    );
  });

  it("rejects static/moving driver mismatches, incompatible controls, and missing outputs", () => {
    const source = fixtureSemanticPlan();
    expectMappingError(
      { ...fixtureIntent(), behavior: "static" },
      source,
      "invalid_motion",
    );
    expectMappingError(
      fixtureIntent(),
      { ...source, driver: null },
      "invalid_motion",
    );
    expectMappingError(
      fixtureIntent(),
      { ...source, driver: { ...source.driver!, jointKey: "missing" } },
      "invalid_motion",
    );
    expectMappingError(
      fixtureIntent(),
      { ...source, driver: { ...source.driver!, control: "slide" as const } },
      "invalid_motion",
    );
    expectMappingError(
      fixtureIntent(),
      { ...source, outputs: [] },
      "invalid_motion",
    );
  });

  it("maps slide and rotate driver controls to the joint unit", () => {
    const slider = semanticPlanToFabricationPlanV1(
      { ...fixtureIntent(), behavior: "slide" },
      {
        ...guidedSliderPlan(),
        driver: { ...guidedSliderPlan().driver!, control: "slide" as const },
      },
    );
    expect(slider.ok).toBe(true);
    if (slider.ok) expect(slider.value.driver?.unit).toBe("mm");

    const source = fixtureSemanticPlan();
    const relationship = connectorPlan().connectorRelationships[0]!;
    const revolutePlan = {
      ...source,
      connectorRelationships: [
        {
          ...relationship,
          tabAttachment: { panelKey: "wing", edgeIndex: 0 },
          slotAttachment: { panelKey: "base", edgeIndex: 0 },
        },
      ],
      joints: source.joints.map((joint) => {
        if (joint.kind !== "fold") throw new Error("fixture invariant");
        const { foldDirection: _foldDirection, ...angular } = joint;
        return {
          ...angular,
          kind: "revolute" as const,
          connectorRelationshipKeys: ["lock"],
        };
      }),
      driver: { ...source.driver!, control: "rotate" as const },
      assemblyStrategy: "articulated_tab_slot" as const,
    };
    const revolute = semanticPlanToFabricationPlanV1(
      { ...fixtureIntent(), behavior: "rotate" },
      revolutePlan,
    );
    expect(revolute.ok).toBe(true);
    if (revolute.ok) expect(revolute.value.driver?.unit).toBe("deg");
  });

  it("rejects output references to missing joints and bodies", () => {
    const source = fixtureSemanticPlan();
    expectMappingError(
      fixtureIntent(),
      {
        ...source,
        outputs: source.outputs.map((output) => ({
          ...output,
          jointKey: "missing",
        })),
      },
      "invalid_reference",
    );
    expectMappingError(
      fixtureIntent(),
      {
        ...source,
        outputs: source.outputs.map((output) => ({
          ...output,
          bodyKey: "missing",
        })),
      },
      "invalid_reference",
    );
  });

  it("rejects invalid direct, mirrored, pull-tab, and cam-slot coupling references", () => {
    const source = fixtureSemanticPlan();
    expectMappingError(
      fixtureIntent(),
      {
        ...source,
        couplings: source.couplings.map((coupling) => ({
          ...coupling,
          inputJointKey: "missing",
        })),
      },
      "invalid_reference",
    );
    expectMappingError(
      fixtureIntent(),
      {
        ...source,
        couplings: source.couplings.map((coupling) => ({
          ...coupling,
          outputJointKeys: ["missing"],
        })),
      },
      "invalid_reference",
    );

    const mirroredSource = fixtureSemanticPlan();
    expectMappingError(
      fixtureIntent(),
      {
        ...mirroredSource,
        couplings: [
          {
            key: "mirrored",
            kind: "mirrored_pair" as const,
            inputJointKey: "wing",
            leftOutputJointKey: "wing",
            rightOutputJointKey: "missing",
            ratio: 1,
            phaseOffsetDeg: 0,
          },
        ],
      },
      "invalid_reference",
    );

    const slider = guidedSliderPlan();
    expectMappingError(
      { ...fixtureIntent(), behavior: "slide" },
      {
        ...slider,
        couplings: [
          {
            key: "pull",
            kind: "pull_tab" as const,
            driverKey: "missing",
            sliderJointKey: "slide",
            outputJointKeys: ["slide"],
            ratio: 1,
          },
        ],
      },
      "invalid_reference",
    );
    expectMappingError(
      { ...fixtureIntent(), behavior: "slide" },
      {
        ...slider,
        couplings: [
          {
            key: "cam",
            kind: "cam_slot" as const,
            driverKey: "pull",
            connectorRelationshipKey: "missing",
            outputJointKey: "slide",
            branch: "negative" as const,
            phaseOffsetMm: 2,
          },
        ],
      },
      "invalid_reference",
    );
  });

  it("maps every semantic landmark reference and rejects every missing kind", () => {
    const source = fixtureSemanticPlan();
    const withDriverReference = {
      ...source,
      landmarks: [
        ...source.landmarks,
        {
          key: "driver",
          label: "Driver",
          role: "motion input",
          geometryRefs: [{ kind: "driver" as const, key: "wing" }],
        },
      ],
    };
    const mapped = semanticPlanToFabricationPlanV1(
      fixtureIntent(),
      withDriverReference,
    );
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(
        mapped.value.semanticParts.find(
          (part) => part.semanticPartId === "part-driver",
        )?.geometryRefs,
      ).toEqual([{ kind: "driver", id: "driver-wing" }]);
    }

    for (const kind of [
      "panel",
      "body",
      "joint",
      "connector_relationship",
      "driver",
      "output",
    ] as const) {
      const base = kind === "connector_relationship" ? connectorPlan() : source;
      const intent =
        kind === "connector_relationship"
          ? { ...fixtureIntent(), behavior: "static" as const }
          : fixtureIntent();
      expectMappingError(
        intent,
        {
          ...base,
          landmarks: [
            {
              key: `missing-${kind}`,
              label: "Missing reference",
              role: "negative test",
              geometryRefs: [{ kind, key: "missing" }],
            },
          ],
        },
        "invalid_reference",
      );
    }
  });

  it("returns the semantic mapping error unchanged from the V2 expansion entrypoint", () => {
    const result = expandSemanticFabricationPlan(fixtureIntent(), {}, 1);
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "semantic_plan_mapping", code: "contract_invalid" },
    });
  });

  it("fails typed when a local attachment mapping is ambiguous", () => {
    const plan = fixtureSemanticPlan();
    const malformed = {
      ...plan,
      joints: plan.joints.map((joint) => ({
        ...joint,
        childAttachment: { ...joint.childAttachment, edgeIndex: 0 },
      })),
    };
    expect(
      semanticPlanToFabricationPlanV1(fixtureIntent(), malformed),
    ).toMatchObject({
      ok: false,
      error: { kind: "semantic_plan_mapping", code: "edge_length_mismatch" },
    });
  });
});
