# FoldForge implementation plan

## Current state

The prompt-to-fabrication pivot is implemented. The deterministic software, offline/model-contract evaluations, browser experience, exports, and live security boundary are complete. The latest paid Sol intent contract passed 3/3 cases, and the guarded complex intent preserved all 18 explicit requirements. Its background program proposal did not settle before the guarded deadline; the second chained continuation is sealed at **$2.722365**. No live program, repair, artifact, or end-to-end success is claimed.

| Milestone                                                           | Status     | Evidence                                                               |
| ------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| Versioned intent, program, IR, report, patch, and candidate schemas | Complete   | Strict Zod contracts and canonical round-trip tests                    |
| Pure deterministic compiler and geometry kernel                     | Complete   | 120/120 valid controls; 0 crashes                                      |
| Ordered verifier and kinematic sampler                              | Complete   | 0/560 hard-invalid mutations accepted                                  |
| Candidate ranking and bounded repair                                | Complete   | 40/40 repaired; 20/20 infeasible; 0/120 bad patches accepted           |
| GLB, SVG, DXF, JSON, and profile-scoped FOLD exports                | Complete   | 0/120 export-equivalence failures; independent consumer parsers        |
| Interactive 3D and flat-pattern controls                            | Complete   | Real motion/orbit/pan/zoom; pattern-only controls; browser-tested      |
| Describe → Compare → Download product experience                    | Complete   | Plain-language first screen; 7/7 Chromium flows at required widths     |
| Saved examples and understandable prompt gallery                    | Complete   | Prepared vertical-lift flower and fold-only duck plus editable prompts |
| Hardened GPT-5.6 Sol route boundary                                 | Complete   | Strict contracts, auth, origin, caps, quotas, background, kill switch  |
| Independent geometry/security hardening                             | Complete   | Source-bound cuts/GLB mesh bytes, connector material, bounded work     |
| Live GPT-5.6 Sol behavior                                           | Partial    | Intent 3/3 and 18/18 recall; program blocked; ledger $2.722365         |
| Submission script and documentation                                 | Complete   | Devpost-ready README, concise video script, rubric, eval evidence      |
| Public video and `/feedback` session ID                             | User-owned | Record/upload after the live gate, then enter the primary task ID      |

## What remains

The remaining activation and evidence sequence is:

1. Preserve the original ledger, both chained continuations, their claim/hash lineage, and every failed-run report. Do not delete, reset, or relabel the conservative cumulative $2.722365 charge.
2. Finish offline verification and GitHub CI for the medium-reasoning, 8,000-token background-program configuration. It starts exactly one paid generation, polls only retrieval state, and cancels after 210 seconds inside the 240-second route.
3. Use the builder's authorization for one further non-branching attempt only within the unchanged $3.70 executable cap.
4. Create a new immutable continuation from the sealed second continuation ledger. It must carry every prior entry and charge, record the source hash, atomically reject branching, and retain the $3.70 internal cap. Point both paid runners at it with `LIVE_EVAL_LEDGER_PATH`; never edit any source ledger or claim.
5. On that exact clean build, run the focused compiler contract only if its conservative reservation still leaves enough for a readiness case; then attempt readiness. Stop immediately if program generation fails again or the next reservation would cross the cap.
6. Run the sealed five-case readiness suite only while the conservative budget reservation allows it. The release gate remains at least four complete end-to-end passes. Fewer attempted cases or an early budget stop is not a sealed pass.
7. Require at least one real measured failure with a stable failure ID, measured value, limit, repairable path, grounded Sol patch, before/after hashes, and a deterministically passing full recheck. A successful run with no repair does not satisfy the demo's repair claim.
8. Preserve the exact selected live artifact pack and run consumer checks against those bytes: SVG scale/layers/calibration, DXF units/layers plus LibreCAD, Khronos-valid GLB plus animation playback when applicable, canonical JSON/hash binding, and official-parser/GUI FOLD only when lossless.
9. If the sealed suite passes, deploy the identical commit with Sol enabled. Verify `Live generation ready`, access, an unseen production prompt, three candidates, repair evidence, controls, downloads, build SHA, console, and metadata-only logs. If it fails, engage the kill switch and report the exact blocked state.
10. Record and upload the public narrated video only after the deployed evidence exists. Include the private judge access code in Devpost testing instructions, the public repository and video, and the primary Codex task's `/feedback` session ID.

No partial run is promoted to release evidence. The $4 authorization is a ceiling, not a spending target; testing stops at the $3.70 internal cap even if the five-case gate remains incomplete.

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
- Paid evaluations reserve the conservative maximum cost before each sequential request, charge provider-reported usage afterward, and keep response/token/cost metadata in the ignored selected ledger. The companion `.lock` prevents concurrent runs. Missing usage, uncertain provider failure, or a crash with a pending reservation charges the conservative maximum and seals the ledger. Program synthesis uses one background generation plus bounded retrieval polling; retrieval retries cannot create duplicate model work.

## Deliberate scope

V1 supports bounded flat-sheet objects and acyclic mechanisms. It refuses smooth solid modeling, deformable simulation, electronics, motors, force-dependent behavior, and general closed-loop mechanisms. These are product boundaries, not missing implementation.

FoldForge verifies geometry, motion, clearances, and source equivalence. It makes no strength, friction, fatigue, durability, load, or manufacturing-performance claim.

## Release discipline

Every code milestone ends with formatting, zero-warning lint, strict TypeScript, unit/integration/property/browser tests, coverage, offline evals, production build, dependency audit, and diff review. Live evidence is always labelled live; mocked and deterministic evidence are never presented as model performance.

The harsh release score must be at least 92/100 with Technological Implementation, Design, Potential Impact, and Quality of the Idea each at least 22/25. The live suite can strengthen technical, design, and idea evidence. Potential Impact also requires a demonstrated exact-file handoff into a real downstream tool; no adoption, time-saving, strength, durability, or manufacturing-performance claim is made without separate evidence.
