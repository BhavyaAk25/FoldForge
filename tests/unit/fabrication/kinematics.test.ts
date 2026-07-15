import { describe, expect, it } from "vitest";

import { compileFabricationProgram } from "@/core/fabrication/compiler";
import {
  evaluateMotionState,
  homeMotionState,
  identityBodyMatrix,
} from "@/core/fabrication/kinematics";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

const compiledFixture = () => {
  const result = compileFabricationProgram(fixtureIntent(), fixtureProgram());
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

describe("fabrication kinematics", () => {
  it("moves a folded child about the declared axis", () => {
    const ir = compiledFixture();
    const flat = evaluateMotionState(ir, 0);
    const open = evaluateMotionState(ir, 90);
    expect(flat.ok).toBe(true);
    expect(open.ok).toBe(true);
    if (!flat.ok || !open.ok) return;
    expect(flat.value.maximumClosureResidualMm).toBeCloseTo(0);
    expect(open.value.maximumClosureResidualMm).toBeCloseTo(0);
    expect(open.value.driverRatio).toBe(1);
    expect(open.value.jointValues["joint-wing"]).toBe(90);

    const flatFarEdge = flat.value.panelVertices["panel-wing"]?.[1];
    const openFarEdge = open.value.panelVertices["panel-wing"]?.[1];
    expect(flatFarEdge).toMatchObject({ xMm: 190, yMm: 90, zMm: 0 });
    expect(openFarEdge?.xMm).toBeCloseTo(160);
    expect(openFarEdge?.yMm).toBeCloseTo(90);
    expect(openFarEdge?.zMm).toBeCloseTo(-30);
  });

  it("uses home state and produces triangulated panel surfaces", () => {
    const state = homeMotionState(compiledFixture());
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    expect(state.value.driverValue).toBe(0);
    expect(state.value.panelTriangles["panel-base"]).toHaveLength(2);
    expect(state.value.bodyMatrices["body-base"]).toEqual(identityBodyMatrix());
  });

  it("evaluates prismatic translation", () => {
    const ir = compiledFixture();
    const slider = {
      ...ir,
      joints: [
        {
          jointId: "joint-wing",
          kind: "prismatic" as const,
          parentBodyId: "body-base",
          childBodyId: "body-wing",
          originMm: { xMm: 160, yMm: 90, zMm: 0 },
          axis: { x: 1, y: 0, z: 0 },
          guideConnectorIds: ["guide-slot"],
          homeTravelMm: 0,
          minTravelMm: 0,
          maxTravelMm: 30,
        },
      ],
      driver: {
        ...ir.driver,
        driverId: "driver-wing",
        jointId: "joint-wing",
        label: "Slide wing",
        control: "slide" as const,
        minimumValue: 0,
        maximumValue: 30,
        homeValue: 0,
        unit: "mm" as const,
        direction: 1 as const,
      },
      outputs: [],
      couplings: [],
    };
    const state = evaluateMotionState(slider, 20);
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    expect(state.value.panelVertices["panel-wing"]?.[0]).toEqual({
      xMm: 180,
      yMm: 90,
      zMm: 0,
    });
  });

  it("rejects invalid driver, joint range, axis, and topology", () => {
    const ir = compiledFixture();
    expect(evaluateMotionState(ir, 91)).toMatchObject({
      ok: false,
      error: { id: "motion.driver_value" },
    });
    expect(evaluateMotionState(ir, Number.NaN)).toMatchObject({
      ok: false,
      error: { id: "motion.driver_value" },
    });

    const excessiveCoupling = {
      ...ir,
      couplings: [
        {
          ...ir.couplings[0],
          couplingId: "coupling-wing",
          kind: "direct_ratio" as const,
          inputJointId: "joint-wing",
          outputJointIds: ["joint-wing"],
          ratio: 2,
          offset: 0,
          offsetUnit: "deg" as const,
        },
      ],
    };
    expect(evaluateMotionState(excessiveCoupling, 90)).toMatchObject({
      ok: false,
      error: { id: "motion.joint_range", jointId: "joint-wing" },
    });

    const joint = ir.joints[0];
    if (!joint || joint.kind === "prismatic")
      throw new Error("Expected fold joint.");
    expect(
      evaluateMotionState(
        {
          ...ir,
          joints: [
            {
              ...joint,
              axis: {
                startMm: { xMm: 1, yMm: 1, zMm: 1 },
                endMm: { xMm: 1, yMm: 1, zMm: 1 },
              },
            },
          ],
        },
        30,
      ),
    ).toMatchObject({ ok: false, error: { id: "motion.axis" } });

    const baseBody = ir.bodies[0];
    if (!baseBody) throw new Error("Expected fixture body.");
    expect(
      evaluateMotionState({
        ...ir,
        bodies: [
          ...ir.bodies,
          {
            ...baseBody,
            bodyId: "body-orphan",
          },
        ],
      }),
    ).toMatchObject({ ok: false, error: { id: "motion.topology" } });
  });
});
