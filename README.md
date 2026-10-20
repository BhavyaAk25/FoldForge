# FoldForge

Describe something made of paper or card, such as "a red fox", "a gift box 120 x 80 x 40 mm", or "fold a paper crane". FoldForge builds a checked paper model with a 3D preview you can turn and the print-scale pages to make it.

![FoldForge Describe screen](./docs/images/foldforge-describe.png)

## 3D papercraft

Animals, vehicles, buildings, trees, robots, snowmen, and people come out as low-poly papercraft: coloured A4 pages to print, cut, fold, and glue, with every seam numbered and given a glue tab, printed eyes and windows, a 3D view, and step-by-step instructions. "A blue cat", "a 20 cm penguin", or "a red car" pick the colour and size. Code checks that every printed piece folds back into the 3D model within 0.1 mm and that nothing overlaps or runs off a page. Thirty-two figures are built in (duck, swan, penguin, owl, rat, cat, dog, fox, bear, pig, cow, horse, rabbit, fish, shark, car, bus, truck, house, tower, tree, pine, robot, snowman, person, and more); with an AI key, anything else maps to the closest one, labelled as the AI's choice.

## Pop-up cards and the card box

"A birthday card where a flower pops up" or "a valentine card" gives a real V-fold pop-up: one A4 page with the card, glue guides, and a layered flower (or heart) on its stem, and a 3D view that opens and closes it. Code solves the fold exactly and checks the piece folds flat inside the closed card and never touches a page or itself as it opens. "A box for a deck of playing cards" gives a sleeve printed with card suits and a tray that slides out of it.

## Real origami

Ask for a library model, such as "fold a paper crane", and FoldForge answers with real origami from one uncut square: the crane, the flapping bird, a dart paper plane, a paper cup, and the bird, square, waterbomb, fish, and frog bases. A prompt that asks for origami without naming one, such as "an origami swan from a 20 cm square", lets the AI pick the closest library model and the paper size; the page labels that choice as the AI's. Each model is written as the folds a person makes; code derives the crease pattern from those folds and checks every intermediate state: Maekawa and Kawasaki at every vertex, one consistent flat-folded place for every face, and a layer order in which no paper passes through paper. The page plays the folding in 3D, step by step, next to diagrams and the crease pattern. Downloads: printable instructions (SVG), the crease pattern (SVG, red dash-dot mountain, blue dashed valley), and a FOLD file for Origami Simulator.

Boxes, cards, stands, and anything that opens or slides go to the cut-and-fold engine below.

## How it works

1. **Understand the prompt.** An AI model (or, with no key, a built-in keyword reader) turns your text into a structured fabrication intent: object, size, motion, and stock.
2. **Design it.** The model proposes the parts and how they connect. Deterministic code synthesizes the actual panels, folds, tabs, and slots. If that fails, a parametric template fitted to your dimensions is used, and the result is labelled as a template.
3. **Check it.** Code verifies geometry, sheet packing, folding motion, collisions, and clearances. Nothing that fails is ever shown as valid.
4. **Export it.** Download SVG and DXF patterns (cut = solid, score = dashed), a GLB 3D model, the full JSON record, and FOLD when the design is representable.

![Verified 3D view](./docs/images/foldforge-verified-3d.png)
![SVG cut-and-fold pattern](./docs/images/foldforge-svg-pattern.png)

## Run it

Requires Node.js 22+ and pnpm.

```bash
pnpm install
```

```bash
pnpm dev
```

Open http://localhost:3000.

**No key needed** for boxes, organizers, desk stands, pop-up cards, bookmarks and tags, and stand-up figures such as ducks, cats, rabbits, hearts, trees, houses, and stars (template mode).

**For any other object**, add a free AI key. Copy `.env.example` to `.env.local` and set:

```
AI_API_KEY=<your Google Gemini key from https://aistudio.google.com/apikey>
```

Groq, OpenRouter, a local Ollama model, or OpenAI also work through `AI_BASE_URL` and `AI_MODEL`; see `.env.example`.

## Develop

```bash
pnpm test
```

```bash
pnpm check
```

`pnpm check` runs lint, types, formatting, tests, export validation, and the production build, which is the same as CI. `pnpm test:e2e` runs the Playwright browser flow.

Code layout and engineering rules are in [AGENTS.md](./AGENTS.md); the fabrication model and verifier limits are in [FABRICATION_SPEC.md](./FABRICATION_SPEC.md).

## Limits

Origami layer orders come from a bounded search, since deciding one is NP-hard in general; every library state has one. Bases collapse in a bar-and-hinge simulator; the frog base, which the simulator cannot settle, is shown turning face by face. The cut-and-fold engine handles flat sheets with panels, cuts, folds, tabs, slots, hinges, and sliders, with up to 24 panels and one manual motion. It does not model smooth curved surfaces, material strength, fatigue, or electronics. It verifies geometry and kinematics, not how well a real card stock holds up.

## License

MIT; see [LICENSE](./LICENSE) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
