# FoldForge implementation plan

## Current state

The prompt-to-fabrication pivot is approved, but the implementation is not complete. The current application, tests, deployment, and historical metrics still describe the legacy single-topology stand. Documentation is the first migration step; no target milestone may inherit a legacy pass result without rerunning against versioned fabrication-compiler fixtures.

| Milestone                                                           | Status   | Exit evidence                                                             |
| ------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------- |
| Normative product, privacy, eval, and submission contract           | Complete | Documentation diff and formatting check                                   |
| Versioned intent, program, IR, report, patch, and candidate schemas | Pending  | Contract fixtures and canonical round trips pass                          |
| Pure deterministic compiler and geometry kernel                     | Pending  | Supported grammar compiles without model access                           |
| Ordered verifier and kinematic sampler                              | Pending  | Independent mutation/adversarial oracles reject every hard invalid        |
| Candidate diversity, ranking, and bounded repair                    | Pending  | Sealed topology and repair suites meet [EVALS.md](./EVALS.md)             |
| GLB, print-scale SVG/DXF, JSON, and instruction exports             | Pending  | All formats are source-equivalent to the selected IR                      |
| Describe → Forge → Export product experience                        | Pending  | Browser, accessibility, responsive, and provenance suites pass            |
| Hardened live GPT-5.6 Sol path                                      | Blocked  | Credits/access approved; live sealed suite passes with kill switch on     |
| Submission package and final recording                              | Pending  | Working build, public <3-minute video, repository, README, and session ID |
| Release review                                                      | Pending  | ≥92/100 overall, every criterion ≥22/25, and every hard gate passes       |

## Critical path

1. **Contracts first.** Implement `FabricationIntentV1`, `FabricationProgramV1`, `FabricationIRV1`, `VerificationReportV2`, `ProgramPatchV1`, and `CandidateV2`, plus a canonical serializer and explicit migration/refusal behavior for unknown versions.
2. **Pure compiler.** Lower the bounded grammar into panels, joints, connectors, motion, transforms, and provenance without network or UI dependencies.
3. **Verifier before variety.** Implement the fail-fast verification sequence and independent test oracles before candidate generation can label anything valid.
4. **Candidates and repair.** Generate at most three visible candidates; prefer at least two topology-distinct valid programs when feasible; apply at most eight typed patch operations per cycle and five cycles.
5. **One source of truth.** Render the synchronized preview, flat pattern, motion, report, GLB, SVG, DXF, and JSON from the same selected IR.
6. **Live model last.** Enable Sol only behind access, origin, quota, token, concurrency, timeout, privacy, and kill-switch controls; run sealed live and adversarial suites.
7. **Submission proof.** Record only behavior that passes on the submission build and map the demo to the four official criteria in [JUDGE_RUBRIC.md](./JUDGE_RUBRIC.md).

## Workstreams

### Core and verification

- Keep `src/core` pure and deterministic.
- Support only the grammar and numeric limits in [FABRICATION_SPEC.md](./FABRICATION_SPEC.md).
- Sample motion at 201 fixed driver states and adaptively near contact, clearance, and branch events.
- Test closure, collision, clearance, travel, angles, branch continuity, dead states, semantics, and export equivalence with independent calculations.
- Refuse unsupported or infeasible requests with typed, user-facing reasons.

### AI and server

- Constrain Sol to strict structured intent/program/patch contracts.
- Treat model output as untrusted input and reject unknown fields, identifiers, and operations.
- Enforce the exact security limits in [PRIVACY.md](./PRIVACY.md), including `__Host-` cookie semantics, same-origin checks, body caps, per-session request/token quotas, and bounded concurrency.
- Keep `ENABLE_LIVE_OPENAI=false` until live access, spend authorization, and sealed evaluation are confirmed.

### Product and exports

- Build the Describe → Forge → Export flow at 390, 768, 1280, and 1440 px.
- Provide synchronized 3D, print pattern, program, motion scrub, verifier evidence, and `USER` / `AI` / `CODE` provenance.
- Export only the exact selected verified candidate as GLB, SVG, DXF, and canonical JSON.
- Include units, calibration, layers, hashes, assembly, and operation instructions.
- Make offline behavior explicit; offline fixtures are demonstrations, not arbitrary prompt interpretation.

## Blockers and dependencies

- **Live Sol:** the repository has not completed a paid GPT-5.6 Sol call or generalized live evaluation. Model access, usable credits, and explicit authorization are required before enabling it.
- **Legacy deployment:** [foldforge.vercel.app](https://foldforge.vercel.app) remains the old stand prototype until a new deployment passes the target release gates.
- **Implementation debt:** current schemas, routes, UI, tests, and exporters are topology-specific and must be migrated rather than relabelled.
- **Submission clock:** the official deadline is July 21, 2026 at 5:00 PM Pacific. The date creates prioritization pressure but never lowers a correctness, security, privacy, or honesty gate.

## Explicit non-gates and non-goals

- Material testing is outside the software release gate and cannot substitute for verifier evidence.
- Do not claim material strength, force, friction, fatigue, durability, or manufacturing tolerance beyond the encoded geometric clearances.
- Do not expand into arbitrary smooth solids, deformable simulation, electronics, motors, or general closed-loop mechanisms.
- Do not hide templates behind prompt matching or tune evaluation prompts into the product.
- Do not ship a generalized label over the legacy stand implementation.

## Change cadence

Each milestone ends with formatting, lint, type checking, focused and property tests, applicable E2E/eval suites, production build, and a diff review. Reports must record schema version, seed, build SHA, environment, pass/fail threshold, and whether the result is legacy, offline target, or live target.
