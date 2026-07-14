import { generateCandidates } from "@/core/candidates";
import { DEMO_CONSTRAINT } from "@/core/constraints";
import { buildStandGeometry } from "@/core/geometry";
import type { CandidateParameters, DesignConstraint } from "@/core/schemas";
import type { Candidate } from "@/core/types";
import { verifyCandidate } from "@/core/verification";

export interface RepairFixture {
  readonly name: string;
  readonly candidate: Candidate;
  readonly constraint: DesignConstraint;
  readonly expectedStatus: "passed" | "infeasible";
  readonly expectedInitialFailure: string;
}

const generated = generateCandidates(DEMO_CONSTRAINT, 20260714);
const base = generated.find(
  (candidate) => candidate.strategy === "balanced" && candidate.variant === 1,
);
const rearRunFailure = generated.find(
  (candidate) => candidate.strategy === "compact" && candidate.variant === 2,
);

if (!base || !rearRunFailure || !verifyCandidate(base, DEMO_CONSTRAINT).valid) {
  throw new Error("Repair fixture base candidates are unavailable.");
}

const withParameters = (
  id: string,
  parameters: CandidateParameters,
): Candidate => ({
  ...base,
  id,
  parameters,
  geometry: buildStandGeometry(parameters),
});

const angleFailure = withParameters("fixture-angle", {
  ...base.parameters,
  baseDepthMm: 90,
  backrestRiseMm: 50,
  backrestAngleDeg: 50,
  frontToeDepthMm: 10,
  lipHeightMm: 9,
});

const featureFailure = withParameters("fixture-feature", {
  ...base.parameters,
  standWidthMm: 60,
  tabWidthMm: 28,
});

const lipConstraint: DesignConstraint = {
  ...DEMO_CONSTRAINT,
  objectDepthMm: 30,
  targetViewingAngleDeg: 75,
};
const lipFailure = withParameters("fixture-lip", {
  ...base.parameters,
  backrestAngleDeg: 75,
  lipHeightMm: 8,
});

const contactConstraint: DesignConstraint = {
  ...DEMO_CONSTRAINT,
  objectHeightMm: 320,
  sheetHeightMm: 500,
};
const contactFailure = withParameters("fixture-contact", {
  ...base.parameters,
  baseDepthMm: 80,
  backrestRiseMm: 35,
  backrestAngleDeg: 65,
  frontToeDepthMm: 7,
});

const stabilityConstraint: DesignConstraint = {
  ...DEMO_CONSTRAINT,
  objectWidthMm: 60,
  objectHeightMm: 1,
  objectDepthMm: 30,
  objectMassG: 500,
  sheetHeightMm: 500,
  targetViewingAngleDeg: 75,
};
const stabilityFailure = withParameters("fixture-stability", {
  ...base.parameters,
  backrestAngleDeg: 75,
  lipHeightMm: 11,
});

const sheetFailure = withParameters("fixture-sheet", {
  ...base.parameters,
  baseDepthMm: 90,
  backrestRiseMm: 70,
  backrestAngleDeg: 65,
  frontToeDepthMm: 8,
  lipHeightMm: 10,
});

export const REPAIR_FIXTURES: readonly RepairFixture[] = [
  {
    name: "negative rear run",
    candidate: rearRunFailure,
    constraint: DEMO_CONSTRAINT,
    expectedStatus: "passed",
    expectedInitialFailure: "geometry.rear_run",
  },
  {
    name: "target angle error",
    candidate: angleFailure,
    constraint: DEMO_CONSTRAINT,
    expectedStatus: "passed",
    expectedInitialFailure: "angle.target",
  },
  {
    name: "minimum slot bridge",
    candidate: featureFailure,
    constraint: DEMO_CONSTRAINT,
    expectedStatus: "passed",
    expectedInitialFailure: "feature.minimum",
  },
  {
    name: "insufficient lip",
    candidate: lipFailure,
    constraint: lipConstraint,
    expectedStatus: "passed",
    expectedInitialFailure: "retention.lip",
  },
  {
    name: "insufficient contact",
    candidate: contactFailure,
    constraint: contactConstraint,
    expectedStatus: "passed",
    expectedInitialFailure: "contact.nominal",
  },
  {
    name: "negative front stability",
    candidate: stabilityFailure,
    constraint: stabilityConstraint,
    expectedStatus: "passed",
    expectedInitialFailure: "stability.support_polygon",
  },
  {
    name: "sheet overflow",
    candidate: sheetFailure,
    constraint: DEMO_CONSTRAINT,
    expectedStatus: "passed",
    expectedInitialFailure: "sheet.bounds",
  },
  {
    name: "cuts prohibited",
    candidate: base,
    constraint: { ...DEMO_CONSTRAINT, cutsAllowed: false, maximumCutCount: 0 },
    expectedStatus: "infeasible",
    expectedInitialFailure: "topology.cuts",
  },
  {
    name: "crease limit below topology",
    candidate: base,
    constraint: { ...DEMO_CONSTRAINT, maximumActiveCreaseCount: 4 },
    expectedStatus: "infeasible",
    expectedInitialFailure: "topology.creases",
  },
  {
    name: "glued fold-flat contradiction",
    candidate: base,
    constraint: { ...DEMO_CONSTRAINT, glueAllowed: true },
    expectedStatus: "infeasible",
    expectedInitialFailure: "fold.unlock_to_sheet",
  },
];
