import { err, ok, type Result } from "./result";

export type LengthUnit = "mm" | "cm" | "in";
export type MassUnit = "g" | "kg" | "oz" | "lb";

export interface UnitError {
  readonly code: "unsupported_unit" | "non_finite_value" | "non_positive_value";
  readonly message: string;
}

const validateValue = (value: number): Result<number, UnitError> => {
  if (!Number.isFinite(value)) {
    return err({ code: "non_finite_value", message: "Value must be finite." });
  }

  if (value <= 0) {
    return err({
      code: "non_positive_value",
      message: "Value must be positive.",
    });
  }

  return ok(value);
};

export const lengthToMm = (
  value: number,
  unit: LengthUnit,
): Result<number, UnitError> => {
  const valid = validateValue(value);
  if (!valid.ok) return valid;

  const factor = { mm: 1, cm: 10, in: 25.4 }[unit];
  if (factor === undefined) {
    return err({
      code: "unsupported_unit",
      message: `Unsupported length unit: ${unit}`,
    });
  }

  return ok(valid.value * factor);
};

export const massToG = (
  value: number,
  unit: MassUnit,
): Result<number, UnitError> => {
  const valid = validateValue(value);
  if (!valid.ok) return valid;

  const factor = { g: 1, kg: 1_000, oz: 28.349523125, lb: 453.59237 }[unit];
  if (factor === undefined) {
    return err({
      code: "unsupported_unit",
      message: `Unsupported mass unit: ${unit}`,
    });
  }

  return ok(valid.value * factor);
};
