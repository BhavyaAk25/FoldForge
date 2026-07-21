import { canonicalSerialize } from "../canonical";
import { sha256Hex } from "../sha256";
import type { FabricationPlanV2 } from "./semantic-plan";

const referenceIndex = (
  indexes: ReadonlyMap<string, number>,
  key: string,
): number => indexes.get(key) ?? -1;

/**
 * Identifies verification-relevant V2 structure independently of model labels
 * and semantic key spelling. Dimensions remain part of the fingerprint because
 * equal graphs with different panel geometry are not equivalent candidates.
 */
export const semanticPlanStructureFingerprint = (
  plan: FabricationPlanV2,
): string => {
  const panelIndex = new Map(
    plan.panels.map((panel, index) => [panel.key, index]),
  );
  const bodyIndex = new Map(
    plan.bodies.map((body, index) => [body.key, index]),
  );
  const jointIndex = new Map(
    plan.joints.map((joint, index) => [joint.key, index]),
  );
  const relationshipIndex = new Map(
    plan.connectorRelationships.map((relationship, index) => [
      relationship.key,
      index,
    ]),
  );
  const driverIndex = new Map(
    plan.driver ? [[plan.driver.key, 0] as const] : [],
  );

  return sha256Hex(
    canonicalSerialize({
      panels: plan.panels.map((panel) => ({
        sheetIndex: panel.sheetIndex,
        body: referenceIndex(bodyIndex, panel.bodyKey),
        role: panel.role,
        widthMm: panel.widthMm,
        heightMm: panel.heightMm,
        outline: panel.outline,
        innerCutContours: panel.innerCutContours,
      })),
      bodies: plan.bodies.map((body) => ({
        panels: body.panelKeys.map((key) => referenceIndex(panelIndex, key)),
        grounded: body.grounded,
      })),
      joints: plan.joints.map((joint) => ({
        kind: joint.kind,
        parent: referenceIndex(bodyIndex, joint.parentBodyKey),
        child: referenceIndex(bodyIndex, joint.childBodyKey),
        parentAttachment: {
          panel: referenceIndex(panelIndex, joint.parentAttachment.panelKey),
          edgeIndex: joint.parentAttachment.edgeIndex,
        },
        childAttachment: {
          panel: referenceIndex(panelIndex, joint.childAttachment.panelKey),
          edgeIndex: joint.childAttachment.edgeIndex,
        },
        motion:
          joint.kind === "prismatic"
            ? {
                travelDirection: joint.travelDirection,
                home: joint.homeTravelMm,
                minimum: joint.minimumTravelMm,
                maximum: joint.maximumTravelMm,
                relationships: joint.guideRelationshipKeys.map((key) =>
                  referenceIndex(relationshipIndex, key),
                ),
              }
            : {
                home: joint.homeAngleDeg,
                minimum: joint.minimumAngleDeg,
                maximum: joint.maximumAngleDeg,
                foldDirection:
                  joint.kind === "fold" ? joint.foldDirection : null,
                relationships:
                  joint.kind === "revolute"
                    ? joint.connectorRelationshipKeys.map((key) =>
                        referenceIndex(relationshipIndex, key),
                      )
                    : [],
              },
      })),
      connectors: plan.connectorRelationships.map((relationship) => ({
        tabPanel: referenceIndex(
          panelIndex,
          relationship.tabAttachment.panelKey,
        ),
        tabEdgeIndex: relationship.tabAttachment.edgeIndex,
        slotPanel: referenceIndex(
          panelIndex,
          relationship.slotAttachment.panelKey,
        ),
        slotEdgeIndex: relationship.slotAttachment.edgeIndex,
        spanMm: relationship.spanMm,
        tabDepthMm: relationship.tabDepthMm,
        slotInsetMm: relationship.slotInsetMm,
        clearanceMm: relationship.clearanceMm,
      })),
      driver: plan.driver
        ? {
            joint: referenceIndex(jointIndex, plan.driver.jointKey),
            control: plan.driver.control,
            minimum: plan.driver.minimumValue,
            maximum: plan.driver.maximumValue,
            home: plan.driver.homeValue,
            direction: plan.driver.direction,
          }
        : null,
      outputs: plan.outputs.map((output) => ({
        joint: referenceIndex(jointIndex, output.jointKey),
        body: referenceIndex(bodyIndex, output.bodyKey),
        minimum: output.minimumValue,
        maximum: output.maximumValue,
        direction: output.direction,
      })),
      couplings: plan.couplings.map((coupling) => {
        switch (coupling.kind) {
          case "direct_ratio":
            return {
              kind: coupling.kind,
              input: referenceIndex(jointIndex, coupling.inputJointKey),
              outputs: coupling.outputJointKeys.map((key) =>
                referenceIndex(jointIndex, key),
              ),
              ratio: coupling.ratio,
              offset: coupling.offset,
              offsetUnit: coupling.offsetUnit,
            };
          case "mirrored_pair":
            return {
              kind: coupling.kind,
              input: referenceIndex(jointIndex, coupling.inputJointKey),
              left: referenceIndex(jointIndex, coupling.leftOutputJointKey),
              right: referenceIndex(jointIndex, coupling.rightOutputJointKey),
              ratio: coupling.ratio,
              phaseOffsetDeg: coupling.phaseOffsetDeg,
            };
          case "pull_tab":
            return {
              kind: coupling.kind,
              driver: referenceIndex(driverIndex, coupling.driverKey),
              slider: referenceIndex(jointIndex, coupling.sliderJointKey),
              outputs: coupling.outputJointKeys.map((key) =>
                referenceIndex(jointIndex, key),
              ),
              ratio: coupling.ratio,
            };
          case "cam_slot":
            return {
              kind: coupling.kind,
              driver: referenceIndex(driverIndex, coupling.driverKey),
              relationship: referenceIndex(
                relationshipIndex,
                coupling.connectorRelationshipKey,
              ),
              output: referenceIndex(jointIndex, coupling.outputJointKey),
              branch: coupling.branch,
              phaseOffsetMm: coupling.phaseOffsetMm,
            };
        }
      }),
      assemblyStrategy: plan.assemblyStrategy,
    }),
  );
};
