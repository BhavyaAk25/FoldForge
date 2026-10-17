import { NextResponse } from "next/server";

import { isOrigamiModelId } from "@/core/origami/catalog";
import { apiError } from "@/server/api/response";
import { origamiExport, type OrigamiExportFormat } from "@/server/origami";

const FORMATS: readonly OrigamiExportFormat[] = ["svg", "fold", "instructions"];

/** Downloads for a library model: crease pattern SVG, FOLD file, or printable instructions. */
export const GET = async (
  _request: Request,
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
  const file = origamiExport(id, known);
  return new NextResponse(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
};
