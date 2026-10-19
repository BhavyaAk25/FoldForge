import { describe, expect, it } from "vitest";

import { papercraftPageSvg } from "@/core/mesh/export";
import {
  buildPapercraft,
  type PapercraftModel,
  type PapercraftSpec,
  type Shape,
} from "@/core/mesh/model";
import { verifyPapercraft } from "@/core/mesh/verify";

const part = (
  shape: Shape,
  size: [number, number, number],
): PapercraftSpec => ({
  title: "test",
  parts: [
    {
      id: "p",
      name: "Part",
      shape,
      size,
      position: [0, 0, 0],
      rotation: [10, 20, 30],
      color: "#f2c230",
    },
  ],
});

const build = (spec: PapercraftSpec): PapercraftModel => {
  const built = buildPapercraft(spec);
  if (!built.ok) throw new Error(built.error.kind);
  return built.value;
};

const DUCK: PapercraftSpec = {
  title: "Duck",
  parts: [
    {
      id: "body",
      name: "Body",
      shape: { kind: "ellipsoid" },
      size: [120, 85, 72],
      position: [0, 0, 36],
      color: "#f2c230",
    },
    {
      id: "head",
      name: "Head",
      shape: { kind: "ellipsoid" },
      size: [56, 52, 54],
      position: [42, 0, 88],
      color: "#f2c230",
    },
    {
      id: "beak",
      name: "Beak",
      shape: { kind: "taper", sides: 4, top: 0.35 },
      size: [26, 30, 26],
      position: [74, 0, 86],
      rotation: [45, 90, 0],
      color: "#f07a2b",
    },
  ],
  decals: [
    {
      part: "head",
      direction: [0.55, 0.75, 0.35],
      radiusMm: 4.5,
      color: "#1d1d1d",
    },
  ],
};

describe("3D papercraft", () => {
  it.each([
    ["a box", part({ kind: "box" }, [60, 40, 30])],
    [
      "a hexagonal prism",
      part({ kind: "taper", sides: 6, top: 1 }, [50, 50, 80]),
    ],
    ["a cone", part({ kind: "taper", sides: 8, top: 0 }, [60, 60, 70])],
    [
      "a faceted egg",
      part({ kind: "ellipsoid", segments: 10, rings: 6 }, [70, 60, 90]),
    ],
    ["a duck with a printed eye", DUCK],
  ])(
    "unfolds %s into a net that refolds exactly, every seam tabbed",
    (_, spec) => {
      const model = build(spec);
      expect(verifyPapercraft(model)).toEqual([]);
      expect(papercraftPageSvg(model, 0)).toContain("Glue each grey tab");
    },
  );

  it("prints decals where the ray from the part centre leaves the part", () => {
    const model = build(DUCK);
    expect(model.decals).toHaveLength(1);
    expect(model.pages.flat().flatMap((island) => island.decals)).toHaveLength(
      1,
    );
  });

  it.each([
    [
      "a part the sheet cannot hold",
      part({ kind: "box" }, [400, 400, 20]),
      "too_large",
    ],
    [
      "a decal on a missing part",
      {
        ...DUCK,
        decals: [
          { part: "wing", direction: [0, 1, 0], radiusMm: 3, color: "#000" },
        ],
      },
      "unknown_part",
    ],
  ] as const)("rejects %s", (_, spec, kind) => {
    const built = buildPapercraft(spec);
    expect(built.ok ? null : built.error.kind).toBe(kind);
  });

  // The checker trusts nothing the builder did: each tampering is caught.
  it.each([
    [
      "a stretched face",
      (m: PapercraftModel): PapercraftModel => ({
        ...m,
        pages: m.pages.map((page, p) =>
          page.map((island, i) =>
            p === 0 && i === 0
              ? {
                  ...island,
                  faces: island.faces.map((f, k) =>
                    k === 0
                      ? {
                          ...f,
                          points: f.points.map(([x, y], j) =>
                            j === 0 ? [x + 3, y] : [x, y],
                          ),
                        }
                      : f,
                  ),
                }
              : island,
          ),
        ),
      }),
      "refold",
    ],
    [
      "a missing glue tab",
      (m: PapercraftModel) => ({
        ...m,
        pages: m.pages.map((page) =>
          page.map((island) => ({
            ...island,
            cuts: island.cuts.map((c) => ({ ...c, tab: null })),
          })),
        ),
      }),
      "untabbed_cut",
    ],
    [
      "islands stacked on each other",
      (m: PapercraftModel) => ({
        ...m,
        pages: [m.pages.flat(), ...m.pages.flat().map(() => [])]
          .slice(0, 1)
          .map((page) => [...page, page[0]!]),
      }),
      "overlap",
    ],
    [
      "a piece off the page",
      (m: PapercraftModel) => ({ ...m, sheet: { widthMm: 20, heightMm: 20 } }),
      "off_page",
    ],
  ])("catches %s", (_, tamper, check) => {
    const failures = verifyPapercraft(tamper(build(DUCK)));
    expect(failures.map((f) => f.check)).toContain(check);
  });
});
