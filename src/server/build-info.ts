const BUILD_SHA_KEYS = [
  "VERCEL_GIT_COMMIT_SHA",
  "GITHUB_SHA",
  "SOURCE_VERSION",
  "COMMIT_SHA",
] as const;

const SHA_PATTERN = /^[0-9a-f]{7,64}$/i;

type BuildEnvironment = Readonly<Record<string, string | undefined>>;

export const readBuildSha = (
  environment: BuildEnvironment = process.env,
): string | null => {
  for (const key of BUILD_SHA_KEYS) {
    const candidate = environment[key]?.trim();
    if (candidate && SHA_PATTERN.test(candidate)) {
      return candidate.toLowerCase();
    }
  }
  return null;
};
