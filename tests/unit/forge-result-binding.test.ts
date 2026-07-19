import { describe, expect, it } from "vitest";

import {
  forgePromptHash,
  forgeResultMatchesPrompt,
  sameForgeResultBinding,
  type ForgeResultBinding,
} from "@/lib/forge-result-binding";

describe("forge result binding", () => {
  it("does not treat prompt A's successful result as prompt B's result", () => {
    const promptA = "Make a small folding display.";
    const promptB = "Make a different folding box.";
    const binding: ForgeResultBinding = {
      attemptId: "7f1343f8-9274-4dfb-8bfa-5dc551ca9cc4",
      promptHash: forgePromptHash(promptA),
    };

    expect(forgeResultMatchesPrompt(binding, `  ${promptA}  `)).toBe(true);
    expect(forgeResultMatchesPrompt(binding, promptB)).toBe(false);
    expect(
      sameForgeResultBinding(
        {
          ...binding,
          attemptId: "82f75ae2-78dd-4467-8468-56923f82651f",
        },
        binding,
      ),
    ).toBe(false);
  });
});
