import { TOPOLOGY } from "./constants";
import { degreesToRadians, distance2 } from "./math";
import type { CandidateParameters } from "./schemas";
import type {
  DerivedDimensions,
  FoldedGeometry,
  Point2,
  Point3,
  Polygon2,
  Segment2,
  StandGeometry,
} from "./types";

const rectangle = (
  id: string,
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
): Polygon2 => ({
  id,
  points: [
    { xMm, yMm },
    { xMm: xMm + widthMm, yMm },
    { xMm: xMm + widthMm, yMm: yMm + heightMm },
    { xMm, yMm: yMm + heightMm },
  ],
});

const panel3 = (
  id: string,
  first: Point2,
  second: Point2,
  widthMm: number,
): { readonly id: string; readonly points: readonly Point3[] } => ({
  id,
  points: [
    { xMm: first.xMm, yMm: -widthMm / 2, zMm: first.yMm },
    { xMm: first.xMm, yMm: widthMm / 2, zMm: first.yMm },
    { xMm: second.xMm, yMm: widthMm / 2, zMm: second.yMm },
    { xMm: second.xMm, yMm: -widthMm / 2, zMm: second.yMm },
  ],
});

export const deriveDimensions = (
  parameters: CandidateParameters,
): DerivedDimensions => {
  const angleRad = degreesToRadians(parameters.backrestAngleDeg);
  const ridgeXMm =
    parameters.frontToeDepthMm + parameters.backrestRiseMm / Math.tan(angleRad);
  const rearRunMm = parameters.baseDepthMm - ridgeXMm;
  const backrestLengthMm = parameters.backrestRiseMm / Math.sin(angleRad);
  const rearBraceLengthMm = Math.hypot(parameters.backrestRiseMm, rearRunMm);
  const flatLengthMm =
    parameters.tabDepthMm +
    backrestLengthMm +
    rearBraceLengthMm +
    parameters.baseDepthMm +
    parameters.lipHeightMm;

  return {
    backrestLengthMm,
    rearBraceLengthMm,
    rearRunMm,
    flatLengthMm,
    ridgeXMm,
  };
};

const buildOutline = (
  parameters: CandidateParameters,
  flatLengthMm: number,
): Polygon2 => {
  const widthMm = parameters.standWidthMm;
  const tabWidthMm = parameters.tabWidthMm;
  const tabDepthMm = parameters.tabDepthMm;
  const insetMm = widthMm * 0.14;
  const leftStartMm = insetMm;
  const rightStartMm = widthMm - insetMm - tabWidthMm;

  return {
    id: "perimeter",
    points: [
      { xMm: 0, yMm: tabDepthMm },
      { xMm: leftStartMm, yMm: tabDepthMm },
      { xMm: leftStartMm, yMm: 0 },
      { xMm: leftStartMm + tabWidthMm, yMm: 0 },
      { xMm: leftStartMm + tabWidthMm, yMm: tabDepthMm },
      { xMm: rightStartMm, yMm: tabDepthMm },
      { xMm: rightStartMm, yMm: 0 },
      { xMm: rightStartMm + tabWidthMm, yMm: 0 },
      { xMm: rightStartMm + tabWidthMm, yMm: tabDepthMm },
      { xMm: widthMm, yMm: tabDepthMm },
      { xMm: widthMm, yMm: flatLengthMm },
      { xMm: 0, yMm: flatLengthMm },
    ],
  };
};

export const buildStandGeometry = (
  parameters: CandidateParameters,
): StandGeometry => {
  const derived = deriveDimensions(parameters);
  const backrestStartMm = parameters.tabDepthMm;
  const rearBraceStartMm = backrestStartMm + derived.backrestLengthMm;
  const baseStartMm = rearBraceStartMm + derived.rearBraceLengthMm;
  const lipStartMm = baseStartMm + parameters.baseDepthMm;
  const widthMm = parameters.standWidthMm;
  const tabInsetMm = widthMm * 0.14;
  const slotLengthMm = parameters.tabWidthMm + parameters.slotClearanceMm;
  const slotYMm =
    baseStartMm + parameters.baseDepthMm - parameters.frontToeDepthMm;
  const leftSlotCenterMm = tabInsetMm + parameters.tabWidthMm / 2;
  const rightSlotCenterMm = widthMm - leftSlotCenterMm;

  const creases: readonly Segment2[] = [
    {
      id: "crease-backrest-rear",
      start: { xMm: 0, yMm: rearBraceStartMm },
      end: { xMm: widthMm, yMm: rearBraceStartMm },
    },
    {
      id: "crease-rear-base",
      start: { xMm: 0, yMm: baseStartMm },
      end: { xMm: widthMm, yMm: baseStartMm },
    },
    {
      id: "crease-base-lip",
      start: { xMm: 0, yMm: lipStartMm },
      end: { xMm: widthMm, yMm: lipStartMm },
    },
    {
      id: "crease-tab-left",
      start: { xMm: tabInsetMm, yMm: backrestStartMm },
      end: {
        xMm: tabInsetMm + parameters.tabWidthMm,
        yMm: backrestStartMm,
      },
    },
    {
      id: "crease-tab-right",
      start: {
        xMm: widthMm - tabInsetMm - parameters.tabWidthMm,
        yMm: backrestStartMm,
      },
      end: { xMm: widthMm - tabInsetMm, yMm: backrestStartMm },
    },
  ];

  const slots: readonly Segment2[] = [
    {
      id: "slot-left",
      start: { xMm: leftSlotCenterMm - slotLengthMm / 2, yMm: slotYMm },
      end: { xMm: leftSlotCenterMm + slotLengthMm / 2, yMm: slotYMm },
    },
    {
      id: "slot-right",
      start: { xMm: rightSlotCenterMm - slotLengthMm / 2, yMm: slotYMm },
      end: { xMm: rightSlotCenterMm + slotLengthMm / 2, yMm: slotYMm },
    },
  ];

  const frontFoot: Point2 = { xMm: 0, yMm: 0 };
  const lipTop: Point2 = { xMm: 0, yMm: parameters.lipHeightMm };
  const backrestToe: Point2 = { xMm: parameters.frontToeDepthMm, yMm: 0 };
  const ridge: Point2 = {
    xMm: derived.ridgeXMm,
    yMm: parameters.backrestRiseMm,
  };
  const rearFoot: Point2 = { xMm: parameters.baseDepthMm, yMm: 0 };

  const folded: FoldedGeometry = {
    sideProfile: { frontFoot, lipTop, backrestToe, ridge, rearFoot },
    panels: [
      panel3("panel-base", frontFoot, rearFoot, widthMm),
      panel3("panel-lip", frontFoot, lipTop, widthMm),
      panel3("panel-backrest", backrestToe, ridge, widthMm),
      panel3("panel-rear-brace", ridge, rearFoot, widthMm),
    ],
  };

  return {
    parameters,
    derived,
    flat: {
      outline: buildOutline(parameters, derived.flatLengthMm),
      panels: [
        rectangle(
          "panel-tab-left",
          tabInsetMm,
          0,
          parameters.tabWidthMm,
          parameters.tabDepthMm,
        ),
        rectangle(
          "panel-tab-right",
          widthMm - tabInsetMm - parameters.tabWidthMm,
          0,
          parameters.tabWidthMm,
          parameters.tabDepthMm,
        ),
        rectangle(
          "panel-backrest",
          0,
          backrestStartMm,
          widthMm,
          derived.backrestLengthMm,
        ),
        rectangle(
          "panel-rear-brace",
          0,
          rearBraceStartMm,
          widthMm,
          derived.rearBraceLengthMm,
        ),
        rectangle(
          "panel-base",
          0,
          baseStartMm,
          widthMm,
          parameters.baseDepthMm,
        ),
        rectangle("panel-lip", 0, lipStartMm, widthMm, parameters.lipHeightMm),
      ],
      creases,
      slots,
      widthMm,
      lengthMm: derived.flatLengthMm,
    },
    folded,
  };
};

const interpolateAngle = (
  startRad: number,
  endRad: number,
  progress: number,
): number => {
  let delta = endRad - startRad;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return startRad + delta * progress;
};

const pointFrom = (
  origin: Point2,
  lengthMm: number,
  angleRad: number,
): Point2 => ({
  xMm: origin.xMm + lengthMm * Math.cos(angleRad),
  yMm: origin.yMm + lengthMm * Math.sin(angleRad),
});

export interface DeploymentState {
  readonly progress: number;
  readonly frontFoot: Point2;
  readonly lipTop: Point2;
  readonly rearFoot: Point2;
  readonly ridge: Point2;
  readonly backrestToe: Point2;
}

export const deploymentState = (
  geometry: StandGeometry,
  progress: number,
): DeploymentState => {
  const { parameters, derived, folded } = geometry;
  const frontFoot: Point2 = { xMm: 0, yMm: 0 };
  const baseAngleRad = interpolateAngle(Math.PI, 0, progress);
  const rearFinalAngleRad = Math.atan2(
    folded.sideProfile.ridge.yMm,
    folded.sideProfile.ridge.xMm - folded.sideProfile.rearFoot.xMm,
  );
  const backFinalAngleRad = Math.atan2(
    folded.sideProfile.backrestToe.yMm - folded.sideProfile.ridge.yMm,
    folded.sideProfile.backrestToe.xMm - folded.sideProfile.ridge.xMm,
  );
  const lipAngleRad = interpolateAngle(0, Math.PI / 2, progress);
  const rearAngleRad = interpolateAngle(Math.PI, rearFinalAngleRad, progress);
  const backAngleRad = interpolateAngle(Math.PI, backFinalAngleRad, progress);
  const rearFoot = pointFrom(frontFoot, parameters.baseDepthMm, baseAngleRad);
  const ridge = pointFrom(rearFoot, derived.rearBraceLengthMm, rearAngleRad);
  const backrestToe = pointFrom(ridge, derived.backrestLengthMm, backAngleRad);
  const lipTop = pointFrom(frontFoot, parameters.lipHeightMm, lipAngleRad);

  return { progress, frontFoot, lipTop, rearFoot, ridge, backrestToe };
};

const orientation = (first: Point2, second: Point2, third: Point2): number =>
  (second.yMm - first.yMm) * (third.xMm - second.xMm) -
  (second.xMm - first.xMm) * (third.yMm - second.yMm);

const segmentsProperlyIntersect = (
  firstStart: Point2,
  firstEnd: Point2,
  secondStart: Point2,
  secondEnd: Point2,
): boolean => {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);
  const epsilon = 1e-7;

  if (
    Math.abs(firstOrientation) < epsilon ||
    Math.abs(secondOrientation) < epsilon ||
    Math.abs(thirdOrientation) < epsilon ||
    Math.abs(fourthOrientation) < epsilon
  ) {
    return false;
  }

  return (
    firstOrientation * secondOrientation < 0 &&
    thirdOrientation * fourthOrientation < 0
  );
};

export const findDeploymentIntersection = (
  geometry: StandGeometry,
  sampleCount = TOPOLOGY.deploymentSamples,
): { readonly intersects: boolean; readonly progress: number | null } => {
  for (let index = 0; index < sampleCount; index += 1) {
    const progress = index / (sampleCount - 1);
    const state = deploymentState(geometry, progress);
    const rearHitsLip = segmentsProperlyIntersect(
      state.rearFoot,
      state.ridge,
      state.frontFoot,
      state.lipTop,
    );
    const backHitsLip = segmentsProperlyIntersect(
      state.ridge,
      state.backrestToe,
      state.frontFoot,
      state.lipTop,
    );

    if (rearHitsLip || backHitsLip) {
      return { intersects: true, progress };
    }
  }

  return { intersects: false, progress: null };
};

export const maximumPanelLengthErrorMm = (geometry: StandGeometry): number => {
  const state = deploymentState(geometry, 1);
  return Math.max(
    Math.abs(
      distance2(state.ridge, state.backrestToe) -
        geometry.derived.backrestLengthMm,
    ),
    Math.abs(
      distance2(state.rearFoot, state.ridge) -
        geometry.derived.rearBraceLengthMm,
    ),
    Math.abs(
      distance2(state.frontFoot, state.rearFoot) -
        geometry.parameters.baseDepthMm,
    ),
    Math.abs(
      distance2(state.frontFoot, state.lipTop) -
        geometry.parameters.lipHeightMm,
    ),
  );
};
