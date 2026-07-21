import { describe, expect, it } from "vitest";

import { semanticPlanStructureFingerprint } from "@/core/fabrication/semantic-plan-fingerprint";
import type { FabricationPlanV2 } from "@/core/fabrication/semantic-plan";
import {
  fixtureLiveAcceptancePlan,
  fixtureSemanticPlan,
} from "../../fixtures/semantic-plan";

describe("semantic plan structure fingerprint", () => {
  it("ignores topology labels and semantic key spelling", () => {
    const plan = fixtureLiveAcceptancePlan();
    const originalPanelKey = plan.panels[0]!.key;
    const renamedPanelKey = "renamed-panel-key";
    const renameAttachment = <Attachment extends { readonly panelKey: string }>(
      attachment: Attachment,
    ): Attachment => ({
      ...attachment,
      panelKey:
        attachment.panelKey === originalPanelKey
          ? renamedPanelKey
          : attachment.panelKey,
    });
    const renamed = {
      ...plan,
      topologyKey: "a-different-model-label",
      panels: plan.panels.map((panel) =>
        panel.key === originalPanelKey
          ? { ...panel, key: renamedPanelKey }
          : panel,
      ),
      bodies: plan.bodies.map((body) => ({
        ...body,
        panelKeys: body.panelKeys.map((panelKey) =>
          panelKey === originalPanelKey ? renamedPanelKey : panelKey,
        ),
      })),
      joints: plan.joints.map((joint) => ({
        ...joint,
        parentAttachment: renameAttachment(joint.parentAttachment),
        childAttachment: renameAttachment(joint.childAttachment),
      })),
      connectorRelationships: plan.connectorRelationships.map(
        (relationship) => ({
          ...relationship,
          tabAttachment: renameAttachment(relationship.tabAttachment),
          slotAttachment: renameAttachment(relationship.slotAttachment),
        }),
      ),
    };

    expect(semanticPlanStructureFingerprint(renamed)).toBe(
      semanticPlanStructureFingerprint(plan),
    );
  });

  it("changes when verification-relevant geometry changes", () => {
    const plan = fixtureLiveAcceptancePlan();
    const resized = {
      ...plan,
      panels: plan.panels.map((panel, index) =>
        index === 0 ? { ...panel, widthMm: panel.widthMm + 1 } : panel,
      ),
    };

    expect(semanticPlanStructureFingerprint(resized)).not.toBe(
      semanticPlanStructureFingerprint(plan),
    );
    expect(
      semanticPlanStructureFingerprint({
        ...plan,
        panels: plan.panels.map((panel, index) =>
          index === 0 ? { ...panel, bodyKey: "missing-body" } : panel,
        ),
      }),
    ).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("fingerprints moving plans with drivers, outputs, and couplings", () => {
    expect(semanticPlanStructureFingerprint(fixtureSemanticPlan())).toMatch(
      /^[a-f0-9]{64}$/u,
    );
  });

  it("canonicalizes every joint and coupling grammar branch", () => {
    const source = fixtureSemanticPlan();
    const sourceJoint = source.joints[0]!;
    const connectorRelationship = {
      key: "guide",
      tabAttachment: { panelKey: "wing", edgeIndex: 0 },
      slotAttachment: { panelKey: "base", edgeIndex: 2 },
      spanMm: 12,
      tabDepthMm: 5,
      slotInsetMm: 2,
      clearanceMm: 0.6,
    };
    const prismaticPlan: FabricationPlanV2 = {
      ...source,
      joints: [
        {
          key: sourceJoint.key,
          kind: "prismatic",
          parentBodyKey: sourceJoint.parentBodyKey,
          childBodyKey: sourceJoint.childBodyKey,
          parentAttachment: sourceJoint.parentAttachment,
          childAttachment: sourceJoint.childAttachment,
          travelDirection: "edge_tangent",
          guideRelationshipKeys: [connectorRelationship.key],
          homeTravelMm: 0,
          minimumTravelMm: 0,
          maximumTravelMm: 20,
        },
      ],
      connectorRelationships: [connectorRelationship],
      couplings: [
        {
          key: "mirrored",
          kind: "mirrored_pair",
          inputJointKey: "wing",
          leftOutputJointKey: "wing",
          rightOutputJointKey: "wing",
          ratio: 1,
          phaseOffsetDeg: 0,
        },
        {
          key: "pull",
          kind: "pull_tab",
          driverKey: "wing",
          sliderJointKey: "wing",
          outputJointKeys: ["wing"],
          ratio: 1,
        },
        {
          key: "cam",
          kind: "cam_slot",
          driverKey: "wing",
          connectorRelationshipKey: "guide",
          outputJointKey: "wing",
          branch: "positive",
          phaseOffsetMm: 0,
        },
      ],
    };
    const revolutePlan: FabricationPlanV2 = {
      ...source,
      joints: [
        {
          key: sourceJoint.key,
          kind: "revolute",
          parentBodyKey: sourceJoint.parentBodyKey,
          childBodyKey: sourceJoint.childBodyKey,
          parentAttachment: sourceJoint.parentAttachment,
          childAttachment: sourceJoint.childAttachment,
          homeAngleDeg: 0,
          minimumAngleDeg: 0,
          maximumAngleDeg: 90,
          connectorRelationshipKeys: [connectorRelationship.key],
        },
      ],
      connectorRelationships: [connectorRelationship],
    };

    expect(semanticPlanStructureFingerprint(prismaticPlan)).toMatch(
      /^[a-f0-9]{64}$/u,
    );
    expect(semanticPlanStructureFingerprint(revolutePlan)).toMatch(
      /^[a-f0-9]{64}$/u,
    );
  });
});
