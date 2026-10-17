/**
 * Names and prompt keywords of the origami library, kept apart from the fold
 * sequences so the browser can match a prompt without loading any geometry.
 */

export const ORIGAMI_CATALOG = [
  { id: "crane", name: "Crane", keywords: ["crane", "orizuru", "tsuru"] },
  {
    id: "flapping-bird",
    name: "Flapping bird",
    keywords: ["flapping bird", "bird"],
  },
  {
    id: "paper-plane",
    name: "Paper plane",
    keywords: [
      "paper plane",
      "paper airplane",
      "airplane",
      "aeroplane",
      "plane",
      "dart",
    ],
  },
  { id: "cup", name: "Paper cup", keywords: ["cup"] },
  { id: "bird-base", name: "Bird base", keywords: ["bird base"] },
  {
    id: "square-base",
    name: "Square base",
    keywords: ["square base", "preliminary base"],
  },
  {
    id: "waterbomb-base",
    name: "Waterbomb base",
    keywords: ["waterbomb base", "water bomb base", "waterbomb"],
  },
  { id: "fish-base", name: "Fish base", keywords: ["fish base"] },
  { id: "frog-base", name: "Frog base", keywords: ["frog base"] },
] as const;

export type OrigamiModelId = (typeof ORIGAMI_CATALOG)[number]["id"];

export const isOrigamiModelId = (value: string): value is OrigamiModelId =>
  ORIGAMI_CATALOG.some((entry) => entry.id === value);

const mentions = (text: string, phrase: string): boolean =>
  new RegExp(`\\b${phrase.replace(/ /gu, "[\\s-]+")}(?:e?s)?\\b`, "iu").test(
    text,
  );

/** Objects the cut-and-fold engine makes; "a crane-shaped box" is a box. */
const PAPERCRAFT_WORDS = [
  "box",
  "card",
  "stand",
  "organizer",
  "holder",
  "lamp",
  "bookmark",
  "tag",
  "envelope",
  "tray",
];

/**
 * The library model a prompt names, if any. The longest matching phrase wins,
 * so "bird base" picks the base rather than the flapping bird.
 */
export const matchOrigamiModel = (prompt: string): OrigamiModelId | null => {
  if (PAPERCRAFT_WORDS.some((word) => mentions(prompt, word))) return null;
  let best: { readonly id: OrigamiModelId; readonly length: number } | null =
    null;
  for (const entry of ORIGAMI_CATALOG) {
    for (const keyword of entry.keywords) {
      if (
        mentions(prompt, keyword) &&
        (!best || keyword.length > best.length)
      ) {
        best = { id: entry.id, length: keyword.length };
      }
    }
  }
  return best?.id ?? null;
};

const ORIGAMI_WORDS = ["origami", "fold", "folded", "folding"];

/**
 * Whether a prompt asks for origami without naming a library model, such as
 * "an origami swan": worth asking the AI for the closest model. Prompts that
 * name a papercraft object never qualify.
 */
export const asksForOrigami = (prompt: string): boolean =>
  !PAPERCRAFT_WORDS.some((word) => mentions(prompt, word)) &&
  ORIGAMI_WORDS.some((word) => mentions(prompt, word));

/** Default and allowed paper sizes, in millimetres. */
export const PAPER_MM = { default: 150, minimum: 50, maximum: 400 } as const;

/** The paper size a prompt gives ("a 20 cm square", "6 inch paper"), or null. */
export const paperSizeFromPrompt = (prompt: string): number | null => {
  const match = /(\d+(?:\.\d+)?)\s*(mm|cm|in(?:ch(?:es)?)?|")(?![a-z])/iu.exec(
    prompt,
  );
  if (!match) return null;
  const unit = match[2]!.toLowerCase();
  const mm = Number(match[1]) * (unit === "mm" ? 1 : unit === "cm" ? 10 : 25.4);
  return Math.round(Math.min(PAPER_MM.maximum, Math.max(PAPER_MM.minimum, mm)));
};
