import { NextResponse } from "next/server";

import { PAPER_MM } from "@/core/origami/catalog";
import { apiError } from "@/server/api/response";
import { origamiExport, type OrigamiExportFormat } from "@/server/origami";

const FORMATS: readonly OrigamiExportFormat[] = ["svg", "fold", "instructions"];

/** Downloads for a library model or design: crease pattern SVG, FOLD file, or printable instructions. */
export const GET = async (
  request: Request,
  context: { params: Promise<{ id: string; format: string }> },
): Promise<NextResponse> => {
  const { id, format } = await context.params;
  const known = FORMATS.find((f) => f === format);
  if (!known) {
    return apiError(
      "ORIGAMI_NOT_FOUND",
      "There is no such origami download.",
      404,
    );
  }
  // ?paper=<mm> prints the crease pattern for that square; out-of-range or
  // missing values use the default size.
  const query = new URL(request.url).searchParams;
  const asked = Number(query.get("paper"));
  const paperMm =
    asked >= PAPER_MM.minimum && asked <= PAPER_MM.maximum
      ? Math.round(asked)
      : PAPER_MM.default;
  // ?title= names a generated design after its subject: letters, digits,
  // and spaces only, so it is safe in a sheet and a file name.
  const title =
    (query.get("title") ?? "")
      .replace(/[^\p{L}\p{N} ]/gu, "")
      .trim()
      .slice(0, 40) || null;
  const file = origamiExport(id, known, paperMm, title);
  if (!file) {
    return apiError(
      "ORIGAMI_NOT_FOUND",
      "There is no such origami download.",
      404,
    );
  }
  return new NextResponse(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
};
