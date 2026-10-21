import { describe, expect, it } from "vitest";
import { foldOnlyStand } from "../../fixtures/fold-only";

import { canonicalSerialize } from "@/core/canonical";
import {
  compileFabricationProgram,
  fabricationIrHash,
} from "@/core/fabrication/compiler";
import {
  createOfflineFabricationShowcases,
  type OfflineFabricationShowcase,
} from "@/core/fabrication/examples";
import {
  exportFabricationFold,
  inspectFabricationFoldCompatibility,
} from "@/core/fabrication/export";
import {
  FabricationIntentV1Schema,
  FabricationProgramV1Schema,
} from "@/core/fabrication/schemas";
import { verifyFabricationIr } from "@/core/fabrication/verification";

const compileShowcase = (showcase: OfflineFabricationShowcase) => {
  const result = compileFabricationProgram(showcase.intent, showcase.program);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

describe("offline fabrication showcases", () => {
  it("labels both examples as offline-only instead of live prompt presets", () => {
    const showcases = createOfflineFabricationShowcases();
    expect(showcases.map((showcase) => showcase.showcaseId)).toEqual([
      "modular-cable-organizer",
      "pull-tab-pop-up-flower",
    ]);
    expect(
      showcases.every(
        (showcase) =>
          showcase.availability === "offline_showcase_only" &&
          showcase.livePromptRouting === false &&
          showcase.program.candidateLabel.startsWith("Offline showcase ·") &&
          showcase.program.designSummary.startsWith("Offline showcase only."),
      ),
    ).toBe(true);
    expect(showcases.map((showcase) => showcase.prompt)).toEqual([
      expect.stringContaining("modular cable organizer"),
      expect.stringContaining("vertical tab"),
    ]);
  });

  it("returns byte-for-byte canonical structures on every call", () => {
    const first = createOfflineFabricationShowcases();
    const second = createOfflineFabricationShowcases();
    expect(canonicalSerialize(first)).toBe(canonicalSerialize(second));
    expect(
      new Set(
        first.map((showcase) => fabricationIrHash(compileShowcase(showcase))),
      ).size,
    ).toBe(2);
  });

  it("satisfies strict contracts, compiles, and passes every hard verifier stage", () => {
    for (const showcase of createOfflineFabricationShowcases()) {
      expect(
        FabricationIntentV1Schema.safeParse(showcase.intent).success,
        `${showcase.showcaseId} intent contract`,
      ).toBe(true);
      expect(
        FabricationProgramV1Schema.safeParse(showcase.program).success,
        `${showcase.showcaseId} program contract`,
      ).toBe(true);
      const ir = compileShowcase(showcase);
      const report = verifyFabricationIr(
        ir,
        `candidate-${showcase.showcaseId}`,
      );
      expect(
        report.failures,
        `${showcase.showcaseId} verifier failures`,
      ).toEqual([]);
      expect(report.valid).toBe(true);
      expect(report.completedStage).toBe("scoring");
      expect(report.irHash).toBe(fabricationIrHash(ir));
    }
  });

  it("uses distinct normalized topology and mechanism structures", () => {
    const showcases = createOfflineFabricationShowcases();
    expect(new Set(showcases.map((item) => item.program.topologyId)).size).toBe(
      2,
    );
    const signatures = showcases.map((showcase) => {
      const blueprint = showcase.program.blueprint;
      return canonicalSerialize({
        behavior: showcase.program.behavior,
        moduleKinds: showcase.program.modules.map((module) => module.kind),
        panelCount: blueprint.panels.length,
        jointKinds: blueprint.joints.map((joint) => joint.kind),
        connectorKinds: blueprint.connectors.map((connector) => connector.kind),
      });
    });
    expect(new Set(signatures).size).toBe(2);
    expect(showcases[0]?.program.blueprint).toMatchObject({
      joints: [],
      connectors: [{ kind: "tab" }, { kind: "slot" }],
    });
    expect(showcases[1]?.program.blueprint).toMatchObject({
      joints: [{ kind: "prismatic" }],
      connectors: [{ kind: "tab" }, { kind: "slot" }],
      driver: { control: "pull_tab" },
    });
    expect(
      showcases[1]?.program.blueprint.panels.find(
        (panel) => panel.panelId === "panel-flower-crown",
      )?.contour.vertices,
    ).toHaveLength(32);
  });

  it("keeps measurable showcase requirements hard and recognition claims soft", () => {
    for (const showcase of createOfflineFabricationShowcases()) {
      for (const constraint of showcase.intent.semanticConstraints) {
        const expectedHard = constraint.kind !== "recognizable_form";
        expect(
          constraint.hard,
          `${showcase.showcaseId} ${constraint.constraintId} hardness`,
        ).toBe(expectedHard);
      }
    }
  });

  it("provides semantic parts, ordered assembly steps, and honest limitations", () => {
    for (const showcase of createOfflineFabricationShowcases()) {
      expect(showcase.program.blueprint.semanticParts.length).toBeGreaterThan(
        0,
      );
      expect(
        showcase.program.blueprint.assemblyOperations.length,
      ).toBeGreaterThan(0);
      const orders = showcase.program.blueprint.assemblyOperations.map(
        (operation) => operation.order,
      );
      expect(orders).toEqual([...orders].sort((left, right) => left - right));
      expect(showcase.limitation).toMatch(/not simulate|not model/i);
    }
  });

  it("offers FOLD for a fold-only design and explains the moving flower omission", () => {
    const [, flower] = createOfflineFabricationShowcases();
    if (!flower) throw new Error("Showcase fixtures are incomplete.");
    const stand = foldOnlyStand();
    const compiledStand = compileFabricationProgram(
      stand.intent,
      stand.program,
    );
    if (!compiledStand.ok) throw new Error(JSON.stringify(compiledStand.error));
    const standIr = compiledStand.value;
    const flowerIr = compileShowcase(flower);
    const standCandidateId = "candidate-phone-stand";
    const flowerCandidateId = "candidate-pull-tab-pop-up-flower";
    const standReport = verifyFabricationIr(standIr, standCandidateId);
    const flowerReport = verifyFabricationIr(flowerIr, flowerCandidateId);

    expect(
      inspectFabricationFoldCompatibility({
        ir: standIr,
        sourceCandidateId: standCandidateId,
        sourceIrHash: standReport.irHash,
      }),
    ).toMatchObject({ status: "available" });
    const standFold = exportFabricationFold({
      ir: standIr,
      sourceCandidateId: standCandidateId,
      selectionStatus: "selected",
      verification: standReport,
    });
    expect(standFold).toMatchObject({ status: "generated" });
    if (standFold.status !== "generated") {
      throw new Error("A fold-only design should produce a FOLD artifact.");
    }
    expect(
      JSON.parse(new TextDecoder().decode(standFold.artifact.bytes)),
    ).toHaveProperty("file_spec");

    const flowerCompatibility = inspectFabricationFoldCompatibility({
      ir: flowerIr,
      sourceCandidateId: flowerCandidateId,
      sourceIrHash: flowerReport.irHash,
    });
    expect(flowerCompatibility).toMatchObject({
      status: "omitted",
      reason: {
        code: "non_fold_joint",
        geometryIds: ["joint-flower-lift"],
      },
    });
  });
});
