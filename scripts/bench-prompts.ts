/**
 * The fixed prompt set the visual bench runs. `expect` is the engine that
 * builds each one today; CI fails if a prompt drifts from it, and each new
 * engine moves its prompts over. Photos are the example images the result
 * should match.
 */

export interface BenchPrompt {
  readonly text: string;
  readonly expect: "origami" | "figure" | "popup" | "papercraft" | "none";
  readonly photo?: string;
}

export const BENCH_PROMPTS: readonly BenchPrompt[] = [
  {
    text: "a faceted paper duck",
    expect: "figure",
    photo: "duck-shaped-gift-box.jpg",
  },
  {
    text: "a birthday card where a flower pops up",
    expect: "popup",
    photo: "pop-up-flower-card.jpg",
  },
  {
    text: "a box for a deck of playing cards with a slide-out tray",
    expect: "figure",
    photo: "playing-card-box.jpg",
  },
  { text: "a paper rat", expect: "figure" },
  { text: "a cat", expect: "origami" },
  { text: "a rabbit", expect: "figure" },
  { text: "a fox", expect: "origami" },
  { text: "a penguin", expect: "figure" },
  { text: "a fish", expect: "origami" },
  { text: "a car", expect: "figure" },
  { text: "a house", expect: "figure" },
  { text: "a tree", expect: "figure" },
  { text: "a robot", expect: "figure" },
  { text: "a phone stand", expect: "papercraft" },
  { text: "a gift box 120 x 80 x 40 mm", expect: "origami" },
  { text: "a bookmark", expect: "papercraft" },
  { text: "fold a paper crane", expect: "origami" },
  { text: "a paper airplane", expect: "origami" },
  { text: "a flapping bird", expect: "origami" },
  { text: "a frog base", expect: "origami" },
  { text: "fold an origami dog face", expect: "origami" },
  { text: "an origami swan", expect: "origami" },
  { text: "an origami cat", expect: "origami" },
  { text: "fold a heart", expect: "origami" },
  { text: "an origami flower", expect: "origami" },
  { text: "a yellow giraffe", expect: "origami" },
  { text: "a flamingo", expect: "origami" },
  { text: "an eagle", expect: "origami" },
  { text: "a box for my playing cards", expect: "origami" },
  { text: "an origami lily", expect: "origami" },
  { text: "an origami frog", expect: "origami" },
  { text: "a turtle", expect: "origami" },
  { text: "a deer", expect: "origami" },
  { text: "a horse", expect: "origami" },
  { text: "a fortune teller", expect: "origami" },
  { text: "a samurai helmet", expect: "origami" },
];
