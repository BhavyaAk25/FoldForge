import { MATERIALS, TOPOLOGY } from "./constants";
import { deviceFaceDimensions } from "./constraints";
import { exportFold, verifyFoldReference } from "./export/fold";
import { exportSvg, verifySvgScale } from "./export/svg";
import {
  findDeploymentIntersection,
  maximumPanelLengthErrorMm,
} from "./geometry";
import { degreesToRadians, round } from "./math";
import {
  CandidateParametersSchema,
  DesignConstraintSchema,
  type DesignConstraint,
} from "./schemas";
import { calculateScore } from "./scoring";
import type {
  Candidate,
  CandidateComparison,
  CandidateStrategy,
  CandidateWithReport,
  CheckStatus,
  VerificationCheck,
  VerificationReport,
} from "./types";

interface CheckInput {
  readonly id: string;
  readonly label: string;
  readonly passed: boolean;
  readonly actual: number | string | boolean;
  readonly expected: string;
  readonly passMessage: string;
  readonly failMessage: string;
  readonly geometryRefs?: readonly string[];
  readonly hard?: boolean;
}

class OrderedCheckRunner {
  readonly checks: VerificationCheck[] = [];
  private stopped = false;

  run(input: CheckInput): void {
    if (this.stopped) {
      this.checks.push({
        id: input.id,
        label: input.label,
        status: "not_run",
        actual: "not evaluated",
        expected: input.expected,
        message: "Skipped after an earlier hard failure.",
        geometryRefs: input.geometryRefs ?? [],
      });
      return;
    }

    const status: CheckStatus = input.passed
      ? "pass"
      : input.hard === false
        ? "warning"
        : "fail";
    this.checks.push({
      id: input.id,
      label: input.label,
      status,
      actual: input.actual,
      expected: input.expected,
      message: input.passed ? input.passMessage : input.failMessage,
      geometryRefs: input.geometryRefs ?? [],
    });

    if (!input.passed && input.hard !== false) this.stopped = true;
  }
}

const finiteGeometry = (candidate: Candidate): boolean => {
  const coordinates = [
    ...candidate.geometry.flat.outline.points.flatMap((point) => [
      point.xMm,
      point.yMm,
    ]),
    ...candidate.geometry.folded.panels.flatMap((panel) =>
      panel.points.flatMap((point) => [point.xMm, point.yMm, point.zMm]),
    ),
    ...Object.values(candidate.geometry.derived),
  ];
  return coordinates.every(Number.isFinite);
};

const statusFor = (
  checks: readonly VerificationCheck[],
  id: string,
): CheckStatus => checks.find((check) => check.id === id)?.status ?? "not_run";

export const verifyCandidate = (
  candidate: Candidate,
  constraint: DesignConstraint,
): VerificationReport => {
  const runner = new OrderedCheckRunner();
  const parameterResult = CandidateParametersSchema.safeParse(
    candidate.parameters,
  );
  const constraintResult = DesignConstraintSchema.safeParse(constraint);
  const schemaValid = parameterResult.success && constraintResult.success;

  runner.run({
    id: "schema.valid",
    label: "Schema, units, and finite input",
    passed: schemaValid,
    actual: schemaValid,
    expected: "strict canonical schemas",
    passMessage:
      "Candidate and constraint inputs match the strict canonical schemas.",
    failMessage: "Candidate or constraint input is outside its strict schema.",
  });

  const scopeValid =
    constraint.supportedScopeStatus === "supported" &&
    constraint.contradictoryRequirements.length === 0 &&
    constraint.unresolvedQuestions.length === 0;
  runner.run({
    id: "scope.supported",
    label: "Supported scope",
    passed: scopeValid,
    actual: constraint.supportedScopeStatus,
    expected: "supported with no unresolved contradictions",
    passMessage:
      "The request is inside the supported phone/light-tablet stand family.",
    failMessage:
      "The request is unsupported, contradictory, or still needs essential input.",
  });

  const rearRunValid =
    candidate.geometry.derived.rearRunMm >= TOPOLOGY.minimumRearRunMm;
  runner.run({
    id: "geometry.rear_run",
    label: "Parameter ranges and derived rear run",
    passed: rearRunValid,
    actual: round(candidate.geometry.derived.rearRunMm, 3),
    expected: `at least ${TOPOLOGY.minimumRearRunMm} mm`,
    passMessage: "The derived rear brace has enough horizontal run.",
    failMessage:
      "The ridge consumes too much base depth, leaving an invalid rear brace run.",
    geometryRefs: ["panel-rear-brace", "crease-rear-base"],
  });

  const geometryFinite = finiteGeometry(candidate);
  const nondegenerate =
    geometryFinite &&
    candidate.geometry.derived.backrestLengthMm > 0 &&
    candidate.geometry.derived.rearBraceLengthMm > 0 &&
    candidate.geometry.flat.outline.points.length >= 4;
  runner.run({
    id: "geometry.finite",
    label: "Finite, nondegenerate geometry",
    passed: nondegenerate,
    actual: geometryFinite,
    expected: "finite coordinates and positive panel lengths",
    passMessage:
      "All generated coordinates are finite and all panels are nondegenerate.",
    failMessage:
      "Generated geometry contains a non-finite coordinate or degenerate panel.",
    geometryRefs: ["perimeter"],
  });

  const patternWidthWithMarginsMm =
    candidate.geometry.flat.widthMm + constraint.printableMarginMm * 2;
  const patternLengthWithMarginsMm =
    candidate.geometry.flat.lengthMm + constraint.printableMarginMm * 2;
  const sheetFits =
    patternWidthWithMarginsMm <= constraint.sheetWidthMm &&
    patternLengthWithMarginsMm <= constraint.sheetHeightMm;
  runner.run({
    id: "sheet.bounds",
    label: "Sheet bounds",
    passed: sheetFits,
    actual: `${round(patternWidthWithMarginsMm, 2)} × ${round(patternLengthWithMarginsMm, 2)} mm`,
    expected: `${constraint.sheetWidthMm} × ${constraint.sheetHeightMm} mm or smaller`,
    passMessage: "The complete pattern fits the selected sheet.",
    failMessage:
      "The pattern exceeds the selected sheet after printable margins.",
    geometryRefs: ["perimeter"],
  });

  const marginValid =
    constraint.printableMarginMm >= 3 &&
    candidate.geometry.flat.widthMm <=
      constraint.sheetWidthMm - constraint.printableMarginMm * 2 &&
    candidate.geometry.flat.lengthMm <=
      constraint.sheetHeightMm - constraint.printableMarginMm * 2;
  runner.run({
    id: "sheet.margin",
    label: "Printable margins",
    passed: marginValid,
    actual: constraint.printableMarginMm,
    expected: "at least 3 mm on every side",
    passMessage: "The pattern stays inside the printable margin.",
    failMessage: "One or more cut lines enter the reserved printable margin.",
    geometryRefs: ["perimeter"],
  });

  const leftSlot = candidate.geometry.flat.slots[0];
  const rightSlot = candidate.geometry.flat.slots[1];
  const slotGapMm =
    leftSlot && rightSlot
      ? rightSlot.start.xMm - leftSlot.end.xMm
      : Number.NEGATIVE_INFINITY;
  const featuresValid =
    candidate.parameters.tabDepthMm >= 8 &&
    candidate.parameters.tabWidthMm >= 16 &&
    candidate.parameters.slotClearanceMm >= 0.4 &&
    slotGapMm >= 8;
  runner.run({
    id: "feature.minimum",
    label: "Minimum features and clearances",
    passed: featuresValid,
    actual: round(slotGapMm, 3),
    expected: "tabs ≥8 × 16 mm, clearance ≥0.4 mm, slot gap ≥8 mm",
    passMessage:
      "Tabs, slots, and intervening paper meet the minimum feature rules.",
    failMessage:
      "A tab, slot, clearance, or intervening paper bridge is too small.",
    geometryRefs: [
      "slot-left",
      "slot-right",
      "crease-tab-left",
      "crease-tab-right",
    ],
  });

  const requiredLipHeightMm = Math.min(
    18,
    Math.max(
      8,
      constraint.objectDepthMm *
        Math.cos(degreesToRadians(candidate.parameters.backrestAngleDeg)) +
        3,
    ),
  );
  const lipValid = candidate.parameters.lipHeightMm >= requiredLipHeightMm;
  runner.run({
    id: "retention.lip",
    label: "Front-lip retention height",
    passed: lipValid,
    actual: round(candidate.parameters.lipHeightMm, 3),
    expected: `at least ${round(requiredLipHeightMm, 3)} mm for the device depth`,
    passMessage:
      "The front lip meets the geometric retention-height heuristic.",
    failMessage:
      "The front lip is too short for the device depth at this angle.",
    geometryRefs: ["panel-lip", "crease-base-lip"],
  });

  const creaseCountValid =
    candidate.geometry.flat.creases.length <=
      constraint.maximumActiveCreaseCount &&
    candidate.geometry.flat.creases.length === TOPOLOGY.activeCreaseCount;
  runner.run({
    id: "topology.creases",
    label: "Active crease limit",
    passed: creaseCountValid,
    actual: candidate.geometry.flat.creases.length,
    expected: `exactly ${TOPOLOGY.activeCreaseCount} and no more than the requested limit`,
    passMessage:
      "The release topology uses exactly five active crease components.",
    failMessage:
      "The active crease count exceeds the requested or topology limit.",
    geometryRefs: candidate.geometry.flat.creases.map((crease) => crease.id),
  });

  const cutCountValid =
    constraint.cutsAllowed &&
    candidate.geometry.flat.slots.length === TOPOLOGY.internalCutCount &&
    candidate.geometry.flat.slots.length <= constraint.maximumCutCount;
  runner.run({
    id: "topology.cuts",
    label: "Internal cut limit",
    passed: cutCountValid,
    actual: candidate.geometry.flat.slots.length,
    expected: `exactly ${TOPOLOGY.internalCutCount} permitted internal slots`,
    passMessage:
      "The pattern uses two permitted internal slot cuts; perimeter trim is separate.",
    failMessage:
      "This locking topology requires two internal slots, but the request disallows them.",
    geometryRefs: ["slot-left", "slot-right"],
  });

  const panelLengthErrorMm = maximumPanelLengthErrorMm(candidate.geometry);
  const targetAngleErrorDeg = Math.abs(
    candidate.parameters.backrestAngleDeg - constraint.targetViewingAngleDeg,
  );
  const transformValid = panelLengthErrorMm <= 0.01;
  runner.run({
    id: "fold.transforms",
    label: "Rigid transforms and seam closure",
    passed: transformValid,
    actual: round(panelLengthErrorMm, 6),
    expected: "panel length error ≤0.01 mm",
    passMessage:
      "Folded transforms preserve panel lengths and close the intended chain.",
    failMessage: "Folded transforms do not preserve the source panel lengths.",
    geometryRefs: [
      "panel-backrest",
      "panel-rear-brace",
      "panel-base",
      "panel-lip",
    ],
  });
  runner.run({
    id: "angle.target",
    label: "Target viewing angle",
    passed: targetAngleErrorDeg <= constraint.angleToleranceDeg,
    actual: round(targetAngleErrorDeg, 3),
    expected: `≤${constraint.angleToleranceDeg}° error`,
    passMessage:
      "The generated backrest angle is within the requested tolerance.",
    failMessage: "The generated backrest angle misses the requested tolerance.",
    geometryRefs: ["panel-backrest"],
  });

  const intersection = findDeploymentIntersection(candidate.geometry);
  runner.run({
    id: "fold.intersections",
    label: "Deployment intersections",
    passed: !intersection.intersects,
    actual:
      intersection.progress === null ? "none" : round(intersection.progress, 4),
    expected: `no improper intersections across ${TOPOLOGY.deploymentSamples} states`,
    passMessage:
      "No improper cross-section intersection was found during sampled deployment.",
    failMessage: "Panels intersect during the sampled unlock-to-sheet path.",
    geometryRefs: ["panel-lip", "panel-backrest", "panel-rear-brace"],
  });

  const face = deviceFaceDimensions(constraint);
  const overlapWidthMm = Math.min(
    face.widthMm,
    candidate.parameters.standWidthMm,
  );
  const overlapLengthMm = Math.min(
    face.lengthMm,
    candidate.geometry.derived.backrestLengthMm,
  );
  const contactAreaMm2 = overlapWidthMm * overlapLengthMm;
  const contactRatio = contactAreaMm2 / (face.widthMm * face.lengthMm);
  runner.run({
    id: "contact.nominal",
    label: "Nominal geometric contact",
    passed: contactRatio >= 0.25,
    actual: round(contactAreaMm2, 2),
    expected: "at least 25% of the device face area",
    passMessage: "The backrest provides adequate nominal geometric overlap.",
    failMessage:
      "The nominal backrest overlap is too small for this supported device.",
    geometryRefs: ["panel-backrest"],
  });

  const angleRad = degreesToRadians(candidate.parameters.backrestAngleDeg);
  const objectCenterXMm =
    candidate.parameters.frontToeDepthMm +
    (face.lengthMm / 2) * Math.cos(angleRad) -
    (constraint.objectDepthMm / 2) * Math.sin(angleRad);
  const paperAreaM2 =
    (candidate.geometry.flat.widthMm * candidate.geometry.flat.lengthMm) /
    1_000_000;
  const paperMassG = paperAreaM2 * MATERIALS[constraint.materialProfile].gsm;
  const combinedCenterXMm =
    (objectCenterXMm * constraint.objectMassG +
      (candidate.parameters.baseDepthMm / 2) * paperMassG) /
    (constraint.objectMassG + paperMassG);
  const uncertaintyMm = Math.max(5, candidate.parameters.baseDepthMm * 0.03);
  const frontStabilityMarginMm = combinedCenterXMm - uncertaintyMm;
  const rearStabilityMarginMm =
    candidate.parameters.baseDepthMm - combinedCenterXMm - uncertaintyMm;
  const sideStabilityMarginMm =
    candidate.parameters.standWidthMm / 2 - uncertaintyMm;
  const stabilityValid =
    frontStabilityMarginMm >= 0 &&
    rearStabilityMarginMm >= 0 &&
    sideStabilityMarginMm >= 0;
  runner.run({
    id: "stability.support_polygon",
    label: "Support polygon and stability reserves",
    passed: stabilityValid,
    actual: `front ${round(frontStabilityMarginMm, 2)}, rear ${round(rearStabilityMarginMm, 2)}, side ${round(sideStabilityMarginMm, 2)} mm`,
    expected: "all signed reserves ≥0 mm",
    passMessage:
      "The approximate combined centre of mass remains inside the reserved support polygon.",
    failMessage:
      "The approximate centre of mass crosses a conservative support-polygon reserve.",
    geometryRefs: ["panel-base"],
  });

  const foldFlatCompatible =
    !constraint.mustFoldFlat ||
    (candidate.parameters.lockingStyle === "dual_tabs" &&
      !constraint.glueAllowed);
  runner.run({
    id: "fold.unlock_to_sheet",
    label: "Unlock-to-sheet compatibility",
    passed: foldFlatCompatible,
    actual: candidate.parameters.lockingStyle,
    expected: "dual releasable tabs with no glued joint",
    passMessage:
      "Releasing both tabs returns the continuous strip to its planar sheet.",
    failMessage:
      "The requested fold-flat behavior is incompatible with the selected lock or glue rule.",
    geometryRefs: [
      "crease-tab-left",
      "crease-tab-right",
      "slot-left",
      "slot-right",
    ],
  });

  const svg = exportSvg(candidate, constraint);
  const svgScale = verifySvgScale(svg, constraint);
  runner.run({
    id: "export.svg_scale",
    label: "SVG physical scale",
    passed: svgScale.valid,
    actual: round(svgScale.errorMm, 6),
    expected: "≤0.01 mm declaration and 50 mm calibration error",
    passMessage: "SVG millimetres, viewBox units, and calibration line agree.",
    failMessage:
      "SVG physical dimensions or calibration line are inconsistent.",
    geometryRefs: ["calibration-50mm", "perimeter"],
  });

  const foldReference = verifyFoldReference(candidate, exportFold(candidate));
  runner.run({
    id: "export.fold_reference",
    label: "FOLD source equivalence",
    passed: foldReference.valid,
    actual: foldReference.valid,
    expected: "FoldForge FOLD 1.2 edge profile",
    passMessage: foldReference.message,
    failMessage: foldReference.message,
    geometryRefs: ["perimeter", "slot-left", "slot-right"],
  });

  const hardFailures = runner.checks
    .filter((check) => check.status === "fail")
    .map((check) => check.id);
  const valid =
    hardFailures.length === 0 &&
    runner.checks.every((check) => check.status === "pass");
  const paperEfficiencyRatio =
    (candidate.geometry.flat.widthMm * candidate.geometry.flat.lengthMm) /
    (constraint.sheetWidthMm * constraint.sheetHeightMm);
  const scoreBreakdown = calculateScore({
    eligible: valid,
    frontStabilityMarginMm,
    rearStabilityMarginMm,
    sideStabilityMarginMm,
    paperEfficiencyRatio,
    targetAngleErrorDeg,
    angleToleranceDeg: constraint.angleToleranceDeg,
    panelClearanceMm: candidate.parameters.panelClearanceMm,
    priority: constraint.priorities[0] ?? "stability",
  });

  return {
    candidateId: candidate.id,
    valid,
    checks: runner.checks,
    schemaValidity: statusFor(runner.checks, "schema.valid"),
    finiteGeometry: statusFor(runner.checks, "geometry.finite"),
    sheetBoundResult: statusFor(runner.checks, "sheet.bounds"),
    printableMarginResult: statusFor(runner.checks, "sheet.margin"),
    creaseCountResult: statusFor(runner.checks, "topology.creases"),
    cutCountResult: statusFor(runner.checks, "topology.cuts"),
    minimumFeatureResult: statusFor(runner.checks, "feature.minimum"),
    targetAngleErrorDeg: round(targetAngleErrorDeg, 6),
    contactAreaMm2: round(contactAreaMm2, 3),
    contactAreaResult: statusFor(runner.checks, "contact.nominal"),
    supportPolygonResult: statusFor(runner.checks, "stability.support_polygon"),
    frontStabilityMarginMm: round(frontStabilityMarginMm, 3),
    rearStabilityMarginMm: round(rearStabilityMarginMm, 3),
    sideStabilityMarginMm: round(sideStabilityMarginMm, 3),
    approximateCenterOfMassProjectionMm: {
      xMm: round(combinedCenterXMm, 3),
      yMm: 0,
    },
    intersectionResult: statusFor(runner.checks, "fold.intersections"),
    foldFlatCompatibilityResult: statusFor(
      runner.checks,
      "fold.unlock_to_sheet",
    ),
    svgScaleResult: statusFor(runner.checks, "export.svg_scale"),
    foldReferenceResult: statusFor(runner.checks, "export.fold_reference"),
    warnings: [
      "Geometric and kinematic verification only; material strength and real load capacity are not simulated.",
      "Physical validation pending user print, fold, and timed hold test.",
    ],
    hardFailures,
    scoreBreakdown,
    physicalStatus: TOPOLOGY.physicalStatus,
  };
};

export const selectRepresentatives = (
  candidates: readonly CandidateWithReport[],
): readonly CandidateWithReport[] => {
  const strategies: readonly CandidateStrategy[] = [
    "stable",
    "balanced",
    "compact",
  ];
  return strategies.flatMap((strategy) => {
    const group = candidates.filter(
      (entry) => entry.candidate.strategy === strategy,
    );
    if (strategy === "compact") {
      const measuredFailure = group
        .filter((entry) => !entry.report.valid)
        .sort(
          (first, second) =>
            first.report.hardFailures.length -
            second.report.hardFailures.length,
        )[0];
      if (measuredFailure) return [measuredFailure];
    }

    const best = [...group].sort(
      (first, second) =>
        second.report.scoreBreakdown.total - first.report.scoreBreakdown.total,
    )[0];
    return best ? [best] : [];
  });
};

export const compareCandidates = (
  candidates: readonly CandidateWithReport[],
): CandidateComparison => {
  const valid = candidates
    .filter((entry) => entry.report.valid)
    .sort(
      (first, second) =>
        second.report.scoreBreakdown.total - first.report.scoreBreakdown.total,
    );
  const winner = valid[0] ?? null;

  return {
    candidateIds: candidates.map((entry) => entry.candidate.id),
    passedConstraints: Object.fromEntries(
      candidates.map((entry) => [
        entry.candidate.id,
        entry.report.checks
          .filter((check) => check.status === "pass")
          .map((check) => check.id),
      ]),
    ),
    failedConstraints: Object.fromEntries(
      candidates.map((entry) => [
        entry.candidate.id,
        entry.report.hardFailures,
      ]),
    ),
    scoreByCandidate: Object.fromEntries(
      candidates.map((entry) => [
        entry.candidate.id,
        entry.report.scoreBreakdown,
      ]),
    ),
    tradeoffs: candidates.map(
      (entry) =>
        `${entry.candidate.strategy}: ${round(entry.candidate.parameters.baseDepthMm, 1)} mm base, ${round(entry.candidate.parameters.standWidthMm, 1)} mm width`,
    ),
    recommendedCandidateId: winner?.candidate.id ?? null,
    recommendationRationale: winner
      ? `${winner.candidate.id} has the highest deterministic score among candidates that pass every hard check.`
      : "No candidate passes every hard check; no recommendation is permitted.",
  };
};
