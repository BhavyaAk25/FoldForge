import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as compilePost } from "@/app/api/compile/route";
import { GET as healthGet } from "@/app/api/health/route";
import { POST as intentPost } from "@/app/api/intent/route";
import { POST as programsPost } from "@/app/api/programs/route";

const ORIGIN = "http://localhost:3000";

const post = (path: string, body: unknown): Request =>
  new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify(body),
  });

// The full no-AI path the UI follows: prompt -> intent -> program -> compile.
describe("template mode (no AI provider configured)", () => {
  beforeEach(() => {
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("AI_BASE_URL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reports that AI is off", async () => {
    const health = await healthGet().json();
    expect(health.liveAiEnabled).toBe(false);
    expect(health.aiModel).toBeNull();
  });

  it("turns a box prompt into a verified design", async () => {
    const intentResponse = await intentPost(
      post("/api/intent", { prompt: "a gift box 120 x 80 x 40 mm" }),
    );
    expect(intentResponse.status).toBe(200);
    const intent = await intentResponse.json();

    const programsResponse = await programsPost(
      post("/api/programs", {
        intent,
        candidateOrdinal: 1,
        usedTopologyIds: [],
      }),
    );
    expect(programsResponse.status).toBe(200);
    const { proposal } = await programsResponse.json();
    expect(proposal.provenance.generationSource).toBe("template");

    const compileResponse = await compilePost(
      post("/api/compile", {
        intent,
        program: proposal.program,
        candidateId: "candidate-template-box",
      }),
    );
    const compiled = await compileResponse.json();
    expect(compiled.status).toBe("passed");
    expect(compiled.report.valid).toBe(true);
  }, 60_000);

  it("explains honestly when a prompt needs AI", async () => {
    const response = await intentPost(
      post("/api/intent", { prompt: "a walking robot" }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("PROMPT_NEEDS_AI");
  });

  it("rejects cross-origin requests", async () => {
    const response = await intentPost(
      new Request(`${ORIGIN}/api/intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
        body: JSON.stringify({ prompt: "a box" }),
      }),
    );
    expect(response.status).toBe(403);
  });
});
