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

## 2026-07-15 — plain-language product clarity

- Rebuilt the first screen around one understandable promise: describe a paper object, compare three checked designs, and download the pattern.
- Added three illustrated, editable prompts for a playing-card box, pop-up flower card, and duck-shaped gift box. Each example states the object, purpose, material, size, and requested behavior in everyday language.
- Added a prepared pop-up flower result that works while live generation is off. It is explicitly labelled as saved, makes no model request, and supports the real 3D, pattern, motion, verification, and export controls.
- Simplified result labels, download explanations, status messages, and error text while keeping technical evidence available in a collapsed details section.
- Reset the browser checkpoint version so older technical copy cannot silently replace the clearer first screen.
- Matched the approved paper, graphite, and teal reference at 1280 × 720, then checked responsive layout, keyboard flow, reduced motion, and accessibility at all required widths.
- Fixed every P1/P2 from independent frontend review: nearby access focus, visible prompt-selection feedback, screen-reader percentage values, saved-example export coverage, and separation of orchestration from the start/results views. The follow-up review found no remaining P0–P2 issue.
- Converted the three source-quality example renders to high-quality JPEGs, reducing their combined repository and transfer footprint from about 5.9 MB to about 1.0 MB without a visible quality loss.

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

## 2026-07-14 — generalized fabrication compiler implementation

- Replaced the stand-only runtime with versioned `FabricationIntentV1`, `FabricationProgramV1`, `FabricationIRV1`, `VerificationReportV2`, `ProgramPatchV1`, and `CandidateV2` contracts.
- Implemented the pure panel/joint/connector compiler, polygon-with-holes triangulation, rigid transforms, 201-state kinematics, ordered verifier, deterministic scoring, canonical hashes, and bounded report-grounded repair.
- Added exact GLB, print-scale SVG, DXF, canonical JSON, and profile-scoped FOLD exports. Every route rebuilds and verifies the selected candidate before returning bytes.
- Rebuilt the app as a concise Describe → Forge → Compare → Export studio with sequential topology-aware proposal generation, synchronized 3D/pattern previews, motion controls, real repair evidence, provenance, checkpoint restoration, and exact downloads.
- Removed executable legacy stand routes, modules, fixtures, and tests so the generalized compiler is the only product path.
- Replaced legacy eval scripts with target evidence: 120 valid controls, 560 independent mutations, 50 × 10 repeatability runs, 140 intent-contract cases, 40 repairable failures, 20 infeasible cases, 120 adversarial patches, 15 offline end-to-end runs, and a structured-feedback ablation.
- Recorded 0 accepted hard-invalid mutations, 0 export-equivalence failures, 100% repeatability, 40/40 repaired failures, 0/120 accepted adversarial patches, and 15/15 offline end-to-end runs.
- Added seven Chromium flows covering access, sequential generation, measured repair, checkpoint restore, exact exports, duplicate topologies, honest offline state, malformed data, all required widths, keyboard focus, reduced motion, and zero serious/critical Axe violations.
- Rendered and inspected the studio at 1440, 1280, 768, and 390 px. Removed a redundant visible status announcement while retaining its screen-reader live region.
- Live GPT-5.6 Sol remains fail-closed until the user enables model access. Offline and mocked evidence is labelled and never presented as live behavior.

## 2026-07-14 — adversarial geometry and security review

- Corrected the fabrication-path topology so shared fold hinges are score-only, tab roots remain attached, slots remain closed cuts, and every exported cut/score path has one canonical source.
- Added hard checks for hole edge size, outer and inter-hole ligaments, net material area/ratio, cut-on-crease overlap, joint connector body/axis binding, cam connector body binding, and full reflected panel/hole symmetry rather than bounding-box symmetry.
- Bound GLB output to the selected IR: panel surfaces, all fabrication paths, connectors, hierarchy, embedded canonical profile, and 11 code-derived motion samples are source-equivalence checked. Removed caller-controlled animation inputs.
- Added a fail-closed 2,000,000-unit verification work budget, one-state static verification, and best-effort process-local rate/concurrency controls on public deterministic compile/export routes.
- Focused regression validation passed 29 files and 226 tests after the independent geometry and security findings were fixed. The complete release matrix is rerun before the milestone is committed or deployed.
- Final hardening validation passed 277 tests, 96.68% statement / 90.08% branch coverage, the 1,000-run seeded property suite, all offline eval groups, 7/7 Chromium flows, exact fixture verification, strict formatting/type/lint/build checks, production dependency audit, and secret-ignore checks.

## 2026-07-14 — connector material and binary export closure

- Rejected the final independent geometry mutations: off-panel slots, slots that remove useful panel material, detached tab roots, and cross-paired joint guides.
- Centralized slot contours and net material so verification, scoring, collision triangles, symmetry, verification work estimates, and GLB meshes use the same geometry.
- Upgraded GLB source checking to regenerate the complete canonical artifact and compare every byte. Panel/path meshes, node hierarchy, scenes, motion channels/keyframes, metadata, and binary payload now fail closed on any difference.
- Added reciprocal connector fit checks: slot width clears stock thickness; slot length clears the widest full-tab span along its own root tangent; declared clearance is exact; and both insertion axes and assembled-frame tab/slot spans must align. Cross-frame, flared-tab, sub-clearance, and perpendicular-axis bypasses are covered by regressions.
- Independent geometry re-review found no remaining high/medium issue and decoded GLB surface areas within floating-point tolerance of the source material areas for the organizer and both flower panels.
- Independent geometry and security re-reviews reproduced the connector, long-identifier, and GLB attacks, confirmed every fix, and found no remaining high/medium issue in this revision.
- The complete release matrix passes 280 tests, 96.66% statements / 90.12% branches, 1,000 seeded property runs, 120/120 valid controls, 0/560 accepted hard-invalid mutations, 120/120 export controls, 40/40 repairs, 20/20 infeasible outcomes, 0/120 hostile patches, 15/15 offline end-to-end cases, 7/7 Chromium flows, 13 regenerated artifacts, a production dependency audit with no known vulnerability, and a disabled live suite that made zero model requests.
- Standalone compile-and-verify p95 is 53.318 ms against the 2,000 ms gate. GPT-5.6 Sol remains the only blocked evidence lane and requires explicit user activation.
