import { describe, expect, it } from "vitest";

import { compileFabricationProgram } from "@/core/fabrication/compiler";
import type {
  FabricationIntentV1,
  FabricationProgramV1,
  ProgramConnectionV1,
  ProgramModuleV1,
} from "@/core/fabrication/types";
import {
  fixtureIntent,
  fixtureProgram,
  fixtureSheet,
} from "../../fixtures/fabrication";

const modulePair = (): {
  readonly modules: readonly [ProgramModuleV1, ProgramModuleV1];
  readonly connection: ProgramConnectionV1;
} => ({
  modules: [
    {
      moduleId: "module-source",
      registryId: "test.source",
      registryVersion: 1,
      kind: "panel_layout",
      label: "Source",
      parameters: [
        {
          parameterId: "size",
          kind: "number",
          value: 10,
          unit: "mm",
          minimum: 1,
          maximum: 20,
        },
      ],
      ports: [{ portId: "body-out", kind: "body", direction: "output" }],
      semanticPartIds: [],
    },
    {
      moduleId: "module-target",
      registryId: "test.target",
      registryVersion: 1,
      kind: "fold_structure",
      label: "Target",
      parameters: [],
      ports: [{ portId: "body-in", kind: "body", direction: "input" }],
      semanticPartIds: [],
    },
  ],
  connection: {
    connectionId: "connection-source-target",
    fromModuleId: "module-source",
    fromPortId: "body-out",
    toModuleId: "module-target",
    toPortId: "body-in",
  },
});

const compileWithModules = (
  mutate: (
    modules: readonly ProgramModuleV1[],
    connections: readonly ProgramConnectionV1[],
  ) => Pick<FabricationProgramV1, "modules" | "connections">,
) => {
  const pair = modulePair();
  const program = fixtureProgram();
  const changed = mutate(pair.modules, [pair.connection]);
  return compileFabricationProgram(fixtureIntent(), {
    ...program,
    ...changed,
  });
};

describe("fabrication compiler fail-closed boundaries", () => {
  it.each([
    {
      scopeStatus: "needs_clarification" as const,
      clarificationQuestion: "Which sheet size?",
      unsupportedReason: null,
      reason: "Which sheet size?",
    },
    {
      scopeStatus: "unsupported" as const,
      clarificationQuestion: null,
      unsupportedReason: "The request needs an unsupported material model.",
      reason: "The request needs an unsupported material model.",
    },
  ])("returns the grounded blocked-intent reason", (change) => {
    const { reason, ...intentChange } = change;
    const intent: FabricationIntentV1 = {
      ...fixtureIntent(),
      ...intentChange,
    };
    expect(compileFabricationProgram(intent, fixtureProgram())).toMatchObject({
      ok: false,
      error: { kind: "unsupported_fabrication", reason },
    });
  });

  it("rejects behavior, sheet, panel, mechanism, cut, and stock drift", () => {
    const intent = fixtureIntent();
    const program = fixtureProgram();
    expect(
      compileFabricationProgram(intent, { ...program, behavior: "rotate" }),
    ).toMatchObject({
      ok: false,
      error: { kind: "contract_validation", contract: "FabricationProgramV1" },
    });

    const secondSheet = { ...fixtureSheet(), sheetId: "sheet-b" };
    expect(
      compileFabricationProgram(
        {
          ...intent,
          stockOptions: [...intent.stockOptions, secondSheet],
          fabricationBudget: {
            ...intent.fabricationBudget,
            maximumSheets: 1,
          },
        },
        { ...program, sheets: [...program.sheets, secondSheet] },
      ),
    ).toMatchObject({
      ok: false,
      error: { kind: "limit_exceeded", limit: "intent.maximumSheets" },
    });
    expect(
      compileFabricationProgram(
        {
          ...intent,
          fabricationBudget: {
            ...intent.fabricationBudget,
            maximumJointAndConnectorCount: 0,
          },
        },
        program,
      ),
    ).toMatchObject({
      ok: false,
      error: {
        kind: "limit_exceeded",
        limit: "intent.maximumJointAndConnectorCount",
      },
    });
    expect(
      compileFabricationProgram(
        {
          ...intent,
          fabricationBudget: {
            ...intent.fabricationBudget,
            cutsAllowed: false,
          },
        },
        program,
      ),
    ).toMatchObject({ ok: false, error: { kind: "contract_validation" } });
    expect(
      compileFabricationProgram(intent, {
        ...program,
        sheets: [
          {
            ...program.sheets[0]!,
            material: {
              ...program.sheets[0]!.material,
              thicknessMm: 0.31,
            },
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: { kind: "invalid_reference", referenceKind: "stock_option" },
    });
  });

  it.each([
    {
      label: "duplicate module",
      mutate: (
        modules: readonly ProgramModuleV1[],
        connections: readonly ProgramConnectionV1[],
      ) => ({
        modules: [modules[0]!, modules[0]!],
        connections,
      }),
      kind: "contract_validation",
    },
    {
      label: "duplicate connection",
      mutate: (
        modules: readonly ProgramModuleV1[],
        connections: readonly ProgramConnectionV1[],
      ) => ({
        modules,
        connections: [connections[0]!, connections[0]!],
      }),
      kind: "contract_validation",
    },
    {
      label: "missing target module",
      mutate: (
        modules: readonly ProgramModuleV1[],
        connections: readonly ProgramConnectionV1[],
      ) => ({
        modules,
        connections: [{ ...connections[0]!, toModuleId: "module-missing" }],
      }),
      kind: "invalid_reference",
    },
    {
      label: "missing source port",
      mutate: (
        modules: readonly ProgramModuleV1[],
        connections: readonly ProgramConnectionV1[],
      ) => ({
        modules,
        connections: [{ ...connections[0]!, fromPortId: "port-missing" }],
      }),
      kind: "invalid_reference",
    },
    {
      label: "missing target port",
      mutate: (
        modules: readonly ProgramModuleV1[],
        connections: readonly ProgramConnectionV1[],
      ) => ({
        modules,
        connections: [{ ...connections[0]!, toPortId: "port-missing" }],
      }),
      kind: "invalid_reference",
    },
    {
      label: "incompatible port kind",
      mutate: (
        modules: readonly ProgramModuleV1[],
        connections: readonly ProgramConnectionV1[],
      ) => ({
        modules: [
          modules[0]!,
          {
            ...modules[1]!,
            ports: [
              {
                portId: "body-in",
                kind: "joint" as const,
                direction: "input" as const,
              },
            ],
          },
        ],
        connections,
      }),
      kind: "contract_validation",
    },
    {
      label: "backwards source direction",
      mutate: (
        modules: readonly ProgramModuleV1[],
        connections: readonly ProgramConnectionV1[],
      ) => ({
        modules: [
          {
            ...modules[0]!,
            ports: [
              {
                portId: "body-out",
                kind: "body" as const,
                direction: "input" as const,
              },
            ],
          },
          modules[1]!,
        ],
        connections,
      }),
      kind: "contract_validation",
    },
  ])("rejects $label", ({ mutate, kind }) => {
    expect(compileWithModules(mutate)).toMatchObject({
      ok: false,
      error: { kind },
    });
  });

  it("rejects duplicate ports, parameters, constraints, and unknown semantic parts", () => {
    const pair = modulePair();
    const source = pair.modules[0];
    if (!source) throw new Error("Source module missing.");
    const base = fixtureProgram();
    const variants: readonly FabricationProgramV1[] = [
      {
        ...base,
        modules: [{ ...source, ports: [source.ports[0]!, source.ports[0]!] }],
      },
      {
        ...base,
        modules: [
          {
            ...source,
            parameters: [source.parameters[0]!, source.parameters[0]!],
          },
        ],
      },
      {
        ...base,
        semanticConstraints: [
          {
            constraintId: "constraint-repeat",
            kind: "dimension",
            hard: true,
            source: "program",
            geometryRef: { kind: "panel", id: "panel-base" },
            dimension: "width",
            minimumMm: 1,
            maximumMm: null,
            targetMm: null,
            toleranceMm: null,
          },
          {
            constraintId: "constraint-repeat",
            kind: "dimension",
            hard: false,
            source: "program",
            geometryRef: { kind: "panel", id: "panel-base" },
            dimension: "width",
            minimumMm: null,
            maximumMm: 100,
            targetMm: null,
            toleranceMm: null,
          },
        ],
      },
      {
        ...base,
        modules: [{ ...source, semanticPartIds: ["part-missing"] }],
      },
    ];
    for (const program of variants) {
      expect(compileFabricationProgram(fixtureIntent(), program).ok).toBe(
        false,
      );
    }
  });

  it("rejects a program that weakens an intent constraint", () => {
    const constraint = {
      constraintId: "constraint-user-width",
      kind: "dimension" as const,
      hard: true,
      source: "user" as const,
      geometryRef: { kind: "panel" as const, id: "panel-base" },
      dimension: "width" as const,
      minimumMm: 60,
      maximumMm: null,
      targetMm: null,
      toleranceMm: null,
    };
    expect(
      compileFabricationProgram(
        { ...fixtureIntent(), semanticConstraints: [constraint] },
        {
          ...fixtureProgram(),
          semanticConstraints: [{ ...constraint, hard: false }],
        },
      ),
    ).toMatchObject({ ok: false, error: { kind: "contract_validation" } });
  });

  it("rejects missing fold bodies, panels, connector panels, and duplicate derived paths", () => {
    const program = fixtureProgram();
    const joint = program.blueprint.joints[0]!;
    const connector = {
      connectorId: "connector-missing-panel",
      kind: "slot" as const,
      panelId: "panel-missing",
      mateConnectorId: "connector-mate",
      centerline: {
        start: { xMm: 0, yMm: 0 },
        end: { xMm: 10, yMm: 0 },
      },
      widthMm: 2,
      insertionDirection: { x: 1, y: 0, z: 0 },
      clearanceMm: 0.4,
    };
    const variants = [
      {
        ...program,
        blueprint: {
          ...program.blueprint,
          joints: [{ ...joint, parentBodyId: "body-missing" }],
        },
      },
      {
        ...program,
        blueprint: {
          ...program.blueprint,
          bodies: program.blueprint.bodies.map((body) =>
            body.bodyId === joint.parentBodyId
              ? { ...body, panelIds: ["panel-missing"] }
              : body,
          ),
        },
      },
      {
        ...program,
        blueprint: { ...program.blueprint, connectors: [connector] },
      },
      {
        ...program,
        blueprint: {
          ...program.blueprint,
          joints: [{ ...joint, creasePathId: "panel-base.cut.edge-1" }],
        },
      },
    ] as const;
    for (const variant of variants) {
      expect(compileFabricationProgram(fixtureIntent(), variant).ok).toBe(
        false,
      );
    }
  });

  it("deterministically compiles a zero-length slot contour for later verification", () => {
    const showcase = createZeroLengthSlotProgram();
    const result = compileFabricationProgram(showcase.intent, showcase.program);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const path = result.value.paths.find(
        (item) => item.pathId === "slot-zero.cut",
      );
      expect(
        new Set(path?.points.map((point) => `${point.xMm},${point.yMm}`)).size,
      ).toBe(1);
    }
  });
});

const createZeroLengthSlotProgram = (): {
  readonly intent: FabricationIntentV1;
  readonly program: FabricationProgramV1;
} => {
  const intent = fixtureIntent();
  const program = fixtureProgram();
  const slot = {
    connectorId: "slot-zero",
    kind: "slot" as const,
    panelId: "panel-base",
    mateConnectorId: "tab-zero",
    centerline: {
      start: { xMm: 10, yMm: 10 },
      end: { xMm: 10, yMm: 10 },
    },
    widthMm: 2,
    insertionDirection: { x: 1, y: 0, z: 0 },
    clearanceMm: 0.4,
  };
  const tab = {
    connectorId: "tab-zero",
    kind: "tab" as const,
    panelId: "panel-base",
    mateConnectorId: "slot-zero",
    contour: {
      vertices: [
        { xMm: 0, yMm: 0 },
        { xMm: 2, yMm: 0 },
        { xMm: 1, yMm: 2 },
      ],
    },
    rootEdge: {
      start: { xMm: 0, yMm: 0 },
      end: { xMm: 2, yMm: 0 },
    },
    insertionDirection: { x: 1, y: 0, z: 0 },
    clearanceMm: 0.4,
  };
  return {
    intent,
    program: {
      ...program,
      blueprint: { ...program.blueprint, connectors: [slot, tab] },
    },
  };
};
