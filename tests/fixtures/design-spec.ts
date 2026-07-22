import type { FabricationDesignSpecV3 } from "@/core/fabrication/design-spec";

const exactMm = (value: number) => ({
  minimumMm: value,
  preferredMm: value,
  maximumMm: value,
});

const boxPart = (
  key: string,
  label: string,
  role: FabricationDesignSpecV3["parts"][number]["role"],
  widthMm: number,
  heightMm: number,
) => ({
  key,
  label,
  role,
  width: exactMm(widthMm),
  height: exactMm(heightMm),
  shapePreference: "rectangle" as const,
});

/**
 * The exact homepage request expressed without topology, roots, edge indexes,
 * fold signs, packing, transforms, or tab-and-slot geometry.
 */
export const fixtureHomepageCardBoxDesignSpec =
  (): FabricationDesignSpecV3 => ({
    version: "3",
    label: "Playing-card box",
    summary:
      "A one-sheet cardstock enclosure for a standard deck, with four walls and a hinged tab-locking lid.",
    parts: [
      boxPart("base", "Base", "support", 70, 95),
      boxPart("front", "Front wall", "wall", 70, 25),
      boxPart("back", "Back wall", "wall", 70, 25),
      {
        ...boxPart("left", "Left wall", "wall", 24, 95),
        width: { minimumMm: 24, preferredMm: 24, maximumMm: 25 },
      },
      {
        ...boxPart("right", "Right wall", "wall", 24, 95),
        width: { minimumMm: 24, preferredMm: 24, maximumMm: 25 },
      },
      boxPart("lid", "Hinged lid", "closure", 70, 95),
    ],
    relations: [
      {
        key: "front-fold",
        kind: "fold",
        partAKey: "base",
        partBKey: "front",
        angleRangeDeg: { minimum: 90, home: 90, maximum: 90 },
      },
      {
        key: "back-fold",
        kind: "fold",
        partAKey: "base",
        partBKey: "back",
        angleRangeDeg: { minimum: 90, home: 90, maximum: 90 },
      },
      {
        key: "left-fold",
        kind: "fold",
        partAKey: "base",
        partBKey: "left",
        angleRangeDeg: { minimum: 90, home: 90, maximum: 90 },
      },
      {
        key: "right-fold",
        kind: "fold",
        partAKey: "base",
        partBKey: "right",
        angleRangeDeg: { minimum: 90, home: 90, maximum: 90 },
      },
      {
        key: "lid-motion",
        kind: "open_close",
        partAKey: "back",
        partBKey: "lid",
        angleRangeDeg: { minimum: 0, home: 90, maximum: 90 },
      },
      {
        key: "lid-lock",
        kind: "lock",
        partAKey: "lid",
        partBKey: "front",
        lockStyle: "tab_slot",
      },
    ],
    materialConstraints: {
      materialLabel: "cardstock",
      thickness: exactMm(0.3),
    },
    sheetConstraints: { minimumSheets: 1, maximumSheets: 1 },
    glueAllowed: false,
    driver: {
      relationKey: "lid-motion",
      label: "Open the lid",
      control: "fold",
    },
    outputs: [
      {
        key: "lid-angle",
        relationKey: "lid-motion",
        partKey: "lid",
        label: "Lid angle",
      },
    ],
    visibleLandmarks: ["base", "front", "back", "left", "right", "lid"].map(
      (partKey) => ({
        key: `${partKey}-landmark`,
        label: partKey,
        partKeys: [partKey],
        importance: "required" as const,
      }),
    ),
    aestheticPreferences: ["simple rectangular enclosure", "centered lid lock"],
    priorities: ["mechanical_simplicity", "fabrication_efficiency"],
    tolerances: { dimensionMm: 2, clearanceMm: 0.5, angleDeg: 2 },
  });

/**
 * A natural model decomposition uses the 70 x 25 face as the floor and 95 mm
 * tall walls. It is semantically equivalent to the homepage request but was
 * not realizable before code-owned face assignment.
 */
export const fixtureNaturalCardBoxDesignSpec = (): FabricationDesignSpecV3 => {
  const source = fixtureHomepageCardBoxDesignSpec();
  const dimensionsByPart = new Map<string, readonly [number, number]>([
    ["base", [70, 25]],
    ["front", [70, 95]],
    ["back", [70, 95]],
    ["left", [25, 95]],
    ["right", [25, 95]],
    ["lid", [70, 25]],
  ]);
  return {
    ...source,
    parts: source.parts.map((part) => {
      const dimensions = dimensionsByPart.get(part.key);
      return dimensions
        ? {
            ...part,
            width: exactMm(dimensions[0]),
            height: exactMm(dimensions[1]),
          }
        : part;
    }),
  };
};

/** A compact collection of schema-valid choices observed in realistic model output. */
export const fixtureModelShapedCardBoxDesignSpec =
  (): FabricationDesignSpecV3 => {
    const source = fixtureNaturalCardBoxDesignSpec();
    return {
      ...source,
      parts: [
        ...source.parts,
        boxPart("tuck-tab", "Tuck tab", "closure", 30, 10),
      ],
      relations: [
        ...source.relations
          .filter((relation) => relation.kind !== "lock")
          .map((relation) =>
            relation.kind === "open_close"
              ? {
                  ...relation,
                  angleRangeDeg: { minimum: 0, home: 0, maximum: 120 },
                }
              : relation,
          ),
        {
          key: "tab-fold",
          kind: "fold",
          partAKey: "lid",
          partBKey: "tuck-tab",
          angleRangeDeg: { minimum: 90, home: 90, maximum: 90 },
        },
        {
          key: "lid-lock",
          kind: "lock",
          partAKey: "tuck-tab",
          partBKey: "front",
          lockStyle: "tab_slot",
        },
      ],
      visibleLandmarks: [
        ...source.visibleLandmarks,
        {
          key: "tuck-tab-landmark",
          label: "Tuck tab",
          partKeys: ["tuck-tab"],
          importance: "preferred",
        },
      ],
      tolerances: { ...source.tolerances, clearanceMm: 2 },
    };
  };

export const fixtureStaticPanelDesignSpec = (): FabricationDesignSpecV3 => ({
  version: "3",
  label: "Static display panel",
  summary: "One rectangular display panel cut from a single sheet.",
  parts: [boxPart("panel", "Display panel", "structural", 80, 60)],
  relations: [],
  materialConstraints: {
    materialLabel: "cardstock",
    thickness: exactMm(0.3),
  },
  sheetConstraints: { minimumSheets: 1, maximumSheets: 1 },
  glueAllowed: false,
  driver: null,
  outputs: [],
  visibleLandmarks: [
    {
      key: "panel-landmark",
      label: "Display panel",
      partKeys: ["panel"],
      importance: "required",
    },
  ],
  aestheticPreferences: ["clean rectangular outline"],
  priorities: ["fabrication_efficiency"],
  tolerances: { dimensionMm: 1, clearanceMm: 0.5, angleDeg: 2 },
});

export const fixtureSingleFoldDesignSpec = (): FabricationDesignSpecV3 => ({
  version: "3",
  label: "Opening wing",
  summary: "A rectangular wing folds open from a supporting base.",
  parts: [
    boxPart("base", "Base", "support", 80, 60),
    boxPart("wing", "Opening wing", "moving", 30, 60),
  ],
  relations: [
    {
      key: "wing-fold",
      kind: "fold",
      partAKey: "base",
      partBKey: "wing",
      angleRangeDeg: { minimum: 0, home: 0, maximum: 90 },
    },
  ],
  materialConstraints: {
    materialLabel: "cardstock",
    thickness: exactMm(0.3),
  },
  sheetConstraints: { minimumSheets: 1, maximumSheets: 1 },
  glueAllowed: false,
  driver: {
    relationKey: "wing-fold",
    label: "Open the wing",
    control: "fold",
  },
  outputs: [
    {
      key: "wing-angle",
      relationKey: "wing-fold",
      partKey: "wing",
      label: "Wing angle",
    },
  ],
  visibleLandmarks: [
    {
      key: "base-landmark",
      label: "Base",
      partKeys: ["base"],
      importance: "required",
    },
    {
      key: "wing-landmark",
      label: "Wing",
      partKeys: ["wing"],
      importance: "required",
    },
  ],
  aestheticPreferences: ["simple two-panel fold"],
  priorities: ["mechanical_simplicity", "motion_range"],
  tolerances: { dimensionMm: 1, clearanceMm: 0.5, angleDeg: 2 },
});

export const fixtureSliderDesignSpec = (): FabricationDesignSpecV3 => ({
  version: "3",
  label: "Guided slider",
  summary: "A rectangular slider travels through a code-synthesized guide.",
  parts: [
    boxPart("base", "Guide base", "support", 60, 40),
    boxPart("slider", "Moving slider", "slider", 60, 40),
  ],
  relations: [
    {
      key: "slide-motion",
      kind: "slide",
      partAKey: "base",
      partBKey: "slider",
      travelRangeMm: { minimum: 0, home: 0, maximum: 20 },
    },
    {
      key: "slide-guide",
      kind: "lock",
      partAKey: "slider",
      partBKey: "base",
      lockStyle: "tab_slot",
    },
  ],
  materialConstraints: {
    materialLabel: "cardstock",
    thickness: exactMm(0.3),
  },
  sheetConstraints: { minimumSheets: 1, maximumSheets: 1 },
  glueAllowed: false,
  driver: {
    relationKey: "slide-motion",
    label: "Pull slider",
    control: "pull_tab",
  },
  outputs: [
    {
      key: "slider-travel",
      relationKey: "slide-motion",
      partKey: "slider",
      label: "Slider travel",
    },
  ],
  visibleLandmarks: [
    {
      key: "slider-landmark",
      label: "Slider",
      partKeys: ["slider"],
      importance: "required",
    },
  ],
  aestheticPreferences: ["straight guided motion"],
  priorities: ["mechanical_simplicity", "motion_range"],
  tolerances: { dimensionMm: 1, clearanceMm: 0.5, angleDeg: 2 },
});
