import { canonicalSerialize } from "@/core/canonical";
import { compileFabricationProgram } from "@/core/fabrication/compiler";
import {
  expandFabricationPlan,
  FABRICATION_PLAN_EXPANDER_VERSION,
} from "@/core/fabrication/planning";
import {
  expandResolvedSemanticFabricationPlan,
  SEMANTIC_PLAN_RESOLUTION_BUDGETS,
} from "@/core/fabrication/semantic-plan-expansion";
import { semanticPlanStructureFingerprint } from "@/core/fabrication/semantic-plan-fingerprint";
import { scoreFabricationCandidate } from "@/core/fabrication/scoring";
import {
  FabricationPlanV2Schema,
  type FabricationPlanV2,
} from "@/core/fabrication/semantic-plan";
import type {
  FabricationIntentV1,
  FabricationPlanV1,
  FabricationProgramV1,
  VerificationReportV2,
} from "@/core/fabrication/types";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import { sha256Hex } from "@/core/sha256";

import {
  FabricationPlanProposalV1Schema,
  FabricationPlanProposalBatchV2Schema,
  FabricationPlanProposalBatchV3Schema,
  FabricationPlanProposalV2Schema,
  ProgramProposalV1Schema,
  type ProgramProposalV1,
  type FabricationPlanStructuralAlternativeV2,
} from "./contracts";
import {
  FabricationModelContractError,
  type FabricationModelContractErrorCode,
} from "./model-contract-error";

export interface CompletedFabricationPlanResponse {
  readonly id: string;
  readonly status?: string | null;
  readonly output?: readonly unknown[] | null;
}

export interface FabricationProgramFailureDetail {
  readonly phase: "decoding" | "schema" | "expansion";
  readonly code: string;
  readonly path: readonly string[];
  readonly message?: string;
  readonly behavior?: FabricationIntentV1["behavior"];
  readonly planHash?: string;
  readonly topologyId?: string;
  readonly resolverEvaluationCount?: number;
  readonly proposalCount?: number;
  readonly proposalFailures?: readonly {
    readonly proposalIndex: number;
    readonly planHash: string;
    readonly structuralFingerprint: string | null;
    readonly code: string;
  }[];
  readonly limit?: {
    readonly name: string;
    readonly actual: number;
    readonly maximum: number;
  };
}

export class FabricationProgramModelError extends FabricationModelContractError {
  constructor(
    code: FabricationModelContractErrorCode,
    message: string,
    readonly safeDetail: FabricationProgramFailureDetail | null = null,
  ) {
    super(code, message);
    this.name = "FabricationProgramModelError";
  }
}

interface FabricationPlanFunctionCallCandidate {
  readonly type: "function_call";
  readonly name: "submit_fabrication_plan";
  readonly arguments?: unknown;
}

const isFabricationPlanFunctionCallCandidate = (
  item: unknown,
): item is FabricationPlanFunctionCallCandidate =>
  typeof item === "object" &&
  item !== null &&
  "type" in item &&
  item.type === "function_call" &&
  "name" in item &&
  item.name === "submit_fabrication_plan";

const expansionFailureDetail = (
  error: unknown,
): FabricationProgramFailureDetail => {
  if (typeof error !== "object" || error === null) {
    return { phase: "expansion", code: "unknown", path: [] };
  }
  const record = error as Record<string, unknown>;
  const issues = Array.isArray(record.issues) ? record.issues : [];
  const firstIssue = issues[0];
  const issueRecord =
    typeof firstIssue === "object" && firstIssue !== null
      ? (firstIssue as Record<string, unknown>)
      : null;
  const directPath = Array.isArray(record.path) ? record.path : null;
  const issuePath = Array.isArray(issueRecord?.path) ? issueRecord.path : null;
  const limit =
    record.kind === "limit_exceeded" &&
    typeof record.limit === "string" &&
    typeof record.actual === "number" &&
    typeof record.maximum === "number"
      ? {
          name: record.limit,
          actual: record.actual,
          maximum: record.maximum,
        }
      : null;
  return {
    phase: "expansion",
    code:
      typeof record.code === "string"
        ? record.code
        : typeof record.kind === "string"
          ? record.kind
          : "unknown",
    path: (directPath ?? issuePath ?? []).map(String).slice(0, 12),
    ...(typeof record.message === "string"
      ? { message: record.message.slice(0, 500) }
      : {}),
    ...(typeof record.resolverEvaluationCount === "number"
      ? { resolverEvaluationCount: record.resolverEvaluationCount }
      : {}),
    ...(limit ? { limit } : {}),
  };
};

type ParsedPlanProposal =
  | {
      readonly diversityClaim: string;
      readonly plan: FabricationPlanV1;
      readonly version: "1";
    }
  | {
      readonly diversityClaim: string;
      readonly plan: FabricationPlanV2;
      readonly version: "2";
    };

const applyStructuralAlternative = (
  basePlan: FabricationPlanV2,
  alternative: FabricationPlanStructuralAlternativeV2,
): FabricationPlanV2 => {
  const jointEdits = new Map(
    alternative.jointEdits.map((edit) => [edit.jointKey, edit]),
  );
  const connectorEdits = new Map(
    alternative.connectorEdits.map((edit) => [edit.relationshipKey, edit]),
  );
  if (
    (alternative.groundedBodyKey !== null &&
      !basePlan.bodies.some(
        (body) => body.key === alternative.groundedBodyKey,
      )) ||
    alternative.jointEdits.some(
      (edit) => !basePlan.joints.some((joint) => joint.key === edit.jointKey),
    ) ||
    alternative.connectorEdits.some(
      (edit) =>
        !basePlan.connectorRelationships.some(
          (relationship) => relationship.key === edit.relationshipKey,
        ),
    )
  ) {
    throw new FabricationProgramModelError(
      "invalid_plan",
      "GPT-5.6 Sol returned a structural alternative with an unknown reference.",
      {
        phase: "schema",
        code: "alternative_reference",
        path: ["structuralAlternatives"],
      },
    );
  }
  const plan = {
    ...basePlan,
    topologyKey: alternative.topologyKey,
    bodies: basePlan.bodies.map((body) => ({
      ...body,
      grounded:
        alternative.groundedBodyKey === null
          ? body.grounded
          : body.key === alternative.groundedBodyKey,
    })),
    joints: basePlan.joints.map((joint) => {
      const edit = jointEdits.get(joint.key);
      if (!edit) return joint;
      const common = {
        ...joint,
        parentBodyKey: edit.parentBodyKey ?? joint.parentBodyKey,
        childBodyKey: edit.childBodyKey ?? joint.childBodyKey,
        parentAttachment: edit.parentAttachment ?? joint.parentAttachment,
        childAttachment: edit.childAttachment ?? joint.childAttachment,
      };
      if (common.kind === "prismatic") {
        return {
          ...common,
          homeTravelMm: edit.homeValue ?? common.homeTravelMm,
          minimumTravelMm: edit.minimumValue ?? common.minimumTravelMm,
          maximumTravelMm: edit.maximumValue ?? common.maximumTravelMm,
        };
      }
      const angular = {
        ...common,
        homeAngleDeg: edit.homeValue ?? common.homeAngleDeg,
        minimumAngleDeg: edit.minimumValue ?? common.minimumAngleDeg,
        maximumAngleDeg: edit.maximumValue ?? common.maximumAngleDeg,
      };
      return angular.kind === "fold" && edit.foldDirection !== null
        ? { ...angular, foldDirection: edit.foldDirection }
        : angular;
    }),
    connectorRelationships: basePlan.connectorRelationships.map(
      (relationship) => {
        const edit = connectorEdits.get(relationship.key);
        return edit
          ? {
              ...relationship,
              tabAttachment: edit.tabAttachment ?? relationship.tabAttachment,
              slotAttachment:
                edit.slotAttachment ?? relationship.slotAttachment,
            }
          : relationship;
      },
    ),
  };
  const parsed = FabricationPlanV2Schema.safeParse(plan);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new FabricationProgramModelError(
      "invalid_plan",
      "GPT-5.6 Sol returned an invalid structural alternative.",
      {
        phase: "schema",
        code: issue?.code ?? "alternative_invalid",
        path: issue?.path.map(String).slice(0, 12) ?? [],
      },
    );
  }
  return parsed.data;
};

const parsePlanProposals = (
  rawProposal: unknown,
): readonly ParsedPlanProposal[] => {
  const compactBatch =
    FabricationPlanProposalBatchV3Schema.safeParse(rawProposal);
  if (compactBatch.success) {
    const base = compactBatch.data.baseProposal;
    return [
      { ...base, version: "2" as const },
      ...compactBatch.data.structuralAlternatives.map((alternative) => ({
        diversityClaim: alternative.diversityClaim,
        plan: applyStructuralAlternative(base.plan, alternative),
        version: "2" as const,
      })),
    ];
  }
  const batch = FabricationPlanProposalBatchV2Schema.safeParse(rawProposal);
  if (batch.success) {
    return batch.data.proposals.map((proposal) => ({
      ...proposal,
      version: "2" as const,
    }));
  }
  const semantic = FabricationPlanProposalV2Schema.safeParse(rawProposal);
  if (semantic.success) {
    return [{ ...semantic.data, version: "2" }];
  }
  const legacy = FabricationPlanProposalV1Schema.safeParse(rawProposal);
  if (legacy.success) {
    return [{ ...legacy.data, version: "1" }];
  }
  const issue =
    compactBatch.error.issues[0] ??
    batch.error.issues[0] ??
    semantic.error.issues[0];
  throw new FabricationProgramModelError(
    "invalid_plan",
    "GPT-5.6 Sol returned malformed fabrication plan arguments.",
    {
      phase: "schema",
      code: issue?.code ?? "unknown",
      path: issue?.path.map(String).slice(0, 12) ?? [],
    },
  );
};

const withPlanContext = (
  detail: FabricationProgramFailureDetail,
  intent: FabricationIntentV1,
  plan: FabricationPlanV1 | FabricationPlanV2,
): FabricationProgramFailureDetail => {
  const planHash = sha256Hex(canonicalSerialize(plan));
  const topologyId =
    plan.version === "2" ? `topology-${plan.topologyKey}` : plan.topologyId;
  const context = `Behavior ${intent.behavior}; topology ${topologyId}; plan ${planHash.slice(0, 12)}.`;
  return {
    ...detail,
    behavior: intent.behavior,
    planHash,
    topologyId,
    ...(detail.message
      ? { message: `${context} ${detail.message}`.slice(0, 500) }
      : {}),
  };
};

const verificationFailureDetail = (
  report: VerificationReportV2,
): FabricationProgramFailureDetail => {
  const primary =
    report.failures.find((failure) => failure.severity === "hard") ??
    report.failures[0];
  return {
    phase: "expansion",
    code: primary?.failureId ?? "verification_hard_failure",
    path:
      primary?.geometryRefs.map((reference) => reference.id).slice(0, 12) ?? [],
    message:
      primary?.message ??
      "The generated program failed deterministic verification.",
  };
};

interface ValidatedProposal {
  readonly proposal: ParsedPlanProposal;
  readonly proposalIndex: number;
  readonly program: FabricationProgramV1;
  readonly planHash: string;
  readonly structuralFingerprint: string | null;
  readonly totalScore: number;
}

interface DistinctProposal {
  readonly proposal: ParsedPlanProposal;
  readonly proposalIndex: number;
  readonly planHash: string;
  readonly structuralFingerprint: string | null;
}

export const fabricationProgramProposalFromResponse = (input: {
  readonly response: CompletedFabricationPlanResponse;
  readonly intent: FabricationIntentV1;
  readonly candidateOrdinal: number;
  readonly modelId: string;
}): ProgramProposalV1 => {
  if (input.response.status !== "completed") {
    throw new FabricationProgramModelError(
      "model_incomplete",
      "GPT-5.6 Sol did not complete the fabrication plan.",
    );
  }
  const planCalls = (input.response.output ?? []).filter(
    isFabricationPlanFunctionCallCandidate,
  );
  const planCall = planCalls[0];
  if (!planCall) {
    throw new FabricationProgramModelError(
      "missing_plan_call",
      "GPT-5.6 Sol returned no fabrication plan call.",
    );
  }
  if (planCalls.length !== 1) {
    throw new FabricationProgramModelError(
      "duplicate_plan_call",
      "GPT-5.6 Sol returned more than one fabrication plan call.",
    );
  }
  if (typeof planCall.arguments !== "string") {
    throw new FabricationProgramModelError(
      "invalid_plan",
      "GPT-5.6 Sol returned malformed fabrication plan arguments.",
      { phase: "decoding", code: "arguments_not_string", path: [] },
    );
  }
  let rawProposal: unknown;
  try {
    rawProposal = JSON.parse(planCall.arguments);
  } catch {
    throw new FabricationProgramModelError(
      "invalid_plan",
      "GPT-5.6 Sol returned malformed fabrication plan arguments.",
      { phase: "decoding", code: "invalid_json", path: [] },
    );
  }
  const proposals = parsePlanProposals(rawProposal);
  const valid: ValidatedProposal[] = [];
  const seenPlanHashes = new Set<string>();
  const seenStructuralFingerprints = new Set<string>();
  const proposalFailures: {
    proposalIndex: number;
    planHash: string;
    structuralFingerprint: string | null;
    code: string;
  }[] = [];
  let bestFailure: FabricationProgramFailureDetail | null = null;
  const distinctProposals: DistinctProposal[] = [];
  for (const [proposalIndex, proposal] of proposals.entries()) {
    const planHash = sha256Hex(canonicalSerialize(proposal.plan));
    const structuralFingerprint =
      proposal.version === "2"
        ? semanticPlanStructureFingerprint(proposal.plan)
        : null;
    const duplicateCode = seenPlanHashes.has(planHash)
      ? "duplicate_plan_hash"
      : structuralFingerprint &&
          seenStructuralFingerprints.has(structuralFingerprint)
        ? "duplicate_structural_fingerprint"
        : null;
    if (duplicateCode) {
      proposalFailures.push({
        proposalIndex,
        planHash,
        structuralFingerprint,
        code: duplicateCode,
      });
      continue;
    }
    seenPlanHashes.add(planHash);
    if (structuralFingerprint) {
      seenStructuralFingerprints.add(structuralFingerprint);
    }
    distinctProposals.push({
      proposal,
      proposalIndex,
      planHash,
      structuralFingerprint,
    });
  }
  // Keep the complete deterministic search across a model-authored batch inside
  // the same request budget that previously applied to one proposal. Moving
  // plans are more expensive because every variant runs the swept-motion gate.
  // Equivalent alternatives are removed before this division, so a duplicate
  // cannot consume or dilute the useful deterministic resolution budget.
  const resolutionBudgetPerProposal = Math.max(
    2,
    Math.floor(
      (input.intent.behavior === "static"
        ? SEMANTIC_PLAN_RESOLUTION_BUDGETS.static
        : SEMANTIC_PLAN_RESOLUTION_BUDGETS.moving) / distinctProposals.length,
    ),
  );
  for (const {
    proposal,
    proposalIndex,
    planHash,
    structuralFingerprint,
  } of distinctProposals) {
    const expanded =
      proposal.version === "2"
        ? expandResolvedSemanticFabricationPlan(
            input.intent,
            proposal.plan,
            input.candidateOrdinal,
            resolutionBudgetPerProposal,
          )
        : expandFabricationPlan(
            input.intent,
            proposal.plan,
            input.candidateOrdinal,
          );
    if (!expanded.ok) {
      bestFailure = withPlanContext(
        expansionFailureDetail(expanded.error),
        input.intent,
        proposal.plan,
      );
      proposalFailures.push({
        proposalIndex,
        planHash,
        structuralFingerprint,
        code: bestFailure.code,
      });
      continue;
    }
    const compiled = compileFabricationProgram(input.intent, expanded.value);
    if (!compiled.ok) {
      bestFailure = withPlanContext(
        expansionFailureDetail(compiled.error),
        input.intent,
        proposal.plan,
      );
      proposalFailures.push({
        proposalIndex,
        planHash,
        structuralFingerprint,
        code: bestFailure.code,
      });
      continue;
    }
    const report = verifyFabricationIr(
      compiled.value,
      `candidate-program-selection-${input.candidateOrdinal}-${proposalIndex + 1}`,
    );
    if (!report.valid) {
      bestFailure = withPlanContext(
        verificationFailureDetail(report),
        input.intent,
        proposal.plan,
      );
      proposalFailures.push({
        proposalIndex,
        planHash,
        structuralFingerprint,
        code: bestFailure.code,
      });
      continue;
    }
    const score = scoreFabricationCandidate(
      compiled.value,
      report,
      input.intent,
    );
    valid.push({
      proposal,
      proposalIndex,
      program: expanded.value,
      planHash,
      structuralFingerprint,
      totalScore: score.totalScore ?? 0,
    });
  }
  const selected = valid.toSorted(
    (left, right) =>
      right.totalScore - left.totalScore ||
      left.planHash.localeCompare(right.planHash),
  )[0];
  if (!selected) {
    const failureDetail = bestFailure ?? {
      phase: "expansion" as const,
      code: "no_distinct_proposal",
      path: [],
    };
    throw new FabricationProgramModelError(
      "invalid_plan",
      "GPT-5.6 Sol returned no fabrication plan that passed deterministic verification.",
      {
        ...failureDetail,
        proposalCount: proposals.length,
        proposalFailures,
      },
    );
  }
  return ProgramProposalV1Schema.parse({
    diversityClaim: selected.proposal.diversityClaim,
    program: selected.program,
    provenance: {
      modelId: input.modelId,
      modelResponseId: input.response.id,
      planHash: selected.planHash,
      expanderVersion: FABRICATION_PLAN_EXPANDER_VERSION,
      proposalCount: proposals.length,
      evaluatedProposalCount: distinctProposals.length,
      selectedProposalIndex: selected.proposalIndex,
      terminalFailureCodes: proposalFailures.map((failure) => failure.code),
    },
  });
};
