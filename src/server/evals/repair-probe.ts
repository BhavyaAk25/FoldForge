import { FabricationProgramV1Schema } from "@/core/fabrication/schemas";
import type { FabricationProgramV1 } from "@/core/fabrication/types";

export interface MotionRangeRepairProbe {
  readonly program: FabricationProgramV1;
  readonly mutation: {
    readonly purpose: "deliberate_evaluation_probe";
    readonly path: string;
    readonly originalValue: number;
    readonly mutatedValue: number;
    readonly unit: "mm" | "deg";
  };
}

export const createMotionRangeRepairProbe = (
  programInput: FabricationProgramV1,
): MotionRangeRepairProbe => {
  const program = FabricationProgramV1Schema.parse(programInput);
  const driver = program.blueprint.driver;
  if (!driver) {
    throw new Error("A motion repair probe requires one driver.");
  }

  const originalValue = driver.maximumValue;
  const originalSpan = Math.abs(driver.maximumValue - driver.minimumValue);
  const mutatedValue = driver.maximumValue + Math.max(10, originalSpan * 0.5);
  const mutatedProgram = {
    ...program,
    blueprint: {
      ...program.blueprint,
      driver: { ...driver, maximumValue: mutatedValue },
    },
  };

  return {
    program: FabricationProgramV1Schema.parse(mutatedProgram),
    mutation: {
      purpose: "deliberate_evaluation_probe",
      path: `/blueprint/driver/${driver.driverId}/maximumValue`,
      originalValue,
      mutatedValue,
      unit: driver.unit,
    },
  };
};
