import { NextResponse } from "next/server";
import { z } from "zod";

import { PopupChoiceSchema } from "@/lib/papercraft-contract";
import { apiError, parseRouteJsonBody } from "@/server/api/response";
import { safeSecurityError } from "@/server/api/security-response";
import { runBoundedDeterministicRequest } from "@/server/deterministic-route-guard";
import { buildPopup } from "@/server/popup";
import { guardMutationRequest } from "@/server/request-guard";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({ card: PopupChoiceSchema }).strict();

/** Builds and checks a pop-up card: the card's pieces for the 3D view, its printable page, and the steps. */
export const POST = async (request: Request): Promise<NextResponse> => {
  if (!guardMutationRequest(request).ok)
    return safeSecurityError("REQUEST_ORIGIN_DENIED");
  return runBoundedDeterministicRequest(request, "popup", async () => {
    const body = await parseRouteJsonBody(request, 4 * 1024);
    if (!body.ok) return body.response;
    const parsed = RequestSchema.safeParse(body.value);
    if (!parsed.success)
      return apiError(
        "INVALID_REQUEST",
        "That card is not one FoldForge can build.",
        400,
      );
    const built = buildPopup(parsed.data.card);
    if (!built.ok) {
      return apiError(
        "CARD_UNBUILDABLE",
        "This card did not pass its checks, so it is not shown.",
        422,
        [built.reason],
      );
    }
    return NextResponse.json(built.payload);
  });
};
