import { canonicalSerialize } from "@/core/canonical";
import { fabricationProgramHash } from "@/core/fabrication/compiler";
import { normalizeFabricationIntentFeasibility } from "@/core/fabrication/feasibility-normalization";
import { normalizeFabricationIntentBudget } from "@/core/fabrication/intent-budget";
import {
  FabricationIntentV1Schema,
  ProgramPatchV1Schema,
} from "@/core/fabrication/schemas";
import type {
  CandidateV2,
  FabricationIntentV1,
  FabricationProgramV1,
  GeometryRefKind,
  ProgramPatchV1,
  VerificationReportV2,
} from "@/core/fabrication/types";

import {
  FabricationDesignSpecProposalV3Schema,
  FabricationNarrativeV1Schema,
  type FabricationNarrativeV1,
  type ProgramProposalV1,
} from "./contracts";
import { generateStructured } from "./llm";
import { programProposalFromDesignSpec } from "./plan-response";
import {
  FABRICATION_INTENT_PROMPT,
  FABRICATION_NARRATIVE_PROMPT,
  FABRICATION_PROGRAM_PROMPT,
  FABRICATION_REPAIR_PROMPT,
} from "./prompts";

export interface FabricationIntentModel {
  compileIntent(prompt: string): Promise<FabricationIntentV1>;
}

export interface FabricationProgramModel {
  generateProgram(
    intent: FabricationIntentV1,
    candidateOrdinal: number,
    usedTopologyIds: readonly string[],
  ): Promise<ProgramProposalV1>;
}

export interface FabricationRepairModel {
  diagnoseRepair(
    program: FabricationProgramV1,
    report: VerificationReportV2,
    repairCycle: number,
  ): Promise<ProgramPatchV1>;
}

export interface FabricationNarrativeModel {
  generateNarrative(candidate: CandidateV2): Promise<FabricationNarrativeV1>;
}

type SemanticReferenceKind =
  | "panel"
  | "body"
  | "joint"
  | "connector_relationship"
  | "driver"
  | "output"
  | "landmark";

interface SemanticReferenceKey {
  readonly canonicalId: string;
  readonly semanticKind: SemanticReferenceKind;
  readonly semanticKey: string;
  readonly connectorMember: "tab" | "slot" | null;
}

const referenceKeyConvention = (
  kind: GeometryRefKind,
): {
  readonly prefix: string;
  readonly semanticKind: SemanticReferenceKind;
} | null => {
  switch (kind) {
    case "panel":
    case "body":
    case "joint":
    case "driver":
    case "output":
      return { prefix: `${kind}-`, semanticKind: kind };
    case "semantic_part":
      return { prefix: "part-", semanticKind: "landmark" };
    case "sheet":
    case "path":
    case "connector":
    case "semantic_constraint":
    case "export":
      return null;
  }
};

const removeRepeatedPrefix = (identifier: string, prefix: string): string => {
  let result = identifier;
  while (result.startsWith(prefix) && result.length > prefix.length) {
    result = result.slice(prefix.length);
  }
  return result;
};

const canonicalSemanticPartId = (identifier: string): string => {
  if (identifier.startsWith("connector-")) {
    const connectorKey = removeRepeatedPrefix(identifier, "connector-").replace(
      /-(?:tab|slot)$/u,
      "",
    );
    return `part-connector-${connectorKey}`;
  }
  for (const prefix of ["panel-", "body-", "joint-", "driver-", "output-"]) {
    if (identifier.startsWith(prefix)) {
      return `part-${removeRepeatedPrefix(identifier, prefix)}`;
    }
  }
  return `part-${removeRepeatedPrefix(identifier, "part-")}`;
};

const canonicalPartTokens = (semanticPartIds: readonly string[]): Set<string> =>
  new Set(
    semanticPartIds.flatMap((id) =>
      id
        .replace(/^part-(?:connector-)?/u, "")
        .toLowerCase()
        .split(/[^a-z0-9]+/u)
        .filter((token) => token.length > 1),
    ),
  );

const namedLandmarksForParts = (
  landmarks: readonly string[],
  semanticPartIds: readonly string[],
): readonly string[] => {
  const partTokens = canonicalPartTokens(semanticPartIds);
  const named = landmarks.filter((landmark) =>
    landmark
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .some((token) => partTokens.has(token)),
  );
  return named.length > 0
    ? named
    : semanticPartIds.map((id) =>
        id.replace(/^part-(?:connector-)?/u, "").replaceAll("-", " "),
      );
};

const duplicatesRequestedEnvelope = (
  intent: FabricationIntentV1,
  constraint: Extract<
    FabricationIntentV1["semanticConstraints"][number],
    { readonly kind: "dimension" }
  >,
): boolean => {
  const requestedMm =
    constraint.dimension === "width"
      ? intent.requestedSize.widthMm
      : constraint.dimension === "height"
        ? intent.requestedSize.heightMm
        : constraint.dimension === "depth"
          ? intent.requestedSize.depthMm
          : null;
  if (requestedMm === null || constraint.targetMm !== requestedMm) return false;
  return (
    (constraint.minimumMm === null || constraint.minimumMm === requestedMm) &&
    (constraint.maximumMm === null || constraint.maximumMm === requestedMm)
  );
};

const normalizeIntentSemanticPartIds = (
  intent: FabricationIntentV1,
): FabricationIntentV1 => ({
  ...intent,
  semanticConstraints: intent.semanticConstraints
    .filter(
      (constraint) =>
        constraint.kind !== "dimension" ||
        !duplicatesRequestedEnvelope(intent, constraint),
    )
    .map((constraint) => {
      if (constraint.kind !== "recognizable_form") return constraint;
      const semanticPartIds = [
        ...new Set(constraint.semanticPartIds.map(canonicalSemanticPartId)),
      ];
      return {
        ...constraint,
        semanticPartIds,
        requiredLandmarks: namedLandmarksForParts(
          constraint.requiredLandmarks,
          semanticPartIds,
        ),
      };
    }),
});

const semanticReferenceKey = (
  kind: GeometryRefKind,
  canonicalId: string,
): SemanticReferenceKey | null => {
  if (kind === "connector") {
    const withoutPrefix = removeRepeatedPrefix(canonicalId, "connector-");
    const connectorMember = withoutPrefix.endsWith("-tab")
      ? "tab"
      : withoutPrefix.endsWith("-slot")
        ? "slot"
        : null;
    const semanticKey = connectorMember
      ? withoutPrefix.slice(0, -(connectorMember.length + 1))
      : withoutPrefix;
    return semanticKey.length > 0
      ? {
          canonicalId,
          semanticKind: "connector_relationship",
          semanticKey,
          connectorMember,
        }
      : null;
  }
  const convention = referenceKeyConvention(kind);
  if (!convention) return null;
  const semanticKey = removeRepeatedPrefix(canonicalId, convention.prefix);
  if (semanticKey.length === 0) return null;
  return {
    canonicalId,
    semanticKind: convention.semanticKind,
    semanticKey,
    connectorMember: null,
  };
};

export const fabricationSemanticReferenceKeys = (
  intent: FabricationIntentV1,
): readonly SemanticReferenceKey[] => {
  const references: {
    readonly kind: GeometryRefKind;
    readonly id: string;
  }[] = [];
  for (const constraint of intent.semanticConstraints) {
    switch (constraint.kind) {
      case "dimension":
        references.push(constraint.geometryRef);
        break;
      case "clearance":
      case "contact":
        references.push(...constraint.geometryRefs);
        break;
      case "symmetry":
      case "fold_flat":
        references.push(
          ...constraint.bodyIds.map((id) => ({ kind: "body" as const, id })),
        );
        break;
      case "motion":
        references.push({ kind: "output", id: constraint.outputId });
        break;
      case "recognizable_form":
        references.push(
          ...constraint.semanticPartIds.map((id) => ({
            kind: "semantic_part" as const,
            id,
          })),
        );
        break;
    }
  }
  const byCanonicalReference = new Map<string, SemanticReferenceKey>();
  for (const reference of references) {
    const normalized = semanticReferenceKey(reference.kind, reference.id);
    if (normalized) {
      byCanonicalReference.set(
        `${normalized.semanticKind}:${normalized.canonicalId}`,
        normalized,
      );
    }
  }
  return [...byCanonicalReference.values()].toSorted((left, right) =>
    `${left.semanticKind}:${left.canonicalId}`.localeCompare(
      `${right.semanticKind}:${right.canonicalId}`,
      "en-US",
    ),
  );
};

export const fabricationPlanningInput = (
  intent: FabricationIntentV1,
  usedTopologyIds: readonly string[],
) => ({
  exactRequirements: intent.sourcePrompt,
  designBrief: {
    objectLabel: intent.objectLabel,
    functionalGoal: intent.functionalGoal,
    visualDescription: intent.visualDescription,
    behavior: intent.behavior,
    requestedSize: intent.requestedSize,
    stockOptions: intent.stockOptions,
    fabricationBudget: intent.fabricationBudget,
    semanticConstraints: intent.semanticConstraints,
    priorities: intent.priorities,
  },
  semanticReferenceKeys: fabricationSemanticReferenceKeys(intent),
  diversity:
    usedTopologyIds.length > 0
      ? { topologyIdsAlreadyUsed: [...usedTopologyIds] }
      : null,
});

export const fabricationNarrativeInput = (candidate: CandidateV2) => ({
  candidateId: candidate.candidateId,
  selectionStatus: candidate.selectionStatus,
  intent: {
    title: candidate.intent.title,
    objectLabel: candidate.intent.objectLabel,
    functionalGoal: candidate.intent.functionalGoal,
    visualDescription: candidate.intent.visualDescription,
    behavior: candidate.intent.behavior,
    requestedSize: candidate.intent.requestedSize,
    semanticConstraints: candidate.intent.semanticConstraints,
  },
  design: {
    label: candidate.label,
    summary: candidate.program.designSummary,
    assemblyStrategy: candidate.program.assemblyStrategy,
    assemblyOperations: candidate.program.blueprint.assemblyOperations,
  },
  verification: {
    valid: candidate.verification.valid,
    reportId: candidate.verification.reportId,
    irHash: candidate.verification.irHash,
    failedAtStage: candidate.verification.failedAtStage,
  },
  score: candidate.score,
  exportMetadata: candidate.exportMetadata,
  provenance: {
    compilerVersion: candidate.provenance.compilerVersion,
    modelId: candidate.provenance.modelId,
    modelResponseId: candidate.provenance.modelResponseId,
    modelPlanHash: candidate.provenance.modelPlanHash,
    planExpanderVersion: candidate.provenance.planExpanderVersion,
    appliedPatchIds: candidate.provenance.appliedPatchIds,
    repairCycle: candidate.provenance.repairCycle,
  },
});

export class LlmFabricationIntentModel implements FabricationIntentModel {
  async compileIntent(prompt: string): Promise<FabricationIntentV1> {
    const { value } = await generateStructured({
      schema: FabricationIntentV1Schema,
      schemaName: "FabricationIntentV1",
      instructions: FABRICATION_INTENT_PROMPT,
      input: prompt,
    });
    // The model fills the semantic fields; code normalizes reference IDs,
    // capacity budgets, and stock feasibility so they cannot contradict the
    // compiler limits.
    return normalizeFabricationIntentFeasibility(
      FabricationIntentV1Schema.parse(
        normalizeFabricationIntentBudget(
          normalizeIntentSemanticPartIds({ ...value, sourcePrompt: prompt }),
          prompt,
        ),
      ),
    );
  }
}

export class LlmFabricationProgramModel implements FabricationProgramModel {
  async generateProgram(
    intent: FabricationIntentV1,
    candidateOrdinal: number,
    usedTopologyIds: readonly string[],
  ): Promise<ProgramProposalV1> {
    const result = await generateStructured({
      schema: FabricationDesignSpecProposalV3Schema,
      schemaName: "FabricationDesignSpecProposalV3",
      instructions: FABRICATION_PROGRAM_PROMPT,
      input: canonicalSerialize(
        fabricationPlanningInput(intent, usedTopologyIds),
      ),
    });
    return programProposalFromDesignSpec({
      proposal: result.value,
      intent,
      candidateOrdinal,
      modelId: result.modelId,
      responseId: result.responseId,
    });
  }
}

export class LlmFabricationRepairModel implements FabricationRepairModel {
  async diagnoseRepair(
    program: FabricationProgramV1,
    report: VerificationReportV2,
    repairCycle: number,
  ): Promise<ProgramPatchV1> {
    const baseProgramHash = fabricationProgramHash(program);
    const { value: proposedPatch } = await generateStructured({
      schema: ProgramPatchV1Schema,
      schemaName: "ProgramPatchV1",
      instructions: FABRICATION_REPAIR_PROMPT,
      input: canonicalSerialize({
        program,
        report,
        patchContext: {
          programId: program.programId,
          baseProgramHash,
          repairCycle,
        },
      }),
    });
    return ProgramPatchV1Schema.parse({
      ...proposedPatch,
      // These fields describe the current server transaction, not an AI
      // design decision. Binding them here prevents a fabricated or stale
      // echo from rejecting an otherwise grounded repair.
      programId: program.programId,
      baseProgramHash,
      repairCycle,
      authoredBy: "ai",
      changesIntent: false,
      operations: proposedPatch.operations.map((operation) => ({
        ...operation,
        // The patch is applied immediately to the same hashed program. Path,
        // failure grounding, value type, unit, no-op, and final schema checks
        // remain deterministic; an echoed current value is not authoritative.
        expectedCurrentValue: null,
      })),
    });
  }
}

export class LlmFabricationNarrativeModel implements FabricationNarrativeModel {
  async generateNarrative(
    candidate: CandidateV2,
  ): Promise<FabricationNarrativeV1> {
    const { value } = await generateStructured({
      schema: FabricationNarrativeV1Schema,
      schemaName: "FabricationNarrativeV1",
      instructions: FABRICATION_NARRATIVE_PROMPT,
      input: canonicalSerialize(fabricationNarrativeInput(candidate)),
    });
    return value;
  }
}
