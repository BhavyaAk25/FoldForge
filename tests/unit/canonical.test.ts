import { describe, expect, it } from "vitest";

import { canonicalSerialize, stableHash } from "@/core/canonical";

describe("canonical serialization", () => {
  it("sorts object keys recursively and rounds floating noise", () => {
    const first = {
      z: 2,
      a: { y: 1.00000000001, x: [3, { b: true, a: null }] },
    };
    const second = { a: { x: [3, { a: null, b: true }], y: 1 }, z: 2 };

    expect(canonicalSerialize(first)).toBe(canonicalSerialize(second));
    expect(stableHash(first)).toBe(stableHash(second));
  });

  it("normalizes unsupported non-finite JSON numbers to null", () => {
    expect(
      canonicalSerialize({ high: Number.POSITIVE_INFINITY, low: Number.NaN }),
    ).toBe('{"high":null,"low":null}');
  });

  it("returns a stable eight-character hash", () => {
    expect(stableHash("FoldForge")).toMatch(/^[0-9a-f]{8}$/);
    expect(stableHash("FoldForge")).not.toBe(stableHash("foldforge"));
  });
});
