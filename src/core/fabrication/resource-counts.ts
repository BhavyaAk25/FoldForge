import type { FabricationPlanV2 } from "./semantic-plan";
import type { FabricationProgramV1 } from "./types";

export interface SemanticPlanResourceCounts {
  readonly panelCount: number;
  readonly jointCount: number;
  readonly connectorRelationshipCount: number;
  readonly expandedConnectorCount: number;
  readonly mechanismFeatureCount: number;
}

export interface FabricationProgramResourceCounts {
  readonly panelCount: number;
  readonly jointCount: number;
  readonly connectorCount: number;
  readonly mechanismFeatureCount: number;
}

const combinedMechanismFeatureCount = (
  jointCount: number,
  connectorCount: number,
): number => jointCount + connectorCount;

export const semanticPlanResourceCounts = (
  plan: FabricationPlanV2,
): SemanticPlanResourceCounts => {
  const jointCount = plan.joints.length;
  const connectorRelationshipCount = plan.connectorRelationships.length;
  const expandedConnectorCount = connectorRelationshipCount * 2;
  return {
    panelCount: plan.panels.length,
    jointCount,
    connectorRelationshipCount,
    expandedConnectorCount,
    mechanismFeatureCount: combinedMechanismFeatureCount(
      jointCount,
      expandedConnectorCount,
    ),
  };
};

export const fabricationProgramResourceCounts = (
  program: FabricationProgramV1,
): FabricationProgramResourceCounts => {
  const jointCount = program.blueprint.joints.length;
  const connectorCount = program.blueprint.connectors.length;
  return {
    panelCount: program.blueprint.panels.length,
    jointCount,
    connectorCount,
    mechanismFeatureCount: combinedMechanismFeatureCount(
      jointCount,
      connectorCount,
    ),
  };
};
