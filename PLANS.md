# FoldForge implementation plan

## Current state

The prompt-to-fabrication pivot is implemented. The deterministic software, offline/model-contract evaluations, browser experience, exports, and live security boundary are complete. GPT-5.6 Sol remains deliberately disabled until the user enables live access and authorizes API use.

| Milestone                                                           | Status     | Evidence                                                           |
| ------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| Versioned intent, program, IR, report, patch, and candidate schemas | Complete   | Strict Zod contracts and canonical round-trip tests                |
| Pure deterministic compiler and geometry kernel                     | Complete   | 120/120 valid controls; 0 crashes                                  |
| Ordered verifier and kinematic sampler                              | Complete   | 0/560 hard-invalid mutations accepted                              |
| Candidate ranking and bounded repair                                | Complete   | 40/40 repaired; 20/20 infeasible; 0/120 bad patches accepted       |
| GLB, SVG, DXF, JSON, and profile-scoped FOLD exports                | Complete   | 0/120 export-equivalence failures                                  |
| Describe → Forge → Export product experience                        | Complete   | 7/7 Chromium flows at all required widths                          |
| Hardened GPT-5.6 Sol route boundary                                 | Complete   | Strict contracts, auth, origin, caps, quotas, timeout, kill switch |
| Independent geometry/security hardening                             | Complete   | Source-bound cuts/GLB, physical joint binding, bounded CPU work    |
| Live GPT-5.6 Sol behavior                                           | User gate  | Enable model access, run sealed live evals, then keep or kill      |
| Submission script and documentation                                 | Complete   | Concise video script, rubric, README, limitations, eval evidence   |
| Public video recording                                              | User-owned | Record the implemented build after the live gate passes            |

## What remains

One external activation sequence remains:

1. Confirm GPT-5.6 Sol credits/model access.
2. Set `ENABLE_LIVE_OPENAI=true` while leaving `LIVE_MODEL_KILL_SWITCH=false`.
3. Run `ENABLE_LIVE_OPENAI=true ENABLE_LIVE_OPENAI_EVALS=true pnpm run eval:live`; the suite is capped at five prompts and requires four complete end-to-end passes.
4. If it passes, deploy the same configuration and record the demo. If it fails, return the kill switch to a blocked state and use the report to repair the live path.

No calendar date blocks implementation.

## Completed architecture

- `src/core/fabrication` is pure, deterministic, versioned, and independent of React/OpenAI.
- The compiler lowers bounded programs into panels, joints, connectors, transforms, motion, provenance, and exact export inputs.
- The verifier fails fast across schema, topology, geometry, connections, packing, transforms, motion, collision, semantics, and export equivalence.
- Static designs use one canonical state. Moving designs use 201 fixed driver states plus bounded deterministic adaptive event samples.
- Panel cutouts must preserve feature size, boundary/inter-hole ligaments, useful net material, and score/cut separation.
- Joint and coupling connectors are verified against their parent/child bodies and declared axes, not only their identifiers.
- GLB motion, hierarchy, paths, connectors, and embedded fabrication profile are generated from and checked against the selected IR.
- Repair accepts one to three allowlisted operations, cites actual report fields and repairable paths, blocks duplicate canonical input, and stops after five cycles.
- Only valid candidates are scored, displayed, selected, finalized, or exported.
- The studio keeps the 3D view, flat pattern, program, motion, report, selection, and downloads on the same candidate IR.
- The live boundary validates same-origin JSON, access, body size, strict schemas, quotas, token reservations, concurrency, and kill-switch state before model use. Public deterministic compile/export work is separately protected by a verifier work budget and best-effort process-local rate/concurrency gates.

## Deliberate scope

V1 supports bounded flat-sheet objects and acyclic mechanisms. It refuses smooth solid modeling, deformable simulation, electronics, motors, force-dependent behavior, and general closed-loop mechanisms. These are product boundaries, not missing implementation.

FoldForge verifies geometry, motion, clearances, and source equivalence. It makes no strength, friction, fatigue, durability, load, or manufacturing-performance claim.

## Release discipline

Every code milestone ends with formatting, zero-warning lint, strict TypeScript, unit/integration/property/browser tests, coverage, offline evals, production build, dependency audit, and diff review. Live evidence is always labelled live; mocked and deterministic evidence are never presented as model performance.
