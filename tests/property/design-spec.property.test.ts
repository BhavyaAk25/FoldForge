import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { canonicalSerialize } from "@/core/canonical";
import {
  FabricationDesignSpecV3Schema,
  type FabricationDesignSpecV3,
} from "@/core/fabrication/design-spec";
import { synthesizeFabricationDesign } from "@/core/fabrication/design-synthesis";
import { fixtureIntent } from "../fixtures/fabrication";

const runs = Number(process.env.FC_NUM_RUNS ?? 100);
const seed = Number(process.env.FC_SEED ?? 20_260_714);
const PROPERTY_TIMEOUT_MS = 60_000;

const exactMm = (value: number) => ({
  minimumMm: value,
  preferredMm: value,
  maximumMm: value,
});

const staticSpec = (
  widthMm: number,
  heightMm: number,
): FabricationDesignSpecV3 => ({
  version: "3",
  label: "Generated panel",
  summary: "One bounded rectangular panel.",
  parts: [
    {
      key: "panel",
      label: "Panel",
      role: "structural",
      width: exactMm(widthMm),
      height: exactMm(heightMm),
      shapePreference: "rectangle",
    },
  ],
  relations: [],
  materialConstraints: {
    materialLabel: "cardstock",
    thickness: exactMm(0.3),
  },
  sheetConstraints: { minimumSheets: 1, maximumSheets: 1 },
  glueAllowed: false,
  driver: null,
  outputs: [],
  visibleLandmarks: [],
  aestheticPreferences: [],
  priorities: ["fabrication_efficiency"],
  tolerances: { dimensionMm: 1, clearanceMm: 0.5, angleDeg: 2 },
});

describe("FabricationDesignSpecV3 properties", () => {
  it(
    "synthesizes randomized in-sheet dimensions repeatably",
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 20, max: 160 }),
          fc.integer({ min: 20, max: 160 }),
          (widthMm, heightMm) => {
            const spec = staticSpec(widthMm, heightMm);
            expect(FabricationDesignSpecV3Schema.safeParse(spec).success).toBe(
              true,
            );
            const intent = {
              ...fixtureIntent(),
              behavior: "static" as const,
              requestedSize: { widthMm, heightMm, depthMm: 0.3 },
            };
            const first = synthesizeFabricationDesign(intent, spec, 1);
            const repeated = synthesizeFabricationDesign(intent, spec, 1);
            expect(first.ok).toBe(true);
            expect(canonicalSerialize(first)).toBe(
              canonicalSerialize(repeated),
            );
          },
        ),
        { numRuns: runs, seed: seed + 31 },
      );
    },
    PROPERTY_TIMEOUT_MS,
  );
});
