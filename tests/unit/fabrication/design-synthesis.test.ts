import { describe, expect, it } from "vitest";

import { canonicalSerialize } from "@/core/canonical";
import {
  buildFabricationCandidate,
  finalizeFabricationCandidate,
} from "@/core/fabrication/candidate";
import { compileFabricationProgram } from "@/core/fabrication/compiler";
import {
  safeSynthesisErrorCode,
  synthesizeFabricationDesign,
} from "@/core/fabrication/design-synthesis";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import {
  fixtureHomepageCardBoxDesignSpec,
  fixtureSingleFoldDesignSpec,
  fixtureSliderDesignSpec,
  fixtureStaticPanelDesignSpec,
} from "../../fixtures/design-spec";
import { fixtureIntent } from "../../fixtures/fabrication";
import { productionCardBoxIntent } from "../../fixtures/production-geometric-failures";

describe("deterministic fabrication design synthesis", () => {
  it("reduces internal failures to safe terminal codes", () => {
    expect(safeSynthesisErrorCode(null)).toBe("unknown");
    expect(safeSynthesisErrorCode("provider text")).toBe("unknown");
    expect(safeSynthesisErrorCode({ code: "mapping_failure" })).toBe(
      "mapping_failure",
    );
    expect(safeSynthesisErrorCode({ kind: "compile_failure" })).toBe(
      "compile_failure",
    );
    expect(safeSynthesisErrorCode({ unrelated: true })).toBe("unknown");
  });

  it("synthesizes, compiles, and fully verifies the exact homepage card-box specification repeatably", () => {
    const intent = productionCardBoxIntent();
    const spec = fixtureHomepageCardBoxDesignSpec();
    const first = synthesizeFabricationDesign(intent, spec, 1);
    const repeated = synthesizeFabricationDesign(intent, spec, 1);

    expect(first.ok).toBe(true);
    expect(repeated.ok).toBe(true);
    if (!first.ok || !repeated.ok) return;
    expect(canonicalSerialize(first.value)).toBe(
      canonicalSerialize(repeated.value),
    );
    expect(first.diagnostics.selectedProgramHash).toBe(
      repeated.diagnostics.selectedProgramHash,
    );
    expect(first.report).toMatchObject({ valid: true, failures: [] });

    const compiled = compileFabricationProgram(intent, first.value);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(
      verifyFabricationIr(compiled.value, "v3-homepage-card-box"),
    ).toMatchObject({ valid: true, failures: [] });

    const candidate = buildFabricationCandidate({
      candidateId: "candidate-v3-homepage-card-box",
      intent,
      program: first.value,
      selectionStatus: "selected",
      provenance: {
        compilerVersion: "design-spec-v3-acceptance",
        generatedAtIso: "2026-07-21T00:00:00.000Z",
        deterministicSeed: 20_260_721,
        modelId: "gpt-5.6-sol",
        modelResponseId: "mocked-v3-response",
        modelPlanHash: first.diagnostics.specHash,
        planExpanderVersion: "3",
        parentCandidateId: null,
        appliedPatchIds: [],
        repairCycle: 0,
      },
    });
    expect(candidate.ok).toBe(true);
    if (!candidate.ok) return;
    const finalized = finalizeFabricationCandidate({
      candidate: candidate.value,
      requestedFormats: ["svg", "dxf", "glb", "json"],
    });
    expect(finalized.ok).toBe(true);
    if (!finalized.ok) return;
    expect(
      finalized.value.artifacts.map((artifact) => artifact.format),
    ).toEqual(["svg", "dxf", "glb", "json"]);
    expect(finalized.value.candidate.exportMetadata).toMatchObject({
      status: "verified",
      sourceEquivalent: true,
    });
  }, 60_000);

  it("returns a typed design_infeasible result when a required part cannot fit the sheet", () => {
    const sourceIntent = fixtureIntent();
    const intent = {
      ...sourceIntent,
      behavior: "static" as const,
      requestedSize: { widthMm: 80, heightMm: 60, depthMm: 1 },
    };
    const spec = fixtureStaticPanelDesignSpec();
    const impossible = {
      ...spec,
      parts: spec.parts.map((part) => ({
        ...part,
        width: { minimumMm: 500, preferredMm: 500, maximumMm: 500 },
      })),
    };

    expect(synthesizeFabricationDesign(intent, impossible, 1)).toMatchObject({
      ok: false,
      error: {
        kind: "design_infeasible",
        code: "part_sheet_fit",
        path: ["parts", "0"],
        evaluatedCandidateCount: 0,
      },
    });
  });

  it.each([
    [
      "intent_not_supported",
      (intent: ReturnType<typeof fixtureIntent>) => ({
        ...intent,
        scopeStatus: "unsupported" as const,
        unsupportedReason: "Outside the bounded grammar.",
      }),
      (spec: ReturnType<typeof fixtureStaticPanelDesignSpec>) => spec,
    ],
    [
      "panel_limit",
      (intent: ReturnType<typeof fixtureIntent>) => ({
        ...intent,
        fabricationBudget: { ...intent.fabricationBudget, maximumPanels: 1 },
      }),
      (spec: ReturnType<typeof fixtureStaticPanelDesignSpec>) => ({
        ...spec,
        parts: [
          ...spec.parts,
          { ...spec.parts[0]!, key: "second", label: "Second panel" },
        ],
      }),
    ],
    [
      "glue_constraint_conflict",
      (intent: ReturnType<typeof fixtureIntent>) => intent,
      (spec: ReturnType<typeof fixtureStaticPanelDesignSpec>) => ({
        ...spec,
        glueAllowed: true,
      }),
    ],
    [
      "sheet_constraint_domain",
      (intent: ReturnType<typeof fixtureIntent>) => intent,
      (spec: ReturnType<typeof fixtureStaticPanelDesignSpec>) => ({
        ...spec,
        sheetConstraints: { minimumSheets: 2, maximumSheets: 2 },
      }),
    ],
    [
      "sheet_constraint_domain",
      (intent: ReturnType<typeof fixtureIntent>) => ({
        ...intent,
        fabricationBudget: { ...intent.fabricationBudget, maximumSheets: 1 },
      }),
      (spec: ReturnType<typeof fixtureStaticPanelDesignSpec>) => ({
        ...spec,
        sheetConstraints: { minimumSheets: 1, maximumSheets: 2 },
      }),
    ],
    [
      "material_thickness",
      (intent: ReturnType<typeof fixtureIntent>) => intent,
      (spec: ReturnType<typeof fixtureStaticPanelDesignSpec>) => ({
        ...spec,
        materialConstraints: {
          ...spec.materialConstraints,
          thickness: { minimumMm: 1, preferredMm: 1, maximumMm: 1 },
        },
      }),
    ],
    [
      "material_thickness",
      (intent: ReturnType<typeof fixtureIntent>) => intent,
      (spec: ReturnType<typeof fixtureStaticPanelDesignSpec>) => ({
        ...spec,
        materialConstraints: {
          ...spec.materialConstraints,
          thickness: { minimumMm: 0.1, preferredMm: 0.1, maximumMm: 0.2 },
        },
      }),
    ],
    [
      "connected_acyclic_graph",
      (intent: ReturnType<typeof fixtureIntent>) => intent,
      (spec: ReturnType<typeof fixtureStaticPanelDesignSpec>) => ({
        ...spec,
        parts: [
          ...spec.parts,
          {
            ...spec.parts[0]!,
            key: "unconnected",
            label: "Unconnected panel",
          },
        ],
      }),
    ],
  ] as const)(
    "returns the typed preflight result %s",
    (code, mapIntent, mapSpec) => {
      const intent = mapIntent(fixtureIntent());
      const spec = mapSpec(fixtureStaticPanelDesignSpec());
      const result = synthesizeFabricationDesign(intent, spec, 1);
      expect(result).toMatchObject({ ok: false, error: { code } });
    },
  );

  it("rejects malformed intent and design-spec contracts before synthesis", () => {
    expect(synthesizeFabricationDesign(null, {}, 1)).toMatchObject({
      ok: false,
      error: { code: "intent_contract_invalid" },
    });
    expect(synthesizeFabricationDesign(fixtureIntent(), {}, 1)).toMatchObject({
      ok: false,
      error: { kind: "invalid_design_spec" },
    });
  });

  it.each([
    "support",
    "structural",
    "wall",
    "closure",
    "moving",
    "slider",
    "guide",
    "decorative",
    "driver",
    "output",
  ] as const)("supports the semantic part role %s", (role) => {
    const spec = fixtureStaticPanelDesignSpec();
    const result = synthesizeFabricationDesign(
      {
        ...fixtureIntent(),
        behavior: "static",
        requestedSize: { widthMm: 80, heightMm: 60, depthMm: 0.3 },
      },
      {
        ...spec,
        parts: spec.parts.map((part) => ({ ...part, role })),
      },
      1,
    );
    expect(result.ok).toBe(true);
  });

  it.each(["rectangle", "triangle", "trapezoid"] as const)(
    "synthesizes the generic %s outline preference",
    (shapePreference) => {
      const spec = fixtureStaticPanelDesignSpec();
      const result = synthesizeFabricationDesign(
        {
          ...fixtureIntent(),
          behavior: "static",
          requestedSize: { widthMm: 80, heightMm: 60, depthMm: 0.3 },
        },
        {
          ...spec,
          parts: spec.parts.map((part) => ({ ...part, shapePreference })),
        },
        1,
      );
      expect(result.ok).toBe(true);
    },
  );

  it.each([
    "support",
    "structural",
    "wall",
    "closure",
    "moving",
    "slider",
    "guide",
    "decorative",
    "driver",
    "output",
  ] as const)("ranks the candidate root for a %s child", (role) => {
    const spec = fixtureSingleFoldDesignSpec();
    const result = synthesizeFabricationDesign(
      fixtureIntent(),
      {
        ...spec,
        parts: spec.parts.map((part) =>
          part.key === "wing" ? { ...part, role } : part,
        ),
      },
      1,
    );
    expect(result.ok).toBe(true);
  });

  it("accepts a part that fits only after a sheet rotation", () => {
    const spec = fixtureStaticPanelDesignSpec();
    const result = synthesizeFabricationDesign(
      {
        ...fixtureIntent(),
        behavior: "static",
        requestedSize: { widthMm: 220, heightMm: 280, depthMm: 0.3 },
      },
      {
        ...spec,
        parts: spec.parts.map((part) => ({
          ...part,
          width: { minimumMm: 220, preferredMm: 220, maximumMm: 220 },
          height: { minimumMm: 280, preferredMm: 280, maximumMm: 280 },
        })),
      },
      1,
    );
    expect(result.ok ? null : result.error.code).not.toBe("part_sheet_fit");
  });

  it.each([
    ["static", fixtureStaticPanelDesignSpec],
    ["flap", fixtureSingleFoldDesignSpec],
  ] as const)(
    "synthesizes a verified %s design",
    (behavior, makeSpec) => {
      const source = fixtureIntent();
      const spec = makeSpec();
      const intent = {
        ...source,
        behavior,
        requestedSize:
          behavior === "static"
            ? { widthMm: 80, heightMm: 60, depthMm: 0.3 }
            : source.requestedSize,
      };
      const result = synthesizeFabricationDesign(intent, spec, 1);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.report).toMatchObject({ valid: true, failures: [] });
      if (behavior === "flap") {
        expect(result.report.motionSummary).toMatchObject({
          baseSampleCount: 201,
        });
      }
    },
    30_000,
  );

  it("handles a slide specification as a bounded deterministic synthesis result", () => {
    const intent = { ...fixtureIntent(), behavior: "slide" as const };
    const first = synthesizeFabricationDesign(
      intent,
      fixtureSliderDesignSpec(),
      1,
    );
    const repeated = synthesizeFabricationDesign(
      intent,
      fixtureSliderDesignSpec(),
      1,
    );

    expect(canonicalSerialize(first)).toBe(canonicalSerialize(repeated));
    if (first.ok) {
      expect(first.report).toMatchObject({ valid: true, failures: [] });
      expect(first.report.motionSummary).toMatchObject({
        baseSampleCount: 201,
      });
    } else {
      expect(first.error.kind).toMatch(
        /design_infeasible|synthesis_budget_exhausted/,
      );
    }
  }, 30_000);
});
