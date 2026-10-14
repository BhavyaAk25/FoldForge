/**
 * Hard limits that keep FoldForge small and fast. `pnpm check:budgets` fails
 * CI when any is exceeded.
 *
 * Raising a budget is allowed only in its own commit that says what grew and
 * why it is worth it; lowering one after a cleanup is always welcome. Every
 * number here was measured from the codebase when it was set.
 */
export const BUDGETS = {
  /** Gzipped JavaScript the home page downloads (measured 519 KB). */
  homePageJsGzipKb: 530,
  /** Lines of TypeScript under src/ (measured 30,870). */
  sourceLines: 31_500,
  /** Lines of TypeScript under tests/ (measured 21,034). */
  testLines: 21_500,
  /** Test lines per source line (measured 0.68): tests may not outgrow code. */
  testToSourceRatio: 0.75,
  /** Runtime dependencies in package.json (measured 10). */
  runtimeDependencies: 10,
  /** Development dependencies in package.json (measured 17). */
  devDependencies: 17,
  /**
   * Slowest template design, from prompt to verified program, on the CI
   * runner (measured under 2 s locally; CI runners are about 4x slower).
   */
  templateDesignMs: 10_000,
} as const;

/** Prompts timed for `templateDesignMs`: one per template family. */
export const TIMED_PROMPTS = [
  "a gift box 120 x 80 x 40 mm",
  "a ring box 50 x 50 x 40 mm",
  "a phone stand 80 x 100 x 70 mm",
  "a star bookmark",
  "a duck 120 x 90 x 30 mm",
  "a pop-up birthday card with a heart",
] as const;
