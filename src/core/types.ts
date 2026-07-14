import type { CandidateParameters, DesignConstraint } from "./schemas";

export type CandidateStrategy = "stable" | "balanced" | "compact";

export interface Point2 {
  readonly xMm: number;
  readonly yMm: number;
}

export interface Point3 {
  readonly xMm: number;
  readonly yMm: number;
  readonly zMm: number;
}

export interface Segment2 {
  readonly id: string;
  readonly start: Point2;
  readonly end: Point2;
}

export interface Polygon2 {
  readonly id: string;
  readonly points: readonly Point2[];
}

export interface Polygon3 {
  readonly id: string;
  readonly points: readonly Point3[];
}

export interface DerivedDimensions {
  readonly backrestLengthMm: number;
  readonly rearBraceLengthMm: number;
  readonly rearRunMm: number;
  readonly flatLengthMm: number;
  readonly ridgeXMm: number;
}

export interface FlatPattern {
  readonly outline: Polygon2;
  readonly panels: readonly Polygon2[];
  readonly creases: readonly Segment2[];
  readonly slots: readonly Segment2[];
  readonly widthMm: number;
  readonly lengthMm: number;
}

export interface FoldedGeometry {
  readonly sideProfile: Readonly<{
    frontFoot: Point2;
    lipTop: Point2;
    backrestToe: Point2;
    ridge: Point2;
    rearFoot: Point2;
  }>;
  readonly panels: readonly Polygon3[];
}

export interface StandGeometry {
  readonly parameters: CandidateParameters;
  readonly derived: DerivedDimensions;
  readonly flat: FlatPattern;
  readonly folded: FoldedGeometry;
}

export interface Candidate {
  readonly id: string;
  readonly strategy: CandidateStrategy;
  readonly variant: number;
  readonly seed: number;
  readonly parameters: CandidateParameters;
  readonly geometry: StandGeometry;
}

export type CheckStatus = "pass" | "fail" | "warning" | "not_run";

export interface VerificationCheck {
  readonly id: string;
  readonly label: string;
  readonly status: CheckStatus;
  readonly actual: number | string | boolean;
  readonly expected: string;
  readonly message: string;
  readonly geometryRefs: readonly string[];
}

export interface ScoreBreakdown {
  readonly eligible: boolean;
  readonly stability: number;
  readonly simplicity: number;
  readonly paperEfficiency: number;
  readonly targetAngle: number;
  readonly foldability: number;
  readonly total: number;
}

export interface VerificationReport {
  readonly candidateId: string;
  readonly valid: boolean;
  readonly checks: readonly VerificationCheck[];
  readonly schemaValidity: CheckStatus;
  readonly finiteGeometry: CheckStatus;
  readonly sheetBoundResult: CheckStatus;
  readonly printableMarginResult: CheckStatus;
  readonly creaseCountResult: CheckStatus;
  readonly cutCountResult: CheckStatus;
  readonly minimumFeatureResult: CheckStatus;
  readonly targetAngleErrorDeg: number;
  readonly contactAreaMm2: number;
  readonly contactAreaResult: CheckStatus;
  readonly supportPolygonResult: CheckStatus;
  readonly frontStabilityMarginMm: number;
  readonly rearStabilityMarginMm: number;
  readonly sideStabilityMarginMm: number;
  readonly approximateCenterOfMassProjectionMm: Point2;
  readonly intersectionResult: CheckStatus;
  readonly foldFlatCompatibilityResult: CheckStatus;
  readonly svgScaleResult: CheckStatus;
  readonly foldReferenceResult: CheckStatus;
  readonly warnings: readonly string[];
  readonly hardFailures: readonly string[];
  readonly scoreBreakdown: ScoreBreakdown;
  readonly physicalStatus: "awaiting_user";
}

export interface CandidateWithReport {
  readonly candidate: Candidate;
  readonly report: VerificationReport;
}

export interface CandidateComparison {
  readonly candidateIds: readonly string[];
  readonly passedConstraints: Readonly<Record<string, readonly string[]>>;
  readonly failedConstraints: Readonly<Record<string, readonly string[]>>;
  readonly scoreByCandidate: Readonly<Record<string, ScoreBreakdown>>;
  readonly tradeoffs: readonly string[];
  readonly recommendedCandidateId: string | null;
  readonly recommendationRationale: string;
}

export interface TraceEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly source: "AI" | "CODE" | "USER";
  readonly kind: string;
  readonly summary: string;
  readonly inputHash: string;
  readonly candidateId: string | null;
}

export interface DesignSession {
  readonly constraint: DesignConstraint;
  readonly candidates: readonly CandidateWithReport[];
  readonly trace: readonly TraceEvent[];
}
