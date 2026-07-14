import { NextResponse } from "next/server";

export const apiError = (
  code: string,
  message: string,
  status: number,
  details: readonly string[] = [],
): NextResponse =>
  NextResponse.json({ error: { code, message, details } }, { status });

export const parseJsonBody = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};
