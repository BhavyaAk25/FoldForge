import { luma, type Colors, type FigureSpec, type RigParams } from "./rigs";

/**
 * Named figures: the words that pick them, a rig, colours, and a size. They
 * are what a prompt gets with no AI, and the AI starts from the nearest one.
 */

export interface FigurePreset {
  readonly id: string;
  readonly name: string;
  readonly words: readonly string[];
  readonly sizeMm: number;
  readonly colors: Colors;
  readonly params: RigParams;
}

const quad = (
  ears: Extract<RigParams, { rig: "quadruped" }>["ears"],
  snout: "short" | "long" | "flat",
  tail: "thin" | "raised" | "bushy" | "short" | "curly",
  legs: "short" | "long" = "short",
): RigParams => ({ rig: "quadruped", ears, snout, tail, legs });
const bird = (
  neck: "none" | "long",
  beak: "flat" | "pointed",
  stance: "sitting" | "upright",
  crest = false,
): RigParams => ({ rig: "bird", neck, beak, stance, crest });
const col = (primary: string, secondary: string, accent: string): Colors => ({
  primary,
  secondary,
  accent,
});

export const FIGURE_PRESETS: readonly FigurePreset[] = [
  {
    id: "cardbox",
    name: "Playing-card box",
    words: [
      "playing cards",
      "playing card",
      "deck of cards",
      "card deck",
      "deck box",
      "card box",
    ],
    sizeMm: 88,
    colors: col("#f6f1e7", "#eee5d4", "#c8463d"),
    params: { rig: "cardbox" },
  },
  {
    id: "duck",
    name: "Duck",
    words: ["duck", "duckling"],
    sizeMm: 130,
    colors: col("#f2c230", "#e8b420", "#f07a2b"),
    params: bird("none", "flat", "sitting"),
  },
  {
    id: "chicken",
    name: "Chicken",
    words: ["chicken", "hen", "rooster", "chick"],
    sizeMm: 130,
    colors: col("#f4efe6", "#e6ddcf", "#f0a531"),
    params: bird("none", "pointed", "sitting", true),
  },
  {
    id: "swan",
    name: "Swan",
    words: ["swan", "goose"],
    sizeMm: 140,
    colors: col("#f7f5f0", "#e9e5dc", "#f07a2b"),
    params: bird("long", "pointed", "sitting"),
  },
  {
    id: "penguin",
    name: "Penguin",
    words: ["penguin"],
    sizeMm: 140,
    colors: col("#2b2f36", "#f4f1ea", "#f0a531"),
    params: bird("none", "pointed", "upright"),
  },
  {
    id: "owl",
    name: "Owl",
    words: ["owl"],
    sizeMm: 130,
    colors: col("#8a6544", "#d9b98f", "#e3a72f"),
    params: bird("none", "pointed", "upright"),
  },
  {
    id: "bird",
    name: "Bird",
    words: ["bird", "sparrow", "robin", "parrot", "dove", "pigeon", "crow"],
    sizeMm: 120,
    colors: col("#4d8fd1", "#2f6db0", "#f0a531"),
    params: bird("none", "pointed", "sitting"),
  },
  {
    id: "rat",
    name: "Rat",
    words: ["rat"],
    sizeMm: 150,
    colors: col("#9a9590", "#c9b9b0", "#e88f9a"),
    params: quad("round", "long", "thin"),
  },
  {
    id: "mouse",
    name: "Mouse",
    words: ["mouse", "mice", "hamster"],
    sizeMm: 120,
    colors: col("#b9b2aa", "#f0c9cf", "#e88f9a"),
    params: quad("round", "short", "thin"),
  },
  {
    id: "cat",
    name: "Cat",
    words: ["cat", "kitten", "kitty"],
    sizeMm: 150,
    colors: col("#e8964a", "#f6e3c8", "#e88f9a"),
    params: quad("pointy", "flat", "raised"),
  },
  {
    id: "dog",
    name: "Dog",
    words: ["dog", "puppy", "pup"],
    sizeMm: 160,
    colors: col("#c58b52", "#f2e1c6", "#2a2420"),
    params: quad("floppy", "long", "short", "long"),
  },
  {
    id: "fox",
    name: "Fox",
    words: ["fox"],
    sizeMm: 160,
    colors: col("#e0702d", "#f6efe6", "#2a2420"),
    params: quad("pointy", "long", "bushy"),
  },
  {
    id: "wolf",
    name: "Wolf",
    words: ["wolf", "husky"],
    sizeMm: 170,
    colors: col("#8f9499", "#e6e6e3", "#2a2420"),
    params: quad("pointy", "long", "bushy", "long"),
  },
  {
    id: "bear",
    name: "Bear",
    words: ["bear", "teddy"],
    sizeMm: 160,
    colors: col("#7a5236", "#c9a27c", "#2a2420"),
    params: quad("round", "short", "short"),
  },
  {
    id: "panda",
    name: "Panda",
    words: ["panda"],
    sizeMm: 160,
    colors: col("#f4f2ee", "#2b2b2b", "#2a2420"),
    params: quad("round", "short", "short"),
  },
  {
    id: "pig",
    name: "Pig",
    words: ["pig", "piglet", "hog"],
    sizeMm: 150,
    colors: col("#f2a9b4", "#f7c3cb", "#d9707f"),
    params: quad("small", "flat", "curly"),
  },
  {
    id: "cow",
    name: "Cow",
    words: ["cow", "bull", "calf"],
    sizeMm: 170,
    colors: col("#f4f2ee", "#2b2b2b", "#e8a3a8"),
    params: quad("small", "flat", "thin", "long"),
  },
  {
    id: "sheep",
    name: "Sheep",
    words: ["sheep", "lamb"],
    sizeMm: 150,
    colors: col("#f6f3ec", "#3a3533", "#2a2420"),
    params: quad("floppy", "short", "short"),
  },
  {
    id: "horse",
    name: "Horse",
    words: ["horse", "pony", "donkey", "zebra"],
    sizeMm: 180,
    colors: col("#8a5a3b", "#3b2a20", "#2a2420"),
    params: quad("pointy", "long", "bushy", "long"),
  },
  {
    id: "deer",
    name: "Deer",
    words: ["deer", "fawn", "reindeer", "moose", "elk", "antelope", "goat"],
    sizeMm: 170,
    colors: col("#a8713f", "#f1e2c8", "#2a2420"),
    params: quad("pointy", "short", "short", "long"),
  },
  {
    id: "elephant",
    name: "Elephant",
    words: ["elephant", "mammoth"],
    sizeMm: 180,
    colors: col("#9a9ea3", "#c9ccd0", "#2a2420"),
    params: quad("floppy", "long", "thin", "long"),
  },
  {
    id: "lion",
    name: "Lion",
    words: ["lion", "tiger", "leopard"],
    sizeMm: 170,
    colors: col("#e1a84f", "#b5702f", "#2a2420"),
    params: quad("round", "flat", "thin", "long"),
  },
  {
    id: "rabbit",
    name: "Rabbit",
    words: ["rabbit", "bunny", "hare"],
    sizeMm: 130,
    colors: col("#efe9e1", "#f2c6cd", "#e88f9a"),
    params: quad("long", "short", "short"),
  },
  {
    id: "fish",
    name: "Fish",
    words: ["fish", "goldfish", "salmon", "trout"],
    sizeMm: 150,
    colors: col("#f08a2a", "#f7c26b", "#2a2420"),
    params: { rig: "fish", fins: "small" },
  },
  {
    id: "shark",
    name: "Shark",
    words: ["shark", "whale", "dolphin"],
    sizeMm: 180,
    colors: col("#7d8b99", "#b9c4cf", "#2a2420"),
    params: { rig: "fish", fins: "tall" },
  },
  {
    id: "car",
    name: "Car",
    words: ["car", "taxi", "jeep"],
    sizeMm: 170,
    colors: col("#d6403a", "#a9d3ee", "#2b2b2b"),
    params: { rig: "vehicle", cabin: "car" },
  },
  {
    id: "bus",
    name: "Bus",
    words: ["bus", "van", "camper"],
    sizeMm: 180,
    colors: col("#f2b632", "#a9d3ee", "#2b2b2b"),
    params: { rig: "vehicle", cabin: "bus" },
  },
  {
    id: "truck",
    name: "Truck",
    words: ["truck", "lorry", "tractor"],
    sizeMm: 180,
    colors: col("#3a7bd5", "#e9e4da", "#2b2b2b"),
    params: { rig: "vehicle", cabin: "truck" },
  },
  {
    id: "house",
    name: "House",
    words: ["house", "home", "cottage", "cabin", "barn"],
    sizeMm: 150,
    colors: col("#f1e2c4", "#b9473a", "#7a4b32"),
    params: { rig: "building", roof: "pyramid" },
  },
  {
    id: "tower",
    name: "Tower",
    words: ["tower", "castle", "lighthouse"],
    sizeMm: 150,
    colors: col("#d9d3c7", "#5b6f8a", "#7a4b32"),
    params: { rig: "building", roof: "tower" },
  },
  {
    id: "tree",
    name: "Tree",
    words: ["tree", "oak", "bush"],
    sizeMm: 160,
    colors: col("#5fa85a", "#7a4f32", "#7a4f32"),
    params: { rig: "tree", crown: "round" },
  },
  {
    id: "pine",
    name: "Pine tree",
    words: ["pine", "christmas tree", "fir", "spruce"],
    sizeMm: 170,
    colors: col("#2f7d4f", "#7a4f32", "#7a4f32"),
    params: { rig: "tree", crown: "pine" },
  },
  {
    id: "robot",
    name: "Robot",
    words: ["robot", "android", "droid"],
    sizeMm: 160,
    colors: col("#a8b4c0", "#5a6b7c", "#3b4652"),
    params: { rig: "figure", build: "robot" },
  },
  {
    id: "snowman",
    name: "Snowman",
    words: ["snowman"],
    sizeMm: 160,
    colors: col("#f7f7f4", "#f7f7f4", "#f07a2b"),
    params: { rig: "figure", build: "snowman" },
  },
  {
    id: "person",
    name: "Person",
    words: ["person", "man", "woman", "boy", "girl", "people", "doll"],
    sizeMm: 170,
    colors: col("#3f7fbf", "#f1c7a3", "#3b3b46"),
    params: { rig: "figure", build: "person" },
  },
];

const mentions = (text: string, phrase: string) =>
  new RegExp(`\\b${phrase.replace(/ /gu, "[\\s-]+")}(?:e?s)?\\b`, "iu").test(
    text,
  );

/** The preset whose longest word appears in the prompt, if any. */
export const matchFigurePreset = (prompt: string): FigurePreset | null => {
  let best: { preset: FigurePreset; length: number } | null = null;
  for (const preset of FIGURE_PRESETS) {
    for (const word of preset.words) {
      if (mentions(prompt, word) && (!best || word.length > best.length))
        best = { preset, length: word.length };
    }
  }
  return best?.preset ?? null;
};

export const figureFromPreset = (preset: FigurePreset): FigureSpec => ({
  title: preset.name,
  sizeMm: preset.sizeMm,
  colors: preset.colors,
  params: preset.params,
});

const COLOR_WORDS: Readonly<Record<string, string>> = {
  red: "#d6403a",
  orange: "#ec8a2f",
  yellow: "#f2c230",
  green: "#4f9d55",
  blue: "#3a7bd5",
  purple: "#8a5cc2",
  pink: "#f2a9b4",
  brown: "#8a5a3b",
  black: "#2b2b2b",
  white: "#f6f3ec",
  gray: "#9a9590",
  grey: "#9a9590",
  gold: "#d9a92e",
  silver: "#c3c7cc",
};

/** The first colour word in a prompt, as #rrggbb ("a blue cat"). */
export const colorWord = (prompt: string): string | null => {
  // The first colour named is the subject's ("a yellow duck with an orange
  // beak"); later ones describe its parts.
  const first = Object.keys(COLOR_WORDS)
    .map((name) => ({
      name,
      at: prompt.search(new RegExp(`\\b${name}\\b`, "iu")),
    }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)[0];
  return first ? COLOR_WORDS[first.name]! : null;
};

/**
 * A shade of a colour for the parts beside it (tails, snouts, wings):
 * darker for light colours, lighter for dark ones, so the parts still read.
 */
const shade = (hex: string): string => {
  const light = luma(hex) > 128;
  return `#${[1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16))
    .map((v) => Math.round(light ? v * 0.86 : v + (255 - v) * 0.22))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
};

/** A preset recoloured by the prompt's colour word, with a matching shade. */
export const recolor = (figure: FigureSpec, prompt: string): FigureSpec => {
  const primary = colorWord(prompt);
  return primary
    ? {
        ...figure,
        colors: { ...figure.colors, primary, secondary: shade(primary) },
      }
    : figure;
};
