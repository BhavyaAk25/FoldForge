import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

const PRODUCTION_COOKIE_NAME = "__Host-foldforge_access";
const LOCAL_COOKIE_NAME = "foldforge_access";
const TOKEN_LIFETIME_SECONDS = 2 * 60 * 60;
const MAXIMUM_TOKEN_LENGTH = 1_024;
const MAXIMUM_CLOCK_SKEW_SECONDS = 60;
const SUBJECT_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const ACCESS_SESSION_SUBJECT = Symbol("access-session-subject");

export interface AccessSessionSubject {
  readonly value: string;
  readonly [ACCESS_SESSION_SUBJECT]: true;
}

export type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export interface AccessSession {
  readonly subject: AccessSessionSubject;
  readonly issuedAtSeconds: number;
  readonly expiresAtSeconds: number;
}

interface AccessTokenPayload {
  readonly version: 1;
  readonly subject: string;
  readonly issuedAtSeconds: number;
  readonly expiresAtSeconds: number;
}

interface AccessCookieOptions {
  readonly secure?: boolean;
}

const secret = (environment: ServerEnvironment = process.env): string | null =>
  environment.ACCESS_COOKIE_SECRET ?? null;

const signature = (payload: string, signingSecret: string): string =>
  createHmac("sha256", signingSecret).update(payload).digest("base64url");

const signingSecret = (environment: ServerEnvironment): string => {
  const value = secret(environment);
  if (!value || value.length < 32) {
    throw new Error(
      "ACCESS_COOKIE_SECRET must contain at least 32 characters.",
    );
  }
  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const accessSessionSubject = (value: string): AccessSessionSubject => ({
  value,
  [ACCESS_SESSION_SUBJECT]: true,
});

const parsePayload = (encodedPayload: string): AccessTokenPayload | null => {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
    if (!isRecord(parsed)) return null;
    const keys = Object.keys(parsed).sort().join(",");
    if (keys !== "expiresAtSeconds,issuedAtSeconds,subject,version") {
      return null;
    }
    const { expiresAtSeconds, issuedAtSeconds, subject, version } = parsed;
    if (
      version !== 1 ||
      typeof subject !== "string" ||
      !SUBJECT_PATTERN.test(subject) ||
      typeof issuedAtSeconds !== "number" ||
      typeof expiresAtSeconds !== "number" ||
      !Number.isSafeInteger(issuedAtSeconds) ||
      !Number.isSafeInteger(expiresAtSeconds)
    ) {
      return null;
    }
    return { version, subject, issuedAtSeconds, expiresAtSeconds };
  } catch {
    return null;
  }
};

const secureCookieEnvironment = (
  environment: ServerEnvironment = process.env,
): boolean =>
  environment.VERCEL_ENV === "production" ||
  environment.NODE_ENV === "production";

export const accessCookieName = (secure = secureCookieEnvironment()): string =>
  secure ? PRODUCTION_COOKIE_NAME : LOCAL_COOKIE_NAME;

export const createAccessToken = (
  nowSeconds = Math.floor(Date.now() / 1_000),
  environment: ServerEnvironment = process.env,
): string => {
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) {
    throw new RangeError("Access token time must be a non-negative integer.");
  }
  const payload: AccessTokenPayload = {
    version: 1,
    subject: randomBytes(24).toString("base64url"),
    issuedAtSeconds: nowSeconds,
    expiresAtSeconds: nowSeconds + TOKEN_LIFETIME_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${encodedPayload}.${signature(encodedPayload, signingSecret(environment))}`;
};

export const readAccessSession = (
  token: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
  environment: ServerEnvironment = process.env,
): AccessSession | null => {
  if (
    token.length === 0 ||
    token.length > MAXIMUM_TOKEN_LENGTH ||
    !Number.isSafeInteger(nowSeconds) ||
    nowSeconds < 0
  ) {
    return null;
  }
  const configuredSecret = secret(environment);
  if (!configuredSecret || configuredSecret.length < 32) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, suppliedSignature] = parts;
  if (!encodedPayload || !suppliedSignature) return null;

  const expectedSignature = signature(encodedPayload, configuredSecret);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }

  const payload = parsePayload(encodedPayload);
  if (!payload) return null;
  const lifetimeSeconds = payload.expiresAtSeconds - payload.issuedAtSeconds;
  if (
    payload.issuedAtSeconds > nowSeconds + MAXIMUM_CLOCK_SKEW_SECONDS ||
    payload.expiresAtSeconds <= nowSeconds ||
    lifetimeSeconds <= 0 ||
    lifetimeSeconds > TOKEN_LIFETIME_SECONDS
  ) {
    return null;
  }
  return {
    subject: accessSessionSubject(payload.subject),
    issuedAtSeconds: payload.issuedAtSeconds,
    expiresAtSeconds: payload.expiresAtSeconds,
  };
};

export const verifyAccessToken = (
  token: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
  environment: ServerEnvironment = process.env,
): boolean => readAccessSession(token, nowSeconds, environment) !== null;

export const readAccessSessionFromRequest = (
  request: NextRequest,
  nowSeconds = Math.floor(Date.now() / 1_000),
  environment: ServerEnvironment = process.env,
): AccessSession | null => {
  const cookie = request.cookies.get(
    accessCookieName(secureCookieEnvironment(environment)),
  );
  return readAccessSession(cookie?.value ?? "", nowSeconds, environment);
};

export const accessRequired = (
  environment: ServerEnvironment = process.env,
): boolean => Boolean(environment.DEMO_ACCESS_CODE);

export const liveAccessConfigurationValid = (
  environment: ServerEnvironment = process.env,
): boolean =>
  (environment.DEMO_ACCESS_CODE?.length ?? 0) >= 12 &&
  (environment.ACCESS_COOKIE_SECRET?.length ?? 0) >= 32;

export const accessCookie = (
  token: string,
  options: AccessCookieOptions = {},
) => {
  const secure = options.secure ?? secureCookieEnvironment();
  return {
    name: accessCookieName(secure),
    value: token,
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/",
    maxAge: TOKEN_LIFETIME_SECONDS,
  };
};

export const accessCodeMatches = (
  supplied: string,
  environment: ServerEnvironment = process.env,
): boolean => {
  const expected = environment.DEMO_ACCESS_CODE;
  if (!expected) return false;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
};
