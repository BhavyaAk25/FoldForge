import { describe, expect, it } from "vitest";

import {
  lengthToMm,
  massToG,
  type LengthUnit,
  type MassUnit,
} from "@/core/units";

describe("unit normalization", () => {
  it.each([
    [10, "mm", 10],
    [2.5, "cm", 25],
    [2, "in", 50.8],
  ] as const)("normalizes %s %s", (value, unit, expected) => {
    expect(lengthToMm(value, unit)).toEqual({ ok: true, value: expected });
  });

  it.each([
    [10, "g", 10],
    [0.5, "kg", 500],
    [2, "oz", 56.69904625],
    [1, "lb", 453.59237],
  ] as const)("normalizes %s %s", (value, unit, expected) => {
    expect(massToG(value, unit)).toEqual({ ok: true, value: expected });
  });

  it("rejects non-finite and non-positive values", () => {
    expect(lengthToMm(Number.NaN, "mm")).toMatchObject({
      ok: false,
      error: { code: "non_finite_value" },
    });
    expect(massToG(0, "g")).toMatchObject({
      ok: false,
      error: { code: "non_positive_value" },
    });
  });

  it("rejects unknown units at the runtime boundary", () => {
    expect(lengthToMm(1, "px" as LengthUnit)).toMatchObject({
      ok: false,
      error: { code: "unsupported_unit" },
    });
    expect(massToG(1, "stone" as MassUnit)).toMatchObject({
      ok: false,
      error: { code: "unsupported_unit" },
    });
  });
});
