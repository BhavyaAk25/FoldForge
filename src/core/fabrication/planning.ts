import { canonicalSerialize } from "@/core/canonical";
import { sha256Hex } from "@/core/sha256";

import { FABRICATION_LIMITS } from "./limits";
import { normalizeFoldOnlyPlan } from "./plan-normalization";
import {
  fabricationErr,
  parseFabricationContract,
  type FabricationContractValidationError,
  type FabricationLimitError,
  type FabricationReferenceError,
  type FabricationResult,
  type UnsupportedFabricationError,
} from "./result";
import {
  FabricationIntentV1Schema,
  FabricationPlanV1Schema,
  FabricationProgramV1Schema,
} from "./schemas";
import type {
  AssemblyOperationV1,
  FabricationIntentV1,
  FabricationPlanV1,
  FabricationProgramV1,
  GeometryRefV1,
  DriverV1,
  JointV1,
  SheetV1,
} from "./types";

export const FABRICATION_PLAN_EXPANDER_VERSION = "2";

export type FabricationPlanExpansionError =
  | FabricationContractValidationError
  | FabricationLimitError
  | FabricationReferenceError
  | UnsupportedFabricationError;

const normalizedDriverForJoint = (
  driver: DriverV1 | null,
  joints: readonly JointV1[],
): DriverV1 | null => {
  if (!driver) return null;
  const drivenJoint = joints.find((joint) => joint.jointId === driver.jointId);
  if (!drivenJoint) return driver;
  const control: DriverV1["control"] =
    drivenJoint.kind === "fold"
      ? "fold"
      : drivenJoint.kind === "revolute"
        ? "rotate"
        : driver.control === "pull_tab"
          ? "pull_tab"
          : "slide";
  return {
    ...driver,
    control,
    unit: drivenJoint.kind === "prismatic" ? "mm" : "deg",
  };
};

const sequentialAssemblyOperations = (
  plan: FabricationPlanV1,
): readonly AssemblyOperationV1[] => {
  const operations: AssemblyOperationV1[] = [];

  const append = (
    kind: AssemblyOperationV1["kind"],
    targetRefs: readonly GeometryRefV1[],
    instruction: string,
  ): void => {
    const order = operations.length + 1;
    const previous = operations.at(-1);
    operations.push({
      operationId: `assembly.op-${order}`,
      order,
      kind,
      targetRefs,
      dependsOnOperationIds: previous ? [previous.operationId] : [],
      instruction,
    });
  };

  for (const panel of plan.panels) {
    append(
      "cut",
      [{ kind: "panel", id: panel.panelId }],
      `Cut the ${panel.label} perimeter and its internal openings.`,
    );
  }
  for (const joint of plan.joints) {
    if (joint.kind === "fold") {
      append(
        "score",
        [{ kind: "joint", id: joint.jointId }],
        `Score the ${joint.jointId} fold axis.`,
      );
      append(
        "fold",
        [{ kind: "joint", id: joint.jointId }],
        `Fold ${joint.jointId} in the marked ${joint.foldDirection} direction.`,
      );
    } else if (joint.kind === "revolute") {
      append(
        "join_hinge",
        [{ kind: "joint", id: joint.jointId }],
        `Join the articulated hinge ${joint.jointId}.`,
      );
    } else {
      append(
        "engage_slider",
        [{ kind: "joint", id: joint.jointId }],
        `Engage the prismatic guide ${joint.jointId}.`,
      );
    }
  }
  for (const connector of plan.connectors) {
    if (connector.kind !== "tab") continue;
    append(
      "insert_tab",
      [{ kind: "connector", id: connector.connectorId }],
      `Insert ${connector.connectorId} into ${connector.mateConnectorId}.`,
    );
  }
  append(
    "verify",
    plan.panels.map((panel) => ({ kind: "panel", id: panel.panelId })),
    "Check every marked joint and connector through its intended motion.",
  );
  return operations;
};

export const fabricationPlanFromProgram = (
  program: FabricationProgramV1,
): FabricationPlanV1 => ({
  version: "1",
  candidateLabel: program.candidateLabel,
  topologyId: program.topologyId,
  panels: program.blueprint.panels.map((panel) => ({
    panelId: panel.panelId,
    sheetId: panel.sheetId,
    bodyId: panel.bodyId,
    label: panel.label,
    role: panel.role,
    widthMm: panel.widthMm,
    heightMm: panel.heightMm,
    contour: panel.contour,
    innerCutContours: panel.innerCutContours,
    flatTransform: panel.flatTransform,
    semanticPartIds: panel.semanticPartIds,
  })),
  bodies: program.blueprint.bodies.map((body) => ({
    bodyId: body.bodyId,
    label: body.label,
    panelIds: body.panelIds,
    initialTransform: body.initialTransform,
    grounded: body.grounded,
    semanticPartIds: body.semanticPartIds,
  })),
  joints: program.blueprint.joints,
  connectors: program.blueprint.connectors,
  driver: program.blueprint.driver,
  outputs: program.blueprint.outputs,
  couplings: program.blueprint.couplings,
  semanticParts: program.blueprint.semanticParts,
  assemblyStrategy: program.assemblyStrategy,
  designSummary: program.designSummary,
});

export const expandFabricationPlan = (
  intentInput: unknown,
  planInput: unknown,
  candidateOrdinal: number,
): FabricationResult<FabricationProgramV1, FabricationPlanExpansionError> => {
  const intentResult = parseFabricationContract(
    "FabricationIntentV1",
    FabricationIntentV1Schema,
    intentInput,
  );
  if (!intentResult.ok) return intentResult;
  const planResult = parseFabricationContract(
    "FabricationPlanV1",
    FabricationPlanV1Schema,
    planInput,
  );
  if (!planResult.ok) return planResult;

  const intent: FabricationIntentV1 = intentResult.value;
  const plan: FabricationPlanV1 = planResult.value;
  if (intent.scopeStatus !== "supported") {
    return fabricationErr({
      kind: "unsupported_fabrication",
      reason:
        intent.unsupportedReason ??
        intent.clarificationQuestion ??
        "The intent is not ready for planning.",
    });
  }
  if (
    !Number.isInteger(candidateOrdinal) ||
    candidateOrdinal < 1 ||
    candidateOrdinal > FABRICATION_LIMITS.maximumCandidateCount
  ) {
    return fabricationErr({
      kind: "contract_validation",
      contract: "FabricationPlanV1",
      issues: [
        {
          code: "custom",
          path: ["candidateOrdinal"],
          message: `Candidate ordinal must be between 1 and ${FABRICATION_LIMITS.maximumCandidateCount}.`,
        },
      ],
    });
  }

  const programId = `program-${sha256Hex(
    canonicalSerialize({
      intent,
      candidateOrdinal,
      plan,
      expanderVersion: FABRICATION_PLAN_EXPANDER_VERSION,
    }),
  ).slice(0, 24)}`;
  const stockById = new Map(
    intent.stockOptions.map((sheet) => [sheet.sheetId, sheet]),
  );
  const selectedSheetIds = [
    ...new Set(plan.panels.map((panel) => panel.sheetId)),
  ];
  const selectedSheets: SheetV1[] = [];
  for (const sheetId of selectedSheetIds) {
    const selectedSheet = stockById.get(sheetId);
    if (!selectedSheet) {
      return fabricationErr({
        kind: "invalid_reference",
        referenceKind: "stock_option",
        referenceId: sheetId,
        ownerId: plan.topologyId,
      });
    }
    selectedSheets.push(selectedSheet);
  }
  if (selectedSheetIds.length > intent.fabricationBudget.maximumSheets) {
    return fabricationErr({
      kind: "limit_exceeded",
      limit: "intent.maximumSheets",
      actual: selectedSheetIds.length,
      maximum: intent.fabricationBudget.maximumSheets,
    });
  }
  const normalizedPlanResult = normalizeFoldOnlyPlan(
    plan,
    intent.stockOptions,
    intent.requestedSize,
  );
  if (!normalizedPlanResult.ok) {
    return fabricationErr({
      kind: "contract_validation",
      contract: "FabricationPlanV1",
      issues: [
        {
          code: "custom",
          path: [...normalizedPlanResult.path],
          message: normalizedPlanResult.message,
        },
      ],
    });
  }
  const normalizedPlan = normalizedPlanResult.value;
  const program: FabricationProgramV1 = {
    version: "1",
    programId,
    intentId: intent.intentId,
    candidateLabel: plan.candidateLabel,
    topologyId: plan.topologyId,
    topologyVersion: 1,
    behavior: intent.behavior,
    sheets: selectedSheets,
    modules: [],
    connections: [],
    blueprint: {
      panels: normalizedPlan.panels,
      bodies: normalizedPlan.bodies,
      joints: normalizedPlan.joints,
      connectors: normalizedPlan.connectors,
      // Control and unit duplicate information already fixed by the driven
      // joint. Deriving them here prevents semantic wording such as "rotate a
      // paper flap" from creating an invalid fold-joint control.
      driver: normalizedDriverForJoint(
        normalizedPlan.driver,
        normalizedPlan.joints,
      ),
      outputs: normalizedPlan.outputs,
      couplings: normalizedPlan.couplings,
      semanticParts: normalizedPlan.semanticParts,
      assemblyOperations: sequentialAssemblyOperations(normalizedPlan),
    },
    semanticConstraints: intent.semanticConstraints,
    assemblyStrategy: plan.assemblyStrategy,
    designSummary: plan.designSummary,
  };

  return parseFabricationContract(
    "FabricationProgramV1",
    FabricationProgramV1Schema,
    program,
  );
};
