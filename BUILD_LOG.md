# FoldForge build log

## 2026-07-18 — Single-design live forge

- Diagnosed the first production playing-card-box run from Vercel request metadata: intent compilation succeeded, candidate one generated, compiled, and reached a repair response, then candidate two returned a controlled program-response error before the client committed any result. Production metadata does not retain the repair body, so it does not prove that candidate one passed.
- Revised the public live workflow to request exactly one Sol plan, run the unchanged deterministic compile and bounded repair path, and show that design immediately after every hard check passes.
- Removed the leftover multi-candidate novelty pressure from the first-plan instruction: with no prior topology, Sol is now told to choose the simplest verification-friendly construction.
- Replaced compare/three-design copy with **Create design** and **Inspect your design**, removed multi-result instructions from the starter prompts, and bumped the browser checkpoint key so an older three-candidate checkpoint cannot reappear.
- Reduced the live session quota to the one-design workflow: one active request per session, five repair calls per hour, two finalizations per hour, ten total live calls, and 140,000 conservatively reserved tokens per hour.
- Updated rendered tests to prove one program request, real repair evidence, exact candidate-bound exports, checkpoint restore, responsive layout, keyboard/reduced-motion behavior, and accessibility.

## 2026-07-17 — Submission hardening

- Removed Vercel Authentication from the production project and verified the
  public app and health endpoint in an isolated browser with no bypass or Vercel
  session.
- Replaced undocumented binary onboarding images and the scaffold favicon with
  small original FoldForge SVG assets.
- Added pinned GitHub Actions gates for strict deterministic verification,
  coverage, 1,000 seeded properties, dependency audit, and rendered Chromium
  flows.
- Extracted collision/contact and semantic geometry math from the verifier into
  a typed pure module without changing stage order, failure IDs, or tolerances.
- Rewrote the README and under-three-minute demo script around the official four
  judging criteria, the immutable paid-evaluation ledger, and the exact remaining
  live-Sol truth gate.

This log records product decisions and evidence boundaries. Counts are snapshots from the named milestone; [EVALS.md](./EVALS.md) holds the current release results.

## 2026-07-14 — deterministic foundation

- Created the strict Next.js 16 / React 19 / TypeScript project, engineering guide, MIT licence, versioned browser checkpoint contract, and server-only environment boundary.
- Implemented the initial continuous-strip stand as a deterministic geometry spike with procedural samples, fail-fast verification, scoring, SVG/FOLD exports, a fixture CLI, and a deliberately invalid kill-test sample.
- Established the core rule that AI may propose constraints and repairs while deterministic code owns geometry, validity, ranking, and files.

## 2026-07-14 — bounded compiler pivot

- The builder rejected a one-object product and chose a broader Work & Productivity tool for flat-sheet product handoffs.
- Defined the bounded fabrication grammar and versioned `FabricationIntentV1`, `FabricationProgramV1`, `FabricationIRV1`, `VerificationReportV2`, `ProgramPatchV1`, and `CandidateV2` contracts.
- Replaced the stand runtime with pure panel/joint/connector compilation, polygon-with-holes geometry, rigid transforms, 201-state kinematics, ordered verification, deterministic scoring, canonical hashes, and bounded report-grounded repair.
- Added exact GLB, print-scale SVG, DXF, canonical JSON, and profile-scoped FOLD exports. Every route rebuilds and verifies the selected candidate before returning bytes.
- Removed the executable legacy stand path so the generalized compiler became the only product runtime.

## 2026-07-14 — GPT-5.6 and security boundary

- Added GPT-5.6 Sol Responses API adapters with strict Zod outputs, `store:false`, bounded tokens, hashed random safety identifiers, high-reasoning intent/repair defaults, and a strict `apply_parameter_patch` function tool.
- Implemented the five-cycle repair loop with at most three operations per cycle, real report references, allowlisted paths, duplicate-input blocking, regeneration, full revalidation, and explicit exhaustion.
- Added signed two-hour access sessions, production `__Host-` HttpOnly cookies, same-origin/Fetch Metadata checks, streaming route body limits, per-session request/token quotas, bounded concurrency, no SDK retries, a bounded model timeout, metadata-only audits, and an independent kill switch.
- Kept live behavior fail-closed. No offline response or prepared example is presented as an arbitrary GPT-5.6 result.

## 2026-07-14 — adversarial geometry and export hardening

- Independent geometry review reproduced a false-valid folded state. Verification now rebuilds trusted geometry, measures deployed panels and requested motion, and rejects topology or coordinate drift.
- Corrected fabrication topology: fold hinges are score-only, tab roots remain attached, slots are closed internal cuts, cutouts stay inside source panels, and all useful material/ligament limits share one geometry implementation.
- Added reciprocal connector checks for stock clearance, full tab span, declared pair clearance, insertion-axis alignment, and assembled-frame span alignment.
- Bound GLB surfaces, fabrication paths, connectors, node hierarchy, canonical profile, and code-derived animation to the selected IR. Equivalence regenerates and compares the complete artifact.
- Added a deterministic verification work budget and best-effort process-local rate/concurrency guards for public compile/export routes.
- Independent geometry and security re-reviews found no remaining high- or medium-severity issue after the fixes.

## 2026-07-14 — evaluation and first production release

- Built deterministic controls, independent verifier mutations, repeatability runs, strict mocked intent cases, repair/exhaustion cases, hostile patches, end-to-end showcases, and a full-feedback ablation.
- Added Chromium journeys for access, sequential generation, measured repair, checkpoint restore, exact exports, duplicate topology rejection, malformed data, four responsive widths, keyboard use, reduced motion, and serious/critical accessibility checks.
- Linked the Vercel project, stored required values through the secure environment flow, deployed production, and aliased [foldforge.vercel.app](https://foldforge.vercel.app).
- Production kept `ENABLE_LIVE_OPENAI=false` because GPT-5.6 Sol access was not yet activated.

## 2026-07-15 — plain-language product pass

- Rebuilt the first screen around one promise: describe a paper object, compare checked designs, and download the pattern.
- Added illustrated, editable prompts for a playing-card box, pop-up flower card, and duck-shaped gift box.
- Added an explicitly labelled prepared flower result so judges can inspect real preview, pattern, motion, verification, and export behavior while live generation is off.
- Removed repeated hero/status/filler copy, simplified result and download labels, collapsed technical detail, and reset the checkpoint version so stale copy cannot replace the new screen.
- Fixed accessibility findings around action focus, prompt-selection feedback, screen-reader motion percentages, and saved-example export coverage.
- Converted the three example renders to high-quality JPEGs, reducing their combined transfer/repository size from about 5.9 MB to about 1.0 MB.

## 2026-07-15 — preview and consumer-export repair

- Replaced the decorative preview with an R3F mesh generated from the selected candidate’s evaluated panel triangles.
- Verified that open/close changes real mechanism state and that orbit, tilt, pan, zoom, reset, pointer rotation, and motion scrubbing affect the rendered 3D view.
- Separated pattern interaction from motion: pattern mode now exposes only pan, zoom, fit, and cut/fold layer controls. It no longer shows rotation or open/close controls that cannot affect a flat cut pattern.
- Combined GLB animation channels into one named `FoldForge Open Close` clip so common viewers expose one usable animation.
- Made FOLD compatibility explicit before download. Fold-only designs export it; revolute/prismatic designs omit it with the exact loss reason.
- Corrected zero-angle fold-only output by omitting the optional parallel fold-angle array rather than pairing mountain/valley assignments with misleading zero angles.
- Changed the flower crown from a generic star to a broad eight-petal silhouette and kept the selected candidate as the single source for pattern, mesh, motion, and bytes.
- Added export route/unit regressions and browser control assertions. The suite now passes 327 tests and 7/7 Chromium flows.
- Independently validated all showcase GLBs with the Khronos glTF Validator, parsed all showcase DXFs with `dxf-parser`, and parsed/populated the fold-only duck with the official FOLD JavaScript library.
- Deployed the repaired branch to production and visually exercised closed/open, orbit, pattern pan/zoom, and conditional export availability in the rendered app.

## 2026-07-15 — final adversarial submission review

- Preserved the flower showcase's real limitation: its rigid vertical motion demonstrates a verified moving panel, but it does not model a horizontal-to-vertical paper linkage.
- Exposed the fold-only duck as a separate finished example so FOLD compatibility can be inspected and downloaded while live model generation is disabled.
- Added concise screen-reader announcements for orbit, pan, zoom, reset, and layer controls, and kept unavailable-format explanations at normal contrast.
- Added a collapsed `USER` / `AI` / `CODE` ownership trace with the selected candidate hash and deployment build SHA so the demo script only asks for evidence the product exposes.
- Rejected mixed explicit/direction-only FOLD angle semantics instead of emitting an ambiguous file, and added static and dynamic GLB home-pose regressions.
- Added a committed consumer-validation command for Khronos GLB validation, DXF parsing/layer/unit checks, and official-library FOLD parsing/population.
- Replaced the repeated demo prompt with a genuinely new supported brief and reduced the conditional judge score from 94 to 92 because live use alone cannot prove adoption impact.

## 2026-07-17 — paid Sol budget and release-evidence gate

- The builder activated $12 of API credit, disabled automatic recharge, and authorized at most $4.00 for testing. FoldForge enforces `LIVE_EVAL_BUDGET_USD=3.70` and preserves a $0.30 safety reserve; the authorization is a ceiling, not a target.
- Added sequential pre-request cost reservation, provider-usage charging, response/token/cost ledger entries, and fail-closed behavior for missing usage, invalid usage, uncertain provider failures, or a crash with a pending reservation. Both paid evaluation commands share the ignored metadata-only `artifacts/evals/live-cost-ledger.json`, and `artifacts/evals/live-cost-ledger.lock` prevents concurrent paid runs.
- Distinguished a budgeted live smoke from the five-case sealed release suite. A smoke proves only the cases it actually completes; release still requires all five cases attempted and at least four complete prompt-to-export successes.
- Defined the paid evidence packet: explicit-constraint recall, unit normalization, supported/refusal/injection behavior, three structural fingerprints, a real report-grounded repair, before/after hashes, selected IR binding, and exact live-artifact consumer results.
- Corrected the harsh score target so Technological Implementation, Design, Potential Impact, and Quality of the Idea must each reach at least 22/25 while the total remains at least 92/100.
- Required downstream proof for the exact live winner rather than prepared fixtures alone: LibreCAD for DXF, Khronos validation and animation playback for GLB, print-scale/calibration checks for SVG, canonical hash checks for JSON, and FOLD tools only when the topology is losslessly representable.
- Preserved the honesty boundary: neither a partial smoke, prepared example, parser-only check, nor geometry verification supports claims of universal generation, adoption, quantified time savings, strength, durability, or manufacturing performance.
- The first guarded launch was blocked locally before any reservation or provider request because the CLI inherited the public access-code preflight. No credit was used. Paid evaluation now has a separate fail-closed enablement check while production routes still require the complete access-cookie configuration.
- The usage-backed intent contract passed 3/3 paid cases on one clean commit: a supported brief, an unsupported brief, and a prompt-injection attempt all stayed inside the strict schema with full explicit-constraint and unit recall. Those calls cost $0.102145.
- The first readiness intent request returned successfully, but the first complex program proposal failed at the provider boundary after about 85 seconds. The runner charged the full $0.6802 reservation, sealed the cumulative ledger at $0.8307225, and made no further request. No generated program, repair, live artifact, or end-to-end success is claimed.
- Raised the no-retry client timeout from 60 to 180 seconds for complex strict program output, retained partial stage evidence on downstream failure, and added a metadata-only provider failure category. These fixes pass offline tests but remain unverified by another paid run because the original ledger is intentionally sealed.
- Bound each paid reservation to the exact request object sent to the provider, distinguished unsettled paid requests from confirmed provider failures for future runs, and added an explicit immutable continuation workflow that carries the complete prior charge and sealed-ledger hash into a new path.
- Published a sanitized live-evidence packet with build/report/ledger hashes and no prompts, model bodies, response IDs, or credentials.
- After the authorized immutable continuation, the paid compiler contract passed all three supported, refusal, and injection cases on commit `859bccd`. The first guarded readiness retry then preserved 17 of 18 explicit requirements but omitted the user's hard fold-flat semantic, so the runner stopped before program generation after charging only the completed intent request. This exposed a real compiler-prompt coverage weakness rather than being relabelled as a success.
- Strengthened the general intent contract with a final explicit-requirement coverage pass and direct mappings for storage state, symmetry, motion range, and named-part dimensions. This remains prompt-level normalization rather than keyword templates or post-hoc mutation of model output.
- Re-ran the three-case paid compiler contract on clean commit `20b60cd`; all supported, refusal, and injection cases passed. The corrected guarded intent then passed 18/18 explicit checks, including the hard user fold-flat constraint.
- The first program proposal still did not settle inside the 180-second synchronous boundary. The budget guard charged its conservative $0.6869125 reservation and sealed the authorized continuation at $1.888625. No program, repair, live artifact, or end-to-end success is claimed, and no second continuation was created.
- Replaced synchronous program generation with the official Responses background pattern: one `background:true` generation, bounded polling to a terminal state, retrieval-only retries, `store:false`, and cancellation at 210 seconds inside the 240-second route. This remedy is offline-tested but not yet paid-verified.
- Corrected FOLD boundary versus internal-cut assignments and namespaced extension keys, made static-duck motion and GLB copy honest, and unified multi-sheet preview/SVG/DXF placement through one deterministic layout.
- Created the second immutable chained continuation and preserved the complete ledger lineage. On clean commit `48b1791`, the paid compiler contract again passed 3/3 and cost $0.12035875; the guarded intent passed all 18 checks.
- The first paid background program request reached its guarded cancellation boundary without usable completion usage. The budget guard charged the full conservative reservation and sealed the 19-entry ledger at $2.722365, leaving $0.977635 below the pre-request reservation ceiling. No program, repair, live artifact, or end-to-end success is claimed.
- Reduced program synthesis from high to medium reasoning while retaining the 8,000-token combined reasoning/output ceiling. A conservative representative-program size test reserves at least half of that ceiling for reasoning instead of risking truncated strict JSON.
- Pinned Three.js and its types to 0.182.0, the newest version compatible with React Three Fiber 9.6.1 without its deprecated `Clock` construction warning, and made browser tests fail on unexpected console warnings as well as errors.
- Renamed the prepared flower result as a direct vertical-lift study. The prompt, labels, summary, limitation, preview, and tests now describe the mechanism it actually implements instead of implying an absent horizontal-to-vertical linkage.
- Restored the original photorealistic concept renders at the builder's request, removed the superseded SVG approximations, and labelled every render as prompt inspiration so it cannot be mistaken for verified candidate geometry.
- Created the third and final immutable continuation for exact clean build `1041e13`. The paid compiler contract passed 3/3 for $0.11435875, and the guarded readiness intent passed all 18 explicit checks for $0.08897875.
- The first program response ended incomplete with reason `max_output_tokens`. FoldForge rejected the partial result as `budget_usage_invalid`, charged the full conservative $0.687725 reservation, and produced zero programs, candidates, repairs, or exports.
- Sealed the 24-entry cumulative ledger at $3.6134275, leaving $0.0865725 under the pre-request reservation ceiling. That remainder cannot satisfy another conservative request reservation, so no further paid call is permitted under the $3.70 client guard.
- Replaced the oversized model-facing full-program response with one strict compact `FabricationPlanV1` function call. A pure expander copies intent-owned constraints, selects only referenced stock, preserves body transforms and semantic bindings, derives stable identifiers and assembly operations, and validates the unchanged canonical program.
- Preserved model ID, response ID, compact-plan hash, and plan-expander version through the authenticated API, candidate provenance, canonical JSON, and visible USER/AI/CODE trace; code expansion is now labelled as CODE rather than AI.
- Found that a later offline compiler evaluation had overwritten the final paid compiler raw report at the shared `artifacts/evals/compiler.json` path. Downgraded that 3/3 item to summary-only evidence without reconstructing it. Paid compiler and readiness reports now use exclusive run-specific paths, and readiness requires the exact compiler-report path.
- Clarified that `$3.70` is a client-side pre-request reservation ceiling rather than a provider billing cap. Structurally valid provider overage metadata is recorded at actual calculated cost and seals the ledger even if the total exceeds the reservation.
- Added fail-closed plan-call and expansion tests, round-tripped all three prepared mechanisms through compile and verification, and retained provider token counts when structurally valid usage exceeds a request ceiling. This mitigation is offline-tested only; it does not change or upgrade the sealed paid result.
- Bound deterministic program IDs to the complete canonical intent as well as the compact plan and ordinal, moved same-build compiler-report and ledger-lineage validation ahead of every readiness provider call, and made sealed ledgers at or above their ceiling ineligible for continuation before any target or claim file is created.

## Remaining external gate

- Preserve every sealed ledger, continuation, claim, and failed-run report. Do not delete, reset, relabel, branch, or bypass them, and make no further paid call under the $3.70 cap.
- Keep live generation disabled. The five-case release gate and exact live-artifact consumer checks remain incomplete.
- Record only the disclosed prepared-example practice path unless separately authorized future evidence satisfies the full truth gate. The paid intent contract is the only live-model success claimed; no live program, repair, artifact, or end-to-end success is claimed.
