import { describe, expect, it } from "vitest";

import { compileFabricationProgram } from "@/core/fabrication/compiler";
import { createFacetedDuckGiftBoxShowcase } from "@/core/fabrication/examples";
import { evaluateMotionState } from "@/core/fabrication/kinematics";
import type {
  CouplingV1,
  FabricationIRV1,
  JointV1,
} from "@/core/fabrication/types";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

const fixtureIr = (): FabricationIRV1 => {
  const result = compileFabricationProgram(fixtureIntent(), fixtureProgram());
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

const irWithCoupling = (coupling: CouplingV1): FabricationIRV1 => {
  const ir = fixtureIr();
  const joint = ir.joints[0];
  if (!joint || joint.kind === "prismatic")
    throw new Error("Fold fixture missing.");
  return {
    ...ir,
    joints: [{ ...joint, minAngleDeg: -180, maxAngleDeg: 180 }],
    couplings: [coupling],
  };
};

describe("fabrication kinematic boundary cases", () => {
  it.each([
    {
      label: "direct ratio",
      coupling: {
        couplingId: "coupling-ratio",
        kind: "direct_ratio",
        inputJointId: "joint-wing",
        outputJointIds: ["joint-wing"],
        ratio: 0.5,
        offset: 2,
        offsetUnit: "deg",
      } satisfies CouplingV1,
      expected: 12,
    },
    {
      label: "mirrored pair",
      coupling: {
        couplingId: "coupling-mirror",
        kind: "mirrored_pair",
        inputJointId: "joint-wing",
        leftOutputJointId: "joint-wing",
        rightOutputJointId: "joint-wing",
        ratio: 1,
        phaseOffsetDeg: 5,
      } satisfies CouplingV1,
      expected: -15,
    },
    {
      label: "pull tab",
      coupling: {
        couplingId: "coupling-pull",
        kind: "pull_tab",
        driverId: "driver-wing",
        sliderJointId: "joint-wing",
        outputJointIds: ["joint-wing"],
        ratio: 0.5,
      } satisfies CouplingV1,
      expected: 10,
    },
    {
      label: "cam slot",
      coupling: {
        couplingId: "coupling-cam",
        kind: "cam_slot",
        driverId: "driver-wing",
        slotConnectorId: "slot-wing",
        followerConnectorId: "tab-wing",
        outputJointId: "joint-wing",
        branch: "negative",
        phaseOffsetMm: 3,
      } satisfies CouplingV1,
      expected: -23,
    },
    {
      label: "positive cam slot",
      coupling: {
        couplingId: "coupling-cam-positive",
        kind: "cam_slot",
        driverId: "driver-wing",
        slotConnectorId: "slot-wing",
        followerConnectorId: "tab-wing",
        outputJointId: "joint-wing",
        branch: "positive",
        phaseOffsetMm: 3,
      } satisfies CouplingV1,
      expected: 23,
    },
  ])("evaluates a $label coupling", ({ coupling, expected }) => {
    const result = evaluateMotionState(irWithCoupling(coupling), 20);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.jointValues["joint-wing"]).toBe(expected);
  });

  it("reports unresolved driver and coupling joint references", () => {
    const ir = fixtureIr();
    expect(
      evaluateMotionState({
        ...ir,
        driver: ir.driver ? { ...ir.driver, jointId: "joint-missing" } : null,
      }),
    ).toMatchObject({
      ok: false,
      error: {
        id: "motion.reference",
        referenceKind: "joint",
        referenceId: "joint-missing",
      },
    });
    expect(
      evaluateMotionState(
        {
          ...ir,
          couplings: [
            {
              couplingId: "coupling-missing-input",
              kind: "direct_ratio",
              inputJointId: "joint-missing",
              outputJointIds: ["joint-wing"],
              ratio: 1,
              offset: 0,
              offsetUnit: "deg",
            },
          ],
        },
        20,
      ),
    ).toMatchObject({
      ok: false,
      error: { id: "motion.reference", referenceId: "joint-missing" },
    });
  });

  it("evaluates a revolute joint through the shared rotation kernel", () => {
    const ir = fixtureIr();
    const fold = ir.joints[0];
    if (!fold || fold.kind === "prismatic")
      throw new Error("Fold fixture missing.");
    const revolute: JointV1 = {
      jointId: fold.jointId,
      kind: "revolute",
      parentBodyId: fold.parentBodyId,
      childBodyId: fold.childBodyId,
      axis: fold.axis,
      connectorIds: [],
      homeAngleDeg: 0,
      minAngleDeg: 0,
      maxAngleDeg: 90,
    };
    const result = evaluateMotionState({ ...ir, joints: [revolute] }, 45);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.panelVertices["panel-wing"]?.[1]?.zMm).toBeLessThan(
        0,
      );
    }
  });

  it("rejects a zero prismatic axis and invalid body transform", () => {
    const ir = fixtureIr();
    const zeroAxis: JointV1 = {
      jointId: "joint-wing",
      kind: "prismatic",
      parentBodyId: "body-base",
      childBodyId: "body-wing",
      originMm: { xMm: 160, yMm: 90, zMm: 0 },
      axis: { x: 0, y: 0, z: 0 },
      guideConnectorIds: [],
      homeTravelMm: 0,
      minTravelMm: 0,
      maxTravelMm: 30,
    };
    const prismaticIr: FabricationIRV1 = {
      ...ir,
      joints: [zeroAxis],
      driver: ir.driver
        ? {
            ...ir.driver,
            control: "slide",
            minimumValue: 0,
            maximumValue: 30,
            homeValue: 0,
            unit: "mm",
          }
        : null,
      couplings: [],
    };
    expect(evaluateMotionState(prismaticIr, 10)).toMatchObject({
      ok: false,
      error: { id: "motion.axis", jointId: "joint-wing" },
    });

    const body = ir.bodies[0]!;
    expect(
      evaluateMotionState({
        ...ir,
        bodies: [
          {
            ...body,
            initialTransform: {
              ...body.initialTransform,
              rotation: { x: 0, y: 0, z: 0, w: 0 },
            },
          },
          ...ir.bodies.slice(1),
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: { id: "motion.transform", bodyId: "body-base" },
    });
  });

  it("rejects panels bound to missing bodies and driver values on static IR", () => {
    const ir = fixtureIr();
    const panel = ir.panels[0]!;
    expect(
      evaluateMotionState({
        ...ir,
        panels: [{ ...panel, bodyId: "body-missing" }, ...ir.panels.slice(1)],
      }),
    ).toMatchObject({
      ok: false,
      error: {
        id: "motion.reference",
        referenceKind: "body",
        referenceId: "body-missing",
      },
    });

    const showcase = createFacetedDuckGiftBoxShowcase();
    const compiled = compileFabricationProgram(
      showcase.intent,
      showcase.program,
    );
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
    expect(evaluateMotionState(compiled.value, 1)).toMatchObject({
      ok: false,
      error: { id: "motion.driver_value", value: 1 },
    });
    const staticState = evaluateMotionState(compiled.value);
    expect(staticState.ok).toBe(true);
    if (staticState.ok) {
      expect(staticState.value.driverValue).toBeNull();
      expect(staticState.value.driverRatio).toBe(0);
    }
  });

  it("keeps finite translated and normalized quaternion transforms", () => {
    const ir = fixtureIr();
    const base = ir.bodies[0]!;
    const result = evaluateMotionState({
      ...ir,
      bodies: [
        {
          ...base,
          initialTransform: {
            translationMm: { xMm: 7, yMm: 8, zMm: 9 },
            rotation: { x: 0, y: 0, z: 0, w: 2 },
          },
        },
        ...ir.bodies.slice(1),
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.panelVertices["panel-base"]?.[0]).toEqual({
        xMm: 87,
        yMm: 98,
        zMm: 9,
      });
    }
  });
});
