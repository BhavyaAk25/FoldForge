import { describe, expect, it } from "vitest";

import { maxDuration as finalizeMaxDuration } from "@/app/api/finalize/route";
import { maxDuration as intentMaxDuration } from "@/app/api/intent/route";
import { maxDuration as programsMaxDuration } from "@/app/api/programs/route";
import { maxDuration as repairMaxDuration } from "@/app/api/repair/route";
import { OPENAI_PRODUCTION_TIMEOUT_MS } from "@/server/ai/client";

describe("live route duration", () => {
  it("leaves bounded route headroom above the OpenAI SDK timeout", () => {
    const routeDurationsSeconds = [
      intentMaxDuration,
      programsMaxDuration,
      repairMaxDuration,
      finalizeMaxDuration,
    ];

    expect(new Set(routeDurationsSeconds)).toEqual(new Set([240]));
    expect(Math.min(...routeDurationsSeconds) * 1_000).toBeGreaterThan(
      OPENAI_PRODUCTION_TIMEOUT_MS,
    );
  });
});
