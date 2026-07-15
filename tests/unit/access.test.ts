import { afterEach, describe, expect, it, vi } from "vitest";

import {
  accessCodeMatches,
  accessCookie,
  accessCookieName,
  createAccessToken,
  readAccessSession,
  verifyAccessToken,
} from "@/server/access";
import {
  safetyIdentifier,
  safetyIdentifierFromSubject,
} from "@/server/ai/safety";

afterEach(() => vi.unstubAllEnvs());

describe("access sessions and privacy identifiers", () => {
  it("signs random-subject sessions and rejects expiry or tampering", () => {
    vi.stubEnv("ACCESS_COOKIE_SECRET", "0123456789abcdef0123456789abcdef");
    const token = createAccessToken(1_000);
    const session = readAccessSession(token, 1_001);
    expect(session?.subject.value).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(session).toMatchObject({
      issuedAtSeconds: 1_000,
      expiresAtSeconds: 8_200,
    });
    expect(
      readAccessSession(createAccessToken(1_000), 1_001)?.subject,
    ).not.toEqual(session?.subject);
    expect(verifyAccessToken(token, 1_001)).toBe(true);
    expect(verifyAccessToken(`${token}.ignored`, 1_001)).toBe(false);
    expect(verifyAccessToken(token, 10_000)).toBe(false);
    expect(verifyAccessToken(`${token}tampered`, 1_001)).toBe(false);
    const [payload, tokenSignature] = token.split(".");
    expect(verifyAccessToken(`${payload}A.${tokenSignature}`, 1_001)).toBe(
      false,
    );
    expect(
      verifyAccessToken(token, 1_001, {
        ACCESS_COOKIE_SECRET: "abcdef0123456789abcdef0123456789",
      }),
    ).toBe(false);
  });

  it("rejects malformed tokens, future tokens, and short secrets", () => {
    vi.stubEnv("ACCESS_COOKIE_SECRET", "short");
    expect(() => createAccessToken(1_000)).toThrow("at least 32");
    expect(verifyAccessToken("malformed", 1_000)).toBe(false);

    vi.stubEnv("ACCESS_COOKIE_SECRET", "0123456789abcdef0123456789abcdef");
    const futureToken = createAccessToken(2_000);
    expect(verifyAccessToken(futureToken, 1_000)).toBe(false);
  });

  it("compares access codes without exposing them", () => {
    vi.stubEnv("DEMO_ACCESS_CODE", "judge-only");
    expect(accessCodeMatches("judge-only")).toBe(true);
    expect(accessCodeMatches("judge")).toBe(false);
  });

  it("uses a __Host- cookie in secure deployments and a local fallback", () => {
    const production = accessCookie("signed-token", { secure: true });
    expect(production).toMatchObject({
      name: "__Host-foldforge_access",
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
    });
    expect(accessCookieName(true)).toBe("__Host-foldforge_access");

    const local = accessCookie("signed-token", { secure: false });
    expect(local).toMatchObject({
      name: "foldforge_access",
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      path: "/",
    });
    expect(accessCookieName(false)).toBe("foldforge_access");

    vi.stubEnv("NODE_ENV", "production");
    expect(accessCookie("signed-token")).toMatchObject({
      name: "__Host-foldforge_access",
      secure: true,
    });
  });

  it("derives safety identifiers only from a valid signed session subject", () => {
    vi.stubEnv("ACCESS_COOKIE_SECRET", "0123456789abcdef0123456789abcdef");
    const token = createAccessToken();
    const session = readAccessSession(token);
    expect(session).not.toBeNull();
    if (!session) return;

    const identifier = safetyIdentifier(token);
    expect(identifier).toMatch(/^ff_[0-9a-f]{40}$/);
    expect(identifier).not.toContain(session.subject.value);
    expect(identifier).toBe(safetyIdentifierFromSubject(session.subject));
    expect(identifier).toBe(safetyIdentifier(token));
    const offlineIdentifier = safetyIdentifier("browser-installation-123");
    expect(offlineIdentifier).toMatch(/^ff_[0-9a-f]{40}$/);
    expect(offlineIdentifier).not.toContain("browser-installation-123");

    vi.stubEnv("ENABLE_LIVE_OPENAI", "true");
    vi.stubEnv("OPENAI_API_KEY", "configured");
    vi.stubEnv("DEMO_ACCESS_CODE", "judge-only-2026");
    expect(() => safetyIdentifier("browser-installation-123")).toThrow(
      "valid signed access session",
    );
  });
});
