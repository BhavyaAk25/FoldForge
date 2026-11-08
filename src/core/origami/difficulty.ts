import type { FoldStep } from "./sequence";

/**
 * How hard a model is to fold by hand, from its checked steps. Plain valley
 * and mountain folds are for beginners. A base, a reverse fold, a page turn,
 * a collapse (squash or petal fold), or a 3D form needs some practice. The
 * frog base (squash and petal folds on all four flaps) or a long sequence
 * heavy with those moves is advanced.
 */
export type Difficulty = "beginner" | "intermediate" | "advanced";

const SKILLED = new Set<FoldStep["kind"]>([
  "inside-reverse",
  "outside-reverse",
  "turn",
  "collapse",
]);

export const difficultyOf = (steps: readonly FoldStep[]): Difficulty => {
  const first = steps[0];
  const base = first?.kind === "creases" ? (first.howTo?.length ?? 1) : 0;
  const skilled = steps.filter((s) => SKILLED.has(s.kind)).length;
  const score = steps.length + 2 * skilled + base;
  if (base >= 5 || score >= 26) return "advanced";
  if (skilled > 0 || base > 0) return "intermediate";
  return "beginner";
};
