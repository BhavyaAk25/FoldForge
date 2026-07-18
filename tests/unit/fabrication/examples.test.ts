import { describe, expect, it } from "vitest";

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
  it("labels all three examples as offline-only instead of live prompt presets", () => {
    const showcases = createOfflineFabricationShowcases();
    expect(showcases.map((showcase) => showcase.showcaseId)).toEqual([
      "faceted-duck-gift-box",
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
      expect.stringContaining("faceted duck gift box"),
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
    ).toBe(3);
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
      3,
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
    expect(new Set(signatures).size).toBe(3);
    expect(showcases[0]?.program.blueprint).toMatchObject({
      joints: [{ kind: "fold" }, { kind: "fold" }],
      connectors: [],
    });
    expect(showcases[1]?.program.blueprint).toMatchObject({
      joints: [],
      connectors: [{ kind: "tab" }, { kind: "slot" }],
    });
    expect(showcases[2]?.program.blueprint).toMatchObject({
      joints: [{ kind: "prismatic" }],
      connectors: [{ kind: "tab" }, { kind: "slot" }],
      driver: { control: "pull_tab" },
    });
    expect(
      showcases[2]?.program.blueprint.panels.find(
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

  it("offers FOLD for the fold-only duck and explains the moving flower omission", () => {
    const [duck, , flower] = createOfflineFabricationShowcases();
    if (!duck || !flower) throw new Error("Showcase fixtures are incomplete.");
    const duckIr = compileShowcase(duck);
    const flowerIr = compileShowcase(flower);
    const duckCandidateId = "candidate-faceted-duck-gift-box";
    const flowerCandidateId = "candidate-pull-tab-pop-up-flower";
    const duckReport = verifyFabricationIr(duckIr, duckCandidateId);
    const flowerReport = verifyFabricationIr(flowerIr, flowerCandidateId);

    expect(
      inspectFabricationFoldCompatibility({
        ir: duckIr,
        sourceCandidateId: duckCandidateId,
        sourceIrHash: duckReport.irHash,
      }),
    ).toMatchObject({ status: "available" });
    const duckFold = exportFabricationFold({
      ir: duckIr,
      sourceCandidateId: duckCandidateId,
      selectionStatus: "selected",
      verification: duckReport,
    });
    expect(duckFold).toMatchObject({ status: "generated" });
    if (duckFold.status !== "generated") {
      throw new Error("The fold-only duck should produce a FOLD artifact.");
    }
    const duckFoldDocument: unknown = JSON.parse(
      new TextDecoder().decode(duckFold.artifact.bytes),
    );
    expect(duckFoldDocument).not.toHaveProperty("edges_foldAngle");

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
