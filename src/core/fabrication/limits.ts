export const FABRICATION_LIMITS = {
  minimumSheetCount: 1,
  maximumSheetCount: 4,
  maximumPanelCount: 24,
  maximumVerticesPerPanel: 64,
  maximumJointAndConnectorCount: 24,
  maximumJointCount: 24,
  maximumConnectorCount: 24,
  maximumDriverCount: 1,
  maximumOutputCount: 6,
  maximumCandidateCount: 3,
  maximumRepairCycles: 5,
  maximumPatchOperationsPerCycle: 3,
  requiredMotionSampleCount: 201,
  minimumPanelAreaMm2: 25,
  minimumFeatureMm: 1,
  minimumInnerCutLigamentMm: 1,
  minimumNetMaterialRatio: 0.08,
  maximumVerificationWorkUnits: 2_000_000,
} as const;

export const FABRICATION_KINEMATIC_LIMITS = {
  maximumClosureResidualMm: 0.1,
  minimumMovingClearanceMm: 0.5,
  maximumAngleErrorDeg: 2,
  maximumTravelErrorMm: 1,
} as const;

export const FABRICATION_CONTRACT_VERSIONS = {
  intent: "1",
  program: "1",
  ir: "1",
  verificationReport: "2",
  programPatch: "1",
  candidate: "2",
} as const;
