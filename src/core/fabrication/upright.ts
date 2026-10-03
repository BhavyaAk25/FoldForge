import type { FabricationProgramV1 } from "./types";

type Program = FabricationProgramV1;
type Panel = Program["blueprint"]["panels"][number];

/** Flat-sheet position of a panel-local (u, v) point, in millimetres. */
export const flatWorldPoint = (panel: Panel, u: number, v: number) => {
  const radians = (panel.flatTransform.rotationDeg * Math.PI) / 180;
  const x = u * panel.widthMm;
  const y = v * panel.heightMm;
  return {
    xMm:
      panel.flatTransform.translationMm.xMm +
      x * Math.cos(radians) -
      y * Math.sin(radians),
    yMm:
      panel.flatTransform.translationMm.yMm +
      x * Math.sin(radians) +
      y * Math.cos(radians),
  };
};

/**
 * Signed, area-weighted measure of whether the parts folded directly off the
 * grounded body rise above the sheet plane (+z) or hang below it.
 *
 * A fold rotates its child about the axis by the home angle (right-hand rule),
 * so a child lying to the left of the axis direction in the flat sheet moves
 * to +z for a positive angle: z sign = sign(angle) * sign(axis x offset).
 */
const firstLevelLift = (program: Program): number => {
  const grounded = new Set(
    program.blueprint.bodies.filter((b) => b.grounded).map((b) => b.bodyId),
  );
  let lift = 0;
  for (const joint of program.blueprint.joints) {
    if (joint.kind !== "fold" || !grounded.has(joint.parentBodyId)) continue;
    const axisX = joint.axis.endMm.xMm - joint.axis.startMm.xMm;
    const axisY = joint.axis.endMm.yMm - joint.axis.startMm.yMm;
    for (const panel of program.blueprint.panels) {
      if (panel.bodyId !== joint.childBodyId) continue;
      const center = flatWorldPoint(panel, 0.5, 0.5);
      const cross =
        axisX * (center.yMm - joint.axis.startMm.yMm) -
        axisY * (center.xMm - joint.axis.startMm.xMm);
      lift +=
        Math.sign(joint.homeAngleDeg) *
        Math.sign(cross) *
        panel.widthMm *
        panel.heightMm;
    }
  }
  return lift;
};

const mirroredRange = (minimum: number, maximum: number) => ({
  minimum: -maximum,
  maximum: -minimum,
});

/**
 * Mirrors a fold-only design through the sheet plane when its parts hang below
 * the grounded body, so a figure or card stands up in the preview and in the
 * GLB. The mirror image has identical distances, clearances, and travel, but
 * the caller still re-verifies it. Designs with hinges, sliders, or couplings
 * are returned unchanged.
 */
export const uprightFoldedProgram = (program: Program): Program => {
  const { joints, couplings, driver, outputs } = program.blueprint;
  if (
    couplings.length > 0 ||
    joints.some((joint) => joint.kind !== "fold") ||
    firstLevelLift(program) >= 0
  ) {
    return program;
  }
  return {
    ...program,
    blueprint: {
      ...program.blueprint,
      joints: joints.map((joint) => {
        if (joint.kind !== "fold") return joint;
        const range = mirroredRange(joint.minAngleDeg, joint.maxAngleDeg);
        return {
          ...joint,
          foldDirection:
            joint.foldDirection === "valley" ? "mountain" : "valley",
          homeAngleDeg: -joint.homeAngleDeg,
          minAngleDeg: range.minimum,
          maxAngleDeg: range.maximum,
        };
      }),
      driver: driver
        ? {
            ...driver,
            minimumValue: -driver.maximumValue,
            maximumValue: -driver.minimumValue,
            homeValue: -driver.homeValue,
            direction: driver.direction === 1 ? -1 : 1,
          }
        : null,
      outputs: outputs.map((output) => {
        const range = mirroredRange(output.minimumValue, output.maximumValue);
        return {
          ...output,
          minimumValue: range.minimum,
          maximumValue: range.maximum,
          direction: output.direction === 1 ? -1 : 1,
        };
      }),
    },
  };
};
