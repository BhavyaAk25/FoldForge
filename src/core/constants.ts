export const PARAMETER_RANGES = {
  baseDepthMm: { min: 45, max: 130 },
  standWidthMm: { min: 60, max: 160 },
  backrestRiseMm: { min: 35, max: 90 },
  backrestAngleDeg: { min: 50, max: 75 },
  frontToeDepthMm: { min: 7, max: 22 },
  lipHeightMm: { min: 8, max: 18 },
  tabDepthMm: { min: 8, max: 12 },
  tabWidthMm: { min: 16, max: 28 },
  slotClearanceMm: { min: 0.4, max: 1.2 },
  panelClearanceMm: { min: 0.4, max: 1.5 },
} as const;

export const MATERIALS = {
  cover_65lb: { label: "65 lb cover", gsm: 176, thicknessMm: 0.22 },
  cover_80lb: { label: "80 lb cover", gsm: 216, thicknessMm: 0.27 },
  cover_110lb: { label: "110 lb cover", gsm: 298, thicknessMm: 0.38 },
} as const;

export const TOPOLOGY = {
  activeCreaseCount: 5,
  internalCutCount: 2,
  minimumRearRunMm: 12,
  deploymentSamples: 201,
  physicalStatus: "awaiting_user",
} as const;

export const PRODUCT_LIMITS = {
  maximumObjectMassG: 500,
  maximumPromptCharacters: 2_000,
  maximumRepairCycles: 5,
  maximumPatchOperations: 3,
} as const;

export const SCORE_WEIGHTS = {
  stability: 30,
  simplicity: 20,
  paperEfficiency: 15,
  targetAngle: 20,
  foldability: 15,
} as const;
