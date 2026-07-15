import type { NextResponse } from "next/server";

import { exportCandidateResponse } from "@/server/fabrication-export-route";

export const POST = (request: Request): Promise<NextResponse> =>
  exportCandidateResponse(request, "dxf");
