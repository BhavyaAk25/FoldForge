import { execFileSync } from "node:child_process";

export interface BuildEvidence {
  readonly gitSha: string;
  readonly workingTreeClean: boolean;
}

const git = (arguments_: readonly string[]): string =>
  execFileSync("git", [...arguments_], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

export const captureBuildEvidence = (): BuildEvidence => {
  const gitSha = git(["rev-parse", "HEAD"]);
  if (!/^[0-9a-f]{40}$/u.test(gitSha)) {
    throw new Error("Paid evaluation requires an immutable Git commit SHA.");
  }
  return {
    gitSha,
    workingTreeClean: git(["status", "--porcelain=v1"]).length === 0,
  };
};

export const requireCleanBuildEvidence = (evidence: BuildEvidence): void => {
  if (!evidence.workingTreeClean) {
    throw new Error(
      "Paid evaluation requires a clean working tree so evidence binds one immutable build.",
    );
  }
};

export const requireUnchangedCleanBuildEvidence = (
  expected: BuildEvidence,
): BuildEvidence => {
  const current = captureBuildEvidence();
  requireCleanBuildEvidence(current);
  if (current.gitSha !== expected.gitSha) {
    throw new Error(
      "Paid evaluation build changed after its immutable evidence SHA was captured.",
    );
  }
  return current;
};
