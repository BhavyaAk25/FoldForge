# FoldForge agent guide

## Objective

Build a narrow, honest consumer tool that turns phone or light-tablet stand requirements into a deterministic one-sheet design, uses GPT-5.6 Sol only for language interpretation and bounded causal repair, and exports printable SVG and FOLD files.

## Boundaries

- `src/core` owns units, geometry, verification, ranking, repair application, and exports. It must stay pure and independent of React and OpenAI.
- `src/server/ai` owns OpenAI requests. Validate every model response before it can reach the core.
- GPT may interpret, diagnose, and explain. It may never emit geometry, declare validity, alter exports, or override ranking.
- Support one continuous-strip, dual-tab stand family only.
- Physical validation remains pending until a user prints, folds, and tests the artifact.

## Commands

- `pnpm run dev` — local application
- `pnpm run check` — lint, types, formatting, unit tests, and production build
- `pnpm run coverage` — core coverage gates
- `FC_SEED=20260714 FC_NUM_RUNS=1000 pnpm run test:property` — geometry properties
- `pnpm run fixture -- --fixture phone-letter-110lb --seed 20260714 --output artifacts/kill-test`
- `pnpm run verify:artifact -- artifacts/kill-test/manifest.json`
- `pnpm run test:e2e` — rendered application flows

## Engineering rules

- Strict TypeScript, no production `any`, exhaustive unions, and units in numeric names.
- Keep expected failures as typed results; reserve exceptions for broken invariants.
- Use one canonical serializer for hashing and repeatability.
- Explain equations and physical assumptions in comments; do not narrate syntax.
- Prefer permissive dependencies, original assets, and Web Audio over external sound files.
- Update behavior and documentation in the same milestone.

## Validation and Git

- Run the narrow relevant test first, then `pnpm run check` before a milestone commit.
- Inspect `git diff --check`, status, and the staged diff. Never commit secrets or unrelated files.
- Work on `codex/foldforge-build-week`. Push passing milestones only. Never force-push or merge.
- Keep the draft PR, `BUILD_LOG.md`, and `EVALS.md` current.

## Visual quality

The interface is quiet, precise, paper-like, responsive, keyboard accessible, reduced-motion aware, and clear in under ten seconds. Use browser screenshots to verify every meaningful frontend milestone. Sound is opt-in after interaction, low-volume, mutable, and nonessential.

## API keys

`OPENAI_API_KEY`, `DEMO_ACCESS_CODE`, and `ACCESS_COOKIE_SECRET` are server-only. Store them in ignored env files or the hosting secret store. Never print, commit, expose through `NEXT_PUBLIC_`, or persist them in browser storage.

## Definition of done

A previously unseen supported request completes Specify → Workshop → Export; the trace shows a real deterministic failure, report-grounded bounded repair, deterministic revalidation, and scaled downloads. Automated, browser, security, accessibility, and licensing gates pass. Physical claims remain explicitly pending until user-confirmed testing.

## Subagents

Use bounded read-heavy reviews for geometry, evals, frontend/accessibility, security/compliance, and skeptical judging. Avoid overlapping edits. The primary agent owns and integrates the core engine, AI loop, and principal tests.
