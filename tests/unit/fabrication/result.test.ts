import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  fabricationErr,
  fabricationOk,
  mapFabricationResult,
  parseFabricationContract,
} from "@/core/fabrication/result";

describe("fabrication result helpers", () => {
  it("parses valid contracts and transforms successful values", () => {
    const parsed = parseFabricationContract(
      "FabricationIntentV1",
      z.object({ widthMm: z.number().positive() }),
      { widthMm: 42 },
    );

    expect(mapFabricationResult(parsed, ({ widthMm }) => widthMm * 2)).toEqual({
      ok: true,
      value: 84,
    });
    expect(fabricationOk("ready")).toEqual({ ok: true, value: "ready" });
  });

  it("preserves typed failures without running the transform", () => {
    const transform = vi.fn((value: never) => value);
    const failure = fabricationErr({
      kind: "unsupported_fabrication",
      reason: "outside the bounded fabrication grammar",
    });

    expect(mapFabricationResult(failure, transform)).toBe(failure);
    expect(transform).not.toHaveBeenCalled();
  });

  it("normalizes Zod issues into stable contract errors", () => {
    expect(
      parseFabricationContract(
        "FabricationProgramV1",
        z.object({ module: z.object({ count: z.number().int().positive() }) }),
        { module: { count: 0 } },
      ),
    ).toMatchObject({
      ok: false,
      error: {
        kind: "contract_validation",
        contract: "FabricationProgramV1",
        issues: [
          {
            code: "too_small",
            path: ["module", "count"],
          },
        ],
      },
    });
  });
});
