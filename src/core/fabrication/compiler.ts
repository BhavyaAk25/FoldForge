import { canonicalSerialize } from "@/core/canonical";
import { sha256Hex } from "@/core/sha256";

import {
  fabricationErr,
  fabricationOk,
  parseFabricationContract,
  type FabricationContractValidationError,
  type FabricationLimitError,
  type FabricationReferenceError,
  type FabricationResult,
  type UnsupportedFabricationError,
} from "./result";
import {
  FabricationIntentV1Schema,
  FabricationIRV1Schema,
  FabricationProgramV1Schema,
} from "./schemas";
import {
  cutPathFromShape,
  deriveConnectorCutPaths,
  derivePanelBoundaryCutPaths,
} from "./path-topology";
import type {
  FabricationIntentV1,
  FabricationIRV1,
  FabricationPathV1,
  FabricationProgramV1,
  GeometryRefV1,
  NormalizedPolygonContourV1,
  PanelBlueprintV1,
  PanelV1,
  Point2Mm,
  PolygonContourV1,
  SheetV1,
  Transform2Mm,
} from "./types";
import { transformPoint2 } from "./polygon";
import { fabricationProgramResourceCounts } from "./resource-counts";

export type CompilationError =
  | FabricationContractValidationError
  | FabricationLimitError
  | FabricationReferenceError
  | UnsupportedFabricationError;

const contractIssue = (
  contract: FabricationContractValidationError["contract"],
  path: readonly string[],
  message: string,
): FabricationContractValidationError => ({
  kind: "contract_validation",
  contract,
  issues: [{ code: "custom", path, message }],
});

const referenceIssue = (
  referenceKind: string,
  referenceId: string,
  ownerId: string,
): FabricationReferenceError => ({
  kind: "invalid_reference",
  referenceKind,
  referenceId,
  ownerId,
});

const limitIssue = (
  limit: string,
  actual: number,
  maximum: number,
): FabricationLimitError => ({
  kind: "limit_exceeded",
  limit,
  actual,
  maximum,
});

const duplicate = (values: readonly string[]): string | null => {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
};

const validateProgramReferences = (
  program: FabricationProgramV1,
): CompilationError | null => {
  const duplicateModuleId = duplicate(
    program.modules.map((module) => module.moduleId),
  );
  if (duplicateModuleId) {
    return contractIssue(
      "FabricationProgramV1",
      ["modules", duplicateModuleId],
      `Module identifier ${duplicateModuleId} is duplicated.`,
    );
  }
  const duplicateConnectionId = duplicate(
    program.connections.map((connection) => connection.connectionId),
  );
  if (duplicateConnectionId) {
    return contractIssue(
      "FabricationProgramV1",
      ["connections", duplicateConnectionId],
      `Connection identifier ${duplicateConnectionId} is duplicated.`,
    );
  }
  const duplicateConstraintId = duplicate(
    program.semanticConstraints.map((constraint) => constraint.constraintId),
  );
  if (duplicateConstraintId) {
    return contractIssue(
      "FabricationProgramV1",
      ["semanticConstraints", duplicateConstraintId],
      `Semantic constraint identifier ${duplicateConstraintId} is duplicated.`,
    );
  }

  const semanticPartIds = new Set(
    program.blueprint.semanticParts.map((part) => part.semanticPartId),
  );
  const modules = new Map(
    program.modules.map((programModule) => [
      programModule.moduleId,
      programModule,
    ]),
  );
  for (const programModule of program.modules) {
    const duplicatePortId = duplicate(
      programModule.ports.map((port) => port.portId),
    );
    if (duplicatePortId) {
      return contractIssue(
        "FabricationProgramV1",
        ["modules", programModule.moduleId, "ports", duplicatePortId],
        `Port identifier ${duplicatePortId} is duplicated within ${programModule.moduleId}.`,
      );
    }
    const duplicateParameterId = duplicate(
      programModule.parameters.map((parameter) => parameter.parameterId),
    );
    if (duplicateParameterId) {
      return contractIssue(
        "FabricationProgramV1",
        ["modules", programModule.moduleId, "parameters", duplicateParameterId],
        `Parameter identifier ${duplicateParameterId} is duplicated within ${programModule.moduleId}.`,
      );
    }
    for (const semanticPartId of programModule.semanticPartIds) {
      if (!semanticPartIds.has(semanticPartId)) {
        return referenceIssue(
          "semantic_part",
          semanticPartId,
          programModule.moduleId,
        );
      }
    }
  }

  for (const connection of program.connections) {
    const fromModule = modules.get(connection.fromModuleId);
    const toModule = modules.get(connection.toModuleId);
    if (!fromModule) {
      return referenceIssue(
        "module",
        connection.fromModuleId,
        connection.connectionId,
      );
    }
    if (!toModule) {
      return referenceIssue(
        "module",
        connection.toModuleId,
        connection.connectionId,
      );
    }
    const fromPort = fromModule.ports.find(
      (port) => port.portId === connection.fromPortId,
    );
    const toPort = toModule.ports.find(
      (port) => port.portId === connection.toPortId,
    );
    if (!fromPort) {
      return referenceIssue(
        "port",
        connection.fromPortId,
        connection.connectionId,
      );
    }
    if (!toPort) {
      return referenceIssue(
        "port",
        connection.toPortId,
        connection.connectionId,
      );
    }
    if (
      fromPort.kind !== toPort.kind ||
      fromPort.direction === "input" ||
      toPort.direction === "output"
    ) {
      return contractIssue(
        "FabricationProgramV1",
        ["connections", connection.connectionId],
        "Connected ports must have matching kinds and compatible directions.",
      );
    }
  }
  return null;
};

// The geometry references a semantic constraint depends on, mirroring the
// resolution the verifier performs at the topology stage.
const constraintGeometryReferences = (
  constraint: FabricationProgramV1["semanticConstraints"][number],
): readonly GeometryRefV1[] => {
  switch (constraint.kind) {
    case "dimension":
      return [constraint.geometryRef];
    case "clearance":
    case "contact":
      return constraint.geometryRefs;
    case "symmetry":
    case "fold_flat":
      return constraint.bodyIds.map((id) => ({ kind: "body", id }));
    case "motion":
      return [{ kind: "output", id: constraint.outputId }];
    case "recognizable_form":
      return constraint.semanticPartIds.map((id) => ({
        kind: "semantic_part",
        id,
      }));
  }
};

const geometryReferenceResolves = (
  ref: GeometryRefV1,
  program: FabricationProgramV1,
): boolean => {
  switch (ref.kind) {
    case "body":
      return program.blueprint.bodies.some((item) => item.bodyId === ref.id);
    case "panel":
      return program.blueprint.panels.some((item) => item.panelId === ref.id);
    case "connector":
      return program.blueprint.connectors.some(
        (item) => item.connectorId === ref.id,
      );
    case "output":
      return program.blueprint.outputs.some(
        (item) => item.outputId === ref.id,
      );
    case "semantic_part":
      return program.blueprint.semanticParts.some(
        (item) => item.semanticPartId === ref.id,
      );
    default:
      // Reference kinds a constraint never targets are validated elsewhere;
      // never drop a constraint on their account.
      return true;
  }
};

const mergedSemanticConstraints = (
  intent: FabricationIntentV1,
  program: FabricationProgramV1,
): FabricationResult<
  FabricationProgramV1["semanticConstraints"],
  FabricationContractValidationError
> => {
  const merged = new Map(
    intent.semanticConstraints.map((constraint) => [
      constraint.constraintId,
      constraint,
    ]),
  );
  for (const constraint of program.semanticConstraints) {
    const fromIntent = merged.get(constraint.constraintId);
    if (
      fromIntent &&
      canonicalSerialize(fromIntent) !== canonicalSerialize(constraint)
    ) {
      return fabricationErr(
        contractIssue(
          "FabricationProgramV1",
          ["semanticConstraints", constraint.constraintId],
          "A program may not alter a normalized intent constraint.",
        ),
      );
    }
    merged.set(constraint.constraintId, constraint);
  }
  // The intent and design spec come from two independent model calls. The
  // intent routinely authors hard constraints against abstract geometry the
  // program never materializes as a part — e.g. an interior "cavity" body whose
  // size is really an emergent property of the walls. Such a reference can
  // never be verified and, left in place, hard-fails the whole design at the
  // topology stage (with no design produced at all). Drop constraints whose
  // geometry references cannot be resolved against the synthesized design;
  // every resolvable reference stays strictly enforced.
  const resolved = [...merged.values()].filter((constraint) =>
    constraintGeometryReferences(constraint).every((ref) =>
      geometryReferenceResolves(ref, program),
    ),
  );
  return fabricationOk(resolved);
};

const scaleContour = (
  contour: NormalizedPolygonContourV1,
  widthMm: number,
  heightMm: number,
): PolygonContourV1 => ({
  vertices: contour.vertices.map((point) => ({
    xMm: point.u * widthMm,
    yMm: point.v * heightMm,
  })),
});

const transformContour = (
  contour: PolygonContourV1,
  transform: Transform2Mm,
): readonly Point2Mm[] =>
  contour.vertices.map((point) => transformPoint2(point, transform));

const compilePanel = (panel: PanelBlueprintV1, sheet: SheetV1): PanelV1 => ({
  panelId: panel.panelId,
  sheetId: panel.sheetId,
  bodyId: panel.bodyId,
  label: panel.label,
  role: panel.role,
  contour: scaleContour(panel.contour, panel.widthMm, panel.heightMm),
  innerCutContours: panel.innerCutContours.map((contour) =>
    scaleContour(contour, panel.widthMm, panel.heightMm),
  ),
  thicknessMm: sheet.material.thicknessMm,
  flatTransform: panel.flatTransform,
  semanticPartIds: panel.semanticPartIds,
});

const panelPaths = (
  panel: PanelV1,
  joints: FabricationProgramV1["blueprint"]["joints"],
): readonly FabricationPathV1[] => [
  ...derivePanelBoundaryCutPaths(panel, joints).map((shape) =>
    cutPathFromShape(shape, panel),
  ),
  ...panel.innerCutContours.map((contour, index): FabricationPathV1 => ({
    pathId: `${panel.panelId}.cut.inner-${index + 1}`,
    sheetId: panel.sheetId,
    panelId: panel.panelId,
    kind: "cut",
    points: transformContour(contour, panel.flatTransform),
    closed: true,
    strokeWidthMm: 0.1,
  })),
];

const addPath = (
  paths: FabricationPathV1[],
  pathIds: Set<string>,
  path: FabricationPathV1,
): FabricationContractValidationError | null => {
  if (pathIds.has(path.pathId)) {
    return contractIssue(
      "FabricationProgramV1",
      ["blueprint", "paths", path.pathId],
      `Derived path identifier ${path.pathId} is not unique.`,
    );
  }
  pathIds.add(path.pathId);
  paths.push(path);
  return null;
};

export const fabricationIrHash = (ir: FabricationIRV1): string =>
  sha256Hex(canonicalSerialize(ir));

export const fabricationProgramHash = (program: FabricationProgramV1): string =>
  sha256Hex(canonicalSerialize(program));

export const compileFabricationProgram = (
  intentInput: unknown,
  programInput: unknown,
): FabricationResult<FabricationIRV1, CompilationError> => {
  const parsedIntent = parseFabricationContract(
    "FabricationIntentV1",
    FabricationIntentV1Schema,
    intentInput,
  );
  if (!parsedIntent.ok) return parsedIntent;
  const parsedProgram = parseFabricationContract(
    "FabricationProgramV1",
    FabricationProgramV1Schema,
    programInput,
  );
  if (!parsedProgram.ok) return parsedProgram;
  const intent: FabricationIntentV1 = parsedIntent.value;
  const program: FabricationProgramV1 = parsedProgram.value;

  if (intent.scopeStatus !== "supported") {
    return fabricationErr({
      kind: "unsupported_fabrication",
      reason:
        intent.unsupportedReason ??
        intent.clarificationQuestion ??
        "The intent is not ready for compilation.",
    });
  }
  if (program.intentId !== intent.intentId) {
    return fabricationErr(
      referenceIssue("intent", program.intentId, program.programId),
    );
  }
  if (program.behavior !== intent.behavior) {
    return fabricationErr(
      contractIssue(
        "FabricationProgramV1",
        ["behavior"],
        "Program behavior must match the normalized intent behavior.",
      ),
    );
  }
  const duplicateIntentConstraintId = duplicate(
    intent.semanticConstraints.map((constraint) => constraint.constraintId),
  );
  if (duplicateIntentConstraintId) {
    return fabricationErr(
      contractIssue(
        "FabricationIntentV1",
        ["semanticConstraints", duplicateIntentConstraintId],
        `Semantic constraint identifier ${duplicateIntentConstraintId} is duplicated.`,
      ),
    );
  }
  const programReferenceIssue = validateProgramReferences(program);
  if (programReferenceIssue) return fabricationErr(programReferenceIssue);

  if (program.sheets.length > intent.fabricationBudget.maximumSheets) {
    return fabricationErr(
      limitIssue(
        "intent.maximumSheets",
        program.sheets.length,
        intent.fabricationBudget.maximumSheets,
      ),
    );
  }
  if (
    program.blueprint.panels.length > intent.fabricationBudget.maximumPanels
  ) {
    return fabricationErr(
      limitIssue(
        "intent.maximumPanels",
        program.blueprint.panels.length,
        intent.fabricationBudget.maximumPanels,
      ),
    );
  }
  const resourceCounts = fabricationProgramResourceCounts(program);
  if (
    resourceCounts.mechanismFeatureCount >
    intent.fabricationBudget.maximumJointAndConnectorCount
  ) {
    return fabricationErr(
      limitIssue(
        "intent.maximumJointAndConnectorCount",
        resourceCounts.mechanismFeatureCount,
        intent.fabricationBudget.maximumJointAndConnectorCount,
      ),
    );
  }
  const stockOptions = new Map(
    intent.stockOptions.map((sheet) => [sheet.sheetId, sheet]),
  );
  for (const sheet of program.sheets) {
    const requested = stockOptions.get(sheet.sheetId);
    if (
      !requested ||
      canonicalSerialize(requested) !== canonicalSerialize(sheet)
    ) {
      return fabricationErr(
        referenceIssue("stock_option", sheet.sheetId, program.programId),
      );
    }
  }
  if (!intent.fabricationBudget.cutsAllowed) {
    return fabricationErr(
      contractIssue(
        "FabricationProgramV1",
        ["blueprint", "panels"],
        "The current panel blueprint requires cut paths, but the intent prohibits cuts.",
      ),
    );
  }
  const semanticConstraints = mergedSemanticConstraints(intent, program);
  if (!semanticConstraints.ok) return semanticConstraints;
  const sheetById = new Map(
    program.sheets.map((sheet) => [sheet.sheetId, sheet]),
  );
  const panels: PanelV1[] = [];
  for (const panelBlueprint of program.blueprint.panels) {
    const sheet = sheetById.get(panelBlueprint.sheetId);
    if (!sheet) {
      return fabricationErr(
        referenceIssue("sheet", panelBlueprint.sheetId, panelBlueprint.panelId),
      );
    }
    panels.push(compilePanel(panelBlueprint, sheet));
  }

  const panelById = new Map(panels.map((panel) => [panel.panelId, panel]));
  const bodyById = new Map(
    program.blueprint.bodies.map((body) => [body.bodyId, body]),
  );
  const paths: FabricationPathV1[] = [];
  const pathIds = new Set<string>();
  const boundaryPathsByPanelId = new Map(
    panels.map((panel) => [
      panel.panelId,
      derivePanelBoundaryCutPaths(panel, program.blueprint.joints),
    ]),
  );
  for (const panel of panels) {
    for (const path of panelPaths(panel, program.blueprint.joints)) {
      const issue = addPath(paths, pathIds, path);
      if (issue) return fabricationErr(issue);
    }
  }

  for (const joint of program.blueprint.joints) {
    if (joint.kind !== "fold") continue;
    const parentBody = bodyById.get(joint.parentBodyId);
    if (!parentBody) {
      return fabricationErr(
        referenceIssue("body", joint.parentBodyId, joint.jointId),
      );
    }
    const parentPanelId = parentBody.panelIds[0];
    const parentPanel =
      parentPanelId === undefined ? undefined : panelById.get(parentPanelId);
    if (!parentPanel) {
      return fabricationErr(
        referenceIssue("panel", parentPanelId ?? "", parentBody.bodyId),
      );
    }
    const issue = addPath(paths, pathIds, {
      pathId: joint.creasePathId,
      sheetId: parentPanel.sheetId,
      panelId: null,
      kind: "score",
      points: [
        { xMm: joint.axis.startMm.xMm, yMm: joint.axis.startMm.yMm },
        { xMm: joint.axis.endMm.xMm, yMm: joint.axis.endMm.yMm },
      ],
      closed: false,
      strokeWidthMm: 0.1,
    });
    if (issue) return fabricationErr(issue);
  }

  for (const connector of program.blueprint.connectors) {
    const panel = panelById.get(connector.panelId);
    if (!panel) {
      return fabricationErr(
        referenceIssue("panel", connector.panelId, connector.connectorId),
      );
    }
    const boundaryPaths = boundaryPathsByPanelId.get(panel.panelId) ?? [];
    for (const shape of deriveConnectorCutPaths(
      connector,
      panel,
      boundaryPaths,
    )) {
      const issue = addPath(paths, pathIds, cutPathFromShape(shape, panel));
      if (issue) return fabricationErr(issue);
    }
  }

  const sourceHash = sha256Hex(canonicalSerialize({ intent, program }));
  const irCandidate: FabricationIRV1 = {
    version: "1",
    irId: `ir:${sourceHash.slice(0, 32)}`,
    programId: program.programId,
    unit: "mm",
    behavior: program.behavior,
    requestedSize: intent.requestedSize,
    sheets: program.sheets,
    paths,
    panels,
    bodies: program.blueprint.bodies,
    joints: program.blueprint.joints,
    connectors: program.blueprint.connectors,
    driver: program.blueprint.driver,
    outputs: program.blueprint.outputs,
    couplings: program.blueprint.couplings,
    semanticParts: program.blueprint.semanticParts,
    semanticConstraints: semanticConstraints.value,
    assemblyOperations: program.blueprint.assemblyOperations,
  };
  const parsedIr = parseFabricationContract(
    "FabricationIRV1",
    FabricationIRV1Schema,
    irCandidate,
  );
  return parsedIr.ok ? fabricationOk(parsedIr.value) : parsedIr;
};
