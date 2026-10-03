import { describe, expect, it } from "vitest";

import { programStructureFingerprint } from "@/core/fabrication/program-fingerprint";

import { fixtureProgram } from "../../fixtures/fabrication";

describe("programStructureFingerprint", () => {
  it("is stable for the same program and ignores labels", () => {
    const program = fixtureProgram();
    expect(programStructureFingerprint(program)).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      programStructureFingerprint({
        ...program,
        candidateLabel: "A renamed candidate",
        designSummary: "Different words, same structure.",
      }),
    ).toBe(programStructureFingerprint(program));
  });

  it("changes when the motion structure changes", () => {
    const program = fixtureProgram();
    expect(program.blueprint.driver).not.toBeNull();
    const staticProgram = {
      ...program,
      behavior: "static" as const,
      blueprint: {
        ...program.blueprint,
        driver: null,
        outputs: [],
        couplings: [],
      },
    };
    expect(programStructureFingerprint(staticProgram)).not.toBe(
      programStructureFingerprint(program),
    );
  });
});
