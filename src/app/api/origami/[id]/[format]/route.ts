import { NextResponse } from "next/server";

import { isOrigamiModelId, PAPER_MM } from "@/core/origami/catalog";
import { apiError } from "@/server/api/response";
import { origamiExport, type OrigamiExportFormat } from "@/server/origami";

const FORMATS: readonly OrigamiExportFormat[] = ["svg", "fold", "instructions"];

/** Downloads for a library model: crease pattern SVG, FOLD file, or printable instructions. */
export const GET = async (
  request: Request,
  context: { params: Promise<{ id: string; format: string }> },
): Promise<NextResponse> => {
  const { id, format } = await context.params;
  const known = FORMATS.find((f) => f === format);
  if (!isOrigamiModelId(id) || !known) {
    return apiError(
      "ORIGAMI_NOT_FOUND",
      "There is no such origami download.",
      404,
    );
  }
  // ?paper=<mm> prints the crease pattern for that square; out-of-range or
  // missing values use the default size.
  const asked = Number(new URL(request.url).searchParams.get("paper"));
  const paperMm =
    asked >= PAPER_MM.minimum && asked <= PAPER_MM.maximum
      ? Math.round(asked)
      : PAPER_MM.default;
  const file = origamiExport(id, known, paperMm);
  return new NextResponse(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
};
