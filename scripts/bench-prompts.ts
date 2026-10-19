/**
 * The fixed prompt set the visual bench runs. `expect` is the engine that
 * builds each one today; CI fails if a prompt drifts from it, and each new
 * engine moves its prompts over. Photos are the example images the result
 * should match.
 */

export interface BenchPrompt {
  readonly text: string;
  readonly expect: "origami" | "papercraft" | "none";
  readonly photo?: string;
}

export const BENCH_PROMPTS: readonly BenchPrompt[] = [
  {
    text: "a faceted paper duck",
    expect: "papercraft",
    photo: "duck-shaped-gift-box.jpg",
  },
  {
    text: "a birthday card where a flower pops up",
    expect: "papercraft",
    photo: "pop-up-flower-card.jpg",
  },
  {
    text: "a box for a deck of playing cards with a slide-out tray",
    expect: "papercraft",
    photo: "playing-card-box.jpg",
  },
  { text: "a paper rat", expect: "papercraft" },
  { text: "a cat", expect: "papercraft" },
  { text: "a rabbit", expect: "papercraft" },
  { text: "a fox", expect: "papercraft" },
  { text: "a penguin", expect: "none" },
  { text: "a fish", expect: "none" },
  { text: "a car", expect: "none" },
  { text: "a house", expect: "papercraft" },
  { text: "a tree", expect: "papercraft" },
  { text: "a robot", expect: "none" },
  { text: "a phone stand", expect: "papercraft" },
  { text: "a gift box 120 x 80 x 40 mm", expect: "papercraft" },
  { text: "a bookmark", expect: "papercraft" },
  { text: "fold a paper crane", expect: "origami" },
  { text: "a paper airplane", expect: "origami" },
  { text: "a flapping bird", expect: "origami" },
  { text: "a frog base", expect: "origami" },
];
