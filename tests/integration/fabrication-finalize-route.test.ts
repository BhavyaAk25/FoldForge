import {
  NextRequest,
  NextResponse,
  type NextResponse as NextResponseType,
} from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildFabricationCandidate,
  type CandidateProvenanceInput,
} from "@/core/fabrication/candidate";
import type { CandidateV2 } from "@/core/fabrication/types";
import type {
  AuthorizedLiveRouteHandler,
  LiveRouteAuthorizationContext,
  LiveRouteAuthorizationInput,
} from "@/server/api/live-authorization";
import { LIVE_OPERATION_POLICIES } from "@/server/api/security-policy";
import type { FabricationNarrativeV1 } from "@/server/fabrication-ai/contracts";
import type { FabricationNarrativeModel } from "@/server/fabrication-ai/models";

import { fixtureIntent, fixtureProgram } from "../fixtures/fabrication";

type RunAuthorizedLiveRoute = (
  input: LiveRouteAuthorizationInput,
  handler: AuthorizedLiveRouteHandler,
) => Promise<NextResponseType>;

const mocks = vi.hoisted(() => ({
  generateNarrative: vi.fn<FabricationNarrativeModel["generateNarrative"]>(),
  runAuthorizedLiveRoute: vi.fn<RunAuthorizedLiveRoute>(),
}));

vi.mock("@/server/api/live-authorization", () => ({
  runAuthorizedLiveRoute: mocks.runAuthorizedLiveRoute,
}));

vi.mock("@/server/fabrication-ai/models", () => ({
  OpenAIFabricationNarrativeModel: class {
    generateNarrative(
      ...input: Parameters<FabricationNarrativeModel["generateNarrative"]>
    ) {
      return mocks.generateNarrative(...input);
    }
  },
}));

import { POST as finalizePost } from "@/app/api/finalize/route";

const SAFETY_IDENTIFIER = `ff_${"f".repeat(40)}`;

const narrative = {
  summary: "A verified folding mechanism ready for source-equivalent export.",
  mechanism: "The selected fold joint drives the articulated wing.",
  assemblySteps: [
    "Cut the source-equivalent panel outlines.",
    "Score and fold the marked hinge.",
  ],
  limitations: [
    "Verification covers geometry and kinematics, not material fatigue.",
  ],
  sourceLabels: [
    {
      claim: "The candidate passed deterministic checks.",
      source: "Calculated",
    },
  ],
} satisfies FabricationNarrativeV1;

const provenance = {
  compilerVersion: "foldforge-core-1",
  generatedAtIso: "2026-07-14T12:00:00.000Z",
  deterministicSeed: 2_026_071_4,
  modelId: "gpt-5.6-sol",
  modelResponseId: "response-finalize-route-fixture",
  parentCandidateId: null,
  appliedPatchIds: [],
  repairCycle: 0,
} as const satisfies CandidateProvenanceInput;

const candidateFrom = (
  selectionStatus: "eligible" | "selected" = "selected",
): CandidateV2 => {
  const result = buildFabricationCandidate({
    candidateId: "candidate-finalize-route",
    intent: fixtureIntent(),
    program: fixtureProgram(),
    selectionStatus,
    provenance,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

const requestFor = (body: unknown): NextRequest =>
  new NextRequest("https://foldforge.example/api/finalize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://foldforge.example",
    },
    body: JSON.stringify(body),
  });

const expectNoStore = (response: NextResponseType): void => {
  expect(response.headers.get("cache-control")).toBe("no-store");
};

const withTamperedIr = (candidate: CandidateV2): CandidateV2 => {
  const firstPath = candidate.ir.paths[0];
  const firstPoint = firstPath?.points[0];
  if (!firstPath || !firstPoint) {
    throw new Error("Finalization fixture requires a path point.");
  }
  return {
    ...candidate,
    ir: {
      ...candidate.ir,
      paths: [
        {
          ...firstPath,
          points: [
            { ...firstPoint, xMm: firstPoint.xMm + 0.25 },
            ...firstPath.points.slice(1),
          ],
        },
        ...candidate.ir.paths.slice(1),
      ],
    },
  };
};

beforeEach(() => {
  mocks.generateNarrative.mockReset();
  mocks.runAuthorizedLiveRoute.mockReset();
  mocks.generateNarrative.mockResolvedValue(narrative);
  mocks.runAuthorizedLiveRoute.mockImplementation(async (input, handler) => {
    const body: unknown = await input.request.json();
    return handler({
      body,
      operation: input.operation,
      reservedInputTokens: input.reservedInputTokens,
      reservedOutputTokens: input.reservedOutputTokens,
      reservedTokens: input.reservedInputTokens + input.reservedOutputTokens,
      safetyIdentifier: SAFETY_IDENTIFIER,
      session: {
        subject: "finalize-route-subject",
        issuedAtSeconds: 1,
        expiresAtSeconds: 2,
      },
      lease: { release: vi.fn() },
    } as unknown as LiveRouteAuthorizationContext);
  });
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/finalize", () => {
  it("passes the exact bound selected CandidateV2 and server safety identifier to the narrative model", async () => {
    const candidate = candidateFrom();
    const response = await finalizePost(requestFor({ candidate }));

    expect(response.status).toBe(200);
    expectNoStore(response);
    await expect(response.json()).resolves.toEqual({ narrative });
    expect(mocks.generateNarrative).toHaveBeenCalledOnce();
    expect(mocks.generateNarrative).toHaveBeenCalledWith(
      candidate,
      SAFETY_IDENTIFIER,
    );
    expect(mocks.runAuthorizedLiveRoute.mock.calls[0]?.[0]).toMatchObject({
      operation: "finalize",
      reservedInputTokens: 12_000,
      reservedOutputTokens:
        LIVE_OPERATION_POLICIES.finalize.maximumOutputTokens,
    });
  });

  it("rejects malformed, unselected, and verification-unbound candidates before model use", async () => {
    const selected = candidateFrom();
    const malformed = await finalizePost(
      requestFor({ candidate: selected, unexpected: true }),
    );
    expect(malformed.status).toBe(400);
    expectNoStore(malformed);
    await expect(malformed.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST", details: [] },
    });

    const unselected = await finalizePost(
      requestFor({ candidate: candidateFrom("eligible") }),
    );
    expect(unselected.status).toBe(409);
    expectNoStore(unselected);
    await expect(unselected.json()).resolves.toMatchObject({
      error: { code: "CANDIDATE_NOT_SELECTED", details: [] },
    });

    const unbound = await finalizePost(
      requestFor({ candidate: withTamperedIr(selected) }),
    );
    expect(unbound.status).toBe(422);
    expectNoStore(unbound);
    await expect(unbound.json()).resolves.toMatchObject({
      error: { code: "CANDIDATE_NOT_VERIFIED", details: [] },
    });
    expect(mocks.generateNarrative).not.toHaveBeenCalled();
  });

  it("preserves the authorization failure and adds no-store without calling the model", async () => {
    mocks.runAuthorizedLiveRoute.mockResolvedValueOnce(
      NextResponse.json(
        {
          error: {
            code: "ACCESS_REQUIRED",
            message: "Live access is required.",
            details: [],
          },
        },
        { status: 401 },
      ),
    );

    const response = await finalizePost(
      requestFor({ candidate: candidateFrom() }),
    );
    expect(response.status).toBe(401);
    expectNoStore(response);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ACCESS_REQUIRED", details: [] },
    });
    expect(mocks.generateNarrative).not.toHaveBeenCalled();
  });

  it("maps provider failures to a fixed no-store response without leaking details", async () => {
    const providerDetail = "private provider narrative payload";
    mocks.generateNarrative.mockRejectedValueOnce(new Error(providerDetail));

    const response = await finalizePost(
      requestFor({ candidate: candidateFrom() }),
    );
    const serialized = JSON.stringify(await response.json());
    expect(response.status).toBe(502);
    expectNoStore(response);
    expect(serialized).toContain("MODEL_RESPONSE_INVALID");
    expect(serialized).not.toContain(providerDetail);
  });
});
