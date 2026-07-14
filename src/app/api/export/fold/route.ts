import { exportFold } from "@/core/export/fold";
import { verifyCandidate } from "@/core/verification";
import { apiError, parseJsonBody } from "@/server/api/response";
import { ExportRequestSchema, toCandidate } from "@/server/api/schemas";

export const POST = async (request: Request): Promise<Response> => {
  const parsed = ExportRequestSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success)
    return apiError("INVALID_REQUEST", "Export input is malformed.", 400);
  const candidate = toCandidate(parsed.data.candidate);
  const report = verifyCandidate(candidate, parsed.data.constraint);
  if (!report.valid) {
    return apiError(
      "INVALID_CANDIDATE",
      "Failed candidates cannot be exported.",
      422,
      report.hardFailures,
    );
  }

  return new Response(exportFold(candidate), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="foldforge-${candidate.id}.fold"`,
      "Cache-Control": "no-store",
    },
  });
};
