# FoldForge build log

## 2026-07-14 — deterministic core

- Built the strict Next.js 16.2.10 / React 19.2.7 scaffold, project guidance, MIT licence, versioned browser checkpoint contract, and server-only environment boundary.
- Implemented the full-width continuous strip, nine deterministic samples, fail-fast verifier, scoring, canonical hashes, SVG/FOLD exporters, fixture CLI, and invalid kill-test sample.
- Verified 1,000 property cases, byte-stable repeatability, SVG millimetre dimensions, 50 mm calibration, and source-equivalent FOLD assignments.
- Commit: `622bd53 feat: initialize FoldForge deterministic core`.

## 2026-07-14 — compiler, repair, and API

- Implemented strict GPT-5.6 Sol Responses API contracts with Zod, `store:false`, bounded output, reasoning defaults, hashed browser safety identifiers, and no production prompt logging.
- Added all eight application routes, server reconstruction of client candidates, short-lived signed HttpOnly access cookies, constant-time access-code comparison, and an explicit live-AI opt-in.
- Implemented five-cycle bounded repair with three operations per cycle, report grounding, allowlisted parameters, duplicate-input blocking, regeneration, full revalidation, source-labelled traces, and explicit exhaustion.
- Live calls remain disabled because usable credits are not confirmed; 25 offline compiler cases and 11 repair fixtures pass.

## 2026-07-14 — workshop and evaluation

- Built the responsive Specify / Workshop / Export flow, R3F folded preview, SVG flat pattern, real verifier highlights, before/after repair diff, source-labelled trace, downloads, instructions, material limitation, audio preference, reduced motion, and keyboard flow.
- Rendered QA covered 1440, 1280, 768, and 390 px. The 768 px review caused a tablet breakpoint correction.
- Playwright: 5 / 5 passed. Fifteen end-to-end constraint variations: 15 / 15 passed. Full-feedback repair ablation: 100% versus 0% for pass/fail-only and no-feedback baselines.
- Evaluation found a lip-repair rounding loop; a 0.02 mm geometric allowance removed the duplicate-input failure and all affected cases now pass within three cycles.

## 2026-07-14 — independent review hardening

- Geometry review reproduced a false-valid result with zeroed folded vertices. Verification now rebuilds source geometry from parameters, measures folded panels and backrest angle, rejects topology/coordinate drift, and adds a hard device-toe capture check.
- FOLD exports now derive deployed hinge angles and validate every coordinate/reference/parallel array against the source document. SVG verification now requires exact source equivalence and reserves a separate scale footer. The artifact CLI validates stored bytes, not regenerated stand-ins.
- Evaluation now varies 100 constraints and uses independent folded-geometry, SVG, and FOLD corruption oracles. It records 98% request-level geometry success, 100% mutation rejection, 100% no-crash/repeatability, 11/11 repair outcomes, and 15/15 end-to-end cases across seven failure causes.
- Product review fixes make the offline prompt explicitly unapplied, export the exact selected/repaired candidate, move focus to each new stage, expose selected states, restore visible form focus, and show factual repair reasons.
- Security review closed fail-open live access, bounded request bodies to 64 KiB JSON, added best-effort per-client rate limits, disabled SDK retries, set a 60-second timeout, and added a 24-hour checkpoint/privacy notice. A production audit reports no known vulnerabilities.
- Created the public repository, pushed `codex/foldforge-build-week`, established `main`, and opened draft PR #1 without merging.
- Re-ran the complete release matrix after hardening: 76 tests, 97.48% statement and 91.01% branch coverage, 1,000 seeded properties, all offline eval groups, 5/5 Chromium flows, exact artifact verification, production build, licence inventory, and dependency audit all pass.
- Exercised the repaired candidate through selected-candidate export and the native print save sheet, then cancelled without writing or printing.

## 2026-07-14 — production deployment

- Confirmed Vercel CLI authentication, created and linked the `foldforge` project, and stored the API key, access code, and cookie-signing secret as sensitive production variables without printing their values.
- Kept `ENABLE_LIVE_OPENAI=false` as an explicit production safety gate because usable GPT-5.6 credits/model access are not yet confirmed.
- Vercel independently installed the locked dependencies, compiled Next.js, passed TypeScript, generated all routes, and reported deployment `dpl_CYAbwBjhNnZMNKB8BhgYdDfyBVtL` as Ready.
- Production is aliased at `https://foldforge.vercel.app`. GitHub automatic deployment could not be attached by the CLI, but authenticated production deployment is complete.

## 2026-07-14 — concise product pass

- Captured and inspected the production Specify, Workshop, and Export screens before changing the interface.
- Made the prompt editable in controls mode with a direct disclosure that only exact measurements drive offline generation; no prompt text is silently interpreted.
- Replaced the repeated hero and filler copy with short task language, collapsed the verifier and source trace by default, shortened actions, and removed repeated export warnings.
- Re-captured all three stages at the same desktop viewport and compared them with the production references. The revised flow preserves the paper/graphite design system while materially reducing vertical and reading load.
- Full checks remain green: 76 tests, 6/6 Chromium flows, four required responsive widths, production build, and 97.48% statement / 91.01% branch coverage.
- Refreshed production at `https://foldforge.vercel.app`; Vercel independently rebuilt the concise branch and reported deployment `dpl_CMT6rKXvcCiUM34GjyEmYEmH3rYy` as Ready.

## External gates

- Production live-model verification depends on GPT-5.6 Sol access and usable credits. No paid API call has been made.

## 2026-07-14 — prompt-to-fabrication documentation pivot

- Reframed FoldForge for the OpenAI Build Week Work & Productivity track as a bounded prompt-to-fabrication compiler; retained the deployed stand, its tests, and its metrics as an explicitly labelled legacy baseline.
- Added the normative fabrication grammar, versioned contracts, ordered verifier, hard tolerances, candidate-diversity rules, bounded repair, and exact GLB/SVG/DXF/JSON export contract.
- Added target evaluation thresholds, official four-criterion judge rubric, primary-source research record, privacy/security limits, and a conditional 2:50 submission-video script.
- Retired the standalone material-test protocol; no material or force claim is made.
- Recorded the live boundary honestly: `ENABLE_LIVE_OPENAI=false`, generalized Sol evaluation not run, current production still the legacy stand, and all pivot results pending.
- This entry covers documentation only. It does not claim the target schemas, compiler, verifier, UI, exports, security controls, deployment, or live evaluation are implemented.
- Documentation verification passed targeted Prettier checking, local Markdown-link existence checking, and `git diff --check`; no package, source, or test file was edited as part of this documentation workstream.

## 2026-07-14 — live-model security foundation

- Replaced the client-controlled safety identifier with a random server-issued subject inside a signed, versioned two-hour access session.
- Added production `__Host-` cookie semantics, strict origin/Fetch Metadata checks, streaming route-specific body limits, bounded per-session request/token quotas, global/session concurrency leases, an independent live-model kill switch, metadata-only audit types, and validated build-SHA discovery.
- Kept the live path fail-closed. Generalized routes must still wire the signed subject, exact quotas, concurrency leases, audit events, and health provenance before Sol can be enabled.
- Focused security and legacy API integration validation passed 27 tests, strict type checking, targeted zero-warning lint, targeted formatting, and `git diff --check`.
