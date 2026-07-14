import { createHmac, timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

const COOKIE_NAME = "foldforge_demo_access";
const TOKEN_LIFETIME_SECONDS = 2 * 60 * 60;

const secret = (): string | null => process.env.ACCESS_COOKIE_SECRET ?? null;

const signature = (payload: string, signingSecret: string): string =>
  createHmac("sha256", signingSecret).update(payload).digest("base64url");

export const createAccessToken = (
  nowSeconds = Math.floor(Date.now() / 1_000),
): string => {
  const signingSecret = secret();
  if (!signingSecret || signingSecret.length < 32) {
    throw new Error(
      "ACCESS_COOKIE_SECRET must contain at least 32 characters.",
    );
  }
  const payload = `${nowSeconds + TOKEN_LIFETIME_SECONDS}`;
  return `${payload}.${signature(payload, signingSecret)}`;
};

export const verifyAccessToken = (
  token: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): boolean => {
  const signingSecret = secret();
  const [expiresText, suppliedSignature] = token.split(".");
  if (!signingSecret || !expiresText || !suppliedSignature) return false;

  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires <= nowSeconds) return false;
  const expected = signature(expiresText, signingSecret);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
};

export const accessRequired = (): boolean =>
  Boolean(process.env.DEMO_ACCESS_CODE);

export const hasLiveModelAccess = (request: NextRequest): boolean =>
  !accessRequired() ||
  verifyAccessToken(request.cookies.get(COOKIE_NAME)?.value ?? "");

export const accessCookie = (token: string) => ({
  name: COOKIE_NAME,
  value: token,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: TOKEN_LIFETIME_SECONDS,
});

export const accessCodeMatches = (supplied: string): boolean => {
  const expected = process.env.DEMO_ACCESS_CODE;
  if (!expected) return true;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
};
