# FoldForge implementation plan

## Current state

The product is now a single-design prompt-to-fabrication compiler. The deterministic compiler, verifier, repair engine, exports, browser experience, offline contracts, and live security boundary are implemented. The current no-cost gates pass **455 tests**, the four coverage thresholds, **7/7** rendered browser flows, offline compiler/mutation/repeatability suites, offline intent and end-to-end suites, repair/ablation gates, consumer parsers, and the production build.

Live GPT-5.6 Sol is the remaining product gate. Sol now completes strict intent and compact semantic-plan generation inside the bounded runtime. The latest exact run passed all 16 intent requirements and returned a strict plan, but deterministic expansion rejected one model-selected short child edge at `joints/rightFold`. The compiler now resolves an incorrectly selected angular child edge only when another edge has the same physical length and places the child outside the parent; the exact six-panel regression then passes expansion, verification, and source-equivalent exports offline. Production therefore retains `LIVE_MODEL_KILL_SWITCH=true` until this exact build passes the paid local acceptance.

| Area                                                                   | Status   | Evidence boundary                                                    |
| ---------------------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| Versioned intent, semantic plan, program, IR, report, patch, candidate | Complete | Strict Zod contracts and canonical round trips                       |
| Pure compiler, geometry, and kinematics                                | Complete | 120/120 controls; 0/560 hard-invalid mutations accepted              |
| Ordered verifier and bounded repair                                    | Complete | 40/40 repaired; 20/20 infeasible; 0/120 hostile patches accepted     |
| SVG, DXF, GLB, JSON, and conditional FOLD                              | Complete | Source-bound exporters and independent prepared-artifact consumers   |
| One-design Describe → Forge → Export experience                        | Complete | 7/7 Chromium flows at all required widths                            |
| OpenAI boundary and production safety                                  | Complete | Strict tools, access, origin/body caps, quotas, dedupe, kill switch  |
| Compact live Sol plan                                                  | Complete | Strict live plans complete; latest deterministic rejection recorded  |
| Exact live prompt → verified files                                     | Pending  | Must pass within the separate $2 authorization                       |
| Final deployment, PR merge, video, `/feedback`                         | Pending  | Deployment/merge follow code proof; video and task ID are user-owned |

## Immediate sequence

Calendar dates are not gates. Complete each ready step and stop only for a real blocker.

1. **Complete — exact offline acceptance contract.** The full source prompt, shape-edge convention, six-panel topology, dimensions, stock, lock, and negative two-panel control are enforced.
2. **Complete — static seam verification.** Only complete positive-length coincident boundary loci receive the seam exemption; adversarial interior crossings remain invalid.
3. **Complete — no-cost gates.** The full check, coverage, properties, offline evaluations, browser suite, consumer validation, audit, and independent reviews pass at the recorded milestones.
4. **Complete — immutable acceptance builds.** Every paid report names its clean build SHA; ignored ledgers and secrets remain outside Git.
5. **Complete — separate $2 ledger.** The immutable continuation carries every prior charge and remains capped at the original authorization.
6. **In progress — smallest useful live proof.** Commit the general exterior equal-edge resolver, rerun compiler controls on that exact SHA, then make one exact playing-card-box acceptance call. Stop at a new measured failure or the ledger ceiling; never retry blindly.
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
