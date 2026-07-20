import { describe, expect, it } from "vitest";

import { maxDuration as finalizeMaxDuration } from "@/app/api/finalize/route";
import { maxDuration as intentMaxDuration } from "@/app/api/intent/route";
import { maxDuration as programsMaxDuration } from "@/app/api/programs/route";
import { maxDuration as repairMaxDuration } from "@/app/api/repair/route";
import { FABRICATION_PROGRAM_BACKGROUND_MAX_WAIT_MS } from "@/server/fabrication-ai/models";

describe("live route duration", () => {
  it("leaves bounded route headroom above the complete background poll budget", () => {
    const routeDurationsSeconds = [
      intentMaxDuration,
      programsMaxDuration,
      repairMaxDuration,
      finalizeMaxDuration,
    ];

    expect(new Set(routeDurationsSeconds)).toEqual(new Set([240]));
    expect(Math.min(...routeDurationsSeconds) * 1_000).toBeGreaterThan(
      FABRICATION_PROGRAM_BACKGROUND_MAX_WAIT_MS,
    );
    expect(FABRICATION_PROGRAM_BACKGROUND_MAX_WAIT_MS).toBe(210_000);
  });
});
