import { describe, expect, it } from "vitest";

import { fabricationProgramHash } from "@/core/fabrication/compiler";
import {
  createModularCableOrganizerShowcase,
  createPullTabPopUpFlowerShowcase,
} from "@/core/fabrication/examples";
import { applyProgramPatch } from "@/core/fabrication/repair";
import type {
  CouplingV1,
  FabricationProgramV1,
  ProgramPatchOperationV1,
  ProgramPatchV1,
  VerificationReportV2,
} from "@/core/fabrication/types";
import { fixtureProgram } from "../../fixtures/fabrication";

const FAILURE_ID = "packing.repairable#target";

const reportFor = (paths: readonly string[]): VerificationReportV2 => ({
  version: "2",
  reportId: "report-repair-paths",
  candidateId: "candidate-repair-paths",
  programId: "program-repair-paths",
  irId: "ir:00000000000000000000000000000000",
  irHash: "0".repeat(64),
  valid: false,
  completedStage: "sheet_packing",
  failedAtStage: "sheet_packing",
  checks: [],
  failures: [
    {
      failureId: FAILURE_ID,
      category: "manufacturability",
      stage: "sheet_packing",
      severity: "hard",
      message: "Targeted repair fixture.",
      actual: { value: false, unit: null },
      expected: { value: true, unit: null },
      geometryRefs: [],
      repairableProgramPaths: paths,
    },
  ],
  metrics: [],
  motionSummary: null,
  exportEquivalence: [],
});

const patchFor = (
  program: FabricationProgramV1,
  operation: ProgramPatchOperationV1,
): ProgramPatchV1 => ({
  version: "1",
  patchId: `patch-${operation.operationId}`,
  programId: program.programId,
  baseProgramHash: fabricationProgramHash(program),
  repairCycle: 1,
  diagnosis: "Exercise one allowlisted typed target.",
  operations: [operation],
  authoredBy: "code",
  changesIntent: false,
});

const numberOperation = (
  path: string,
  expectedCurrentValue: number | null,
  value: number,
  unit: ProgramPatchOperationV1 extends { unit: infer Unit } ? Unit : never,
): ProgramPatchOperationV1 => ({
  operationId: `number-${path.replaceAll("/", "-")}`,
  operation: "set_number",
  path,
  value,
  expectedCurrentValue,
  unit,
  failureIds: [FAILURE_ID],
  reason: "Exercise the numeric target.",
  expectedEffect: "The exact value changes.",
});

interface NumberPathCase {
  readonly label: string;
  readonly program: () => FabricationProgramV1;
  readonly path: string;
  readonly current: number;
  readonly next: number;
  readonly unit: "mm" | "deg" | "ratio";
  readonly read: (program: FabricationProgramV1) => number | undefined;
}

const basePanel = (program: FabricationProgramV1) =>
  program.blueprint.panels.find((panel) => panel.panelId === "panel-base");

const wingJoint = (program: FabricationProgramV1) =>
  program.blueprint.joints.find((joint) => joint.jointId === "joint-wing");

const NUMBER_PATHS: readonly NumberPathCase[] = [
  {
    label: "panel width",
    program: fixtureProgram,
    path: "/blueprint/panels/panel-base/widthMm",
    current: 80,
    next: 78,
    unit: "mm",
    read: (program) => basePanel(program)?.widthMm,
  },
  {
    label: "panel height",
    program: fixtureProgram,
    path: "/blueprint/panels/panel-base/heightMm",
    current: 60,
    next: 58,
    unit: "mm",
    read: (program) => basePanel(program)?.heightMm,
  },
  {
    label: "panel x translation",
    program: fixtureProgram,
    path: "/blueprint/panels/panel-base/flatTransform/translationMm/xMm",
    current: 80,
    next: 82,
    unit: "mm",
    read: (program) => basePanel(program)?.flatTransform.translationMm.xMm,
  },
  {
    label: "panel y translation",
    program: fixtureProgram,
    path: "/blueprint/panels/panel-base/flatTransform/translationMm/yMm",
    current: 90,
    next: 92,
    unit: "mm",
    read: (program) => basePanel(program)?.flatTransform.translationMm.yMm,
  },
  {
    label: "panel rotation",
    program: fixtureProgram,
    path: "/blueprint/panels/panel-base/flatTransform/rotationDeg",
    current: 0,
    next: 5,
    unit: "deg",
    read: (program) => basePanel(program)?.flatTransform.rotationDeg,
  },
  {
    label: "fold home",
    program: fixtureProgram,
    path: "/blueprint/joints/joint-wing/homeAngleDeg",
    current: 0,
    next: 5,
    unit: "deg",
    read: (program) => {
      const joint = wingJoint(program);
      return joint?.kind === "prismatic" ? undefined : joint?.homeAngleDeg;
    },
  },
  {
    label: "fold minimum",
    program: fixtureProgram,
    path: "/blueprint/joints/joint-wing/minAngleDeg",
    current: 0,
    next: 2,
    unit: "deg",
    read: (program) => {
      const joint = wingJoint(program);
      return joint?.kind === "prismatic" ? undefined : joint?.minAngleDeg;
    },
  },
  {
    label: "fold maximum",
    program: fixtureProgram,
    path: "/blueprint/joints/joint-wing/maxAngleDeg",
    current: 90,
    next: 88,
    unit: "deg",
    read: (program) => {
      const joint = wingJoint(program);
      return joint?.kind === "prismatic" ? undefined : joint?.maxAngleDeg;
    },
  },
  ...(["homeTravelMm", "minTravelMm", "maxTravelMm"] as const).map(
    (property): NumberPathCase => ({
      label: `prismatic ${property}`,
      program: () => createPullTabPopUpFlowerShowcase().program,
      path: `/blueprint/joints/joint-flower-lift/${property}`,
      current: property === "maxTravelMm" ? 30 : 0,
      next: property === "maxTravelMm" ? 29 : 1,
      unit: "mm",
      read: (program) => {
        const joint = program.blueprint.joints.find(
          (item) => item.jointId === "joint-flower-lift",
        );
        return joint?.kind === "prismatic" ? joint[property] : undefined;
      },
    }),
  ),
  ...(["minimumValue", "maximumValue", "homeValue"] as const).map(
    (property): NumberPathCase => ({
      label: `driver ${property}`,
      program: fixtureProgram,
      path: `/blueprint/driver/driver-wing/${property}`,
      current: property === "maximumValue" ? 90 : 0,
      next: property === "maximumValue" ? 88 : 2,
      unit: "deg",
      read: (program) => program.blueprint.driver?.[property],
    }),
  ),
  ...(["minimumValue", "maximumValue"] as const).map(
    (property): NumberPathCase => ({
      label: `output ${property}`,
      program: fixtureProgram,
      path: `/blueprint/outputs/output-wing/${property}`,
      current: property === "maximumValue" ? 90 : 0,
      next: property === "maximumValue" ? 88 : 2,
      unit: "deg",
      read: (program) => program.blueprint.outputs[0]?.[property],
    }),
  ),
  {
    label: "direct coupling ratio",
    program: fixtureProgram,
    path: "/blueprint/couplings/coupling-wing/ratio",
    current: 1,
    next: 0.9,
    unit: "ratio",
    read: (program) => {
      const coupling = program.blueprint.couplings[0];
      return coupling && "ratio" in coupling ? coupling.ratio : undefined;
    },
  },
  {
    label: "direct coupling offset",
    program: fixtureProgram,
    path: "/blueprint/couplings/coupling-wing/offset",
    current: 0,
    next: 2,
    unit: "deg",
    read: (program) => {
      const coupling = program.blueprint.couplings[0];
      return coupling?.kind === "direct_ratio" ? coupling.offset : undefined;
    },
  },
];

describe("fabrication patch path coverage", () => {
  it.each(NUMBER_PATHS)("updates $label", (testCase) => {
    const program = testCase.program();
    const operation = numberOperation(
      testCase.path,
      testCase.current,
      testCase.next,
      testCase.unit,
    );
    const result = applyProgramPatch(
      program,
      patchFor(program, operation),
      reportFor([testCase.path]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(testCase.read(result.value)).toBe(testCase.next);
  });

  it("updates connector clearance and slot width targets", () => {
    const program = createModularCableOrganizerShowcase().program;
    const paths = [
      "/blueprint/connectors/connector-organizer-tab/clearanceMm",
      "/blueprint/connectors/connector-organizer-slot/clearanceMm",
      "/blueprint/connectors/connector-organizer-slot/widthMm",
    ] as const;
    const current = [0.4, 0.4, 3] as const;
    const next = [0.5, 0.5, 3.2] as const;
    for (const [index, path] of paths.entries()) {
      const operation = numberOperation(
        path,
        current[index] ?? null,
        next[index] ?? 0,
        "mm",
      );
      const result = applyProgramPatch(
        program,
        patchFor(program, operation),
        reportFor([path]),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        const connector = result.value.blueprint.connectors.find((item) =>
          path.includes(item.connectorId),
        );
        expect(
          path.endsWith("widthMm") && connector?.kind === "slot"
            ? connector.widthMm
            : connector?.clearanceMm,
        ).toBe(next[index]);
      }
    }
  });

  it("updates number, integer, boolean, and enum module parameters", () => {
    const base = fixtureProgram();
    const program: FabricationProgramV1 = {
      ...base,
      modules: [
        {
          moduleId: "module-tuning",
          registryId: "test.tuning",
          registryVersion: 1,
          kind: "panel_layout",
          label: "Typed tuning parameters",
          parameters: [
            {
              parameterId: "length",
              kind: "number",
              value: 10,
              unit: "mm",
              minimum: 1,
              maximum: 20,
            },
            {
              parameterId: "count",
              kind: "integer",
              value: 2,
              unit: "count",
              minimum: 1,
              maximum: 5,
            },
            {
              parameterId: "enabled",
              kind: "boolean",
              value: false,
              unit: null,
              minimum: null,
              maximum: null,
            },
            {
              parameterId: "mode",
              kind: "enum",
              value: "compact",
              allowedValues: ["compact", "wide"],
              unit: null,
            },
          ],
          ports: [],
          semanticPartIds: [],
        },
        {
          moduleId: "module-unrelated",
          registryId: "test.unrelated",
          registryVersion: 1,
          kind: "panel_layout",
          label: "Unrelated module",
          parameters: [],
          ports: [],
          semanticPartIds: [],
        },
      ],
    };
    const operations: readonly ProgramPatchOperationV1[] = [
      numberOperation(
        "/modules/module-tuning/parameters/length/value",
        10,
        12,
        "mm",
      ),
      {
        operationId: "integer-count",
        operation: "set_integer",
        path: "/modules/module-tuning/parameters/count/value",
        value: 3,
        expectedCurrentValue: 2,
        unit: "count",
        failureIds: [FAILURE_ID],
        reason: "Increase the count.",
        expectedEffect: "The count becomes three.",
      },
      {
        operationId: "boolean-enabled",
        operation: "set_boolean",
        path: "/modules/module-tuning/parameters/enabled/value",
        value: true,
        expectedCurrentValue: false,
        unit: null,
        failureIds: [FAILURE_ID],
        reason: "Enable the option.",
        expectedEffect: "The option becomes enabled.",
      },
    ];
    const paths = operations.map((operation) => operation.path);
    const patch: ProgramPatchV1 = {
      ...patchFor(program, operations[0]!),
      operations,
    };
    const applied = applyProgramPatch(program, patch, reportFor(paths));
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(
      applied.value.modules[0]?.parameters.map((parameter) => parameter.value),
    ).toEqual([12, 3, true, "compact"]);

    const enumOperation: ProgramPatchOperationV1 = {
      operationId: "enum-mode",
      operation: "set_enum",
      path: "/modules/module-tuning/parameters/mode/value",
      value: "wide",
      expectedCurrentValue: "compact",
      unit: null,
      failureIds: [FAILURE_ID],
      reason: "Choose the wide mode.",
      expectedEffect: "The mode becomes wide.",
    };
    const enumResult = applyProgramPatch(
      program,
      patchFor(program, enumOperation),
      reportFor([enumOperation.path]),
    );
    expect(enumResult.ok).toBe(true);
    if (enumResult.ok) {
      expect(enumResult.value.modules[0]?.parameters[3]?.value).toBe("wide");
    }
  });

  it.each([
    {
      coupling: {
        couplingId: "coupling-wing",
        kind: "mirrored_pair",
        inputJointId: "joint-wing",
        leftOutputJointId: "joint-wing",
        rightOutputJointId: "joint-wing",
        ratio: 1,
        phaseOffsetDeg: 0,
      } satisfies CouplingV1,
      property: "phaseOffsetDeg",
      unit: "deg" as const,
    },
    {
      coupling: {
        couplingId: "coupling-wing",
        kind: "pull_tab",
        driverId: "driver-wing",
        sliderJointId: "joint-wing",
        outputJointIds: ["joint-wing"],
        ratio: 1,
      } satisfies CouplingV1,
      property: "ratio",
      unit: "ratio" as const,
    },
    {
      coupling: {
        couplingId: "coupling-wing",
        kind: "cam_slot",
        driverId: "driver-wing",
        slotConnectorId: "slot-wing",
        followerConnectorId: "tab-wing",
        outputJointId: "joint-wing",
        branch: "positive",
        phaseOffsetMm: 0,
      } satisfies CouplingV1,
      property: "phaseOffsetMm",
      unit: "mm" as const,
    },
  ])(
    "updates $coupling.kind coupling properties",
    ({ coupling, property, unit }) => {
      const base = fixtureProgram();
      const program: FabricationProgramV1 = {
        ...base,
        blueprint: { ...base.blueprint, couplings: [coupling] },
      };
      const path = `/blueprint/couplings/coupling-wing/${property}`;
      const operation = numberOperation(
        path,
        property === "ratio" ? 1 : 0,
        0.5,
        unit,
      );
      const result = applyProgramPatch(
        program,
        patchFor(program, operation),
        reportFor([path]),
      );
      expect(result.ok).toBe(true);
    },
  );

  it("covers typed rejection and post-update schema failures", () => {
    const program = fixtureProgram();
    const path = "/blueprint/panels/panel-base/widthMm";
    const wrongType: ProgramPatchOperationV1 = {
      operationId: "wrong-type",
      operation: "set_boolean",
      path,
      value: true,
      expectedCurrentValue: null,
      unit: null,
      failureIds: [FAILURE_ID],
      reason: "Wrong type fixture.",
      expectedEffect: "Must be rejected.",
    };
    expect(
      applyProgramPatch(
        program,
        patchFor(program, wrongType),
        reportFor([path]),
      ),
    ).toMatchObject({ ok: false, error: { id: "patch.type" } });

    const invalidWidth = numberOperation(path, null, -1, null);
    expect(
      applyProgramPatch(
        program,
        patchFor(program, invalidWidth),
        reportFor([path]),
      ),
    ).toMatchObject({ ok: false, error: { id: "patch.schema" } });

    const invalidProgram = {
      ...program,
      sheets: [],
    } as unknown as FabricationProgramV1;
    expect(
      applyProgramPatch(
        invalidProgram,
        patchFor(program, numberOperation(path, 80, 79, "mm")),
        reportFor([path]),
      ),
    ).toMatchObject({ ok: false, error: { id: "patch.program" } });
  });

  it.each([
    "/modules/missing/parameters/value/value",
    "/blueprint/panels/panel-base/missing",
    "/blueprint/joints/joint-wing/missing",
    "/blueprint/connectors/missing/clearanceMm",
    "/blueprint/driver/missing/minimumValue",
    "/blueprint/outputs/missing/minimumValue",
    "/blueprint/couplings/coupling-wing/missing",
    "/blueprint/unknown/id/value",
  ])("rejects unknown allowlist path %s", (path) => {
    const program = fixtureProgram();
    const operation = numberOperation(path, null, 1, null);
    expect(
      applyProgramPatch(
        program,
        patchFor(program, operation),
        reportFor([path]),
      ),
    ).toMatchObject({ ok: false, error: { id: "patch.path" } });
  });

  it("rejects existing identifiers with unsupported target properties", () => {
    const rejectPath = (program: FabricationProgramV1, path: string) => {
      const operation = numberOperation(path, null, 1, null);
      expect(
        applyProgramPatch(
          program,
          patchFor(program, operation),
          reportFor([path]),
        ),
      ).toMatchObject({ ok: false, error: { id: "patch.path" } });
    };

    const base = fixtureProgram();
    rejectPath(base, "/blueprint/joints/joint-wing/homeAngleDeg/unexpected");
    rejectPath(base, "/blueprint/driver/driver-wing/unexpected");
    rejectPath(base, "/blueprint/outputs/output-wing/unexpected");
    rejectPath(base, "/blueprint/couplings/coupling-wing/phaseOffsetDeg");
    rejectPath(base, "/blueprint/couplings/coupling-wing/offset/unexpected");

    const organizer = createModularCableOrganizerShowcase().program;
    rejectPath(
      organizer,
      "/blueprint/connectors/connector-organizer-tab/widthMm",
    );

    for (const [coupling, property] of [
      [
        {
          couplingId: "coupling-wing",
          kind: "mirrored_pair",
          inputJointId: "joint-wing",
          leftOutputJointId: "joint-wing",
          rightOutputJointId: "joint-wing",
          ratio: 1,
          phaseOffsetDeg: 0,
        } satisfies CouplingV1,
        "offset",
      ],
      [
        {
          couplingId: "coupling-wing",
          kind: "cam_slot",
          driverId: "driver-wing",
          slotConnectorId: "slot-wing",
          followerConnectorId: "tab-wing",
          outputJointId: "joint-wing",
          branch: "positive",
          phaseOffsetMm: 0,
        } satisfies CouplingV1,
        "ratio",
      ],
      [
        {
          couplingId: "coupling-wing",
          kind: "pull_tab",
          driverId: "driver-wing",
          sliderJointId: "joint-wing",
          outputJointIds: ["joint-wing"],
          ratio: 1,
        } satisfies CouplingV1,
        "phaseOffsetMm",
      ],
    ] as const) {
      rejectPath(
        {
          ...base,
          blueprint: { ...base.blueprint, couplings: [coupling] },
        },
        `/blueprint/couplings/coupling-wing/${property}`,
      );
    }
  });
});
