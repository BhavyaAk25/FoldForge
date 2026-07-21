import { FABRICATION_LIMITS } from "./limits";
import type { FabricationIntentV1 } from "./types";

export interface ExplicitPromptResourceLimits {
  readonly maximumPanels: number | null;
  readonly maximumJointAndConnectorCount: number | null;
}

const COUNT_WORDS = new Map<string, number>([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
  ["thirteen", 13],
  ["fourteen", 14],
  ["fifteen", 15],
  ["sixteen", 16],
  ["seventeen", 17],
  ["eighteen", 18],
  ["nineteen", 19],
  ["twenty", 20],
  ["twenty-one", 21],
  ["twenty-two", 22],
  ["twenty-three", 23],
  ["twenty-four", 24],
]);

const COUNT_TOKEN =
  "(?:[0-9]{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:[-\\s](?:one|two|three|four))?)";
const LIMIT_PREFIX =
  "(?:at\\s+most|no\\s+more\\s+than|maximum(?:\\s+of)?|max(?:imum)?(?:\\s+of)?|up\\s+to|limit(?:ed)?\\s+to|use(?:\\s+only|\\s+exactly)?|exactly)";

const parseCount = (value: string): number | null => {
  const normalized = value.toLowerCase().replaceAll(/\s+/gu, "-");
  const numeric = Number.parseInt(normalized, 10);
  // COUNT_TOKEN admits only entries present in COUNT_WORDS when the token is
  // not numeric, so the lookup is total at this boundary.
  return Number.isSafeInteger(numeric) ? numeric : COUNT_WORDS.get(normalized)!;
};

const explicitMaximum = (
  prompt: string,
  resourcePattern: string,
  allowExactCompound: boolean,
): number | null => {
  const bounded = new RegExp(
    `\\b${LIMIT_PREFIX}\\s+(${COUNT_TOKEN})\\s+(?:total\\s+)?${resourcePattern}\\b`,
    "iu",
  ).exec(prompt);
  if (bounded?.[1]) return parseCount(bounded[1]);
  if (!allowExactCompound) return null;
  const exact = new RegExp(
    `\\b(${COUNT_TOKEN})(?:-|\\s+)${resourcePattern}\\b`,
    "iu",
  ).exec(prompt);
  return exact?.[1] ? parseCount(exact[1]) : null;
};

export const explicitPromptResourceLimits = (
  prompt: string,
): ExplicitPromptResourceLimits => ({
  maximumPanels: explicitMaximum(prompt, "(?:panels?|pieces?)", true),
  maximumJointAndConnectorCount: explicitMaximum(
    prompt,
    "(?:joints?(?:\\s*(?:and|plus|/)\\s*connectors?)?|connectors?|joins?|mechanism\\s+features?)",
    false,
  ),
});

/**
 * Panel and mechanism ceilings are compiler policy unless the user explicitly
 * asks for a smaller count. The language model may describe that request, but
 * it cannot silently reduce the compiler's available design space.
 */
export const normalizeFabricationIntentBudget = (
  intent: FabricationIntentV1,
  exactPrompt: string,
): FabricationIntentV1 => {
  const explicit = explicitPromptResourceLimits(exactPrompt);
  return {
    ...intent,
    sourcePrompt: exactPrompt,
    fabricationBudget: {
      ...intent.fabricationBudget,
      maximumPanels: Math.min(
        explicit.maximumPanels ?? FABRICATION_LIMITS.maximumPanelCount,
        FABRICATION_LIMITS.maximumPanelCount,
      ),
      maximumJointAndConnectorCount: Math.min(
        explicit.maximumJointAndConnectorCount ??
          FABRICATION_LIMITS.maximumJointAndConnectorCount,
        FABRICATION_LIMITS.maximumJointAndConnectorCount,
      ),
    },
  };
};
