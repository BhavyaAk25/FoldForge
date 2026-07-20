import type { FabricationPlanV2 } from "@/core/fabrication/semantic-plan";

export const fixtureSemanticPlan = (): FabricationPlanV2 => ({
  version: "2",
  candidateLabel: "Mechanically simple",
  topologyKey: "two-panel-fold",
  panels: [
    {
      key: "base",
      sheetIndex: 0,
      bodyKey: "base",
      label: "Base",
      role: "structural",
      widthMm: 80,
      heightMm: 60,
      outline: { kind: "rectangle" },
      innerCutContours: [],
    },
    {
      key: "wing",
      sheetIndex: 0,
      bodyKey: "wing",
      label: "Opening wing",
      role: "output",
      widthMm: 30,
      heightMm: 60,
      outline: { kind: "rectangle" },
      innerCutContours: [],
    },
  ],
  bodies: [
    {
      key: "base",
      label: "Grounded base",
      panelKeys: ["base"],
      grounded: true,
    },
    {
      key: "wing",
      label: "Moving wing",
      panelKeys: ["wing"],
      grounded: false,
    },
  ],
  joints: [
    {
      key: "wing",
      kind: "fold",
      parentBodyKey: "base",
      childBodyKey: "wing",
      parentAttachment: { panelKey: "base", edgeIndex: 1 },
      childAttachment: { panelKey: "wing", edgeIndex: 3 },
      foldDirection: "valley",
      homeAngleDeg: 0,
      minimumAngleDeg: 0,
      maximumAngleDeg: 90,
    },
  ],
  connectorRelationships: [],
  driver: {
    key: "wing",
    jointKey: "wing",
    label: "Open wing",
    control: "fold",
    minimumValue: 0,
    maximumValue: 90,
    homeValue: 0,
    direction: 1,
  },
  outputs: [
    {
      key: "wing",
      jointKey: "wing",
      bodyKey: "wing",
      label: "Wing angle",
      minimumValue: 0,
      maximumValue: 90,
      direction: 1,
    },
  ],
  couplings: [
    {
      key: "wing",
      kind: "direct_ratio",
      inputJointKey: "wing",
      outputJointKeys: ["wing"],
      ratio: 1,
      offset: 0,
      offsetUnit: "deg",
    },
  ],
  landmarks: [
    {
      key: "base",
      label: "Base",
      role: "support",
      geometryRefs: [
        { kind: "panel", key: "base" },
        { kind: "body", key: "base" },
      ],
    },
    {
      key: "wing",
      label: "Wing",
      role: "moving output",
      geometryRefs: [
        { kind: "panel", key: "wing" },
        { kind: "body", key: "wing" },
        { kind: "joint", key: "wing" },
        { kind: "output", key: "wing" },
      ],
    },
  ],
  assemblyStrategy: "fold_only",
  designSummary: "Two semantic panels joined by one local-edge fold.",
});

export const fixtureLiveAcceptancePlan = (): FabricationPlanV2 => {
  const panel = (
    key: string,
    widthMm: number,
    heightMm: number,
    role: "structural" | "output" = "structural",
  ) => ({
    key,
    sheetIndex: 0,
    bodyKey: key,
    label: key,
    role,
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
  const panelKeys = ["base", "front", "back", "left", "right", "lid"];
  return {
    version: "2",
    candidateLabel: "One-sheet tab-locked enclosure",
    topologyKey: "six-panel-box",
    panels: [
      panel("base", 70, 95),
      panel("front", 70, 25),
      panel("back", 70, 25),
      panel("left", 25, 95),
      panel("right", 25, 95),
      panel("lid", 70, 95, "output"),
    ],
    bodies: panelKeys.map((key, index) => ({
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
    landmarks: panelKeys.map((key) => ({
      key,
      label: key,
      role: key === "lid" ? "fixed closed top" : "enclosure panel",
      geometryRefs: [{ kind: "panel" as const, key }],
    })),
    assemblyStrategy: "tab_slot",
    designSummary:
      "A continuous cross net folded into a static closed enclosure with one reciprocal lid lock.",
  };
};
