import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

import { intentFromPromptKeywords } from "../src/core/fabrication/prompt-intent";
import { templateFallback } from "../src/server/fabrication-ai/plan-response";
import { BUDGETS, TIMED_PROMPTS } from "./budgets";

/**
 * Checks the limits in scripts/budgets.ts. Run after `next build`, which
 * produces the home page this measures.
 */

interface Measurement {
  readonly name: string;
  readonly actual: number;
  readonly limit: number;
  readonly unit: string;
}

const trackedLines = (pattern: string): number =>
  execFileSync("git", ["ls-files", pattern], { encoding: "utf8" })
    .split("\n")
    .filter((path) => path.length > 0)
    .reduce(
      (total, path) => total + readFileSync(path, "utf8").split("\n").length,
      0,
    );

const homePageJsGzipKb = (): number => {
  const page = ".next/server/app/index.html";
  if (!existsSync(page)) {
    throw new Error(
      "Run `pnpm build` first: .next/server/app/index.html is missing.",
    );
  }
  const html = readFileSync(page, "utf8");
  const scripts = new Set(
    [...html.matchAll(/\/_next\/(static\/[^"'\s]+\.js)/gu)].map(
      (match) => match[1]!,
    ),
  );
  let bytes = 0;
  for (const script of scripts) {
    bytes += gzipSync(readFileSync(`.next/${script}`)).length;
  }
  return Math.round(bytes / 1024);
};

const slowestTemplateDesignMs = (): number => {
  let slowest = 0;
  for (const prompt of TIMED_PROMPTS) {
    const intent = intentFromPromptKeywords(prompt);
    const start = performance.now();
    const result = intent ? templateFallback(intent, 1) : null;
    const elapsed = performance.now() - start;
    if (!result)
      throw new Error(`No verified template design for "${prompt}".`);
    slowest = Math.max(slowest, elapsed);
  }
  return Math.round(slowest);
};

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  readonly dependencies: Record<string, string>;
  readonly devDependencies: Record<string, string>;
};
const sourceLines = trackedLines("src/*.ts*");
const testLines = trackedLines("tests/*.ts");

const measurements: readonly Measurement[] = [
  {
    name: "Home page JavaScript",
    actual: homePageJsGzipKb(),
    limit: BUDGETS.homePageJsGzipKb,
    unit: "KB gzip",
  },
  {
    name: "Source lines",
    actual: sourceLines,
    limit: BUDGETS.sourceLines,
    unit: "lines",
  },
  {
    name: "Test lines",
    actual: testLines,
    limit: BUDGETS.testLines,
    unit: "lines",
  },
  {
    name: "Test-to-source ratio",
    actual: Math.round((testLines / sourceLines) * 100) / 100,
    limit: BUDGETS.testToSourceRatio,
    unit: "",
  },
  {
    name: "Runtime dependencies",
    actual: Object.keys(packageJson.dependencies).length,
    limit: BUDGETS.runtimeDependencies,
    unit: "",
  },
  {
    name: "Dev dependencies",
    actual: Object.keys(packageJson.devDependencies).length,
    limit: BUDGETS.devDependencies,
    unit: "",
  },
  {
    name: "Slowest template design",
    actual: slowestTemplateDesignMs(),
    limit: BUDGETS.templateDesignMs,
    unit: "ms",
  },
];

let failed = false;
for (const { name, actual, limit, unit } of measurements) {
  const over = actual > limit;
  failed ||= over;
  console.log(
    `${over ? "OVER" : "ok  "}  ${name.padEnd(26)} ${String(actual).padStart(7)} / ${limit} ${unit}`,
  );
}
if (failed) {
  console.error(
    "\nA budget was exceeded. Shrink the change, or raise the budget in scripts/budgets.ts in its own commit explaining why.",
  );
  process.exit(1);
}
