# FoldForge implementation plan

## Current state

The prompt-to-fabrication pivot is implemented. The deterministic software, offline/model-contract evaluations, browser experience, exports, and live security boundary are complete. GPT-5.6 Sol remains deliberately disabled until the user enables live access and authorizes API use.

| Milestone                                                           | Status     | Evidence                                                           |
| ------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| Versioned intent, program, IR, report, patch, and candidate schemas | Complete   | Strict Zod contracts and canonical round-trip tests                |
| Pure deterministic compiler and geometry kernel                     | Complete   | 120/120 valid controls; 0 crashes                                  |
| Ordered verifier and kinematic sampler                              | Complete   | 0/560 hard-invalid mutations accepted                              |
| Candidate ranking and bounded repair                                | Complete   | 40/40 repaired; 20/20 infeasible; 0/120 bad patches accepted       |
| GLB, SVG, DXF, JSON, and profile-scoped FOLD exports                | Complete   | 0/120 export-equivalence failures; independent consumer parsers    |
| Interactive 3D and flat-pattern controls                            | Complete   | Real motion/orbit/pan/zoom; pattern-only controls; browser-tested  |
| Describe → Compare → Download product experience                    | Complete   | Plain-language first screen; 7/7 Chromium flows at required widths |
| Saved examples and understandable prompt gallery                    | Complete   | Prepared flower and fold-only duck plus three editable prompts     |
| Hardened GPT-5.6 Sol route boundary                                 | Complete   | Strict contracts, auth, origin, caps, quotas, timeout, kill switch |
| Independent geometry/security hardening                             | Complete   | Source-bound cuts/GLB mesh bytes, connector material, bounded work |
| Live GPT-5.6 Sol behavior                                           | User gate  | Enable model access, run sealed live evals, then keep or kill      |
| Submission script and documentation                                 | Complete   | Devpost-ready README, concise video script, rubric, eval evidence  |
| Public video and `/feedback` session ID                             | User-owned | Record/upload after the live gate, then enter the primary task ID  |

## What remains

One software activation sequence remains:

1. Confirm GPT-5.6 Sol credits/model access.
2. Set `ENABLE_LIVE_OPENAI=true` while leaving `LIVE_MODEL_KILL_SWITCH=false`.
3. Run `ENABLE_LIVE_OPENAI=true ENABLE_LIVE_OPENAI_EVALS=true pnpm run eval:live`; the suite is capped at five prompts and requires four complete end-to-end passes.
4. If it passes, deploy the same configuration. If it fails, return the kill switch to a blocked state and use the report to repair the live path.

After the software passes, the user must record/upload the required public narrated video and enter the primary Codex task's `/feedback` session ID in Devpost. Those are submission actions, not missing product code.

No calendar date blocks implementation.

## Completed architecture

- `src/core/fabrication` is pure, deterministic, versioned, and independent of React/OpenAI.
- The compiler lowers bounded programs into panels, joints, connectors, transforms, motion, provenance, and exact export inputs.
- The verifier fails fast across schema, topology, geometry, connections, packing, transforms, motion, collision, semantics, and export equivalence.
- Static designs use one canonical state. Moving designs use 201 fixed driver states plus bounded deterministic adaptive event samples.
- Panel and slot cutouts must stay inside their panel, preserve boundary/inter-hole ligaments and useful net material, and remain separate from scores.
- Tab roots must be real contour edges that leave the tab attached. Joint guides must be complete reciprocal mate pairs spanning the declared parent/child bodies and axes.
- GLB motion, hierarchy, paths, connectors, embedded profile, and binary payload are generated from the selected IR; equivalence regenerates the canonical artifact and compares every byte. Slot holes are removed from preview and collision meshes.
- Reciprocal connector pairs are dimensionally checked: slot width clears tab stock thickness, slot length clears the widest full-tab span along its root tangent, declared pair clearance is exact, and insertion/span axes align in the assembled frame.
- Repair accepts one to three allowlisted operations, cites actual report fields and repairable paths, blocks duplicate canonical input, and stops after five cycles.
- Only valid candidates are scored, displayed, selected, finalized, or exported.
- The studio keeps the 3D view, flat pattern, program, motion, report, selection, and downloads on the same candidate IR.
- The first screen explains the outcome in plain language, shows the three-step journey, and uses named examples that describe an understandable object, purpose, material, size, and motion.
- When live generation is disabled, the studio offers prepared flower and fold-only duck candidates that are explicitly labelled as saved and can be inspected and exported without misrepresenting them as prompt results.
- The live boundary validates same-origin JSON, access, body size, strict schemas, quotas, token reservations, concurrency, and kill-switch state before model use. Public deterministic compile/export work is separately protected by a verifier work budget and best-effort process-local rate/concurrency gates.

## Deliberate scope

V1 supports bounded flat-sheet objects and acyclic mechanisms. It refuses smooth solid modeling, deformable simulation, electronics, motors, force-dependent behavior, and general closed-loop mechanisms. These are product boundaries, not missing implementation.

FoldForge verifies geometry, motion, clearances, and source equivalence. It makes no strength, friction, fatigue, durability, load, or manufacturing-performance claim.

## Release discipline

Every code milestone ends with formatting, zero-warning lint, strict TypeScript, unit/integration/property/browser tests, coverage, offline evals, production build, dependency audit, and diff review. Live evidence is always labelled live; mocked and deterministic evidence are never presented as model performance.
