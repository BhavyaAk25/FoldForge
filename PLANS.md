# FoldForge implementation plan

## Current state

The product is now a single-design prompt-to-fabrication compiler. The deterministic compiler, verifier, repair engine, exports, browser experience, offline contracts, and live security boundary are implemented. The current no-cost gates pass **455 tests**, the four coverage thresholds, **7/7** rendered browser flows, offline compiler/mutation/repeatability suites, offline intent and end-to-end suites, repair/ablation gates, consumer parsers, and the production build.

Live GPT-5.6 Sol is the remaining product gate. The first separately budgeted compact-path compiler smoke passed, but the exact box intent exhausted its 3,000-token output allowance before returning structured intent, so program generation was never started. Intent now uses medium reasoning and a 4,000-token allowance; that remedy is proven offline, not yet by a paid response. Production therefore has `LIVE_MODEL_KILL_SWITCH=true` and makes no live-success claim.

| Area                                                                   | Status   | Evidence boundary                                                    |
| ---------------------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| Versioned intent, semantic plan, program, IR, report, patch, candidate | Complete | Strict Zod contracts and canonical round trips                       |
| Pure compiler, geometry, and kinematics                                | Complete | 120/120 controls; 0/560 hard-invalid mutations accepted              |
| Ordered verifier and bounded repair                                    | Complete | 40/40 repaired; 20/20 infeasible; 0/120 hostile patches accepted     |
| SVG, DXF, GLB, JSON, and conditional FOLD                              | Complete | Source-bound exporters and independent prepared-artifact consumers   |
| One-design Describe → Forge → Export experience                        | Complete | 7/7 Chromium flows at all required widths                            |
| OpenAI boundary and production safety                                  | Complete | Strict tools, access, origin/body caps, quotas, dedupe, kill switch  |
| Compact live Sol plan                                                  | Pending  | Offline-tested; no new paid plan response claimed                    |
| Exact live prompt → verified files                                     | Pending  | Must pass within the separate $2 authorization                       |
| Final deployment, PR merge, video, `/feedback`                         | Pending  | Deployment/merge follow code proof; video and task ID are user-owned |

## Immediate sequence

Calendar dates are not gates. Complete each ready step and stop only for a real blocker.

1. **Finish the exact offline acceptance contract.** Preserve the full source prompt and every explicit requirement into planning, define shape-edge ordering for Sol, and prove that the target playing-card box cannot be replaced by a superficially dimension-matching two-panel shape.
2. **Finish static seam verification.** Permit only real positive-length coincident static boundary seams while continuing to reject interior crossings, inset overlaps, connector mismatches, and moving contacts without a declared relationship.
3. **Run every no-cost gate.** Run `check`, coverage, 1,000 seeded properties, offline compiler, repair, end-to-end, ablation, browser, consumer, audit, and `git diff --check`. Resolve every serious review finding.
4. **Commit the exact acceptance build.** Paid evidence must name a clean immutable build SHA. No secret or ignored ledger is committed.
5. **Open a fresh, separately authorized paid ledger capped at $2.00.** It is a new authorization, not a reset or continuation of the historical $3.70 ledger. Preserve the old ledger and all failed reports unchanged.
6. **Run the smallest useful live proof.** The first compiler smoke passed and the first exact intent exposed a measured output-headroom failure. Commit the medium-reasoning/4,000-token remedy, rerun the compiler controls on that exact immutable build, then make one evidence-based exact playing-card-box retry through intent → semantic plan → expansion → deterministic verification/repair → exact exports. Stop at any different failure; do not retry it blindly.
7. **Validate exact bytes.** Check the selected live SVG scale/layers/calibration, parse its DXF, validate its GLB, verify canonical JSON hashes, and record why FOLD is present or omitted.
8. **Enable and verify production only after local acceptance.** Deploy the exact runtime commit, remove the kill switch, confirm `/api/health`, and run the supported prompt from a clean browser while the same separate $2 ceiling still has room. Confirm the displayed result, controls, downloads, build SHA, and metadata-only logs.
9. **Publish truthfully.** Add the new report and exact result to the evidence packet. Do not call a single case a five-case reliability suite or a 92/100 score.
10. **Finish delivery.** Push the branch, complete PR review/checks, merge to `main` under the user's explicit authorization, verify production matches `main`, then record the public narrated demo and submit the primary Codex task's `/feedback` session ID.

## Paid-evidence boundaries

The historical ledger is immutable:

- earlier authorization: $4.00;
- historical client reservation ceiling: $3.70;
- preserved cumulative charge: $3.6134275;
- result: live intent evidence, but no valid live program or artifact.

The new acceptance allowance is separate:

- maximum: **$2.00** total;
- fresh run-specific report and ledger paths;
- sequential calls only;
- no model-generation retry;
- conservative pre-request reservation and provider-usage reconciliation;
- stop on first schema, provider, budget, verification, or consumer failure; and
- no claim beyond the exact cases observed.

The process-local interactive quota/deduplication store is best-effort across serverless instances. It is not a durable cross-instance billing cap. The paid-evaluation ledger is auditable but is still a client-side guard, not an account-level provider limit.

## Implemented architecture

- `src/core/fabrication` is pure, deterministic, versioned, and independent of React and OpenAI.
- Sol authors a compact semantic plan: bounded shapes, bodies, local-edge attachments, joint/connector relationships, motion, semantic landmarks, and assembly intent.
- Pure code selects intent stock, derives transforms and packing, constructs reciprocal connector geometry, creates stable IDs and assembly order, and validates the canonical program.
- The verifier fails fast across schema, topology, geometry, connections, packing, transforms, motion, collision, semantics, and export equivalence.
- Moving designs use 201 fixed driver states plus bounded adaptive event samples. Static designs use one canonical assembled state.
- Repair cites actual report fields, accepts at most three allowlisted operations per cycle, blocks duplicate/no-op inputs, recompiles, and stops after five cycles.
- Only a verified candidate may be shown, finalized, or exported. Prompt/result hashes prevent a failed new prompt from exposing an older result.
- 3D, pattern, program, report, trace, and downloads remain bound to the same selected IR.
- Live routes enforce same-origin JSON, access, route body limits, quotas, conservative token reservations, bounded concurrency, deduplication, and the independent kill switch.

## Scope

Version 1 supports bounded flat-sheet objects and acyclic mechanisms. Smooth solids, deformable simulation, electronics, motors, force-dependent behavior, and general closed-loop mechanisms are honest refusals, not hidden templates or incomplete success states.

FoldForge verifies geometry, bounded motion, clearance, and source equivalence. It does not claim material strength, force, friction, fatigue, durability, adoption, or quantified time savings.

## Release discipline

Offline, prepared, mocked, smoke, and live evidence are labelled separately. A partial request is never promoted to a successful design. A hard-invalid candidate is never displayed or exported as valid.

The harsh target remains at least **92/100** overall and **22/25** in each official category, but it is not earned yet. Current missing evidence is a complete live compact-plan result, exact live-selected consumer proof, the hosted clean-browser run, a final reviewer score, and the public narrated submission.
