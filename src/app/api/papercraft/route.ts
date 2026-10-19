import { NextResponse } from "next/server";

import { PapercraftRequestSchema } from "@/lib/papercraft-contract";
import { apiError, parseRouteJsonBody } from "@/server/api/response";
import { safeSecurityError } from "@/server/api/security-response";
import { runBoundedDeterministicRequest } from "@/server/deterministic-route-guard";
import { buildFigure } from "@/server/papercraft";
import { guardMutationRequest } from "@/server/request-guard";

export const dynamic = "force-dynamic";

/** Builds and checks a 3D papercraft figure: parts for the 3D view, printable pages, instructions. */
export const POST = async (request: Request): Promise<NextResponse> => {
  if (!guardMutationRequest(request).ok)
    return safeSecurityError("REQUEST_ORIGIN_DENIED");
  return runBoundedDeterministicRequest(request, "papercraft", async () => {
    const body = await parseRouteJsonBody(request, 8 * 1024);
    if (!body.ok) return body.response;
    const parsed = PapercraftRequestSchema.safeParse(body.value);
    if (!parsed.success)
      return apiError(
        "INVALID_REQUEST",
        "That figure is not one FoldForge can build.",
        400,
      );
    const built = buildFigure(parsed.data.figure);
    if (!built.ok) {
      return apiError(
        "FIGURE_UNBUILDABLE",
        "This figure did not pass its checks, so it is not shown. Try another size or colour.",
        422,
        [built.reason],
      );
    }
    return NextResponse.json(built.payload);
  });
};
