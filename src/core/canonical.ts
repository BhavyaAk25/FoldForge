const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize(value[key])]),
    );
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? Number(value.toFixed(9)) : null;
  }

  return value;
};

export const canonicalSerialize = (value: unknown): string =>
  JSON.stringify(normalize(value));

export const stableHash = (value: unknown): string => {
  const input = canonicalSerialize(value);
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};
