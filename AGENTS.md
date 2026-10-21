# FoldForge engineering guide

## What it is

FoldForge turns a text prompt into real origami: a square that folds itself in 3D, step by step, with printable diagrams and a crease pattern, every fold checked. Origami is the main result; three more engines make what origami cannot, or offer the same subject as cut-and-glue: 3D papercraft figures (animals, vehicles, buildings, and the sliding playing-card box), pop-up cards, and cut-and-fold mechanisms (boxes, stands, bookmarks). A language model at most picks an answer and fills a bounded form; deterministic code builds the geometry, verifies it, previews it in 3D, and exports it.

The model never decides whether a design is valid. Code compiles, verifies, scores, and exports.

## How a prompt becomes a design

0. **Route** (`/api/choose`, `routePrompt` in `src/server/fabrication-ai/router.ts`). Words decide first, with no AI. A library model named outright ("a paper crane") is origami. A named format wins next: a pop-up or greeting card goes to the pop-up engine, and "papercraft", "faceted", "low-poly", "cardstock", or the sliding sleeve and tray to a figure preset (a deck of cards to the card-box figure). A box or tray is the origami box, sized so its base fits any measurements given, with the card-box figure (for a deck) or the cut-and-fold mechanism engine offered beside it; other mechanism words (stand, bookmark, tag) go to the mechanism engine below. Otherwise a subject with a known fold (`src/core/origami/subjects.ts`: a library model or a hand-tuned design, with its natural paper colour) is origami, with the matching figure preset (`src/core/mesh/presets.ts`) offered beside it as the cut-and-glue alternative; a subject with only a figure stays papercraft. Only an unrecognised prompt costs one AI call (20 s deadline), whose answer is limited to library ids, family parameters, preset ids, colours, and sizes; family parameters are clamped and moved to the nearest design that folds, and the page labels the choice as AI. When the AI is unavailable or fails, an origami request still folds: a general winged bird for a bird, otherwise the classic crane, with a note saying why (never labelled as the AI's choice).
   - **Figures** (`/api/papercraft`): `rigSpec` turns a preset's rig parameters into low-poly parts; `buildPapercraft` unfolds each part into islands with numbered glue tabs and packs them onto A4 pages; `verifyPapercraft` rechecks everything (closed outward solids, every printed face congruent and right side out so the net refolds within 0.1 mm, folds that meet, paired tabbed seams, no overlap, nothing off the page). The route returns the 3D parts, page SVGs, and instructions; a figure that fails a check is never returned.
   - **Pop-up cards** (`/api/popup`): `src/core/popup` solves a V-fold exactly (the fold angle beta from cos(alpha) cos(beta) + sin(alpha) cos(theta/2) sin(beta) = cos(phi)), and `verifyPopup` checks the piece folds flat inside the closed card and never passes through a page or another piece at any opening angle. One A4 page holds the card, its glue guides, and the piece.
   - **Origami** (`/api/origami/[id]`): `id` is a library id ("crane") or a design id ("neck_0.55_10_0.86_-15": a family and its parameters, canonical so one design has one URL). A standing animal ("standing_...") is two squares: its id serves the body with an `assembly` naming the neck sheet (`<id>~2`) and where it tucks in, and the page shows both together and then each sheet's own folds and downloads. The server derives the crease pattern from the model's fold sequence, checks every step, builds the animation keyframes, and caches the result; a design id that does not derive is not found. Downloads come from `/api/origami/[id]/[format]` (`svg`, `fold`, `instructions`; `?title=` names a design after its subject).
   - **Mechanisms** continue below.
1. **Intent** (`/api/intent`). With an AI provider configured, the model fills `FabricationIntentV1`. Without one, or if the provider fails, `intentFromPromptKeywords` in `src/core/fabrication/prompt-intent.ts` recognizes boxes, desk stands, pop-up cards, and flat cut-outs (bookmarks, tags, ornaments) and parses sizes such as `90 x 60 x 40 mm` or `70 mm wide`.
2. **Program** (`/api/programs`). The model proposes a `FabricationDesignSpecV3`; `synthesizeFabricationDesign` turns it into a verified program. If synthesis fails or no AI is configured, `templateFallback` fits a parametric template from `design-templates.ts` to the requested size, first against the intent as given and otherwise against the same size and stock without model-invented constraints; the route returns the intent it verified, and the client uses that one. Template output always records `generationSource: "template"`. A pop-up panel or cut-out may request a `silhouette` (heart, flower, tree, house, star, arch): after synthesis, `silhouettes.ts` redraws that rectangular panel inside its bounds, keeping the hinge edge, and `upright.ts` mirrors fold-only designs that hang below their base. Both are kept only if the full verifier still passes.
3. **Compile and verify** (`/api/compile`). The server compiles, verifies, scores, and hashes the program and returns the finished `CandidateV2` plus FOLD availability; the browser only renders it. Saved examples come ready-made from `/api/examples/[id]`.
4. **Build notes** (`/api/finalize`, needs AI): a narrative for an already verified candidate.
5. **Export** (`/api/export/[format]`): the exact selected candidate.

## AI provider

`src/server/fabrication-ai/llm.ts` is the only place that talks to a model. It uses the OpenAI-compatible Chat Completions API in JSON mode, validates every reply with Zod, and retries once with the validation issues. Configure it with `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL` (see `.env.example`). The default is Google Gemini's free tier; `AI_MODEL` takes a comma-separated list, and a model that is retired (404), rate limited (429), or busy (5xx) falls through to the next, since free quotas are per model. Groq, OpenRouter, Ollama, and OpenAI also work.

## Code layout

- `src/core/popup`: pop-up cards. `popup.ts` (V-fold kinematics and checks), `cards.ts` (designs), `export.ts` (the printable page).
- `src/core/mesh`: 3D papercraft. `geometry.ts` and `primitives.ts` (closed low-poly solids), `unfold.ts` (non-overlapping islands, numbered seams, glue tabs), `model.ts` (parts, open boxes, and sliding parts to packed A4 pages, printed decals from `decals.ts`), `verify.ts` (the independent checks), `export.ts` (page SVG), `rigs.ts` and `presets.ts` (body types and named figures).
- `src/core/origami`: one-sheet origami. `crease-pattern.ts` (planar crease graph), `fold-rules.ts` (Maekawa, Kawasaki, flat-folded face placement), `layers.ts` (layer-order solver: fold sense, taco-tortilla, taco-taco, transitivity), `simulate.ts` (bar-and-hinge simulator for bases that collapse at once), `sequence.ts` (models written as folds; derives creases and checks each step), `animate.ts` and `pose.ts` (keyframes and 3D poses), `export.ts` (crease-pattern SVG, FOLD, instruction sheet), `models.ts` and `catalog.ts` (the library), `families.ts` (parametric families: the neck creature and the fish on the kite, the winged bird on the bird base, four legs on the frog base, and the standing animal's body; the swan, the crane, and the frog are designs in them), `generate.ts` (design bounds, ids, each design's sheets, and the search for the nearest design that folds), `subjects.ts` (words to library models or tuned designs), `form.ts` (faces placed by turning them about their creases; closure proves a 3D form such as the box).
- `src/core`: units, schemas, canonical serialization, compiler, geometry, kinematics, verification, scoring, templates, and exporters. Pure TypeScript: no React, no browser APIs, no network.
- `src/server/fabrication-ai`: prompts, the LLM client, model classes, and conversion from model output to programs.
- `src/server/api` and `src/app/api`: route guards (same-origin check, per-client rate limit, body caps) and thin route handlers.
- `src/server/candidates.ts`: builds finished candidates (live and saved examples) on the server.
- `src/components`, `src/lib`: the UI and its typed API client. The UI never invents a result or edits geometry; the 3D results panel loads lazily so the start screen stays light.

## Rules that matter

- A design that fails verification is never shown, recommended, or exported as valid.
- Never present template or saved-example geometry as AI-generated.
- Keep `src/core` pure and deterministic; hashes use the one canonical serializer.
- Strict TypeScript (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); no production `any`, and no unsafe casts without a reason.
- Expected failures are typed results; exceptions are for broken invariants.
- Secrets live only in `.env.local` or the host's secret store, never in `NEXT_PUBLIC_` variables, the client bundle, or logs. Do not log user prompts.
- Keep modules small and comments about geometry and trade-offs rather than syntax. Delete dead code instead of leaving it behind.

Verification limits (from `FABRICATION_SPEC.md`): closure residual at most 0.1 mm, no collision, at least 0.5 mm moving clearance, angle error at most 2°, travel error at most 1 mm, and no branch jump or dead driver state. FoldForge models geometry and kinematics only, not material strength or fatigue.

## Guardrails (enforced)

`pnpm check:budgets` runs in CI and fails the build when the home page JavaScript, source lines, test lines, test-to-source ratio, dependency counts, or template design time exceed `scripts/budgets.ts`. Raise a budget only in its own commit that says what grew and why; lower it after every cleanup.

- **Tests:** one test per behaviour change, preferably a new row in an existing table test. A bug fix gets one regression test. Tests for deleted code are deleted with it. No snapshot dumps or copied model output as fixtures.
- **Four engines, one each:** figures, pop-ups, origami, and mechanisms each have exactly one builder and one verifier; a new capability extends the engine it belongs to. A replacement deletes what it supersedes in the same PR; no parallel paths kept "just in case".
- **Visual bench:** `pnpm bench` renders a fixed prompt set to `artifacts/bench/contact-sheet.png` beside the example photos; CI fails when a prompt leaves its expected engine. Look at the sheet before calling visual work done.
- **Server does the heavy work:** compiling, verifying, and synthesizing run on the server; the browser renders results and never repeats those checks.
- **Dependencies:** none added without removing one or raising the budget explicitly.
- **Always shippable:** merge only with CI green, then confirm the live site on real prompts.

## Roadmap

Done: the light page; the crease-pattern core; fold-rule checks; a layer-order solver run on every state; the simulator for base collapses and rigid step animation for folds; the bird, square, waterbomb, fish, and frog bases with the crane, swan, dog face, cat face, heart, tulip, flapping bird, paper plane, and cup; the origami box, a 3D form proven by closing every loop of faces rather than by flat-folding; page turns (a flap swung over an axis by toggling its hinge creases, re-proven like any fold), which give the lily and the frog; paper colour from the prompt; origami first, with the cut-and-glue figure offered beside it; five parametric families (long-necked creatures, winged birds, fish, four-legged animals seen from above, and standing animals from two squares: a double boat body with a neck sheet tucked in) whose designs are generated for a subject by tuned words or the AI and always checked to fold; printable crease patterns, instructions, FOLD, and the 3D animation.

Next, in order:

1. A tail and slimmer legs for the standing animals; a one-sheet standing animal needs a base with five or more flaps (a blintzed bird base). Ruled out for one sheet: the folded triangle (each corner must be both a leg and the neck or tail), the double boat base alone (closed corners leave no paper for a head), the bird base's wings as legs (too short), and the frog base side-on (every leg hangs from the rear).
2. Curled and shaped finishes (the lily's curled petals) as checked 3D forms after a flat sequence.
3. A physical simulator for collapses the bar-and-hinge solver cannot settle (the frog base is animated face by face).

## Commands

- `pnpm dev`: run the app at http://localhost:3000
- `pnpm test`: unit and integration tests (vitest)
- `pnpm test:e2e`: browser flows (Playwright)
- `pnpm check`: lint, types, formatting, tests, export validation, production build, and budgets (what CI runs)
- `pnpm check:budgets`: size and speed limits (after `pnpm build`)

## Git

Work on a feature branch, keep commits small and passing, and open a PR into `main`. CI runs `pnpm check` plus the browser flow. Never commit `.env.local`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
