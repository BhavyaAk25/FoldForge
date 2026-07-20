import { z } from "zod";

import { sha256Hex } from "@/core/sha256";

export const ForgeResultBindingSchema = z
  .object({
    attemptId: z.string().uuid(),
    promptHash: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict();

export type ForgeResultBinding = z.infer<typeof ForgeResultBindingSchema>;

export const forgePromptHash = (prompt: string): string =>
  sha256Hex(prompt.trim());

export const forgeResultMatchesPrompt = (
  binding: ForgeResultBinding | null,
  prompt: string,
): boolean =>
  binding !== null && binding.promptHash === forgePromptHash(prompt);

export const sameForgeResultBinding = (
  left: ForgeResultBinding | null,
  right: ForgeResultBinding,
): boolean =>
  left?.attemptId === right.attemptId && left.promptHash === right.promptHash;
