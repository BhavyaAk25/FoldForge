import { exportSvg } from "@/core/export/svg";
import { verifyCandidate } from "@/core/verification";
import { apiError, parseJsonBody } from "@/server/api/response";
import { ExportRequestSchema, toCandidate } from "@/server/api/schemas";

export const POST = async (request: Request): Promise<Response> => {
  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = ExportRequestSchema.safeParse(body.value);
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

  return new Response(exportSvg(candidate, parsed.data.constraint), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="foldforge-${candidate.id}.svg"`,
      "Cache-Control": "no-store",
    },
  });
};
