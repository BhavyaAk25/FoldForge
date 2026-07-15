import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

interface RateWindow {
  count: number;
  resetsAtMs: number;
}

const windows = new Map<string, RateWindow>();

export const requestSubjectHash = (request: Request): string => {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const subject = forwarded || request.headers.get("user-agent") || "unknown";
  return createHash("sha256").update(subject).digest("hex").slice(0, 24);
};

export const enforceRateLimit = (
  request: Request,
  scope: string,
  limit: number,
  windowMs: number,
): NextResponse | null => {
  const now = Date.now();
  const key = `${scope}:${requestSubjectHash(request)}`;
  const current = windows.get(key);
  const window =
    !current || current.resetsAtMs <= now
      ? { count: 0, resetsAtMs: now + windowMs }
      : current;
  window.count += 1;
  windows.set(key, window);

  if (windows.size > 2_000) {
    for (const [entryKey, entry] of windows) {
      if (entry.resetsAtMs <= now) windows.delete(entryKey);
    }
    while (windows.size > 2_000) {
      const oldestKey = windows.keys().next().value;
      if (oldestKey === undefined) break;
      windows.delete(oldestKey);
    }
  }

  if (window.count <= limit) return null;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((window.resetsAtMs - now) / 1_000),
  );
  return NextResponse.json(
    {
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Wait before trying again.",
        details: [],
      },
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
};
