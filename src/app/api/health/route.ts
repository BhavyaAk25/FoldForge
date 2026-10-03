import { NextResponse } from "next/server";

import { readBuildSha } from "@/server/build-info";
import { llmConfiguration } from "@/server/fabrication-ai/llm";

export const GET = (): NextResponse => {
  const ai = llmConfiguration();
  return NextResponse.json(
    {
      status: "ok",
      service: "foldforge",
      liveAiEnabled: ai !== null,
      aiModel: ai?.model ?? null,
      buildSha: readBuildSha(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
};
