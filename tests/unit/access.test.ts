import { afterEach, describe, expect, it, vi } from "vitest";

import {
  accessCodeMatches,
  createAccessToken,
  verifyAccessToken,
} from "@/server/access";
import { safetyIdentifier } from "@/server/ai/safety";

afterEach(() => vi.unstubAllEnvs());

describe("access and privacy identifiers", () => {
  it("signs and expires access tokens", () => {
    vi.stubEnv("ACCESS_COOKIE_SECRET", "0123456789abcdef0123456789abcdef");
    const token = createAccessToken(1_000);
    expect(verifyAccessToken(token, 1_001)).toBe(true);
    expect(verifyAccessToken(token, 10_000)).toBe(false);
    expect(verifyAccessToken(`${token}tampered`, 1_001)).toBe(false);
  });

  it("rejects malformed tokens and short secrets", () => {
    vi.stubEnv("ACCESS_COOKIE_SECRET", "short");
    expect(() => createAccessToken(1_000)).toThrow("at least 32");
    expect(verifyAccessToken("malformed", 1_000)).toBe(false);
  });

  it("compares access codes without exposing them", () => {
    vi.stubEnv("DEMO_ACCESS_CODE", "judge-only");
    expect(accessCodeMatches("judge-only")).toBe(true);
    expect(accessCodeMatches("judge")).toBe(false);
  });

  it("hashes browser installation IDs into bounded safety identifiers", () => {
    const identifier = safetyIdentifier("browser-installation-123");
    expect(identifier).toMatch(/^ff_[0-9a-f]{40}$/);
    expect(identifier).not.toContain("browser-installation-123");
    expect(identifier).toBe(safetyIdentifier("browser-installation-123"));
  });
});
