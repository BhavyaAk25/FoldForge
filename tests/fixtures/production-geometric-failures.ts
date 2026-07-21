import { FABRICATION_LIMITS } from "@/core/fabrication/limits";
import type { FabricationPlanV2 } from "@/core/fabrication/semantic-plan";
import type { FabricationIntentV1 } from "@/core/fabrication/types";
import { fixtureIntent } from "./fabrication";
import { fixtureLiveAcceptancePlan } from "./semantic-plan";

export const productionCardBoxIntent = (): FabricationIntentV1 => {
  const source = fixtureIntent();
  return {
    ...source,
    sourcePrompt:
      "Make a small box from one sheet of cardstock that holds a standard deck of playing cards. The finished box should be about 70 mm wide, 95 mm tall, and 25 mm deep. Add a lid with a tab so it stays closed. Avoid glue if possible.",
    objectLabel: "playing-card box",
    behavior: "open_close",
    requestedSize: { widthMm: 70, heightMm: 95, depthMm: 25 },
    fabricationBudget: {
      ...source.fabricationBudget,
      maximumPanels: FABRICATION_LIMITS.maximumPanelCount,
      maximumJointAndConnectorCount:
        FABRICATION_LIMITS.maximumJointAndConnectorCount,
    },
    semanticConstraints: [],
    scopeStatus: "supported",
  };
};

const movingCardBoxPlan = (): FabricationPlanV2 => {
  const source = fixtureLiveAcceptancePlan();
  return {
    ...source,
    panels: source.panels.map((panel) =>
      panel.key === "left" || panel.key === "right"
        ? { ...panel, widthMm: 24 }
        : panel,
    ),
    joints: source.joints.map((joint) =>
      joint.key === "lid" && joint.kind === "fold"
        ? { ...joint, minimumAngleDeg: 0, maximumAngleDeg: 90 }
        : joint,
    ),
    driver: {
      key: "lid",
      jointKey: "lid",
      label: "Open the lid",
      control: "fold",
      minimumValue: 0,
      maximumValue: 90,
      homeValue: 90,
      direction: 1,
    },
    outputs: [
      {
        key: "lid",
        jointKey: "lid",
        bodyKey: "lid",
        label: "Lid angle",
        minimumValue: 0,
        maximumValue: 90,
        direction: 1,
      },
    ],
    designSummary:
      "A moving six-panel enclosure shaped like the sanitized production plans.",
  };
};

export const productionConnectorReachPlan = (): FabricationPlanV2 => {
  const source = movingCardBoxPlan();
  return {
    ...source,
    topologyKey: "crossNetFrontRoot",
    joints: source.joints.map((joint) =>
      joint.key === "lid" && joint.kind === "fold"
        ? {
            ...joint,
            foldDirection: "mountain",
            homeAngleDeg: -90,
            minimumAngleDeg: -90,
            maximumAngleDeg: 0,
          }
        : joint,
    ),
    driver: source.driver
      ? {
          ...source.driver,
          minimumValue: -90,
          maximumValue: 0,
          homeValue: -90,
          direction: -1,
        }
      : null,
    outputs: source.outputs.map((output) => ({
      ...output,
      minimumValue: -90,
      maximumValue: 0,
      direction: -1,
    })),
  };
};

export const productionIntermediateCollisionPlan = (): FabricationPlanV2 => {
  const source = movingCardBoxPlan();
  return {
    ...source,
    topologyKey: "tuckRearChain",
    joints: source.joints.map((joint) =>
      joint.key === "left" && joint.kind === "fold"
        ? {
            ...joint,
            parentBodyKey: "lid",
            parentAttachment: { panelKey: "lid", edgeIndex: 1 },
            childAttachment: { panelKey: "left", edgeIndex: 1 },
          }
        : joint,
    ),
  };
};
