import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FabricationIntentV1Schema } from "@/core/fabrication/schemas";
import type { FabricationIntentV1 } from "@/core/fabrication/types";
import type {
  AuthorizedLiveRouteHandler,
  LiveRouteAuthorizationContext,
  LiveRouteAuthorizationInput,
} from "@/server/api/live-authorization";
import { LIVE_OPERATION_POLICIES } from "@/server/api/security-policy";
import { PROMPT_MAXIMUM_CHARACTERS } from "@/server/fabrication-ai/contracts";
import type { FabricationIntentModel } from "@/server/fabrication-ai/models";

import { fixtureIntent } from "../fixtures/fabrication";

type RunAuthorizedLiveRoute = (
  input: LiveRouteAuthorizationInput,
  handler: AuthorizedLiveRouteHandler,
) => Promise<NextResponse>;

const mocks = vi.hoisted(() => ({
  compileIntent: vi.fn<FabricationIntentModel["compileIntent"]>(),
  runAuthorizedLiveRoute: vi.fn<RunAuthorizedLiveRoute>(),
}));

vi.mock("@/server/api/live-authorization", () => ({
  runAuthorizedLiveRoute: mocks.runAuthorizedLiveRoute,
}));

vi.mock("@/server/fabrication-ai/models", () => ({
  OpenAIFabricationIntentModel: class {
    compileIntent(prompt: string, safetyIdentifier: string) {
      return mocks.compileIntent(prompt, safetyIdentifier);
    }
  },
}));

import { POST } from "@/app/api/intent/route";

const SAFETY_IDENTIFIER = `ff_${"a".repeat(40)}`;

const requestFor = (body: unknown): NextRequest =>
  new NextRequest("https://foldforge.example/api/intent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://foldforge.example",
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.compileIntent.mockReset();
  mocks.runAuthorizedLiveRoute.mockReset();
  mocks.runAuthorizedLiveRoute.mockImplementation(async (input, handler) => {
    const body: unknown = await input.request.json();
    return handler({
      body,
      operation: input.operation,
      reservedInputTokens: input.reservedInputTokens,
      reservedOutputTokens: input.reservedOutputTokens,
      reservedTokens: input.reservedInputTokens + input.reservedOutputTokens,
      safetyIdentifier: SAFETY_IDENTIFIER,
      lease: { release: vi.fn() },
    } as unknown as LiveRouteAuthorizationContext);
  });
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/intent", () => {
  it("returns a strict normalized intent through the authorized policy", async () => {
    const privatePrompt = "Build a private winged display.";
    const modelIntent = {
      ...fixtureIntent(),
      title: "  Winged display  ",
    } satisfies FabricationIntentV1;
    mocks.compileIntent.mockResolvedValueOnce(modelIntent);
    const consoleSpies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    const request = requestFor({ prompt: `  ${privatePrompt}  ` });

    const response = await POST(request);
    const body: unknown = await response.json();
    const parsed = FabricationIntentV1Schema.safeParse(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.title).toBe("Winged display");
    expect(mocks.compileIntent).toHaveBeenCalledWith(
      privatePrompt,
      SAFETY_IDENTIFIER,
    );
    expect(mocks.runAuthorizedLiveRoute).toHaveBeenCalledOnce();
    const authorizationInput = mocks.runAuthorizedLiveRoute.mock.calls[0]?.[0];
    expect(authorizationInput).toMatchObject({
      request,
      operation: "intent",
      reservedInputTokens: PROMPT_MAXIMUM_CHARACTERS,
      reservedOutputTokens: LIVE_OPERATION_POLICIES.intent.maximumOutputTokens,
    });
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });

  it("returns a content-free validation error without calling the model", async () => {
    const response = await POST(
      requestFor({ prompt: "Build a display.", unexpected: "private value" }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "The fabrication intent request is malformed.",
        details: [],
        diagnostic: {
          version: "1",
          stage: "intent",
          kind: "request",
          code: "INVALID_INTENT_REQUEST",
          message: "The fabrication intent request is malformed.",
          retryable: false,
          modelCall: "not_started",
          failureIds: [],
          failedAtStage: null,
          repairCycle: null,
        },
      },
    });
    expect(mocks.compileIntent).not.toHaveBeenCalled();
  });

  it("collapses provider failures without leaking prompts or error details", async () => {
    const privatePrompt = "private customer fabrication request";
    const providerDetail = "provider detail with private response content";
    mocks.compileIntent.mockRejectedValueOnce(new Error(providerDetail));

    const response = await POST(requestFor({ prompt: privatePrompt }));
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(serialized).toContain("MODEL_RESPONSE_ERROR");
    expect(serialized).not.toContain(privatePrompt);
    expect(serialized).not.toContain(providerDetail);
  });

  it("classifies exhausted provider credits without exposing provider text", async () => {
    const privateProviderText = "private billing response payload";
    mocks.compileIntent.mockRejectedValueOnce(
      Object.assign(new Error(privateProviderText), {
        code: "insufficient_quota",
        status: 429,
      }),
    );

    const response = await POST(requestFor({ prompt: "Build a display." }));
    const body = await response.json();

    expect(body).toMatchObject({
      error: {
        code: "PROVIDER_CREDITS_EXHAUSTED",
        diagnostic: {
          stage: "intent",
          kind: "provider",
          code: "PROVIDER_CREDITS_EXHAUSTED",
          retryable: false,
          modelCall: "attempted",
          failureIds: [],
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain(privateProviderText);
  });

  it("rejects a non-strict model result at the route boundary", async () => {
    const invalidIntent = {
      ...fixtureIntent(),
      unexpectedModelField: "must not cross the boundary",
    } as unknown as FabricationIntentV1;
    mocks.compileIntent.mockResolvedValueOnce(invalidIntent);

    const response = await POST(requestFor({ prompt: "Build a display." }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "MODEL_RESPONSE_ERROR", details: [] },
    });
  });

  it("passes authorization failures through without constructing the model", async () => {
    mocks.runAuthorizedLiveRoute.mockResolvedValueOnce(
      NextResponse.json(
        {
          error: {
            code: "ACCESS_REQUIRED",
            message: "A valid access session is required.",
            details: [],
          },
        },
        { status: 401 },
      ),
    );

    const response = await POST(requestFor({ prompt: "Build a display." }));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.compileIntent).not.toHaveBeenCalled();
  });
});
