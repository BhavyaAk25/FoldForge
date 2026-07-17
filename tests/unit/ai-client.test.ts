import { describe, expect, it } from "vitest";

import {
  OPENAI_PAID_EVALUATION_TIMEOUT_MS,
  OPENAI_PRODUCTION_TIMEOUT_MS,
} from "@/server/ai/client";

describe("OpenAI client timeout boundaries", () => {
  it("keeps public requests bounded while allowing complex paid eval output", () => {
    expect(OPENAI_PRODUCTION_TIMEOUT_MS).toBe(180_000);
    expect(OPENAI_PAID_EVALUATION_TIMEOUT_MS).toBe(180_000);
  });
});
