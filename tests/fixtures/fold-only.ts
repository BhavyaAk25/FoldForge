import { intentFromPromptKeywords } from "@/core/fabrication/prompt-intent";
import { templateFallback } from "@/server/fabrication-ai/plan-response";

/**
 * A static, fold-only design from live code (the phone-stand template): a
 * base, a back, and a lip on two 90-degree folds, with no driver, so its FOLD
 * export is lossless.
 */
export const foldOnlyStand = () => {
  const intent = intentFromPromptKeywords("a phone stand");
  const templated = intent ? templateFallback(intent, 1) : null;
  if (!templated) throw new Error("The phone-stand template is missing.");
  return { intent: templated.intent, program: templated.proposal.program };
};
