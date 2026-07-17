import { describe, expect, it } from "vitest";

import { POST as dxfPost } from "@/app/api/export/dxf/route";
import { POST as foldPost } from "@/app/api/export/fold/route";
import { POST as glbPost } from "@/app/api/export/glb/route";
import { POST as jsonPost } from "@/app/api/export/json/route";
import { POST as svgPost } from "@/app/api/export/svg/route";
import {
  buildFabricationCandidate,
  type CandidateProvenanceInput,
} from "@/core/fabrication/candidate";
import { createFacetedDuckGiftBoxShowcase } from "@/core/fabrication/examples";
import { FOLD_EXTENSION_KEYS } from "@/core/fabrication/export";
import { CandidateV2Schema } from "@/core/fabrication/schemas";
import type { CandidateV2 } from "@/core/fabrication/types";
import { sha256HexBytes } from "@/core/sha256";
import { API_BODY_LIMIT_BYTES } from "@/server/api/security-policy";

import { fixtureIntent, fixtureProgram } from "../fixtures/fabrication";

const provenance = {
  compilerVersion: "route-test-1",
  generatedAtIso: "2026-07-14T12:00:00.000Z",
  deterministicSeed: 2_026_071_4,
  modelId: null,
  modelResponseId: null,
  parentCandidateId: null,
  appliedPatchIds: [],
  repairCycle: 0,
} as const satisfies CandidateProvenanceInput;

const candidateFrom = (
  selectionStatus: "eligible" | "selected" = "selected",
): CandidateV2 => {
  const built = buildFabricationCandidate({
    candidateId: "candidate-export-route",
    intent: fixtureIntent(),
    program: fixtureProgram(),
    rank: 1,
    selectionStatus,
    provenance,
  });
  if (!built.ok) throw new Error(JSON.stringify(built.error));
  return built.value;
};

const request = (
  url: string,
  body: unknown,
  options: {
    readonly origin?: string;
    readonly contentLength?: number;
  } = {},
): Request => {
  const headers = new Headers({
    "Content-Type": "application/json",
    Origin: options.origin ?? new URL(url).origin,
  });
  if (options.contentLength !== undefined) {
    headers.set("Content-Length", String(options.contentLength));
  }
  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
};

const invalidCandidateFrom = (candidate: CandidateV2): CandidateV2 => {
  const invalid: CandidateV2 = {
    ...candidate,
    selectionStatus: "invalid",
    verification: {
      ...candidate.verification,
      valid: false,
      completedStage: "collision",
      failedAtStage: "collision",
    },
    score: {
      eligible: false,
      totalScore: null,
      components: [],
      rankingReason: null,
    },
  };
  return CandidateV2Schema.parse(invalid);
};

const crossIrCandidateFrom = (candidate: CandidateV2): CandidateV2 => {
  const path = candidate.ir.paths[0];
  const point = path?.points[0];
  if (!path || !point) throw new Error("Fixture path missing.");
  return CandidateV2Schema.parse({
    ...candidate,
    ir: {
      ...candidate.ir,
      paths: [
        {
          ...path,
          points: [
            { ...point, xMm: point.xMm + 0.25 },
            ...path.points.slice(1),
          ],
        },
        ...candidate.ir.paths.slice(1),
      ],
    },
  });
};

describe("fabrication export routes", () => {
  it.each([
    ["svg", svgPost, "image/svg+xml"],
    ["dxf", dxfPost, "application/dxf"],
    ["glb", glbPost, "model/gltf-binary"],
    ["json", jsonPost, "application/json"],
  ] as const)(
    "exports a selected candidate as source-bound %s bytes",
    async (format, post, mimeType) => {
      const candidate = candidateFrom();
      const response = await post(
        request(`http://localhost/api/export/${format}`, { candidate }),
      );
      const bytes = new Uint8Array(await response.arrayBuffer());

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("content-type")).toContain(mimeType);
      expect(response.headers.get("content-disposition")).toContain(
        "attachment; filename=",
      );
      expect(response.headers.get("x-foldforge-artifact-sha256")).toBe(
        sha256HexBytes(bytes),
      );
      expect(response.headers.get("x-foldforge-source-ir-sha256")).toBe(
        candidate.verification.irHash,
      );
      expect(bytes.byteLength).toBeGreaterThan(0);
    },
  );

  it("reports an honest FOLD omission for an unsupported coupling profile", async () => {
    const response = await foldPost(
      request("http://localhost/api/export/fold", {
        candidate: candidateFrom(),
      }),
    );
    expect(response.status).toBe(422);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "FORMAT_UNAVAILABLE",
        message: expect.stringMatching(/coupling/i),
      },
    });
  });

  it("downloads a parseable FOLD file for the fold-only duck showcase", async () => {
    const showcase = createFacetedDuckGiftBoxShowcase();
    const built = buildFabricationCandidate({
      candidateId: "candidate-duck-fold-route",
      intent: showcase.intent,
      program: showcase.program,
      rank: 1,
      selectionStatus: "selected",
      provenance,
    });
    if (!built.ok) throw new Error(JSON.stringify(built.error));

    const response = await foldPost(
      request("http://localhost/api/export/fold", {
        candidate: built.value,
      }),
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const document: unknown = JSON.parse(new TextDecoder().decode(bytes));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/vnd.fold+json",
    );
    expect(response.headers.get("content-disposition")).toContain(".fold");
    expect(response.headers.get("x-foldforge-artifact-sha256")).toBe(
      sha256HexBytes(bytes),
    );
    expect(document).toMatchObject({
      file_spec: 1.2,
      frame_unit: "mm",
      [FOLD_EXTENSION_KEYS.sourceCandidateId]: "candidate-duck-fold-route",
    });
  });

  it("rejects eligible, invalid, and cross-IR candidate payloads", async () => {
    const selected = candidateFrom();
    const cases = [
      {
        candidate: candidateFrom("eligible"),
        status: 409,
        code: "CANDIDATE_NOT_SELECTED",
      },
      {
        candidate: invalidCandidateFrom(selected),
        status: 422,
        code: "CANDIDATE_NOT_VERIFIED",
      },
      {
        candidate: crossIrCandidateFrom(selected),
        status: 422,
        code: "CANDIDATE_NOT_VERIFIED",
      },
    ] as const;

    for (const testCase of cases) {
      const response = await svgPost(
        request("http://localhost/api/export/svg", {
          candidate: testCase.candidate,
        }),
      );
      expect(response.status).toBe(testCase.status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject({
        error: { code: testCase.code },
      });
    }
  });

  it("rejects cross-origin and over-cap export requests before candidate work", async () => {
    const crossOrigin = await svgPost(
      request(
        "http://localhost/api/export/svg",
        { candidate: candidateFrom() },
        { origin: "https://evil.example" },
      ),
    );
    expect(crossOrigin.status).toBe(403);
    expect(crossOrigin.headers.get("cache-control")).toBe("no-store");
    await expect(crossOrigin.json()).resolves.toMatchObject({
      error: { code: "REQUEST_ORIGIN_DENIED" },
    });

    const overCap = await svgPost(
      request(
        "http://localhost/api/export/svg",
        {},
        { contentLength: API_BODY_LIMIT_BYTES.exports + 1 },
      ),
    );
    expect(overCap.status).toBe(413);
    expect(overCap.headers.get("cache-control")).toBe("no-store");
    await expect(overCap.json()).resolves.toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
  });
});
