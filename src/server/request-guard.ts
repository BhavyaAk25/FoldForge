const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type MutationGuardBlockReason =
  | "cross_site"
  | "invalid_fetch_metadata"
  | "invalid_origin"
  | "missing_request_provenance"
  | "origin_mismatch";

export type MutationGuardResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: MutationGuardBlockReason;
    };

export interface MutationGuardOptions {
  readonly allowedOrigins?: readonly string[];
}

const normalizedOrigin = (value: string): string | null => {
  try {
    const url = new URL(value);
    return url.origin === value ? url.origin : null;
  } catch {
    return null;
  }
};

const allowedOriginsFor = (
  request: Request,
  configured: readonly string[] | undefined,
): ReadonlySet<string> => {
  const origins = configured ?? [new URL(request.url).origin];
  const normalized = new Set<string>();
  for (const origin of origins) {
    const value = normalizedOrigin(origin);
    if (!value) {
      throw new Error("Mutation guard allowed origins must be exact origins.");
    }
    normalized.add(value);
  }
  if (normalized.size === 0) {
    throw new Error("Mutation guard requires at least one allowed origin.");
  }
  return normalized;
};

export const guardMutationRequest = (
  request: Request,
  options: MutationGuardOptions = {},
): MutationGuardResult => {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return { ok: true };

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site" || fetchSite === "same-site") {
    return { ok: false, reason: "cross_site" };
  }
  if (
    fetchSite !== undefined &&
    fetchSite !== "same-origin" &&
    fetchSite !== "none"
  ) {
    return { ok: false, reason: "invalid_fetch_metadata" };
  }

  const suppliedOrigin = request.headers.get("origin");
  if (suppliedOrigin !== null) {
    const origin = normalizedOrigin(suppliedOrigin);
    if (!origin) return { ok: false, reason: "invalid_origin" };
    if (!allowedOriginsFor(request, options.allowedOrigins).has(origin)) {
      return { ok: false, reason: "origin_mismatch" };
    }
    return { ok: true };
  }

  return fetchSite === "same-origin"
    ? { ok: true }
    : { ok: false, reason: "missing_request_provenance" };
};
