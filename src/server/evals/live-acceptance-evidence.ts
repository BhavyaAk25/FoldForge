import { evaluateMotionState } from "@/core/fabrication/kinematics";
import type {
  CandidateV2,
  FabricationBehavior,
  PanelBlueprintV1,
} from "@/core/fabrication/types";

export interface LiveAcceptanceContract {
  readonly behavior: FabricationBehavior;
  readonly assemblyStrategy: "fold_only" | "tab_slot" | "articulated_tab_slot";
  readonly panels: readonly {
    readonly name: string;
    readonly role: PanelBlueprintV1["role"];
    readonly widthMm: number;
    readonly heightMm: number;
  }[];
  readonly foldConnections: readonly {
    readonly parentPanelName: string;
    readonly childPanelName: string;
  }[];
  readonly connectorPairs: readonly {
    readonly tabPanelName: string;
    readonly slotPanelName: string;
  }[];
  readonly sheet: {
    readonly widthMm: number;
    readonly heightMm: number;
    readonly printableMarginMm: number;
    readonly stockThicknessMm: number;
  };
  readonly homeEnvelopeSpansMm: readonly [number, number, number] | null;
  readonly motion: {
    readonly control: "pull_tab" | "fold" | "slide" | "rotate";
    readonly minimumValue: number;
    readonly maximumValue: number;
    readonly homeValue: number;
    readonly outputCount: number;
    readonly baseSampleCount: number;
  } | null;
  readonly exports: {
    readonly foldExpected: boolean;
    readonly glbAnimationCount: number;
    readonly glbMotionSampleCount: number;
  };
}

export interface LiveAcceptanceCheck {
  readonly field: string;
  readonly expected: string | number | boolean;
  readonly observed: string | number | boolean | null;
  readonly passed: boolean;
}

export interface LiveAcceptanceEvidence {
  readonly checks: readonly LiveAcceptanceCheck[];
  readonly passedCount: number;
  readonly checkCount: number;
  readonly passed: boolean;
}

interface ConsumerEvidence {
  readonly sourceCandidateId: string;
  readonly sourceIrHash: string;
  readonly formats: readonly string[];
  readonly artifactMetadata: readonly {
    readonly format: string;
    readonly sourceCandidateId: string;
    readonly sourceIrHash: string;
    readonly verified: boolean;
  }[];
  readonly svg: {
    readonly calibrationLengthMm: number;
    readonly layerCount: number;
    readonly sourcePathCount: number;
  };
  readonly dxf: {
    readonly layers: readonly string[];
    readonly calibrationLengthMm: number;
    readonly sourcePathCount: number;
  };
  readonly glb: {
    readonly errors: number;
    readonly warnings: number;
    readonly animationCount: number;
    readonly motionSampleCount: number;
    readonly sourcePathCount: number;
  };
  readonly json: {
    readonly sourcePathCount: number;
    readonly assemblyOperationCount: number;
  };
  readonly fold: { readonly edgeCount: number } | null;
}

const MM_TOLERANCE = 0.01;
const RECTANGLE_CONTOUR = [
  { u: 0, v: 0 },
  { u: 1, v: 0 },
  { u: 1, v: 1 },
  { u: 0, v: 1 },
] as const;
const REQUIRED_DXF_LAYERS = ["CUT", "ENGRAVE", "PERFORATION", "SCORE"] as const;
const REQUIRED_CORE_EXPORTS = ["dxf", "glb", "json", "svg"] as const;

const closeTo = (value: number, expected: number): boolean =>
  Math.abs(value - expected) <= MM_TOLERANCE;

const normalizeWords = (value: string): readonly string[] =>
  value
    .toLocaleLowerCase("en-US")
    .split(/[^a-z0-9]+/u)
    .filter((word) => word.length > 0);

const describesName = (
  values: readonly string[],
  requiredName: string,
): boolean => {
  const requiredWords = normalizeWords(requiredName);
  const observedWords = new Set(values.flatMap(normalizeWords));
  return requiredWords.every((word) => observedWords.has(word));
};

const isCanonicalRectangle = (panel: PanelBlueprintV1): boolean =>
  panel.innerCutContours.length === 0 &&
  panel.contour.vertices.length === RECTANGLE_CONTOUR.length &&
  panel.contour.vertices.every((vertex, index) => {
    const expected = RECTANGLE_CONTOUR[index];
    return (
      expected !== undefined &&
      vertex.u === expected.u &&
      vertex.v === expected.v
    );
  });

const acceptanceCheck = (
  field: string,
  expected: string | number | boolean,
  observed: string | number | boolean | null,
  passed: boolean,
): LiveAcceptanceCheck => ({ field, expected, observed, passed });

export const evaluateLiveAcceptance = (input: {
  readonly candidate: CandidateV2;
  readonly consumerValidation: ConsumerEvidence | null;
  readonly contract: LiveAcceptanceContract;
}): LiveAcceptanceEvidence => {
  const { candidate, contract } = input;
  const { blueprint } = candidate.program;
  const checks: LiveAcceptanceCheck[] = [
    acceptanceCheck(
      "candidate.verification.valid",
      true,
      candidate.verification.valid,
      candidate.verification.valid,
    ),
    acceptanceCheck(
      "candidate.exportMetadata.sourceEquivalent",
      true,
      candidate.exportMetadata.sourceEquivalent,
      candidate.exportMetadata.sourceEquivalent,
    ),
    acceptanceCheck(
      "program.behavior",
      contract.behavior,
      candidate.program.behavior,
      candidate.program.behavior === contract.behavior &&
        candidate.intent.behavior === contract.behavior,
    ),
    acceptanceCheck(
      "program.assemblyStrategy",
      contract.assemblyStrategy,
      candidate.program.assemblyStrategy,
      candidate.program.assemblyStrategy === contract.assemblyStrategy,
    ),
    acceptanceCheck(
      "blueprint.panels.length",
      contract.panels.length,
      blueprint.panels.length,
      blueprint.panels.length === contract.panels.length,
    ),
    acceptanceCheck(
      "blueprint.joints.fold.length",
      contract.foldConnections.length,
      blueprint.joints.filter((joint) => joint.kind === "fold").length,
      blueprint.joints.length === contract.foldConnections.length &&
        blueprint.joints.every((joint) => joint.kind === "fold"),
    ),
    acceptanceCheck(
      "program.sheets.length",
      1,
      candidate.program.sheets.length,
      candidate.program.sheets.length === 1,
    ),
  ];

  const panelByName = new Map<string, PanelBlueprintV1>();
  for (const expectedPanel of contract.panels) {
    const matchingPanels = blueprint.panels.filter((panel) =>
      describesName([panel.panelId, panel.label], expectedPanel.name),
    );
    const panel = matchingPanels.length === 1 ? matchingPanels[0] : undefined;
    if (panel) panelByName.set(expectedPanel.name, panel);
    checks.push(
      acceptanceCheck(
        `panels.${expectedPanel.name}.uniqueName`,
        1,
        matchingPanels.length,
        panel !== undefined,
      ),
      acceptanceCheck(
        `panels.${expectedPanel.name}.role`,
        expectedPanel.role,
        panel?.role ?? null,
        panel?.role === expectedPanel.role,
      ),
      acceptanceCheck(
        `panels.${expectedPanel.name}.widthMm`,
        expectedPanel.widthMm,
        panel?.widthMm ?? null,
        panel !== undefined && closeTo(panel.widthMm, expectedPanel.widthMm),
      ),
      acceptanceCheck(
        `panels.${expectedPanel.name}.heightMm`,
        expectedPanel.heightMm,
        panel?.heightMm ?? null,
        panel !== undefined && closeTo(panel.heightMm, expectedPanel.heightMm),
      ),
      acceptanceCheck(
        `panels.${expectedPanel.name}.rectangle`,
        true,
        panel ? isCanonicalRectangle(panel) : null,
        panel !== undefined && isCanonicalRectangle(panel),
      ),
    );
    const semanticParts = panel
      ? blueprint.semanticParts.filter(
          (part) =>
            describesName(
              [part.semanticPartId, part.label, part.role],
              expectedPanel.name,
            ) &&
            part.geometryRefs.some(
              (reference) =>
                reference.kind === "panel" && reference.id === panel.panelId,
            ),
        )
      : [];
    checks.push(
      acceptanceCheck(
        `semanticParts.${expectedPanel.name}.panelReference`,
        1,
        semanticParts.length,
        semanticParts.length === 1,
      ),
    );
  }

  for (const connection of contract.foldConnections) {
    const parent = panelByName.get(connection.parentPanelName);
    const child = panelByName.get(connection.childPanelName);
    const matches = blueprint.joints.filter(
      (joint) =>
        joint.kind === "fold" &&
        joint.parentBodyId === parent?.bodyId &&
        joint.childBodyId === child?.bodyId,
    );
    checks.push(
      acceptanceCheck(
        `foldConnections.${connection.parentPanelName}.${connection.childPanelName}`,
        1,
        matches.length,
        matches.length === 1,
      ),
    );
  }

  const tabs = blueprint.connectors.filter(
    (connector) => connector.kind === "tab",
  );
  const slots = blueprint.connectors.filter(
    (connector) => connector.kind === "slot",
  );
  checks.push(
    acceptanceCheck(
      "blueprint.connectors.reciprocalPairs",
      contract.connectorPairs.length,
      Math.min(tabs.length, slots.length),
      blueprint.connectors.length === contract.connectorPairs.length * 2 &&
        tabs.length === contract.connectorPairs.length &&
        slots.length === contract.connectorPairs.length &&
        tabs.every((tab) => {
          const slot = slots.find(
            (candidateSlot) =>
              candidateSlot.connectorId === tab.mateConnectorId,
          );
          return slot?.mateConnectorId === tab.connectorId;
        }),
    ),
  );
  for (const pair of contract.connectorPairs) {
    const expectedTabPanel = panelByName.get(pair.tabPanelName);
    const expectedSlotPanel = panelByName.get(pair.slotPanelName);
    const matches = tabs.filter((tab) => {
      const slot = slots.find(
        (candidateSlot) => candidateSlot.connectorId === tab.mateConnectorId,
      );
      return (
        tab.panelId === expectedTabPanel?.panelId &&
        slot !== undefined &&
        slot.panelId === expectedSlotPanel?.panelId &&
        slot.mateConnectorId === tab.connectorId
      );
    });
    checks.push(
      acceptanceCheck(
        `connectorPairs.${pair.tabPanelName}.${pair.slotPanelName}`,
        1,
        matches.length,
        matches.length === 1,
      ),
    );
  }

  const sheet = candidate.program.sheets[0];
  const expectedSheetSides = [
    contract.sheet.widthMm,
    contract.sheet.heightMm,
  ].toSorted((left, right) => left - right);
  const observedSheetSides = sheet
    ? [sheet.widthMm, sheet.heightMm].toSorted((left, right) => left - right)
    : [];
  checks.push(
    acceptanceCheck(
      "sheet.shortSideMm",
      expectedSheetSides[0] ?? 0,
      observedSheetSides[0] ?? null,
      observedSheetSides[0] !== undefined &&
        closeTo(observedSheetSides[0], expectedSheetSides[0] ?? 0),
    ),
    acceptanceCheck(
      "sheet.longSideMm",
      expectedSheetSides[1] ?? 0,
      observedSheetSides[1] ?? null,
      observedSheetSides[1] !== undefined &&
        closeTo(observedSheetSides[1], expectedSheetSides[1] ?? 0),
    ),
    acceptanceCheck(
      "sheet.printableMarginMm",
      contract.sheet.printableMarginMm,
      sheet?.printableMarginMm ?? null,
      sheet !== undefined &&
        closeTo(sheet.printableMarginMm, contract.sheet.printableMarginMm),
    ),
    acceptanceCheck(
      "sheet.material.thicknessMm",
      contract.sheet.stockThicknessMm,
      sheet?.material.thicknessMm ?? null,
      sheet !== undefined &&
        closeTo(sheet.material.thicknessMm, contract.sheet.stockThicknessMm),
    ),
  );

  if (contract.homeEnvelopeSpansMm) {
    const state = evaluateMotionState(candidate.ir);
    const observedSpans = state.ok
      ? (["xMm", "yMm", "zMm"] as const)
          .map((coordinate) => {
            const values = Object.values(state.value.panelVertices)
              .flat()
              .map((point) => point[coordinate]);
            return Math.max(...values) - Math.min(...values);
          })
          .toSorted((left, right) => left - right)
      : [];
    const expectedSpans = [...contract.homeEnvelopeSpansMm].toSorted(
      (left, right) => left - right,
    );
    for (const [index, expectedSpan] of expectedSpans.entries()) {
      const observedSpan = observedSpans[index];
      checks.push(
        acceptanceCheck(
          `homeEnvelopeSpansMm.${index}`,
          expectedSpan,
          observedSpan ?? null,
          observedSpan !== undefined && closeTo(observedSpan, expectedSpan),
        ),
      );
    }
  }

  const driver = blueprint.driver;
  const motionSummary = candidate.verification.motionSummary;
  if (contract.motion) {
    checks.push(
      acceptanceCheck(
        "driver.control",
        contract.motion.control,
        driver?.control ?? null,
        driver?.control === contract.motion.control,
      ),
      acceptanceCheck(
        "driver.minimumValue",
        contract.motion.minimumValue,
        driver?.minimumValue ?? null,
        driver !== null &&
          closeTo(driver.minimumValue, contract.motion.minimumValue),
      ),
      acceptanceCheck(
        "driver.maximumValue",
        contract.motion.maximumValue,
        driver?.maximumValue ?? null,
        driver !== null &&
          closeTo(driver.maximumValue, contract.motion.maximumValue),
      ),
      acceptanceCheck(
        "driver.homeValue",
        contract.motion.homeValue,
        driver?.homeValue ?? null,
        driver !== null && closeTo(driver.homeValue, contract.motion.homeValue),
      ),
      acceptanceCheck(
        "blueprint.outputs.length",
        contract.motion.outputCount,
        blueprint.outputs.length,
        blueprint.outputs.length === contract.motion.outputCount,
      ),
      acceptanceCheck(
        "verification.motionSummary.baseSampleCount",
        contract.motion.baseSampleCount,
        motionSummary?.baseSampleCount ?? null,
        motionSummary?.baseSampleCount === contract.motion.baseSampleCount,
      ),
    );
  } else {
    checks.push(
      acceptanceCheck(
        "blueprint.driver",
        false,
        driver !== null,
        driver === null,
      ),
      acceptanceCheck(
        "blueprint.outputs.length",
        0,
        blueprint.outputs.length,
        blueprint.outputs.length === 0,
      ),
      acceptanceCheck(
        "blueprint.joints.fixedAtHome",
        true,
        blueprint.joints.every((joint) =>
          joint.kind === "prismatic"
            ? joint.minTravelMm === joint.homeTravelMm &&
              joint.homeTravelMm === joint.maxTravelMm
            : joint.minAngleDeg === joint.homeAngleDeg &&
              joint.homeAngleDeg === joint.maxAngleDeg,
        ),
        blueprint.joints.every((joint) =>
          joint.kind === "prismatic"
            ? joint.minTravelMm === joint.homeTravelMm &&
              joint.homeTravelMm === joint.maxTravelMm
            : joint.minAngleDeg === joint.homeAngleDeg &&
              joint.homeAngleDeg === joint.maxAngleDeg,
        ),
      ),
    );
  }

  const consumer = input.consumerValidation;
  const formats = consumer?.formats.toSorted() ?? [];
  checks.push(
    acceptanceCheck(
      "exports.requiredCoreFormats",
      REQUIRED_CORE_EXPORTS.join(","),
      formats.join(","),
      REQUIRED_CORE_EXPORTS.every((format) => formats.includes(format)),
    ),
    acceptanceCheck(
      "exports.selectedSourceBinding",
      true,
      consumer
        ? consumer.sourceCandidateId === candidate.candidateId &&
            consumer.sourceIrHash === candidate.verification.irHash
        : null,
      consumer !== null &&
        consumer.sourceCandidateId === candidate.candidateId &&
        consumer.sourceIrHash === candidate.verification.irHash &&
        consumer.artifactMetadata.every(
          (metadata) =>
            metadata.verified &&
            metadata.sourceCandidateId === candidate.candidateId &&
            metadata.sourceIrHash === candidate.verification.irHash,
        ),
    ),
    acceptanceCheck(
      "exports.svg.calibrationLengthMm",
      50,
      consumer?.svg.calibrationLengthMm ?? null,
      consumer?.svg.calibrationLengthMm === 50 && consumer.svg.layerCount === 4,
    ),
    acceptanceCheck(
      "exports.dxf.calibrationAndLayers",
      `${50}:${REQUIRED_DXF_LAYERS.join(",")}`,
      consumer
        ? `${consumer.dxf.calibrationLengthMm}:${consumer.dxf.layers.toSorted().join(",")}`
        : null,
      consumer?.dxf.calibrationLengthMm === 50 &&
        consumer.dxf.layers.toSorted().join(",") ===
          REQUIRED_DXF_LAYERS.join(","),
    ),
    acceptanceCheck(
      "exports.sourcePathCounts",
      true,
      consumer
        ? consumer.svg.sourcePathCount === consumer.json.sourcePathCount &&
            consumer.dxf.sourcePathCount === consumer.json.sourcePathCount &&
            consumer.glb.sourcePathCount === consumer.json.sourcePathCount
        : null,
      consumer !== null &&
        consumer.json.sourcePathCount > 0 &&
        consumer.svg.sourcePathCount === consumer.json.sourcePathCount &&
        consumer.dxf.sourcePathCount === consumer.json.sourcePathCount &&
        consumer.glb.sourcePathCount === consumer.json.sourcePathCount,
    ),
    acceptanceCheck(
      "exports.glb.validation",
      `${contract.exports.glbAnimationCount}:${contract.exports.glbMotionSampleCount}`,
      consumer
        ? `${consumer.glb.animationCount}:${consumer.glb.motionSampleCount}`
        : null,
      consumer?.glb.errors === 0 &&
        consumer.glb.warnings === 0 &&
        consumer.glb.animationCount === contract.exports.glbAnimationCount &&
        consumer.glb.motionSampleCount ===
          contract.exports.glbMotionSampleCount,
    ),
    acceptanceCheck(
      "exports.json.assemblyOperations",
      true,
      consumer ? consumer.json.assemblyOperationCount > 0 : null,
      consumer !== null && consumer.json.assemblyOperationCount > 0,
    ),
    acceptanceCheck(
      "exports.fold",
      contract.exports.foldExpected,
      consumer ? consumer.fold !== null : null,
      consumer !== null &&
        (consumer.fold !== null) === contract.exports.foldExpected &&
        (contract.exports.foldExpected
          ? candidate.exportMetadata.foldOmissionReason === null
          : candidate.exportMetadata.foldOmissionReason !== null),
    ),
  );

  const passedCount = checks.filter((item) => item.passed).length;
  return {
    checks,
    passedCount,
    checkCount: checks.length,
    passed: passedCount === checks.length,
  };
};
