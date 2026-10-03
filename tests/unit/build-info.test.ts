import { describe, expect, it } from "vitest";

import { readBuildSha } from "@/server/build-info";

describe("readBuildSha", () => {
  it("reads only validated build SHA values in deployment priority order", () => {
    expect(
      readBuildSha({
        VERCEL_GIT_COMMIT_SHA: "ABCDEF1234567",
        GITHUB_SHA: "1111111111111",
      }),
    ).toBe("abcdef1234567");
    expect(readBuildSha({ GITHUB_SHA: "abcdef1234567" })).toBe("abcdef1234567");
    expect(readBuildSha({ VERCEL_GIT_COMMIT_SHA: "not-a-sha-or-secret" })).toBe(
      null,
    );
  });
});
