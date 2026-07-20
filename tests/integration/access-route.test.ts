import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as accessPost } from "@/app/api/access/route";
import { accessCookieName, readAccessSession } from "@/server/access";

const ACCESS_CODE = "judge-only-2026";
const ACCESS_SECRET = "0123456789abcdef0123456789abcdef";

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/access privacy", () => {
  it("returns only grant state while keeping access secrets server-side", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("DEMO_ACCESS_CODE", ACCESS_CODE);
    vi.stubEnv("ACCESS_COOKIE_SECRET", ACCESS_SECRET);

    const response = await accessPost(
      new Request("https://foldforge.example/api/access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://foldforge.example",
          "X-Forwarded-For": "198.51.100.47",
        },
        body: JSON.stringify({ code: ACCESS_CODE }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.clone().json()).resolves.toEqual({
      granted: true,
      required: true,
    });

    const serialized = await response.clone().text();
    const setCookie = response.headers.get("set-cookie") ?? "";
    const token = new RegExp(`${accessCookieName(false)}=([^;]+)`, "u").exec(
      setCookie,
    )?.[1];
    expect(token).toBeDefined();
    const session = token ? readAccessSession(token) : null;
    expect(session).not.toBeNull();
    expect(serialized).not.toContain(ACCESS_CODE);
    expect(serialized).not.toContain(ACCESS_SECRET);
    expect(setCookie).not.toContain(ACCESS_CODE);
    expect(setCookie).not.toContain(ACCESS_SECRET);
  });
});
