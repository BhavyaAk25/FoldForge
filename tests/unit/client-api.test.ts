import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";

import { postJson } from "@/lib/client-api";
import type { FoldForgeApiError } from "@/lib/client-api";
import { forgeDiagnostic } from "@/lib/forge-diagnostics";

afterEach(() => vi.unstubAllGlobals());

describe("forge client diagnostics", () => {
  it("preserves a strict server diagnostic on an HTTP failure", async () => {
    const diagnostic = forgeDiagnostic({
      stage: "program",
      kind: "contract",
      code: "MODEL_PLAN_INVALID",
      message: "The model plan did not satisfy the fabrication contract.",
      modelCall: "attempted",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: diagnostic.code,
              message: diagnostic.message,
              details: [],
              diagnostic,
            },
          },
          { status: 502 },
        ),
      ),
    );

    const request = postJson(
      "/api/programs",
      { value: "private request body" },
      z.object({ ok: z.literal(true) }).strict(),
      { stage: "program", attemptId: crypto.randomUUID() },
    );

    await expect(request).rejects.toMatchObject({
      code: "MODEL_PLAN_INVALID",
      diagnostic,
    } satisfies Partial<FoldForgeApiError>);
  });

  it("marks a transport interruption as possibly started without retrying", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("socket reset"));
    vi.stubGlobal("fetch", fetchMock);

    const request = postJson(
      "/api/programs",
      { value: "private request body" },
      z.object({ ok: z.literal(true) }).strict(),
      { stage: "program", attemptId: crypto.randomUUID() },
    );

    await expect(request).rejects.toMatchObject({
      diagnostic: {
        code: "CONNECTION_INTERRUPTED",
        stage: "program",
        retryable: false,
        modelCall: "possibly_started",
      },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("sends the forge attempt identifier and rejects a malformed success", async () => {
    const attemptId = crypto.randomUUID();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ unexpected: true }));
    vi.stubGlobal("fetch", fetchMock);

    const request = postJson(
      "/api/intent",
      { prompt: "private prompt" },
      z.object({ ok: z.literal(true) }).strict(),
      { stage: "intent", attemptId },
    );

    await expect(request).rejects.toMatchObject({
      diagnostic: {
        code: "INVALID_API_RESPONSE",
        stage: "intent",
        modelCall: "attempted",
      },
    });
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(
      new Headers(requestInit?.headers).get("X-FoldForge-Attempt-Id"),
    ).toBe(attemptId);
  });
});
