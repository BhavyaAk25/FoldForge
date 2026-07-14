import type { DesignConstraint } from "./schemas";

export const DEMO_CONSTRAINT: DesignConstraint = {
  objectWidthMm: 71.5,
  objectHeightMm: 147.6,
  objectDepthMm: 7.8,
  objectMassG: 172,
  orientation: "portrait",
  targetViewingAngleDeg: 65,
  angleToleranceDeg: 5,
  sheetWidthMm: 215.9,
  sheetHeightMm: 279.4,
  printableMarginMm: 6.35,
  materialProfile: "cover_110lb",
  maximumActiveCreaseCount: 5,
  cutsAllowed: true,
  maximumCutCount: 2,
  glueAllowed: false,
  mustFoldFlat: true,
  priorities: ["stability", "simplicity", "compactness"],
  explicitRequirements: [
    "Portrait phone stand",
    "65 degree viewing angle",
    "US Letter sheet",
    "No glue",
    "Returns to a flat sheet after tabs are released",
  ],
  inferredDefaults: ["5 degree angle tolerance", "6.35 mm printable margin"],
  unresolvedQuestions: [],
  contradictoryRequirements: [],
  supportedScopeStatus: "supported",
  feasibilityStatus: "feasible",
};

export const deviceFaceDimensions = (
  constraint: DesignConstraint,
): { readonly widthMm: number; readonly lengthMm: number } =>
  constraint.orientation === "portrait"
    ? { widthMm: constraint.objectWidthMm, lengthMm: constraint.objectHeightMm }
    : {
        widthMm: constraint.objectHeightMm,
        lengthMm: constraint.objectWidthMm,
      };
