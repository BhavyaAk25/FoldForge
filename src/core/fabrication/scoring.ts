import { canonicalSerialize } from "@/core/canonical";

import { fabricationIrHash } from "./compiler";
import {
  polygonBounds,
  signedPolygonAreaMm2,
  transformPoint2,
} from "./polygon";
import type {
  CandidateScoreV2,
  FabricationIntentV1,
  FabricationIRV1,
  FabricationPriority,
  VerificationReportV2,
} from "./types";

interface ScoreDefinition {
  readonly componentId: FabricationPriority;
  readonly label: string;
  readonly calculate: (ir: FabricationIRV1) => number;
}

export interface RankableFabricationCandidate {
  readonly candidateId: string;
  readonly topologyId: string;
  readonly ir: FabricationIRV1;
  readonly report: VerificationReportV2;
  readonly score: CandidateScoreV2;
}

export interface RankedFabricationCandidate {
  readonly candidateId: string;
  readonly rank: number;
  readonly recommended: boolean;
  readonly totalScore: number;
}

const clampScore = (value: number): number =>
  Math.max(0, Math.min(100, Number(value.toFixed(6))));

const netAreaForPanelMm2 = (panel: FabricationIRV1["panels"][number]): number =>
  Math.abs(signedPolygonAreaMm2(panel.contour.vertices)) -
  panel.innerCutContours.reduce(
    (innerTotal, contour) =>
      innerTotal + Math.abs(signedPolygonAreaMm2(contour.vertices)),
    0,
  );

const panelNetAreaMm2 = (ir: FabricationIRV1): number =>
  ir.panels.reduce((total, panel) => total + netAreaForPanelMm2(panel), 0);

const printableAreaMm2 = (ir: FabricationIRV1): number =>
  ir.sheets.reduce(
    (total, sheet) =>
      total +
      Math.max(0, sheet.widthMm - 2 * sheet.printableMarginMm) *
        Math.max(0, sheet.heightMm - 2 * sheet.printableMarginMm),
    0,
  );

const layoutBoundsAreaMm2 = (ir: FabricationIRV1): number => {
  if (ir.panels.length === 0) return 0;
  const bounds = ir.panels.map((panel) =>
    polygonBounds(
      panel.contour.vertices.map((point) =>
        transformPoint2(point, panel.flatTransform),
      ),
    ),
  );
  const minimumXmm = Math.min(...bounds.map((item) => item.minimumXmm));
  const minimumYmm = Math.min(...bounds.map((item) => item.minimumYmm));
  const maximumXmm = Math.max(...bounds.map((item) => item.maximumXmm));
  const maximumYmm = Math.max(...bounds.map((item) => item.maximumYmm));
  return (maximumXmm - minimumXmm) * (maximumYmm - minimumYmm);
};

const fabricationEfficiency = (ir: FabricationIRV1): number => {
  const availableMm2 = printableAreaMm2(ir);
  if (availableMm2 <= 0) return 0;
  const utilization = panelNetAreaMm2(ir) / availableMm2;
  // Around 65% material utilization leaves realistic nesting and connector room.
  return clampScore(100 - Math.abs(0.65 - utilization) * 125);
};

const mechanicalSimplicity = (ir: FabricationIRV1): number =>
  clampScore(
    100 -
      ir.panels.length * 1.5 -
      ir.joints.length * 7 -
      ir.connectors.length * 4 -
      ir.couplings.length * 6,
  );

const visualExpression = (ir: FabricationIRV1): number => {
  const distinctRoles = new Set(ir.semanticParts.map((part) => part.role)).size;
  const additionalVertices = ir.panels.reduce(
    (total, panel) => total + Math.max(0, panel.contour.vertices.length - 4),
    0,
  );
  return clampScore(
    ir.semanticParts.length * 16 + distinctRoles * 8 + additionalVertices * 2,
  );
};

const compactness = (ir: FabricationIRV1): number => {
  const availableMm2 = printableAreaMm2(ir);
  if (availableMm2 <= 0) return 0;
  return clampScore(100 * (1 - layoutBoundsAreaMm2(ir) / availableMm2));
};

const stability = (ir: FabricationIRV1): number => {
  const groundedBodyIds = new Set(
    ir.bodies.filter((body) => body.grounded).map((body) => body.bodyId),
  );
  const totalAreaMm2 = panelNetAreaMm2(ir);
  if (totalAreaMm2 <= 0) return 0;
  const groundedAreaMm2 = ir.panels
    .filter((panel) => groundedBodyIds.has(panel.bodyId))
    .reduce((total, panel) => total + netAreaForPanelMm2(panel), 0);
  return clampScore((groundedAreaMm2 / totalAreaMm2) * 100);
};

const motionRange = (ir: FabricationIRV1): number => {
  if (ir.behavior === "static") return 100;
  if (ir.outputs.length === 0) return 0;
  const normalized = ir.outputs.map((output) => {
    const range = Math.abs(output.maximumValue - output.minimumValue);
    return output.unit === "deg" ? range / 180 : range / 100;
  });
  return clampScore(
    (normalized.reduce((sum, value) => sum + Math.min(1, value), 0) /
      normalized.length) *
      100,
  );
};

const DEFINITIONS: readonly ScoreDefinition[] = [
  {
    componentId: "fabrication_efficiency",
    label: "Fabrication efficiency",
    calculate: fabricationEfficiency,
  },
  {
    componentId: "mechanical_simplicity",
    label: "Mechanical simplicity",
    calculate: mechanicalSimplicity,
  },
  {
    componentId: "visual_expression",
    label: "Visual expression",
    calculate: visualExpression,
  },
  {
    componentId: "compactness",
    label: "Compact layout",
    calculate: compactness,
  },
  { componentId: "stability", label: "Grounded area", calculate: stability },
  {
    componentId: "motion_range",
    label: "Motion range",
    calculate: motionRange,
  },
];

const weightsFor = (
  priorities: readonly FabricationPriority[],
): ReadonlyMap<FabricationPriority, number> => {
  const raw = new Map<FabricationPriority, number>(
    DEFINITIONS.map((definition) => [
      definition.componentId,
      priorities.includes(definition.componentId) ? 2 : 1,
    ]),
  );
  const total = [...raw.values()].reduce((sum, value) => sum + value, 0);
  return new Map(
    [...raw.entries()].map(([priority, value]) => [priority, value / total]),
  );
};

const reportIsBoundToIr = (
  ir: FabricationIRV1,
  report: VerificationReportV2,
): boolean =>
  report.valid &&
  report.failedAtStage === null &&
  report.completedStage === "scoring" &&
  report.programId === ir.programId &&
  report.irId === ir.irId &&
  report.irHash === fabricationIrHash(ir);

export const scoreFabricationCandidate = (
  ir: FabricationIRV1,
  report: VerificationReportV2,
  intent: FabricationIntentV1,
): CandidateScoreV2 => {
  if (!reportIsBoundToIr(ir, report)) {
    return {
      eligible: false,
      totalScore: null,
      components: [],
      rankingReason: null,
    };
  }
  const weights = weightsFor(intent.priorities);
  const evidenceCheckIds = report.checks
    .filter((check) => check.status === "pass")
    .map((check) => check.checkId);
  const components = DEFINITIONS.map((definition) => {
    const normalizedScore = definition.calculate(ir);
    const weight = weights.get(definition.componentId)!;
    return {
      componentId: definition.componentId,
      label: definition.label,
      normalizedScore,
      weight,
      weightedScore: Number((normalizedScore * weight).toFixed(6)),
      evidenceCheckIds,
    };
  });
  const totalScore = Number(
    components
      .reduce((sum, component) => sum + component.weightedScore, 0)
      .toFixed(6),
  );
  const strongest = [...components].sort(
    (left, right) => right.weightedScore - left.weightedScore,
  )[0];
  return {
    eligible: true,
    totalScore,
    components,
    rankingReason: `Strongest weighted evidence: ${strongest!.label.toLowerCase()}.`,
  };
};

export const rankFabricationCandidates = (
  candidates: readonly RankableFabricationCandidate[],
): readonly RankedFabricationCandidate[] => {
  const eligible = candidates
    .filter(
      (candidate) =>
        reportIsBoundToIr(candidate.ir, candidate.report) &&
        candidate.report.candidateId === candidate.candidateId &&
        candidate.score.eligible &&
        candidate.score.totalScore !== null,
    )
    .sort((left, right) => {
      const scoreDifference = right.score.totalScore! - left.score.totalScore!;
      if (Math.abs(scoreDifference) > 1e-9) return scoreDifference;
      return canonicalSerialize({
        topologyId: left.topologyId,
        candidateId: left.candidateId,
      }).localeCompare(
        canonicalSerialize({
          topologyId: right.topologyId,
          candidateId: right.candidateId,
        }),
      );
    });
  return eligible.map((candidate, index) => ({
    candidateId: candidate.candidateId,
    rank: index + 1,
    recommended: index === 0,
    totalScore: candidate.score.totalScore!,
  }));
};

export const topologyDiversityRatio = (
  candidates: readonly RankableFabricationCandidate[],
): number => {
  const eligible = candidates.filter(
    (candidate) =>
      reportIsBoundToIr(candidate.ir, candidate.report) &&
      candidate.report.candidateId === candidate.candidateId &&
      candidate.score.eligible,
  );
  if (eligible.length <= 1) return 1;
  return (
    new Set(eligible.map((candidate) => candidate.topologyId)).size /
    eligible.length
  );
};
