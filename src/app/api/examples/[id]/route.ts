import { NextResponse } from "next/server";

import { apiError } from "@/server/api/response";
import { savedExample } from "@/server/candidates";
import { SAVED_EXAMPLE_IDS } from "@/lib/saved-examples";

/** A prepared example as a finished, verified candidate. */
export const GET = async (
  _request: Request,
  // Explicit rather than the generated RouteContext, so type-checking does
  // not depend on a prior `next build`.
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> => {
  const { id } = await context.params;
  const exampleId = SAVED_EXAMPLE_IDS.find((known) => known === id);
  const example = exampleId ? savedExample(exampleId) : null;
  return example
    ? NextResponse.json(example)
    : apiError(
        "EXAMPLE_NOT_FOUND",
        "There is no saved example with that id.",
        404,
      );
};
