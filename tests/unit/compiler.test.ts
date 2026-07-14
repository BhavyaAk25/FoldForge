import { describe, expect, it } from "vitest";

import { DEMO_CONSTRAINT } from "@/core/constraints";
import {
  compileConstraints,
  compileProvidedConstraint,
  normalizeCompilation,
  type ConstraintCompilationModel,
} from "@/server/ai/compiler";
import type { RawConstraintCompilation } from "@/server/ai/contracts";

import {
  BASE_RAW_COMPILATION,
  COMPILER_CASES,
} from "../fixtures/compiler-cases";

describe("constraint compiler contract", () => {
  it("covers at least 25 metric, imperial, missing, contradictory, and unsupported cases", () => {
    expect(COMPILER_CASES.length).toBeGreaterThanOrEqual(25);
    for (const compilerCase of COMPILER_CASES) {
      expect(
        normalizeCompilation(compilerCase.raw).status,
        compilerCase.name,
      ).toBe(compilerCase.expectedStatus);
    }
  });

  it("normalizes mixed units deterministically", () => {
    const metric = normalizeCompilation(
      COMPILER_CASES[1]?.raw ?? BASE_RAW_COMPILATION,
    );
    const imperial = normalizeCompilation(
      COMPILER_CASES[2]?.raw ?? BASE_RAW_COMPILATION,
    );
    const mixed = normalizeCompilation(
      COMPILER_CASES[3]?.raw ?? BASE_RAW_COMPILATION,
    );
    const kilograms = normalizeCompilation(
      COMPILER_CASES[4]?.raw ?? BASE_RAW_COMPILATION,
    );

    expect(metric.status).toBe("ready");
    expect(imperial.status).toBe("ready");
    expect(mixed.status).toBe("ready");
    expect(kilograms.status).toBe("ready");
    if (
      metric.status !== "ready" ||
      imperial.status !== "ready" ||
      mixed.status !== "ready" ||
      kilograms.status !== "ready"
    ) {
      return;
    }
    expect(metric.constraint.objectWidthMm).toBeCloseTo(71.5, 6);
    expect(imperial.constraint.objectWidthMm).toBeCloseTo(71.501, 2);
    expect(mixed.constraint.objectHeightMm).toBeCloseTo(147.599, 2);
    expect(kilograms.constraint.objectMassG).toBe(172);
  });

  it("applies documented nonessential defaults without inventing device measurements", () => {
    const raw: RawConstraintCompilation = {
      ...BASE_RAW_COMPILATION,
      orientation: null,
      targetViewingAngleDeg: null,
      angleToleranceDeg: null,
      sheetWidth: { value: null, unit: null, evidence: "not provided" },
      sheetHeight: { value: null, unit: null, evidence: "not provided" },
      printableMargin: { value: null, unit: null, evidence: "not provided" },
      materialProfile: null,
      maximumActiveCreaseCount: null,
      cutsAllowed: null,
      maximumCutCount: null,
      glueAllowed: null,
      mustFoldFlat: null,
      priorities: [],
    };
    const outcome = normalizeCompilation(raw);
    expect(outcome.status).toBe("ready");
    if (outcome.status !== "ready") return;
    expect(outcome.constraint.targetViewingAngleDeg).toBe(65);
    expect(outcome.constraint.inferredDefaults.length).toBeGreaterThanOrEqual(
      8,
    );
    expect(outcome.constraint.objectWidthMm).toBe(71.5);
  });

  it("asks one compact question when essentials are missing", () => {
    const missing = COMPILER_CASES.find(
      (entry) => entry.name === "missing objectMass",
    );
    expect(missing).toBeDefined();
    if (!missing) return;
    const outcome = normalizeCompilation(missing.raw);
    expect(outcome.status).toBe("needs_clarification");
    expect(outcome.constraint).toBeNull();
    expect(outcome.clarifyingQuestion).toContain("missing device measurements");
  });

  it("accepts an injected strict model and never trusts an unparsed value", async () => {
    const model: ConstraintCompilationModel = {
      compile: async () => BASE_RAW_COMPILATION,
    };
    const outcome = await compileConstraints("phone stand", "ff_test", model);
    expect(outcome.status).toBe("ready");
  });

  it("supports a clearly code-labelled provided-constraint fallback", () => {
    expect(
      compileProvidedConstraint(DEMO_CONSTRAINT, "Provided controls"),
    ).toMatchObject({
      status: "ready",
      constraint: DEMO_CONSTRAINT,
      interpretationSummary: "Provided controls",
    });
  });
});
