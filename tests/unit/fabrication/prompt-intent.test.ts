import { describe, expect, it } from "vitest";

import {
  intentFromPromptKeywords,
  parsePromptSizeMm,
  promptTemplateClass,
} from "@/core/fabrication/prompt-intent";
import { FabricationIntentV1Schema } from "@/core/fabrication/schemas";

describe("promptTemplateClass", () => {
  it.each([
    ["a small box for playing cards", "enclosure"],
    ["desk organizer with a lid", "enclosure"],
    ["birthday card with a pop-up flower", "pop_up_card"],
    ["a pop-up card box", "pop_up_card"],
    ["a faceted paper swan", "figure"],
    ["a walking robot", null],
  ])("classifies %j as %s", (prompt, expected) => {
    expect(promptTemplateClass(prompt)).toBe(expected);
  });
});

describe("parsePromptSizeMm", () => {
  it("reads W x H x D in millimetres", () => {
    expect(parsePromptSizeMm("a box 120 x 80 x 40 mm")).toEqual({
      widthMm: 120,
      heightMm: 80,
      depthMm: 40,
    });
  });

  it("applies the trailing unit to unitless numbers", () => {
    expect(parsePromptSizeMm("holder 8×6×4 cm")).toEqual({
      widthMm: 80,
      heightMm: 60,
      depthMm: 40,
    });
  });

  it("reads per-axis phrases", () => {
    expect(
      parsePromptSizeMm("about 70 mm wide, 95 mm tall, and 25 mm deep"),
    ).toEqual({ widthMm: 70, heightMm: 95, depthMm: 25 });
  });

  it("reads A-series card formats", () => {
    expect(parsePromptSizeMm("fits an A6 envelope")).toEqual({
      widthMm: 105,
      heightMm: 148,
      depthMm: null,
    });
  });

  it("clamps implausible sizes and returns null without a size", () => {
    expect(parsePromptSizeMm("box 2 x 9000 x 40 mm")).toEqual({
      widthMm: 10,
      heightMm: 400,
      depthMm: 40,
    });
    expect(parsePromptSizeMm("a nice box")).toBeNull();
  });
});

describe("intentFromPromptKeywords", () => {
  it("builds a schema-valid intent with the parsed size", () => {
    const intent = intentFromPromptKeywords("a box 120 x 80 x 40 mm");
    expect(intent).not.toBeNull();
    expect(FabricationIntentV1Schema.safeParse(intent).success).toBe(true);
    expect(intent?.requestedSize).toEqual({
      widthMm: 120,
      heightMm: 80,
      depthMm: 40,
    });
    expect(intent?.behavior).toBe("open_close");
  });

  it("is deterministic for the same prompt", () => {
    expect(intentFromPromptKeywords("a swan")).toEqual(
      intentFromPromptKeywords("a swan"),
    );
  });

  it("returns null for objects without a template", () => {
    expect(intentFromPromptKeywords("a walking robot")).toBeNull();
  });
});
