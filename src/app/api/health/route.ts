import { NextResponse } from "next/server";

import { accessRequired } from "@/server/access";
import { isLiveAiEnabled } from "@/server/ai/client";

export const GET = (): NextResponse =>
  NextResponse.json({
    status: "ok",
    service: "foldforge",
    model: "gpt-5.6-sol",
    liveAiEnabled: isLiveAiEnabled(),
    accessRequired: accessRequired(),
    physicalStatus: "awaiting_user",
  });
