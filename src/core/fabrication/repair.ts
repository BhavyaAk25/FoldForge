import { canonicalSerialize } from "@/core/canonical";
import { err, ok, type Result } from "@/core/result";
import { sha256Hex } from "@/core/sha256";

import { fabricationProgramHash } from "./compiler";
import { FabricationProgramV1Schema, ProgramPatchV1Schema } from "./schemas";
import type {
  CouplingV1,
  FabricationProgramV1,
  FabricationUnit,
  JointV1,
  PanelBlueprintV1,
  ProgramModuleV1,
  ProgramParameterV1,
  ProgramPatchOperationV1,
  ProgramPatchV1,
  VerificationReportV2,
} from "./types";

export type ProgramPatchError =
  | { readonly id: "patch.schema"; readonly message: string }
  | { readonly id: "patch.program"; readonly message: string }
  | { readonly id: "patch.hash"; readonly message: string }
  | { readonly id: "patch.duplicate"; readonly path: string }
  | { readonly id: "patch.failure_reference"; readonly failureId: string }
  | { readonly id: "patch.ungrounded"; readonly path: string }
  | { readonly id: "patch.path"; readonly path: string }
  | {
      readonly id: "patch.type";
      readonly path: string;
      readonly expected: string;
      readonly actual: string;
    }
  | {
      readonly id: "patch.expected_value";
      readonly path: string;
      readonly expected: string | number | boolean;
      readonly actual: string | number | boolean;
    }
  | {
      readonly id: "patch.unit";
      readonly path: string;
      readonly expected: FabricationUnit | null;
      readonly actual: FabricationUnit | null;
    };

type PatchValueKind = "boolean" | "enum" | "integer" | "number";
type PatchValue = string | number | boolean;

interface PatchTarget {
  readonly kind: PatchValueKind;
  readonly value: PatchValue;
  readonly unit: FabricationUnit | null;
}

const tokensFor = (path: string): readonly string[] =>
  path.split("/").filter((token) => token.length > 0);

const numberTarget = (
  value: number,
  unit: FabricationUnit | null,
): PatchTarget => ({ kind: "number", value, unit });

const panelTarget = (
  panel: PanelBlueprintV1,
  property: readonly string[],
): PatchTarget | null => {
  const key = property.join("/");
  switch (key) {
    case "widthMm":
      return numberTarget(panel.widthMm, "mm");
    case "heightMm":
      return numberTarget(panel.heightMm, "mm");
    case "flatTransform/translationMm/xMm":
      return numberTarget(panel.flatTransform.translationMm.xMm, "mm");
    case "flatTransform/translationMm/yMm":
      return numberTarget(panel.flatTransform.translationMm.yMm, "mm");
    case "flatTransform/rotationDeg":
      return numberTarget(panel.flatTransform.rotationDeg, "deg");
    default:
      return null;
  }
};

const jointTarget = (joint: JointV1, property: string): PatchTarget | null => {
  if (joint.kind === "prismatic") {
    switch (property) {
      case "homeTravelMm":
        return numberTarget(joint.homeTravelMm, "mm");
      case "minTravelMm":
        return numberTarget(joint.minTravelMm, "mm");
      case "maxTravelMm":
        return numberTarget(joint.maxTravelMm, "mm");
      default:
        return null;
    }
  }
  switch (property) {
    case "homeAngleDeg":
      return numberTarget(joint.homeAngleDeg, "deg");
    case "minAngleDeg":
      return numberTarget(joint.minAngleDeg, "deg");
    case "maxAngleDeg":
      return numberTarget(joint.maxAngleDeg, "deg");
    default:
      return null;
  }
};

const couplingTarget = (
  coupling: CouplingV1,
  property: string,
): PatchTarget | null => {
  switch (property) {
    case "ratio":
      return "ratio" in coupling ? numberTarget(coupling.ratio, "ratio") : null;
    case "offset":
      return coupling.kind === "direct_ratio"
        ? numberTarget(coupling.offset, coupling.offsetUnit)
        : null;
    case "phaseOffsetDeg":
      return coupling.kind === "mirrored_pair"
        ? numberTarget(coupling.phaseOffsetDeg, "deg")
        : null;
    case "phaseOffsetMm":
      return coupling.kind === "cam_slot"
        ? numberTarget(coupling.phaseOffsetMm, "mm")
        : null;
    default:
      return null;
  }
};

const parameterTarget = (parameter: ProgramParameterV1): PatchTarget => {
  switch (parameter.kind) {
    case "number":
      return numberTarget(parameter.value, parameter.unit);
    case "integer":
      return { kind: "integer", value: parameter.value, unit: "count" };
    case "boolean":
      return { kind: "boolean", value: parameter.value, unit: null };
    case "enum":
      return { kind: "enum", value: parameter.value, unit: null };
  }
};

const readTarget = (
  program: FabricationProgramV1,
  path: string,
): PatchTarget | null => {
  const tokens = tokensFor(path);
  const [root, collection, id, ...property] = tokens;
  if (root === "modules" && collection && id === "parameters") {
    const parameterId = property[0];
    const leaf = property[1];
    const programModule = program.modules.find(
      (item) => item.moduleId === collection,
    );
    const parameter = programModule?.parameters.find(
      (item) => item.parameterId === parameterId,
    );
    return leaf === "value" && parameter ? parameterTarget(parameter) : null;
  }
  if (root !== "blueprint" || !collection || !id || property.length === 0) {
    return null;
  }
  switch (collection) {
    case "panels": {
      const panel = program.blueprint.panels.find(
        (item) => item.panelId === id,
      );
      return panel ? panelTarget(panel, property) : null;
    }
    case "joints": {
      const joint = program.blueprint.joints.find(
        (item) => item.jointId === id,
      );
      return joint && property.length === 1
        ? jointTarget(joint, property[0] ?? "")
        : null;
    }
    case "connectors": {
      const connector = program.blueprint.connectors.find(
        (item) => item.connectorId === id,
      );
      if (!connector || property.length !== 1) return null;
      if (property[0] === "clearanceMm") {
        return numberTarget(connector.clearanceMm, "mm");
      }
      return property[0] === "widthMm" && connector.kind === "slot"
        ? numberTarget(connector.widthMm, "mm")
        : null;
    }
    case "driver": {
      const driver = program.blueprint.driver;
      if (!driver || driver.driverId !== id || property.length !== 1)
        return null;
      const unit = driver.unit;
      switch (property[0]) {
        case "minimumValue":
          return numberTarget(driver.minimumValue, unit);
        case "maximumValue":
          return numberTarget(driver.maximumValue, unit);
        case "homeValue":
          return numberTarget(driver.homeValue, unit);
        default:
          return null;
      }
    }
    case "outputs": {
      const output = program.blueprint.outputs.find(
        (item) => item.outputId === id,
      );
      if (!output || property.length !== 1) return null;
      if (property[0] === "minimumValue") {
        return numberTarget(output.minimumValue, output.unit);
      }
      return property[0] === "maximumValue"
        ? numberTarget(output.maximumValue, output.unit)
        : null;
    }
    case "couplings": {
      const coupling = program.blueprint.couplings.find(
        (item) => item.couplingId === id,
      );
      return coupling && property.length === 1
        ? couplingTarget(coupling, property[0] ?? "")
        : null;
    }
    default:
      return null;
  }
};

const operationKind = (operation: ProgramPatchOperationV1): PatchValueKind => {
  switch (operation.operation) {
    case "set_number":
      return "number";
    case "set_integer":
      return "integer";
    case "set_boolean":
      return "boolean";
    case "set_enum":
      return "enum";
  }
};

const operationValue = (operation: ProgramPatchOperationV1): PatchValue =>
  operation.value;

const operationExpectedValue = (
  operation: ProgramPatchOperationV1,
): PatchValue | null => operation.expectedCurrentValue;

const operationUnit = (
  operation: ProgramPatchOperationV1,
): FabricationUnit | null => operation.unit;

const updatePanel = (
  panel: PanelBlueprintV1,
  property: readonly string[],
  value: number,
): PanelBlueprintV1 => {
  switch (property.join("/")) {
    case "widthMm":
      return { ...panel, widthMm: value };
    case "heightMm":
      return { ...panel, heightMm: value };
    case "flatTransform/translationMm/xMm":
      return {
        ...panel,
        flatTransform: {
          ...panel.flatTransform,
          translationMm: {
            ...panel.flatTransform.translationMm,
            xMm: value,
          },
        },
      };
    case "flatTransform/translationMm/yMm":
      return {
        ...panel,
        flatTransform: {
          ...panel.flatTransform,
          translationMm: {
            ...panel.flatTransform.translationMm,
            yMm: value,
          },
        },
      };
    case "flatTransform/rotationDeg":
      return {
        ...panel,
        flatTransform: { ...panel.flatTransform, rotationDeg: value },
      };
    default:
      return panel;
  }
};

const updateJoint = (
  joint: JointV1,
  property: string,
  value: number,
): JointV1 => {
  if (joint.kind === "prismatic") {
    switch (property) {
      case "homeTravelMm":
        return { ...joint, homeTravelMm: value };
      case "minTravelMm":
        return { ...joint, minTravelMm: value };
      case "maxTravelMm":
        return { ...joint, maxTravelMm: value };
      default:
        return joint;
    }
  }
  switch (property) {
    case "homeAngleDeg":
      return { ...joint, homeAngleDeg: value };
    case "minAngleDeg":
      return { ...joint, minAngleDeg: value };
    case "maxAngleDeg":
      return { ...joint, maxAngleDeg: value };
    default:
      return joint;
  }
};

const updateCoupling = (
  coupling: CouplingV1,
  property: string,
  value: number,
): CouplingV1 => {
  if (property === "ratio" && "ratio" in coupling) {
    return { ...coupling, ratio: value };
  }
  if (property === "offset" && coupling.kind === "direct_ratio") {
    return { ...coupling, offset: value };
  }
  if (property === "phaseOffsetDeg" && coupling.kind === "mirrored_pair") {
    return { ...coupling, phaseOffsetDeg: value };
  }
  if (property === "phaseOffsetMm" && coupling.kind === "cam_slot") {
    return { ...coupling, phaseOffsetMm: value };
  }
  return coupling;
};

const updateParameter = (
  parameter: ProgramParameterV1,
  value: PatchValue,
): ProgramParameterV1 => {
  switch (parameter.kind) {
    case "number":
      return typeof value === "number" ? { ...parameter, value } : parameter;
    case "integer":
      return typeof value === "number" ? { ...parameter, value } : parameter;
    case "boolean":
      return typeof value === "boolean" ? { ...parameter, value } : parameter;
    case "enum":
      return typeof value === "string" ? { ...parameter, value } : parameter;
  }
};

const updateModule = (
  programModule: ProgramModuleV1,
  parameterId: string,
  value: PatchValue,
): ProgramModuleV1 => ({
  ...programModule,
  parameters: programModule.parameters.map((parameter) =>
    parameter.parameterId === parameterId
      ? updateParameter(parameter, value)
      : parameter,
  ),
});

const writeTarget = (
  program: FabricationProgramV1,
  path: string,
  value: PatchValue,
): FabricationProgramV1 => {
  const tokens = tokensFor(path);
  const [root, collection, id, ...property] = tokens;
  if (root === "modules" && collection && id === "parameters") {
    const parameterId = property[0] ?? "";
    return {
      ...program,
      modules: program.modules.map((programModule) =>
        programModule.moduleId === collection
          ? updateModule(programModule, parameterId, value)
          : programModule,
      ),
    };
  }
  if (root !== "blueprint" || !collection || !id) return program;
  const numericValue = typeof value === "number" ? value : Number.NaN;
  switch (collection) {
    case "panels":
      return {
        ...program,
        blueprint: {
          ...program.blueprint,
          panels: program.blueprint.panels.map((panel) =>
            panel.panelId === id
              ? updatePanel(panel, property, numericValue)
              : panel,
          ),
        },
      };
    case "joints":
      return {
        ...program,
        blueprint: {
          ...program.blueprint,
          joints: program.blueprint.joints.map((joint) =>
            joint.jointId === id
              ? updateJoint(joint, property[0] ?? "", numericValue)
              : joint,
          ),
        },
      };
    case "connectors":
      return {
        ...program,
        blueprint: {
          ...program.blueprint,
          connectors: program.blueprint.connectors.map((connector) => {
            if (connector.connectorId !== id) return connector;
            if (property[0] === "clearanceMm") {
              return { ...connector, clearanceMm: numericValue };
            }
            return property[0] === "widthMm" && connector.kind === "slot"
              ? { ...connector, widthMm: numericValue }
              : connector;
          }),
        },
      };
    case "driver":
      return program.blueprint.driver?.driverId === id
        ? {
            ...program,
            blueprint: {
              ...program.blueprint,
              driver: {
                ...program.blueprint.driver,
                ...(property[0] === "minimumValue"
                  ? { minimumValue: numericValue }
                  : property[0] === "maximumValue"
                    ? { maximumValue: numericValue }
                    : { homeValue: numericValue }),
              },
            },
          }
        : program;
    case "outputs":
      return {
        ...program,
        blueprint: {
          ...program.blueprint,
          outputs: program.blueprint.outputs.map((output) =>
            output.outputId !== id
              ? output
              : property[0] === "minimumValue"
                ? { ...output, minimumValue: numericValue }
                : { ...output, maximumValue: numericValue },
          ),
        },
      };
    case "couplings":
      return {
        ...program,
        blueprint: {
          ...program.blueprint,
          couplings: program.blueprint.couplings.map((coupling) =>
            coupling.couplingId === id
              ? updateCoupling(coupling, property[0] ?? "", numericValue)
              : coupling,
          ),
        },
      };
    default:
      return program;
  }
};

const validateOperation = (
  operation: ProgramPatchOperationV1,
  target: PatchTarget,
): ProgramPatchError | null => {
  const kind = operationKind(operation);
  if (kind !== target.kind) {
    return {
      id: "patch.type",
      path: operation.path,
      expected: target.kind,
      actual: kind,
    };
  }
  const expectedValue = operationExpectedValue(operation);
  if (expectedValue !== null && expectedValue !== target.value) {
    return {
      id: "patch.expected_value",
      path: operation.path,
      expected: expectedValue,
      actual: target.value,
    };
  }
  const suppliedUnit = operationUnit(operation);
  if (suppliedUnit !== null && suppliedUnit !== target.unit) {
    return {
      id: "patch.unit",
      path: operation.path,
      expected: target.unit,
      actual: suppliedUnit,
    };
  }
  return null;
};

export const repairInputHash = (
  program: FabricationProgramV1,
  report: VerificationReportV2,
): string =>
  sha256Hex(
    canonicalSerialize({
      program,
      report: {
        reportId: report.reportId,
        irHash: report.irHash,
        failures: report.failures,
      },
    }),
  );

export const applyProgramPatch = (
  programInput: FabricationProgramV1,
  patchInput: unknown,
  report: VerificationReportV2,
): Result<FabricationProgramV1, ProgramPatchError> => {
  const parsedProgram = FabricationProgramV1Schema.safeParse(programInput);
  if (!parsedProgram.success) {
    return err({
      id: "patch.program",
      message: parsedProgram.error.issues[0]?.message ?? "Program is invalid.",
    });
  }
  const parsedPatch = ProgramPatchV1Schema.safeParse(patchInput);
  if (!parsedPatch.success) {
    return err({
      id: "patch.schema",
      message: parsedPatch.error.issues[0]?.message ?? "Patch is invalid.",
    });
  }
  const patch: ProgramPatchV1 = parsedPatch.data;
  let program: FabricationProgramV1 = parsedProgram.data;
  if (patch.programId !== program.programId) {
    return err({
      id: "patch.program",
      message: "Patch program ID does not match.",
    });
  }
  if (patch.baseProgramHash !== fabricationProgramHash(program)) {
    return err({ id: "patch.hash", message: "Patch base hash is stale." });
  }
  const seenPaths = new Set<string>();
  const failuresById = new Map(
    report.failures.map((failure) => [failure.failureId, failure]),
  );
  for (const operation of patch.operations) {
    if (seenPaths.has(operation.path)) {
      return err({ id: "patch.duplicate", path: operation.path });
    }
    seenPaths.add(operation.path);
    const referencedFailures = operation.failureIds.map((failureId) => ({
      failureId,
      failure: failuresById.get(failureId),
    }));
    const missingFailure = referencedFailures.find((item) => !item.failure);
    if (missingFailure) {
      return err({
        id: "patch.failure_reference",
        failureId: missingFailure.failureId,
      });
    }
    const grounded = referencedFailures.some((item) =>
      item.failure?.repairableProgramPaths.includes(operation.path),
    );
    if (!grounded) return err({ id: "patch.ungrounded", path: operation.path });

    const target = readTarget(program, operation.path);
    if (!target) return err({ id: "patch.path", path: operation.path });
    const validationError = validateOperation(operation, target);
    if (validationError) return err(validationError);
    program = writeTarget(program, operation.path, operationValue(operation));
  }
  const reparsed = FabricationProgramV1Schema.safeParse(program);
  if (!reparsed.success) {
    return err({
      id: "patch.schema",
      message:
        reparsed.error.issues[0]?.message ??
        "Patched program violates the strict schema.",
    });
  }
  return ok(reparsed.data);
};
