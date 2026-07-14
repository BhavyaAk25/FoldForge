# FoldForge build log

## 2026-07-14 — deterministic core

- Built the strict Next.js 16.2.10 / React 19.2.7 scaffold, project guidance, MIT licence, versioned browser checkpoint contract, and server-only environment boundary.
- Implemented the full-width continuous strip, nine deterministic samples, fail-fast verifier, scoring, canonical hashes, SVG/FOLD exporters, fixture CLI, and invalid kill-test sample.
- Verified 1,000 property cases, byte-stable repeatability, physical SVG dimensions, 50 mm calibration, and source-equivalent FOLD assignments.
- Commit: `622bd53 feat: initialize FoldForge deterministic core`.

## 2026-07-14 — compiler, repair, and API

- Implemented strict GPT-5.6 Sol Responses API contracts with Zod, `store:false`, bounded output, reasoning defaults, hashed browser safety identifiers, and no production prompt logging.
- Added all eight application routes, server reconstruction of client candidates, short-lived signed HttpOnly access cookies, constant-time access-code comparison, and an explicit live-AI opt-in.
- Implemented five-cycle bounded repair with three operations per cycle, report grounding, allowlisted parameters, duplicate-input blocking, regeneration, full revalidation, source-labelled traces, and explicit exhaustion.
- Live calls remain disabled because usable credits are not confirmed; 28 offline compiler cases and 10 repair fixtures pass.

## 2026-07-14 — workshop and evaluation

- Built the responsive Specify / Workshop / Export flow, R3F folded preview, SVG flat pattern, real verifier highlights, before/after repair diff, source-labelled trace, downloads, instructions, physical warning, audio preference, reduced motion, and keyboard flow.
- Rendered QA covered 1440, 1280, 768, and 390 px. The 768 px review caused a tablet breakpoint correction.
- Playwright: 5 / 5 passed. Fifteen end-to-end constraint variations: 15 / 15 passed. Full-feedback repair ablation: 100% versus 0% for pass/fail-only and no-feedback baselines.
- Evaluation found a lip-repair rounding loop; a 0.02 mm geometric allowance removed the duplicate-input failure and all affected cases now pass within three cycles.

## External gates

- Physical validation is awaiting the user and remains separate from software completion.
- GitHub repository creation/push and Vercel deployment depend on authenticated CLI or connector access.
- Production live-model verification depends on GPT-5.6 Sol access and usable credits. No paid API call has been made.
