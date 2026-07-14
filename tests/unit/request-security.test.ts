import { describe, expect, it } from "vitest";

import { parseJsonBody, parseRouteJsonBody } from "@/server/api/response";
import { guardMutationRequest } from "@/server/request-guard";

const request = (
  headers: Record<string, string> = {},
  method = "POST",
): Request =>
  new Request("https://foldforge.example/api/compile", { method, headers });

describe("mutation request guard", () => {
  it("allows exact same-origin evidence and safe methods", () => {
    expect(
      guardMutationRequest(request({ Origin: "https://foldforge.example" })),
    ).toEqual({ ok: true });
    expect(
      guardMutationRequest(request({ "Sec-Fetch-Site": "same-origin" })),
    ).toEqual({ ok: true });
    expect(guardMutationRequest(request({}, "GET"))).toEqual({ ok: true });
  });

  it("blocks cross-site, mismatched, malformed, and missing provenance", () => {
    expect(
      guardMutationRequest(
        request({
          Origin: "https://foldforge.example",
          "Sec-Fetch-Site": "cross-site",
        }),
      ),
    ).toEqual({ ok: false, reason: "cross_site" });
    expect(
      guardMutationRequest(request({ Origin: "https://attacker.example" })),
    ).toEqual({ ok: false, reason: "origin_mismatch" });
    expect(guardMutationRequest(request({ Origin: "null" }))).toEqual({
      ok: false,
      reason: "invalid_origin",
    });
    expect(guardMutationRequest(request())).toEqual({
      ok: false,
      reason: "missing_request_provenance",
    });
  });

  it("accepts an explicitly configured production origin", () => {
    const previewRequest = new Request("https://preview.example/api/compile", {
      method: "POST",
      headers: { Origin: "https://foldforge.example" },
    });
    expect(
      guardMutationRequest(previewRequest, {
        allowedOrigins: ["https://foldforge.example"],
      }),
    ).toEqual({ ok: true });
  });
});

describe("route-sized JSON parser", () => {
  it("parses JSON within a route-specific byte cap", async () => {
    const result = await parseRouteJsonBody(
      new Request("https://foldforge.example/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "ok" }),
      }),
      32,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ code: "ok" });
  });

  it("rejects declared and streamed bodies over the selected cap", async () => {
    const declared = await parseRouteJsonBody(
      new Request("https://foldforge.example/api/access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "33",
        },
        body: JSON.stringify({ code: "x".repeat(40) }),
      }),
      32,
    );
    expect(declared.ok).toBe(false);
    if (!declared.ok) expect(declared.response.status).toBe(413);

    const streamed = await parseRouteJsonBody(
      new Request("https://foldforge.example/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "x".repeat(40) }),
      }),
      32,
    );
    expect(streamed.ok).toBe(false);
    if (!streamed.ok) expect(streamed.response.status).toBe(413);
  });

  it("rejects invalid limit configuration", async () => {
    await expect(
      parseJsonBody(
        new Request("https://foldforge.example/api/access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
        { maxBytes: 0 },
      ),
    ).rejects.toThrow("no larger than 1 MiB");
  });
});
