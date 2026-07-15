import { NextResponse } from "next/server";
import { z } from "zod";

import { finalizeFabricationCandidate } from "@/core/fabrication/candidate";
import { CandidateV2Schema } from "@/core/fabrication/schemas";
import type { ExportFormat } from "@/core/fabrication/types";
import { apiError, parseRouteJsonBody } from "@/server/api/response";
import { API_BODY_LIMIT_BYTES } from "@/server/api/security-policy";
import { runBoundedDeterministicRequest } from "@/server/deterministic-route-guard";
import { guardMutationRequest } from "@/server/request-guard";

const ExportCandidateRequestSchema = z
  .object({ candidate: CandidateV2Schema })
  .strict();

const noStore = <T>(response: NextResponse<T>): NextResponse<T> => {
  response.headers.set("Cache-Control", "no-store");
  return response;
};

const exportFailure = (kind: string): NextResponse => {
  switch (kind) {
    case "candidate_not_selected":
      return apiError(
        "CANDIDATE_NOT_SELECTED",
        "Select a verified candidate before exporting.",
        409,
      );
    case "invalid_candidate_selection":
    case "verification_failed":
    case "candidate_binding":
      return apiError(
        "CANDIDATE_NOT_VERIFIED",
        "The selected candidate no longer matches its verification evidence.",
        422,
      );
    case "invalid_export_request":
      return apiError("INVALID_EXPORT", "That export is not supported.", 400);
    default:
      return apiError(
        "EXPORT_FAILED",
        "The selected design could not be exported in that format.",
        422,
      );
  }
};

const handleExportCandidateResponse = async (
  request: Request,
  format: ExportFormat,
): Promise<NextResponse> => {
  const body = await parseRouteJsonBody(request, API_BODY_LIMIT_BYTES.exports);
  if (!body.ok) return noStore(body.response);
  const parsed = ExportCandidateRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    return noStore(
      apiError(
        "INVALID_REQUEST",
        "A strict selected candidate is required.",
        400,
      ),
    );
  }

  const finalized = finalizeFabricationCandidate({
    candidate: parsed.data.candidate,
    requestedFormats: [format],
  });
  if (!finalized.ok) {
    return noStore(exportFailure(finalized.error.kind));
  }
  const artifact = finalized.value.artifacts[0];
  if (!artifact) {
    return noStore(
      apiError(
        "FORMAT_UNAVAILABLE",
        finalized.value.foldOmission?.message ??
          "This design cannot be represented in that format.",
        422,
      ),
    );
  }

  const responseBytes = new Uint8Array(artifact.bytes.byteLength);
  responseBytes.set(artifact.bytes);
  return new NextResponse(responseBytes.buffer, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": artifact.metadata.mimeType,
      "Content-Disposition": `attachment; filename="${artifact.metadata.fileName}"`,
      "X-FoldForge-Artifact-SHA256": artifact.metadata.sha256,
      "X-FoldForge-Source-IR-SHA256": artifact.metadata.sourceIrHash,
    },
  });
};

export const exportCandidateResponse = async (
  request: Request,
  format: ExportFormat,
): Promise<NextResponse> => {
  const mutation = guardMutationRequest(request);
  if (!mutation.ok) {
    return noStore(
      apiError(
        "REQUEST_ORIGIN_DENIED",
        "The request origin is not allowed.",
        403,
      ),
    );
  }
  return runBoundedDeterministicRequest(request, `export:${format}`, () =>
    handleExportCandidateResponse(request, format),
  );
};
