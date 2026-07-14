import { NextResponse } from "next/server";

export const apiError = (
  code: string,
  message: string,
  status: number,
  details: readonly string[] = [],
): NextResponse =>
  NextResponse.json({ error: { code, message, details } }, { status });

const MAXIMUM_JSON_BODY_BYTES = 64 * 1024;

export type JsonBodyResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly response: NextResponse };

export const parseJsonBody = async (
  request: Request,
): Promise<JsonBodyResult> => {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    return {
      ok: false,
      response: apiError(
        "UNSUPPORTED_MEDIA_TYPE",
        "Requests must use application/json.",
        415,
      ),
    };
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAXIMUM_JSON_BODY_BYTES
  ) {
    return {
      ok: false,
      response: apiError(
        "PAYLOAD_TOO_LARGE",
        "Request body exceeds 64 KiB.",
        413,
      ),
    };
  }

  try {
    const reader = request.body?.getReader();
    if (!reader) return { ok: true, value: null };
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteLength += chunk.value.byteLength;
      if (byteLength > MAXIMUM_JSON_BODY_BYTES) {
        await reader.cancel();
        return {
          ok: false,
          response: apiError(
            "PAYLOAD_TOO_LARGE",
            "Request body exceeds 64 KiB.",
            413,
          ),
        };
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return {
      ok: false,
      response: apiError(
        "INVALID_JSON",
        "Request body is not valid JSON.",
        400,
      ),
    };
  }
};
