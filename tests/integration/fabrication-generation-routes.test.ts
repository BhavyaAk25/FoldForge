import { NextRequest, type NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fabricationProgramHash } from "@/core/fabrication/compiler";
import { FABRICATION_PLAN_EXPANDER_VERSION } from "@/core/fabrication/planning";
import type {
  FabricationProgramV1,
  ProgramPatchV1,
} from "@/core/fabrication/types";
import type {
  AuthorizedLiveRouteHandler,
  LiveRouteAuthorizationContext,
  LiveRouteAuthorizationInput,
} from "@/server/api/live-authorization";
import {
  API_BODY_LIMIT_BYTES,
  LIVE_OPERATION_POLICIES,
} from "@/server/api/security-policy";
import { ProgramProposalV1Schema } from "@/server/fabrication-ai/contracts";
import type {
  FabricationProgramModel,
  FabricationRepairModel,
} from "@/server/fabrication-ai/models";
import { programStructureFingerprint } from "@/server/fabrication-ai/orchestration";
import { FabricationProgramModelError } from "@/server/fabrication-ai/plan-response";

import { fixtureIntent, fixtureProgram } from "../fixtures/fabrication";

type RunAuthorizedLiveRoute = (
  input: LiveRouteAuthorizationInput,
  handler: AuthorizedLiveRouteHandler,
) => Promise<NextResponse>;

const mocks = vi.hoisted(() => ({
  diagnoseRepair: vi.fn<FabricationRepairModel["diagnoseRepair"]>(),
  generateProgram: vi.fn<FabricationProgramModel["generateProgram"]>(),
  runAuthorizedLiveRoute: vi.fn<RunAuthorizedLiveRoute>(),
}));

vi.mock("@/server/api/live-authorization", () => ({
  runAuthorizedLiveRoute: mocks.runAuthorizedLiveRoute,
}));

vi.mock("@/server/fabrication-ai/models", () => ({
  OpenAIFabricationProgramModel: class {
    generateProgram(
      ...input: Parameters<FabricationProgramModel["generateProgram"]>
    ) {
      return mocks.generateProgram(...input);
    }
  },
  OpenAIFabricationRepairModel: class {
    diagnoseRepair(
      ...input: Parameters<FabricationRepairModel["diagnoseRepair"]>
    ) {
      return mocks.diagnoseRepair(...input);
    }
  },
}));

import { POST as compilePost } from "@/app/api/compile/route";
import { POST as programsPost } from "@/app/api/programs/route";
import { POST as repairPost } from "@/app/api/repair/route";

const SAFETY_IDENTIFIER = `ff_${"b".repeat(40)}`;

const authorizedRequest = (path: string, body: unknown): NextRequest =>
  new NextRequest(`https://foldforge.example${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://foldforge.example",
    },
    body: JSON.stringify(body),
  });

const compileRequest = (
  body: unknown,
  origin = "https://foldforge.example",
): Request =>
  new Request("https://foldforge.example/api/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });

const compileBody = (program: FabricationProgramV1 = fixtureProgram()) => ({
  intent: fixtureIntent(),
  program,
  candidateId: "candidate-wing",
});

const invalidPanelProgram = (): FabricationProgramV1 => {
  const program = fixtureProgram();
  return {
    ...program,
    blueprint: {
      ...program.blueprint,
      panels: program.blueprint.panels.map((panel) =>
        panel.panelId === "panel-base" ? { ...panel, widthMm: 0.2 } : panel,
      ),
    },
  };
};

const repairPatch = (
  program: FabricationProgramV1,
  repairCycle: number,
  widthMm = 80,
): ProgramPatchV1 => ({
  version: "1",
  patchId: "patch-restore-width",
  programId: program.programId,
  baseProgramHash: fabricationProgramHash(program),
  repairCycle,
  diagnosis: "The base panel is below the minimum area.",
  operations: [
    {
      operationId: "operation-restore-width",
      operation: "set_number",
      path: "/blueprint/panels/panel-base/widthMm",
      value: widthMm,
      expectedCurrentValue: 0.2,
      unit: "mm",
      failureIds: ["geometry.simple_panel#panel-base"],
      reason: "Restore the base panel width.",
      expectedEffect: "The base panel will exceed the minimum area.",
    },
  ],
  authoredBy: "ai",
  changesIntent: false,
});

beforeEach(() => {
  mocks.diagnoseRepair.mockReset();
  mocks.generateProgram.mockReset();
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

describe("POST /api/programs", () => {
  it("generates one strict proposal and its structural fingerprint", async () => {
    const program = fixtureProgram();
    const proposal = ProgramProposalV1Schema.parse({
      diversityClaim: "A direct single-fold topology.",
      program,
      provenance: {
        modelId: "gpt-5.6-sol",
        modelResponseId: "resp-program-route",
        planHash: "a".repeat(64),
        expanderVersion: FABRICATION_PLAN_EXPANDER_VERSION,
      },
    });
    mocks.generateProgram.mockResolvedValueOnce(proposal);
    const requestBody = {
      intent: fixtureIntent(),
      candidateOrdinal: 2,
      usedTopologyIds: ["prior-topology"],
    };
    const response = await programsPost(
      authorizedRequest("/api/programs", requestBody),
    );
    const body = (await response.json()) as {
      proposal: {
        diversityClaim: string;
        program: FabricationProgramV1;
        provenance: { modelResponseId: string };
      };
      programStructureFingerprint: string;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.proposal.diversityClaim).toBe("A direct single-fold topology.");
    expect(body.proposal.provenance.modelResponseId).toBe("resp-program-route");
    expect(body.programStructureFingerprint).toBe(
      programStructureFingerprint(program),
    );
    expect(mocks.generateProgram).toHaveBeenCalledOnce();
    expect(mocks.generateProgram).toHaveBeenCalledWith(
      requestBody.intent,
      2,
      ["prior-topology"],
      SAFETY_IDENTIFIER,
    );
    expect(mocks.runAuthorizedLiveRoute.mock.calls[0]?.[0]).toMatchObject({
      operation: "programs",
      reservedInputTokens: API_BODY_LIMIT_BYTES.programs / 4,
      reservedOutputTokens:
        LIVE_OPERATION_POLICIES.programs.maximumOutputTokens,
    });
  });

  it("returns fixed request and model errors without response details", async () => {
    const malformed = await programsPost(
      authorizedRequest("/api/programs", {
        intent: fixtureIntent(),
        candidateOrdinal: 1,
        usedTopologyIds: [],
        privateExtra: "must not be accepted",
      }),
    );
    expect(malformed.status).toBe(400);
    expect(mocks.generateProgram).not.toHaveBeenCalled();

    const providerDetail = "provider response with private program content";
    mocks.generateProgram.mockRejectedValueOnce(new Error(providerDetail));
    const failed = await programsPost(
      authorizedRequest("/api/programs", {
        intent: fixtureIntent(),
        candidateOrdinal: 1,
        usedTopologyIds: [],
      }),
    );
    const serialized = JSON.stringify(await failed.json());
    expect(failed.status).toBe(502);
    expect(serialized).toContain("MODEL_RESPONSE_ERROR");
    expect(serialized).not.toContain(providerDetail);
  });

  it("reports an incomplete plan with a stable non-private diagnostic", async () => {
    const privateDetail = "private partial plan content";
    mocks.generateProgram.mockRejectedValueOnce(
      new FabricationProgramModelError("model_incomplete", privateDetail),
    );

    const response = await programsPost(
      authorizedRequest("/api/programs", {
        intent: fixtureIntent(),
        candidateOrdinal: 1,
        usedTopologyIds: [],
      }),
    );
    const body = await response.json();

    expect(body).toMatchObject({
      error: {
        code: "MODEL_INCOMPLETE",
        diagnostic: {
          stage: "program",
          kind: "contract",
          code: "MODEL_INCOMPLETE",
          modelCall: "attempted",
          failureIds: [],
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain(privateDetail);
  });
});

describe("POST /api/compile", () => {
  it("deterministically returns passed, invalid, and compile_error outcomes", async () => {
    const passed = await compilePost(compileRequest(compileBody()));
    const passedBody = (await passed.json()) as Record<string, unknown>;
    expect(passed.status).toBe(200);
    expect(passed.headers.get("cache-control")).toBe("no-store");
    expect(passedBody).toMatchObject({
      status: "passed",
      candidateId: "candidate-wing",
      report: { valid: true },
      score: { eligible: true },
    });

    const invalid = await compilePost(
      compileRequest(compileBody(invalidPanelProgram())),
    );
    expect(await invalid.json()).toMatchObject({
      status: "invalid",
      report: { valid: false, failedAtStage: "panel_geometry" },
      score: { eligible: false },
    });

    const unbound = {
      ...fixtureProgram(),
      intentId: "intent-other",
    } satisfies FabricationProgramV1;
    const compileError = await compilePost(
      compileRequest(compileBody(unbound)),
    );
    const compileErrorBody = await compileError.json();
    expect(compileErrorBody).toEqual({
      status: "compile_error",
      candidateId: "candidate-wing",
      ir: null,
      report: null,
      score: null,
      diagnostic: {
        version: "1",
        stage: "compile",
        kind: "compilation",
        code: "PROGRAM_COMPILE_ERROR",
        message: "The generated program could not be compiled safely.",
        retryable: false,
        modelCall: "not_applicable",
        failureIds: ["compile.invalid_reference"],
        failedAtStage: null,
        repairCycle: null,
      },
    });
    expect(JSON.stringify(compileErrorBody)).not.toContain("intent-other");
    expect(mocks.generateProgram).not.toHaveBeenCalled();
    expect(mocks.diagnoseRepair).not.toHaveBeenCalled();
  });

  it("guards origin, strict input, and the exact 32 KiB cap", async () => {
    const crossOrigin = await compilePost(
      compileRequest(compileBody(), "https://attacker.example"),
    );
    expect(crossOrigin.status).toBe(403);

    const oversized = await compilePost(
      new Request("https://foldforge.example/api/compile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://foldforge.example",
          "Content-Length": String(API_BODY_LIMIT_BYTES.compile + 1),
        },
        body: "{}",
      }),
    );
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE", details: [] },
    });

    const strict = await compilePost(
      compileRequest({ ...compileBody(), unexpected: true }),
    );
    expect(strict.status).toBe(400);
    await expect(strict.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST", details: [] },
    });
  });
});

describe("POST /api/repair", () => {
  it("returns an already-valid program without invoking the model", async () => {
    const response = await repairPost(
      authorizedRequest("/api/repair", {
        ...compileBody(),
        repairCycle: 1,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      status: "passed",
      patch: null,
      report: { valid: true },
      score: { eligible: true },
    });
    expect(mocks.diagnoseRepair).not.toHaveBeenCalled();
  });

  it("applies exactly one cycle then fully recompiles, verifies, and scores", async () => {
    const program = invalidPanelProgram();
    const patch = repairPatch(program, 2);
    mocks.diagnoseRepair.mockResolvedValueOnce(patch);
    const response = await repairPost(
      authorizedRequest("/api/repair", {
        intent: fixtureIntent(),
        program,
        candidateId: "candidate-repair",
        repairCycle: 2,
      }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "passed",
      candidateId: "candidate-repair",
      patch: { patchId: "patch-restore-width", repairCycle: 2 },
      report: { valid: true },
      score: { eligible: true },
    });
    expect(mocks.diagnoseRepair).toHaveBeenCalledOnce();
    const diagnosis = mocks.diagnoseRepair.mock.calls[0];
    expect(diagnosis?.[0]).toEqual(program);
    expect(diagnosis?.[1]).toMatchObject({
      valid: false,
      failedAtStage: "panel_geometry",
    });
    expect(diagnosis?.[2]).toBe(2);
    expect(diagnosis?.[3]).toBe(SAFETY_IDENTIFIER);
    expect(mocks.runAuthorizedLiveRoute.mock.calls[0]?.[0]).toMatchObject({
      operation: "repair",
      reservedInputTokens: API_BODY_LIMIT_BYTES.repair / 4,
      reservedOutputTokens: LIVE_OPERATION_POLICIES.repair.maximumOutputTokens,
    });
  });

  it("reports still_invalid after an accepted but insufficient patch", async () => {
    const program = invalidPanelProgram();
    mocks.diagnoseRepair.mockResolvedValueOnce(repairPatch(program, 1, 0.3));

    const response = await repairPost(
      authorizedRequest("/api/repair", {
        intent: fixtureIntent(),
        program,
        candidateId: "candidate-still-invalid",
        repairCycle: 1,
      }),
    );

    expect(await response.json()).toMatchObject({
      status: "still_invalid",
      patch: { repairCycle: 1 },
      report: { valid: false },
      score: { eligible: false },
      diagnostic: {
        stage: "repair",
        code: "REPAIR_INCOMPLETE",
        modelCall: "attempted",
        failureIds: ["geometry.simple_panel#panel-base"],
      },
    });
    expect(mocks.diagnoseRepair).toHaveBeenCalledOnce();
  });

  it("fails safely for no patch, wrong-cycle patches, and provider errors", async () => {
    const program = invalidPanelProgram();
    mocks.diagnoseRepair.mockResolvedValueOnce(null);
    const noPatch = await repairPost(
      authorizedRequest("/api/repair", {
        intent: fixtureIntent(),
        program,
        candidateId: "candidate-no-patch",
        repairCycle: 1,
      }),
    );
    expect(await noPatch.json()).toMatchObject({
      status: "infeasible",
      patch: null,
      report: { valid: false },
      diagnostic: {
        stage: "repair",
        code: "REPAIR_INFEASIBLE",
        modelCall: "attempted",
        failureIds: ["geometry.simple_panel#panel-base"],
      },
    });

    mocks.diagnoseRepair.mockResolvedValueOnce(repairPatch(program, 2));
    const wrongCycle = await repairPost(
      authorizedRequest("/api/repair", {
        intent: fixtureIntent(),
        program,
        candidateId: "candidate-wrong-cycle",
        repairCycle: 1,
      }),
    );
    expect(await wrongCycle.json()).toMatchObject({
      status: "infeasible",
      patch: null,
      program,
      diagnostic: {
        stage: "repair",
        code: "REPAIR_PATCH_REJECTED",
        modelCall: "attempted",
        failureIds: ["geometry.simple_panel#panel-base"],
      },
    });

    const providerDetail = "private provider repair response";
    mocks.diagnoseRepair.mockRejectedValueOnce(new Error(providerDetail));
    const providerFailure = await repairPost(
      authorizedRequest("/api/repair", {
        intent: fixtureIntent(),
        program,
        candidateId: "candidate-provider-failure",
        repairCycle: 1,
      }),
    );
    const serialized = JSON.stringify(await providerFailure.json());
    expect(providerFailure.status).toBe(502);
    expect(serialized).toContain("MODEL_RESPONSE_ERROR");
    expect(serialized).toContain('"stage":"repair"');
    expect(serialized).toContain('"modelCall":"attempted"');
    expect(serialized).not.toContain(providerDetail);
  });
});
