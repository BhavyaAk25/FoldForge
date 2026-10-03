# FoldForge engineering guide

## What it is

FoldForge turns a text prompt into a buildable cut-and-fold paper design. A language model interprets the request; deterministic code builds the geometry, verifies it, previews it in 3D, and exports SVG, DXF, GLB, JSON, and FOLD files.

The model never decides whether a design is valid. Code compiles, verifies, scores, and exports.

## How a prompt becomes a design

1. **Intent** (`/api/intent`). With an AI provider configured, the model fills `FabricationIntentV1`. Without one, or if the provider fails, `intentFromPromptKeywords` in `src/core/fabrication/prompt-intent.ts` recognizes boxes, pop-up cards, and bird figures and parses sizes such as `90 x 60 x 40 mm` or `70 mm wide`.
2. **Program** (`/api/programs`). The model proposes a `FabricationDesignSpecV3`; `synthesizeFabricationDesign` turns it into a verified program. If synthesis fails or no AI is configured, a parametric template from `design-templates.ts` is fitted to the requested size. Template output always records `generationSource: "template"`.
3. **Compile and verify** (`/api/compile`). Pure, deterministic, and repeated on the server before anything is shown.
4. **Repair** (`/api/repair`, needs AI): a bounded typed patch, re-verified from scratch.
5. **Build notes** (`/api/finalize`, needs AI): a narrative for an already verified candidate.
6. **Export** (`/api/export/[format]`): the exact selected candidate.

## AI provider

`src/server/fabrication-ai/llm.ts` is the only place that talks to a model. It uses the OpenAI-compatible Chat Completions API in JSON mode, validates every reply with Zod, and retries once with the validation issues. Configure it with `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL` (see `.env.example`). The default is Google Gemini's free tier. Groq, OpenRouter, Ollama, and OpenAI also work.

## Code layout

- `src/core`: units, schemas, canonical serialization, compiler, geometry, kinematics, verification, scoring, repair, templates, and exporters. Pure TypeScript: no React, no browser APIs, no network.
- `src/server/fabrication-ai`: prompts, the LLM client, model classes, and conversion from model output to programs.
- `src/server/api` and `src/app/api`: route guards (same-origin check, per-client rate limit, body caps) and thin route handlers.
- `src/components`, `src/lib`: the UI and its typed API client. The UI never invents a result or edits geometry.

## Rules that matter

- A design that fails verification is never shown, recommended, or exported as valid.
- Never present template or saved-example geometry as AI-generated.
- Keep `src/core` pure and deterministic; hashes use the one canonical serializer.
- Strict TypeScript (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); no production `any`, and no unsafe casts without a reason.
- Expected failures are typed results; exceptions are for broken invariants.
- Secrets live only in `.env.local` or the host's secret store, never in `NEXT_PUBLIC_` variables, the client bundle, or logs. Do not log user prompts.
- Keep modules small and comments about geometry and trade-offs rather than syntax. Delete dead code instead of leaving it behind.

Verification limits (from `FABRICATION_SPEC.md`): closure residual at most 0.1 mm, no collision, at least 0.5 mm moving clearance, angle error at most 2°, travel error at most 1 mm, and no branch jump or dead driver state. FoldForge models geometry and kinematics only, not material strength or fatigue.

## Commands

- `pnpm dev`: run the app at http://localhost:3000
- `pnpm test`: unit and integration tests (vitest)
- `pnpm test:e2e`: browser flows (Playwright)
- `pnpm check`: lint, types, formatting, tests, export validation, and production build (what CI runs)

## Git

Work on a feature branch, keep commits small and passing, and open a PR into `main`. CI runs `pnpm check` plus the browser flow. Never commit `.env.local`.
