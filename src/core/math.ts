export const degreesToRadians = (degrees: number): number =>
  (degrees * Math.PI) / 180;

export const radiansToDegrees = (radians: number): number =>
  (radians * 180) / Math.PI;

export const clamp = (
  value: number,
  minimum: number,
  maximum: number,
): number => Math.min(maximum, Math.max(minimum, value));

export const round = (value: number, precision = 6): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

export const distance2 = (
  first: { readonly xMm: number; readonly yMm: number },
  second: { readonly xMm: number; readonly yMm: number },
): number => Math.hypot(second.xMm - first.xMm, second.yMm - first.yMm);
