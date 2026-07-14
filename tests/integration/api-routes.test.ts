import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as accessPost } from "@/app/api/access/route";
import { POST as compilePost } from "@/app/api/compile/route";
import { POST as foldPost } from "@/app/api/export/fold/route";
import { POST as svgPost } from "@/app/api/export/svg/route";
import { POST as finalizePost } from "@/app/api/finalize/route";
import { POST as generatePost } from "@/app/api/generate/route";
import { GET as healthGet } from "@/app/api/health/route";
import { POST as repairPost } from "@/app/api/repair/route";
import { DEMO_CONSTRAINT } from "@/core/constraints";
import type { Candidate, CandidateWithReport } from "@/core/types";

const jsonRequest = (url: string, body: unknown): Request =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const nextJsonRequest = (url: string, body: unknown): NextRequest =>
  new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const inputFor = (candidate: Candidate) => ({
  id: candidate.id,
  strategy: candidate.strategy,
  variant: candidate.variant,
  seed: candidate.seed,
  parameters: candidate.parameters,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("application API routes", () => {
  it("reports safe health state without exposing credentials", async () => {
    vi.stubEnv("ENABLE_LIVE_OPENAI", "false");
    const body = (await healthGet().json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: "ok",
      model: "gpt-5.6-sol",
      liveAiEnabled: false,
      physicalStatus: "awaiting_user",
    });
    expect(JSON.stringify(body)).not.toContain("sk-");
  });

  it("compiles provided controls in clearly labelled offline mode", async () => {
    vi.stubEnv("ENABLE_LIVE_OPENAI", "false");
    const response = await compilePost(
      nextJsonRequest("http://localhost/api/compile", {
        prompt: "Build a stand for the provided phone controls.",
        installationId: "test-installation-id",
        providedConstraint: DEMO_CONSTRAINT,
      }),
    );
    const body = (await response.json()) as {
      mode: string;
      outcome: { status: string };
    };
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      mode: "deterministic-controls",
      outcome: { status: "ready" },
    });
  });

  it("refuses an offline prompt that lacks provided controls", async () => {
    vi.stubEnv("ENABLE_LIVE_OPENAI", "false");
    const response = await compilePost(
      nextJsonRequest("http://localhost/api/compile", {
        prompt: "A stand",
        installationId: "test-installation-id",
        providedConstraint: null,
      }),
    );
    expect(response.status).toBe(503);
  });

  it("generates three representatives from nine server-verified candidates", async () => {
    const response = await generatePost(
      jsonRequest("http://localhost/api/generate", {
        constraint: DEMO_CONSTRAINT,
        seed: 20260714,
      }),
    );
    const body = (await response.json()) as {
      internalCandidateCount: number;
      candidates: CandidateWithReport[];
    };
    expect(response.status).toBe(200);
    expect(body.internalCandidateCount).toBe(9);
    expect(body.candidates).toHaveLength(3);
    expect(body.candidates.some((entry) => entry.report.valid)).toBe(true);
    expect(body.candidates.some((entry) => !entry.report.valid)).toBe(true);
  });

  it("repairs a client candidate only after server recomputation", async () => {
    const generated = await generatePost(
      jsonRequest("http://localhost/api/generate", {
        constraint: DEMO_CONSTRAINT,
        seed: 20260714,
      }),
    );
    const body = (await generated.json()) as {
      candidates: CandidateWithReport[];
    };
    const failure = body.candidates.find((entry) => !entry.report.valid);
    expect(failure).toBeDefined();
    if (!failure) return;

    vi.stubEnv("ENABLE_LIVE_OPENAI", "false");
    const repaired = await repairPost(
      nextJsonRequest("http://localhost/api/repair", {
        candidate: inputFor(failure.candidate),
        constraint: DEMO_CONSTRAINT,
        installationId: "test-installation-id",
      }),
    );
    const repairedBody = (await repaired.json()) as {
      mode: string;
      outcome: { status: string; report: { valid: boolean } };
    };
    expect(repaired.status).toBe(200);
    expect(repairedBody).toMatchObject({
      mode: "deterministic-offline-repair",
      outcome: { status: "passed", report: { valid: true } },
    });
  });

  it("finalizes only a code-selected valid winner", async () => {
    const generated = await generatePost(
      jsonRequest("http://localhost/api/generate", {
        constraint: DEMO_CONSTRAINT,
        seed: 20260714,
      }),
    );
    const body = (await generated.json()) as {
      candidates: CandidateWithReport[];
    };
    vi.stubEnv("ENABLE_LIVE_OPENAI", "false");
    const response = await finalizePost(
      nextJsonRequest("http://localhost/api/finalize", {
        candidates: body.candidates.map((entry) => inputFor(entry.candidate)),
        constraint: DEMO_CONSTRAINT,
        installationId: "test-installation-id",
      }),
    );
    const final = (await response.json()) as {
      winner: CandidateWithReport;
      narrative: { foldingSteps: string[]; limitations: string[] };
    };
    expect(response.status).toBe(200);
    expect(final.winner.report.valid).toBe(true);
    expect(final.narrative.foldingSteps.length).toBeGreaterThanOrEqual(4);
    expect(final.narrative.limitations.join(" ")).toContain(
      "Physical validation",
    );
  });

  it("exports validated SVG/FOLD and blocks a failed candidate", async () => {
    const generated = await generatePost(
      jsonRequest("http://localhost/api/generate", {
        constraint: DEMO_CONSTRAINT,
        seed: 20260714,
      }),
    );
    const body = (await generated.json()) as {
      candidates: CandidateWithReport[];
    };
    const valid = body.candidates.find((entry) => entry.report.valid);
    const invalid = body.candidates.find((entry) => !entry.report.valid);
    expect(valid && invalid).toBeTruthy();
    if (!valid || !invalid) return;

    const requestBody = {
      candidate: inputFor(valid.candidate),
      constraint: DEMO_CONSTRAINT,
    };
    const svg = await svgPost(
      jsonRequest("http://localhost/api/export/svg", requestBody),
    );
    const fold = await foldPost(
      jsonRequest("http://localhost/api/export/fold", requestBody),
    );
    expect(svg.status).toBe(200);
    expect(svg.headers.get("content-type")).toContain("image/svg+xml");
    expect(await svg.text()).toContain("calibration-50mm");
    expect(fold.status).toBe(200);
    expect(JSON.parse(await fold.text())).toMatchObject({ file_spec: 1.2 });

    const blocked = await svgPost(
      jsonRequest("http://localhost/api/export/svg", {
        candidate: inputFor(invalid.candidate),
        constraint: DEMO_CONSTRAINT,
      }),
    );
    expect(blocked.status).toBe(422);
  });

  it("rejects malformed JSON consistently", async () => {
    const response = await generatePost(
      new Request("http://localhost/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects non-JSON and oversized request bodies before schema work", async () => {
    const wrongType = await generatePost(
      new Request("http://localhost/api/generate", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      }),
    );
    expect(wrongType.status).toBe(415);

    const misleadingType = await generatePost(
      new Request("http://localhost/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json-patch+json" },
        body: "{}",
      }),
    );
    expect(misleadingType.status).toBe(415);

    const oversized = await generatePost(
      new Request("http://localhost/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(70 * 1024),
        },
        body: JSON.stringify({ value: "x".repeat(70 * 1024) }),
      }),
    );
    expect(oversized.status).toBe(413);
  });

  it("sets a short-lived HttpOnly cookie only for the correct access code", async () => {
    vi.stubEnv("DEMO_ACCESS_CODE", "too-short");
    vi.stubEnv("ACCESS_COOKIE_SECRET", "0123456789abcdef0123456789abcdef");
    const misconfigured = await accessPost(
      jsonRequest("http://localhost/api/access", { code: "too-short" }),
    );
    expect(misconfigured.status).toBe(503);

    vi.stubEnv("DEMO_ACCESS_CODE", "judge-only-2026");
    const denied = await accessPost(
      jsonRequest("http://localhost/api/access", { code: "wrong" }),
    );
    expect(denied.status).toBe(401);

    const granted = await accessPost(
      jsonRequest("http://localhost/api/access", { code: "judge-only-2026" }),
    );
    expect(granted.status).toBe(200);
    expect(granted.headers.get("set-cookie")).toContain("HttpOnly");
    expect(granted.headers.get("set-cookie")).toContain("SameSite=strict");
  });
});
