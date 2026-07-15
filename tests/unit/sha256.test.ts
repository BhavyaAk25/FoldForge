import { describe, expect, it } from "vitest";

import { sha256Hex, sha256HexBytes } from "@/core/sha256";

describe("pure SHA-256", () => {
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    [
      "FoldForge",
      "3b7a8ab9caa7492676793c6ddc6d4b6f634be7a9b188c1e633db27a4bcb42b27",
    ],
  ])("hashes the standard vector %j", (input, expected) => {
    expect(sha256Hex(input)).toBe(expected);
  });

  it("hashes arbitrary bytes without string coercion", () => {
    expect(sha256HexBytes(new Uint8Array([0, 1, 2, 255]))).toBe(
      "3d1f57c984978ef98a18378c8166c1cb8ede02c03eeb6aee7e2f121dfeee3e56",
    );
  });
});
