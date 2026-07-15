import { NextResponse } from "next/server";

import { publicLiveState } from "@/server/api/public-live-state";
import { readBuildSha } from "@/server/build-info";

export const GET = (): NextResponse => {
  const live = publicLiveState();
  return NextResponse.json(
    {
      status: "ok",
      service: "foldforge",
      liveAiEnabled: live.enabled,
      liveAiBlockReason: live.blockReason,
      buildSha: readBuildSha(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
};
