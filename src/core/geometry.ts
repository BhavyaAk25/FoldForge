import { TOPOLOGY } from "./constants";
import { degreesToRadians, radiansToDegrees } from "./math";
import type { CandidateParameters } from "./schemas";
import type {
  Candidate,
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
    const backHitsBase = segmentsProperlyIntersect(
      state.ridge,
      state.backrestToe,
      state.frontFoot,
      state.rearFoot,
    );

    if (rearHitsLip || backHitsLip || backHitsBase) {
      return { intersects: true, progress };
    }
  }

  return { intersects: false, progress: null };
};

export const maximumPanelLengthErrorMm = (geometry: StandGeometry): number => {
  const expectedLengths = new Map<string, number>([
    ["panel-backrest", geometry.derived.backrestLengthMm],
    ["panel-rear-brace", geometry.derived.rearBraceLengthMm],
    ["panel-base", geometry.parameters.baseDepthMm],
    ["panel-lip", geometry.parameters.lipHeightMm],
  ]);

  return Math.max(
    ...geometry.folded.panels.map((panel) => {
      const first = panel.points[0];
      const last = panel.points[3];
      const expected = expectedLengths.get(panel.id);
      if (!first || !last || expected === undefined)
        return Number.POSITIVE_INFINITY;
      const actual = Math.hypot(
        last.xMm - first.xMm,
        last.yMm - first.yMm,
        last.zMm - first.zMm,
      );
      return Math.abs(actual - expected);
    }),
  );
};

const maximumNumberDifference = (
  actual: readonly number[],
  expected: readonly number[],
): number => {
  if (actual.length !== expected.length) return Number.POSITIVE_INFINITY;
  return Math.max(
    0,
    ...actual.map((value, index) =>
      Math.abs(value - (expected[index] ?? Number.POSITIVE_INFINITY)),
    ),
  );
};

const geometryCoordinates = (geometry: StandGeometry): readonly number[] => [
  ...Object.values(geometry.derived),
  geometry.flat.widthMm,
  geometry.flat.lengthMm,
  ...geometry.flat.outline.points.flatMap((point) => [point.xMm, point.yMm]),
  ...geometry.flat.panels.flatMap((panel) =>
    panel.points.flatMap((point) => [point.xMm, point.yMm]),
  ),
  ...geometry.flat.creases.flatMap((segment) => [
    segment.start.xMm,
    segment.start.yMm,
    segment.end.xMm,
    segment.end.yMm,
  ]),
  ...geometry.flat.slots.flatMap((segment) => [
    segment.start.xMm,
    segment.start.yMm,
    segment.end.xMm,
    segment.end.yMm,
  ]),
  ...Object.values(geometry.folded.sideProfile).flatMap((point) => [
    point.xMm,
    point.yMm,
  ]),
  ...geometry.folded.panels.flatMap((panel) =>
    panel.points.flatMap((point) => [point.xMm, point.yMm, point.zMm]),
  ),
];

const panelAreaMm2 = (panel: FoldedGeometry["panels"][number]): number => {
  const first = panel.points[0];
  const second = panel.points[1];
  const last = panel.points[3];
  if (!first || !second || !last) return 0;
  const firstEdge = {
    x: second.xMm - first.xMm,
    y: second.yMm - first.yMm,
    z: second.zMm - first.zMm,
  };
  const secondEdge = {
    x: last.xMm - first.xMm,
    y: last.yMm - first.yMm,
    z: last.zMm - first.zMm,
  };
  const cross = {
    x: firstEdge.y * secondEdge.z - firstEdge.z * secondEdge.y,
    y: firstEdge.z * secondEdge.x - firstEdge.x * secondEdge.z,
    z: firstEdge.x * secondEdge.y - firstEdge.y * secondEdge.x,
  };
  return Math.hypot(cross.x, cross.y, cross.z);
};

export interface FoldedGeometryAudit {
  readonly sourceCoordinateErrorMm: number;
  readonly panelLengthErrorMm: number;
  readonly minimumPanelAreaMm2: number;
  readonly measuredBackrestAngleDeg: number;
  readonly parametersMatch: boolean;
  readonly topologyMatch: boolean;
}

export const auditFoldedGeometry = (
  candidate: Candidate,
): FoldedGeometryAudit => {
  const expected = buildStandGeometry(candidate.parameters);
  const backrest = candidate.geometry.folded.panels.find(
    (panel) => panel.id === "panel-backrest",
  );
  const toe = backrest?.points[0];
  const ridge = backrest?.points[3];
  const measuredBackrestAngleDeg =
    toe && ridge
      ? radiansToDegrees(Math.atan2(ridge.zMm - toe.zMm, ridge.xMm - toe.xMm))
      : Number.POSITIVE_INFINITY;

  return {
    sourceCoordinateErrorMm: maximumNumberDifference(
      geometryCoordinates(candidate.geometry),
      geometryCoordinates(expected),
    ),
    panelLengthErrorMm: maximumPanelLengthErrorMm(candidate.geometry),
    minimumPanelAreaMm2: Math.min(
      ...candidate.geometry.folded.panels.map(panelAreaMm2),
    ),
    measuredBackrestAngleDeg,
    parametersMatch:
      JSON.stringify(candidate.geometry.parameters) ===
      JSON.stringify(candidate.parameters),
    topologyMatch:
      JSON.stringify({
        outline: candidate.geometry.flat.outline.id,
        panels: candidate.geometry.flat.panels.map((panel) => panel.id),
        creases: candidate.geometry.flat.creases.map((crease) => crease.id),
        slots: candidate.geometry.flat.slots.map((slot) => slot.id),
        folded: candidate.geometry.folded.panels.map((panel) => panel.id),
      }) ===
      JSON.stringify({
        outline: expected.flat.outline.id,
        panels: expected.flat.panels.map((panel) => panel.id),
        creases: expected.flat.creases.map((crease) => crease.id),
        slots: expected.flat.slots.map((slot) => slot.id),
        folded: expected.folded.panels.map((panel) => panel.id),
      }),
  };
};

export const planarPanelsHaveInteriorOverlap = (
  geometry: StandGeometry,
): boolean => {
  const bounds = geometry.flat.panels.map((panel) => ({
    id: panel.id,
    minX: Math.min(...panel.points.map((point) => point.xMm)),
    maxX: Math.max(...panel.points.map((point) => point.xMm)),
    minY: Math.min(...panel.points.map((point) => point.yMm)),
    maxY: Math.max(...panel.points.map((point) => point.yMm)),
  }));
  const epsilon = 1e-7;
  for (let firstIndex = 0; firstIndex < bounds.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < bounds.length;
      secondIndex += 1
    ) {
      const first = bounds[firstIndex];
      const second = bounds[secondIndex];
      if (!first || !second) continue;
      const overlapX =
        Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX);
      const overlapY =
        Math.min(first.maxY, second.maxY) - Math.max(first.minY, second.minY);
      if (overlapX > epsilon && overlapY > epsilon) return true;
    }
  }
  return false;
};
