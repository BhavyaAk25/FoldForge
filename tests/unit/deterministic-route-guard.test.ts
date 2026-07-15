import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";

import { runBoundedDeterministicRequest } from "@/server/deterministic-route-guard";

const requestFor = (subject: string): Request =>
  new Request("http://localhost/api/compile", {
    method: "POST",
    headers: { "x-forwarded-for": subject },
  });

describe("deterministic route work guard", () => {
  it("rate-limits repeated CPU-bound route requests", async () => {
    const request = requestFor("198.51.100.41");
    for (let index = 0; index < 30; index += 1) {
      const response = await runBoundedDeterministicRequest(
        request,
        "unit-rate",
        async () => NextResponse.json({ ok: true }),
      );
      expect(response.status).toBe(200);
    }
    const limited = await runBoundedDeterministicRequest(
      request,
      "unit-rate",
      async () => NextResponse.json({ ok: true }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).not.toBeNull();
    expect(limited.headers.get("Cache-Control")).toBe("no-store");
  });

  it("allows only one active deterministic request per subject", async () => {
    const request = requestFor("198.51.100.42");
    let releaseFirst: (() => void) | undefined;
    const first = runBoundedDeterministicRequest(
      request,
      "unit-concurrency",
      () =>
        new Promise<NextResponse>((resolve) => {
          releaseFirst = () => resolve(NextResponse.json({ ok: true }));
        }),
    );
    await Promise.resolve();
    const second = await runBoundedDeterministicRequest(
      request,
      "unit-concurrency",
      async () => NextResponse.json({ ok: true }),
    );
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({
      error: { code: "TOO_MANY_ACTIVE_REQUESTS" },
    });
    releaseFirst?.();
    expect((await first).status).toBe(200);
  });
});
