# FoldForge build log

## 2026-07-18 — Compact semantic plan and guarded acceptance build

- Replaced the model-facing canonical program payload with `FabricationPlanV2`, a smaller semantic contract for bounded shapes, bodies, local-edge attachments, joints, tab-slot relationships, motion, landmarks, and assembly intent. Pure code expands it through the unchanged canonical program and verifier without prompt-keyword or prepared-object routing.
- Added an exact offline playing-card-box proof on one 210 × 297 mm sheet with 5 mm margins, 0.4 mm stock, six named panels, five folds, one reciprocal tab-slot pair, and 70 × 95 × 25 mm assembled spans. A dimension-matching two-panel shape is not accepted as the requested enclosure.
- Hardened contact verification so a contact exemption requires every measured intersection interval to be covered continuously by coincident contour seams, or to remain at the actual reciprocal connector locus. Interior crossings—including concave crossings hidden between valid seam endpoints—inset overlaps, unrelated seams, and distant connector geometry remain hard failures.
- Derived folded static home transforms from authored fold relationships so assembled previews and verification use the requested pose rather than a flat placeholder.
- Preserved the source prompt and explicit requirements at the planning boundary and documented built-in shape edge ordering so Sol does not guess edge indices or silently lose topology requirements.
- Added stage-specific typed diagnostics, real verifier failure IDs, no-op and duplicate repair rejection, prompt/attempt result binding, and stale-finalization rejection. A failed new prompt cannot display or export an older result.
- Moved paid finalization into the same authorization and deduplication boundary as intent, planning, and repair. Each signed random access session now has independent best-effort quotas and deduplication, while a separate process-local deployment ceiling limits aggregate warm-instance use. The same random session subject remains the OpenAI safety identifier.
- Reduced the semantic-plan output ceiling to 4,000 tokens and retained one-design generation, no model-generation retry, bounded background polling, and fail-closed schema validation.
- Passed the complete no-cost gate: 450 tests; 96.95% statements, 90.37% branches, 97.85% functions, and 97.99% lines; 1,000 seeded properties; offline compiler, repair, E2E, and ablation suites; 7/7 Chromium flows; consumer parsers; production audit; and build.
- Kept production `LIVE_MODEL_KILL_SWITCH=true`. No paid response has yet validated the new semantic-plan path, so no live program or artifact success is claimed.
- Recorded a new, separate builder authorization of at most $2.00 for the exact compact-plan acceptance path. It uses a fresh run-specific ledger, stops at the first failure, and does not modify or continue the historical ledger sealed at $3.6134275.
- On clean commit `659e84b`, the new live compiler smoke passed its supported, refusal, and injection controls for $0.13202125. The exact box run then stopped before program generation because intent extraction consumed its full 3,000-output-token allowance, including 2,918 reasoning tokens, without returning parsed intent. That completed request cost $0.10198375; the separate ledger remains open at $0.234005 charged and $1.765995 available.
- Reduced intent extraction from high to medium reasoning, raised its strict output allowance to 4,000 tokens, and classified missing parsed intent as a stable `MODEL_INCOMPLETE` contract failure. The evidence-based remedy passes 452 tests, coverage, the seeded property gate, all offline evals, 7/7 Chromium flows, consumer validation, and the production build; it still requires a paid response on its exact clean commit.
- On clean commit `6537b46`, the three live compiler controls passed again. The exact box intent then passed 16/16 requirements, and Sol completed a compact program response in about 71 seconds; deterministic expansion rejected that response as `invalid_plan` before compilation. The two exact-case calls cost $0.19071875, bringing the separate ledger to $0.542165 with $1.457835 remaining. This disproves the earlier theory that program generation cannot complete within the available duration, but it is not yet a valid design.
- Added bounded phase/code/path diagnostics for invalid program plans and a silent pre-submit expansion audit covering references, body topology, equal fold-edge lengths, printable net size, connector containment, motion ranges, and static-plan controls. No response body or private reasoning is stored or exposed.
- On clean commit `21c82f7`, the live compiler controls passed and the exact box again preserved 16/16 requirements. Sol returned another complete strict program response, and the new diagnostic isolated its only expansion blocker as `packing_failed` at the flat component rooted at `base`. The two calls cost $0.1735275; cumulative spend is $0.795658 with $1.204342 remaining.
- Generalized deterministic sheet packing to evaluate both 0° and 90° orientations for every connected flat component, select a deterministic shelf placement, and rotate the complete component transform without changing panel dimensions or topology. This removes the measured A4-orientation blocker for arbitrary connected nets rather than adding a box template.
- On clean commit `1af1551`, the compiler controls passed, the exact intent passed 16/16, and the complete Sol plan passed strict schema and deterministic expansion after the packing fix. The verifier then rejected the generated candidate before export; no repair call ran because its hard failure exposed no bounded repair path. These calls cost $0.1715125, bringing cumulative spend to $1.044196 with $0.955804 remaining.
- Preserved the initial verifier stage, stable failure IDs, measured actual/expected fields, and repairable paths in failed live-acceptance evidence even when zero repair cycles are possible. This exposes the next deterministic blocker without storing model output or spending on an ungrounded repair call.
- On clean commit `0f78b02`, the compiler controls passed. The exact intent passed 16/16, but OpenAI reported 4,007 output tokens for a request whose model ceiling was 4,000; the budget guard recorded the real $0.14747 usage, sealed the ledger at $1.360834, and stopped before plan parsing. No provider response or remaining allowance was silently ignored.
- Added a 32-token provider output-accounting reserve while leaving the model-facing `max_output_tokens` unchanged. Actual usage is still reconciled and charged, larger overages still seal the ledger, and continuation carries every prior entry and dollar under the same $2 authorization.

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

## 2026-07-19 — compact live-plan integration

- Continued the separately authorized $2 compact-path ledger without resetting or deleting any earlier evidence. On clean commit `f880d20`, compiler controls passed, the exact intent recalled 16/16 requirements, and Sol completed a strict semantic plan.
- Deterministic expansion rejected that plan at `joints/rightFold` with `edge_length_mismatch`; the model had selected the short edge of a 25 × 95 mm side panel for a 95 mm base seam. The two exact calls cost $0.1821925, bringing cumulative compact-path spend to $1.617172 and leaving $0.382828.
- Added a general deterministic recovery for that bounded model error: when an angular child edge has the wrong length, the mapper may select only a same-length boundary edge that aligns the child outside its parent. It preserves the original typed failure when no valid edge exists and never changes model-authored panel dimensions, topology, motion, or user intent.
- The exact six-panel acceptance test now reproduces the wrong right-panel edge and proves the recovered program has exact 70 × 95 × 25 mm closed spans, passes the complete verifier, and produces source-equivalent SVG, DXF, GLB, and canonical JSON offline.
- On clean commit `2357c2f`, three paid compiler controls completed with strict schemas. The supported case and injection refusal passed, while a plain powered-robot request incorrectly returned `needs_clarification` instead of `unsupported`; the gate stopped before exact program generation. The calls cost $0.11447125, bringing cumulative compact-path spend to $1.73164325 and leaving $0.26835675.
- Clarified the model contract so inherently unrepresentable essential behavior wins over missing dimensions or materials, while `needs_clarification` is reserved for requests already inside the fabrication grammar. This is a general scope-precedence rule and remains offline-tested until another authorized clean-build response validates it.
- With a new separately authorized $2 ledger, clean commit `5ae9fea` passed all three live compiler controls for $0.1164025. The exact intent recalled 16/16 requirements and Sol completed a strict plan, but topology rejected nine recognizable-form references because semantic-part fields contained panel, joint, and connector IDs. The exact calls cost $0.1867375, bringing this ledger to $0.30314 with $1.69686 remaining.
- Canonicalized recognizable-form references into deduplicated `part-*` IDs before planning, including aliases for panel/body/joint/output landmarks and reciprocal connector relationships. Updated semantic verification so hard `landmark_geometry` evidence requires referenced semantic parts with valid source geometry and required landmark labels, while hard `human_review` remains invalid.
- Extended the exact six-panel offline acceptance to carry the hard recognizable-form constraint through semantic planning, compilation, topology, semantics, complete verification, and source-equivalent export finalization.
- On clean commit `446e95b`, the live compiler gate passed 3/3 for $0.10987. The exact intent passed 16/16 and Sol completed a strict plan, but semantic verification found the correct 70/95/25 span set under a different world-axis orientation, redundant overall-size constraints attached to panels, and one topology sentence incorrectly listed as a geometric landmark. The exact calls cost $0.170165, bringing the current ledger to $0.583175 with $1.416825 remaining.
- Made requested envelope verification invariant to rigid world-axis orientation through deterministic minimum-error span assignment. Removed only exact dimension constraints that duplicate the already authoritative overall `requestedSize`; differently sized named-part constraints remain intact.
- Restricted `requiredLandmarks` normalization to concise names connected to canonical semantic parts, with a deterministic fallback to those part names. Counts, dimensions, topology prose, and assembly sentences stay in the exact request rather than becoming unverifiable landmark labels.
- On clean commit `e7d38af`, the live compiler gate passed 3/3 for $0.11398 and the exact 16/16 intent produced a strict plan. The earlier semantic failures were gone; topology rejected only a duplicate `part-connector-lid-lock`, authored once as the requested landmark and once derived by code from the same reciprocal relationship. The exact calls cost $0.16564, bringing current-ledger spend to $0.862795 with $1.137205 remaining.
- Merged explicit connector-relationship landmarks with their code-derived semantic part and deduplicated canonical connector geometry references. The exact offline acceptance now exercises this dual-source case and retains one source-bound lid-lock part.

## 2026-07-19 — exact live acceptance

- Continued only under the builder's new separate $2 authorization; no historical ledger was reset, deleted, or reused.
- On clean commit `8f8c008`, Sol produced a deterministically verified six-panel candidate and source-bound SVG, DXF, GLB, and JSON. The strict acceptance gate exposed a fully consumed tab engagement and an incorrect shallow-box fixture rather than another model or verifier failure.
- Bounded derived slot inset to retain a 1 mm engagement margin. Corrected the acceptance geometry for a 70 mm wide × 95 mm high × 25 mm deep upright box and allowed any deterministically valid connected cuboid net instead of forcing one base-star net that cannot fit printable A4.
- The complete no-cost gate passes 457/457 tests, the production build, consumer validators, and 96.95% statement / 90.36% branch / 97.79% function / 97.97% line coverage.
- On clean commit `2dc57ed`, the same-build compiler controls passed 3/3 and the exact live playing-card-box case passed all 63 acceptance checks. One strict Sol plan became one verified candidate with source-bound SVG, DXF, GLB, and JSON; GLB validation reported zero errors and warnings, and FOLD was correctly omitted for `connector_semantics`.
- The separate ledger records $1.6265905 charged and $0.3734095 remaining. This is one successful acceptance smoke, not the five-case reliability gate.

## Production delivery and remaining submission gate

- Preserve every sealed ledger, continuation, claim, and failed-run report. Do not delete, reset, relabel, branch, or bypass them, and make no further paid call under the $3.70 cap.
- Production deployment `dpl_2JJv9jmcD4uQyr7UHB9N5QLFuPH4` is ready with live generation enabled. An authenticated browser run completed access, intent, program, and compile with HTTP 200 in about 53 seconds; its verifier incorrectly waited for the intentionally clipped screen-reader status line to become visually visible, so that final rendered assertion is not claimed.
- A final program-only hosted confirmation returned a strict Sol program that production compiled as `passed`: 6 panels, 5 joints, 2 reciprocal connector elements, zero hard failures, and source-equivalent SVG/DXF/GLB/JSON. No model retry ran. Hosted usage is outside the client ledger, so exact final provider spend remains a dashboard check rather than a fabricated ledger value.
- The rotated production demo access code is stored in macOS Keychain under `FoldForge DEMO_ACCESS_CODE`; it was never printed, committed, or written to browser storage.
- Keep the five-case reliability gate, final judge score, narrated demo, and `/feedback` submission explicitly separate from the successful one-case live acceptance.
