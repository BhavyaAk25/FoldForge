import type { OrigamiModelId } from "./catalog";
import { foldableDesign, designId, type Design } from "./generate";

/**
 * Subjects the origami answers without AI: a word names either a library
 * model or a design in one of the families, tuned by hand to look like it.
 * A design here must fold as written (the tests check), so these never move.
 */

interface Subject {
  readonly words: readonly string[];
  readonly title: string;
  /** Paper colour when the prompt names none: a flamingo is pink. */
  readonly color: string;
  readonly answer:
    { readonly library: OrigamiModelId } | { readonly design: Design };
}

const neck = (
  neckAt: number,
  leanDeg: number,
  headAt: number,
  headDeg: number,
): { readonly design: Design } => ({
  design: { family: "neck", neckAt, leanDeg, headAt, headDeg },
});
/** A standing animal from two squares: the body, and a neck design tucked in. */
const standing = (
  neckAt: number,
  leanDeg: number,
  headAt: number,
  headDeg: number,
): { readonly design: Design } => ({
  design: { family: "standing", neckAt, leanDeg, headAt, headDeg },
});
const bird = (
  neckDeg: number,
  tailDeg: number,
  headTurnDeg: number,
  wingDeg: number,
): { readonly design: Design } => ({
  design: {
    family: "bird",
    neckDeg,
    tailDeg,
    headAt: 0.8,
    headTurnDeg,
    wingDeg,
  },
});

export const SUBJECTS: readonly Subject[] = [
  {
    words: ["cat", "kitten", "kitty"],
    title: "Cat",
    color: "#ec8a2f",
    answer: { library: "cat-face" },
  },
  {
    words: ["dog", "puppy", "pup"],
    title: "Dog",
    color: "#b07a4f",
    answer: { library: "dog-face" },
  },
  {
    words: ["swan", "goose"],
    title: "Swan",
    color: "#f4f1ea",
    answer: { library: "swan" },
  },
  {
    words: ["crane"],
    title: "Crane",
    color: "#c8463d",
    answer: { library: "crane" },
  },
  {
    words: ["heart"],
    title: "Heart",
    color: "#d6403a",
    answer: { library: "heart" },
  },
  {
    words: ["tulip", "flower"],
    title: "Tulip",
    color: "#e8708a",
    answer: { library: "tulip" },
  },
  // Long necks: the neck creature, the neck folded far in and leaning or
  // looking the way the animal does.
  {
    words: ["horse", "pony", "stallion", "mare", "foal", "unicorn"],
    title: "Horse",
    color: "#8a5a3b",
    answer: standing(0.55, 10, 0.8, -30),
  },
  {
    words: ["donkey", "mule"],
    title: "Donkey",
    color: "#9a948c",
    answer: standing(0.55, 10, 0.8, -30),
  },
  {
    words: ["zebra"],
    title: "Zebra",
    color: "#f4f1ea",
    answer: standing(0.55, 10, 0.8, -30),
  },
  {
    words: ["deer", "fawn", "reindeer", "elk", "moose", "antelope", "gazelle"],
    title: "Deer",
    color: "#a8713f",
    answer: standing(0.55, 5, 0.85, -10),
  },
  {
    words: ["goat"],
    title: "Goat",
    color: "#e9e2d5",
    answer: standing(0.5, 8, 0.8, -20),
  },
  {
    words: ["cow", "bull", "ox", "calf"],
    title: "Cow",
    color: "#f4f2ee",
    answer: standing(0.45, 14, 0.7, -40),
  },
  {
    words: ["sheep", "lamb"],
    title: "Sheep",
    color: "#f6f3ec",
    answer: standing(0.48, 12, 0.72, -50),
  },
  {
    words: ["giraffe"],
    title: "Giraffe",
    color: "#e8b04a",
    answer: neck(0.55, 10, 0.86, -15),
  },
  {
    words: ["dinosaur", "brachiosaurus", "diplodocus", "sauropod"],
    title: "Dinosaur",
    color: "#6fa35a",
    answer: neck(0.55, 5, 0.85, 5),
  },
  {
    words: ["ostrich", "emu"],
    title: "Ostrich",
    color: "#8a6a4f",
    answer: neck(0.5, 0, 0.82, 0),
  },
  {
    words: ["flamingo"],
    title: "Flamingo",
    color: "#f08aa8",
    answer: neck(0.53, -10, 0.8, -55),
  },
  {
    words: ["llama", "alpaca"],
    title: "Llama",
    color: "#e9dcc4",
    answer: neck(0.5, 0, 0.75, 15),
  },
  {
    words: ["camel"],
    title: "Camel",
    color: "#c9a06a",
    answer: neck(0.48, 12, 0.72, -10),
  },
  {
    words: ["duck", "duckling"],
    title: "Duck",
    color: "#f2c230",
    answer: neck(0.45, 8, 0.65, 0),
  },
  {
    words: ["chicken", "hen", "rooster"],
    title: "Chicken",
    color: "#f4efe6",
    answer: neck(0.45, -5, 0.7, 15),
  },
  {
    words: ["heron", "stork", "egret"],
    title: "Heron",
    color: "#9fb3c3",
    answer: neck(0.53, 12, 0.75, -40),
  },
  // Swimmers: the fish on the kite, its tail flicked up.
  {
    words: ["fish", "goldfish", "koi", "carp", "trout", "salmon"],
    title: "Fish",
    color: "#ec8a2f",
    answer: { design: { family: "fish", tailAt: 0.3, tailUpDeg: 80 } },
  },
  ...(
    [
      ["whale", "Whale", "#4f6f8f", 100],
      ["dolphin", "Dolphin", "#7f9fb8", 95],
      ["shark", "Shark", "#8a9399", 70],
    ] as const
  ).map(([word, title, color, tailUpDeg]): Subject => ({
    words: [word],
    title,
    color,
    answer: { design: { family: "fish", tailAt: 0.25, tailUpDeg } },
  })),
  {
    words: ["frog"],
    title: "Frog",
    color: "#4f9d55",
    answer: { library: "frog" },
  },
  {
    words: ["lily", "lilies"],
    title: "Lily",
    color: "#f2a9b4",
    answer: { library: "lily" },
  },
  // Low four-legged animals seen from above: the frog base with four legs.
  ...(
    [
      [["toad"], "Toad", "#8a6a4f", 165, 230],
      [["turtle", "tortoise"], "Turtle", "#4f7f4f", 170, 205],
      [
        ["lizard", "gecko", "newt", "salamander"],
        "Lizard",
        "#6fa35a",
        160,
        245,
      ],
      [["crocodile", "alligator"], "Crocodile", "#4f6f3f", 170, 240],
    ] as const
  ).map(([words, title, color, frontDeg, hindDeg]): Subject => ({
    words,
    title,
    color,
    answer: { design: { family: "legs", frontDeg, hindDeg } },
  })),
  // Birds in flight or perched with wings: the winged bird.
  {
    words: ["eagle", "hawk", "falcon"],
    title: "Eagle",
    color: "#7a5230",
    answer: bird(60, 60, -120, 160),
  },
  {
    words: ["dove", "pigeon"],
    title: "Dove",
    color: "#f4f1ea",
    answer: bird(65, 60, -100, 120),
  },
  {
    words: ["parrot"],
    title: "Parrot",
    color: "#3fa34d",
    answer: bird(70, 55, -140, 60),
  },
  {
    words: ["bird", "sparrow", "robin"],
    title: "Bird",
    color: "#3a7bd5",
    answer: bird(65, 65, -105, 100),
  },
];

const mentions = (text: string, word: string) =>
  new RegExp(`\\b${word}(?:e?s)?\\b`, "iu").test(text);

/** The origami a prompt's subject names, if any: an id the origami routes serve, and a title. */
export const subjectOrigami = (
  prompt: string,
): {
  readonly modelId: string;
  readonly title: string;
  readonly color: string;
  readonly library: boolean;
} | null => {
  // The longest matching word wins, so "duckling" beats "duck".
  let best: { readonly subject: Subject; readonly length: number } | null =
    null;
  for (const subject of SUBJECTS)
    for (const word of subject.words)
      if (mentions(prompt, word) && (!best || word.length > best.length))
        best = { subject, length: word.length };
  if (!best) return null;
  const { answer, title, color } = best.subject;
  if ("library" in answer)
    return { modelId: answer.library, title, color, library: true };
  const design = foldableDesign(answer.design);
  return design
    ? { modelId: designId(design), title, color, library: false }
    : null;
};
