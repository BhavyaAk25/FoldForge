# FoldForge evaluations

## Evidence status

The current branch passes its deterministic, offline contract, repair, export, browser, and build gates. The compact semantic-plan path has not yet produced a paid live Sol program, so production remains behind `LIVE_MODEL_KILL_SWITCH=true` and no live prompt-to-artifact success is claimed.

Generated reports are written under ignored `artifacts/evals/`. Public evidence contains bounded metrics and hashes, never credentials, prompt bodies, model bodies, response IDs, or private reasoning. Offline evidence never counts as live-model evidence.

## Release rule

Release evidence must satisfy all of these:

- no hard-invalid candidate labelled, displayed, finalized, or exported as valid;
- deterministic repeatability for identical inputs;
- core coverage remains above 95% statements/lines/functions and 90% branches;
- no serious unresolved security, accessibility, privacy, licensing, or export-equivalence finding;
- the deployed build SHA matches the reviewed source and evidence;
- exact selected-artifact bytes pass independent consumer checks; and
- the lower independent judge score is at least 92/100 overall, with every official category at least 22/25.

A one-case paid run is an **acceptance smoke**. It can prove that exact case works, but it is not the older five-case reliability suite and cannot by itself justify a broad reliability or 92/100 claim.

## Current no-cost results

### Test and coverage gates

| Gate             | Result                              |
| ---------------- | ----------------------------------- |
| Vitest           | 455/455 passing                     |
| Statements       | 96.96%                              |
| Branches         | 90.40%                              |
| Functions        | 97.86%                              |
| Lines            | 97.99%                              |
| Chromium E2E     | 7/7 passing                         |
| Production build | Pass                                |
| Production audit | No known production vulnerabilities |

The browser suite covers the one-design flow, success followed by a different prompt's failure, required responsive widths, keyboard use, reduced motion, accessibility, slow/malformed responses, real preview and pattern controls, checkpoint restore, conditional formats, and exact result-bound downloads. It fails on unexpected console errors or warnings.

### Compiler, verifier, and repeatability

| Gate                                     | Result                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| Valid in-range controls                  | 120/120 accepted; zero crashes                                                  |
| Hard-invalid mutations                   | 0/560 accepted                                                                  |
| Correct fail-fast stage                  | 560/560                                                                         |
| Repeatability                            | 50 programs × 10 runs; zero canonical differences                               |
| Seeded properties                        | 1,000 runs with `FC_SEED=20260714`                                              |
| Static semantic playing-card-box fixture | Exact sheet, stock, panel, seam, connector, and closed-span checks pass offline |

The target box fixture uses one 210 × 297 mm sheet, 5 mm margins, 0.4 mm stock, six named panels, five folds, one reciprocal tab-slot pair, and exact closed spans of 70 × 95 × 25 mm. The live acceptance contract rejects a dimension-matching two-panel shape because dimensions alone do not satisfy the requested enclosure topology.

### Intent contracts

| Gate                           | Result                                          |
| ------------------------------ | ----------------------------------------------- |
| Offline compiler contract      | 140/140 schema, recall, unit, and status checks |
| Supported-request no-crash set | Pass                                            |
| Unsupported scope              | Refused or clarified inside the strict schema   |
| Prompt injection               | Cannot escape the typed response contract       |
| Essential missing measurements | One minimal clarifying question                 |

Planning input preserves the source prompt and normalized explicit constraints. The semantic-plan contract defines built-in shape edge ordering, local attachments, semantic parts, and connector relationships so the model does not author compiled coordinates or guess undocumented geometry conventions.

### Repair and ablation

| Gate                            | Result                                    |
| ------------------------------- | ----------------------------------------- |
| Seeded repairable failures      | 40/40 repaired within the evaluated cycle |
| No-progress/infeasible cases    | 20/20 terminated explicitly               |
| Hostile or unrelated patches    | 0/120 accepted                            |
| Full verifier feedback          | 40/40 repaired                            |
| Reduced pass/fail-only feedback | 0/40 repaired                             |

Every diagnosis must cite a real report field and repairable path. Unknown, unrelated, out-of-range, duplicate, and no-op patches are rejected. Every accepted patch triggers complete recompilation and revalidation.

### Offline end-to-end and export consumers

The sealed offline E2E suite passes **15/15**. It exercises prepared deterministic programs and model-contract fixtures; it is not evidence that an arbitrary prompt was interpreted by live Sol.

| Format | Independent check                                                                | Current prepared-artifact result                           |
| ------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| SVG    | Scale, layers, printable bounds, 50 mm calibration, regenerated-byte equivalence | Pass                                                       |
| DXF    | `dxf-parser` 1.1.2                                                               | All showcases parse in millimetres with fabrication layers |
| GLB    | Khronos glTF Validator 2.0.0-dev.3.10                                            | All showcases: 0 errors, 0 warnings                        |
| JSON   | Canonical selected intent/program/IR/report/score/provenance/hashes              | Pass                                                       |
| FOLD   | Official FOLD JS library 0.12.0                                                  | Fold-only duck parses and populates faces                  |

FOLD is omitted with a specific reason when revolute, prismatic, connector, or other source semantics cannot be represented losslessly. Parser acceptance does not prove strength, fabrication quality, or compatibility with every downstream application.

## Historical paid Sol evidence

Historical evaluation used a $3.70 client reservation ceiling under an earlier $4.00 authorization. Preserve it exactly:

- the paid intent contract passed supported, unsupported, and prompt-injection cases;
- the guarded complex intent eventually recalled 18/18 explicit requirements;
- the final retained compiler summary records 3/3 for $0.11435875, but its raw report was overwritten by a later offline run and is therefore summary-only;
- the final guarded readiness intent cost $0.08897875 and passed 18/18 checks;
- older full-program requests failed by provider timeout, unsettled request, missing usage, or incomplete `max_output_tokens` output;
- the last incomplete response was rejected as `budget_usage_invalid` before schema validation, compilation, repair, or export; and
- the third immutable continuation is sealed at $3.6134275, with $0.0865725 unusable under its conservative reservation policy.

Those failures show that fail-closed output and billing controls worked. They do not show that program generation worked. The old ledger, its continuations, claims, hashes, and failed reports are never deleted, reset, branched, relabelled, or reused. The sanitized historical packet is [submission/evidence/sol-live-evidence.json](./submission/evidence/sol-live-evidence.json).

## Why the next contract is smaller

The failed contract asked Sol to produce too much canonical geometry and bookkeeping. The current contract asks for one compact semantic plan containing design judgment: bounded panel shapes, bodies, local-edge attachments, fold/revolute/prismatic joints, tab-slot relationships, motion, semantic landmarks, and assembly intent.

Pure code then:

1. copies intent-owned requirements and stock;
2. resolves documented edge indexes;
3. derives transforms, layout, connector geometry, IDs, and assembly order;
4. validates the canonical `FabricationProgramV1`;
5. compiles and runs the ordered verifier; and
6. emits exact source-bound artifacts only after a pass.

Representative semantic payloads fit inside the reduced 4,000-token plan ceiling, and the exact six-panel box passes offline expansion and verification. This is a tested mitigation, not live evidence.

## Separately authorized $2 acceptance plan

The builder has authorized a new maximum of **$2.00** for the compact path. This is separate from the sealed historical ledger.

On clean commit `659e84b`, the new compiler controls passed 3/3 for $0.13202125. The exact box request then used all 3,000 intent-output tokens, 2,918 of them reasoning tokens, and returned no parsed intent. FoldForge stopped before program generation after charging the completed $0.10198375 request. The new ledger therefore records $0.234005 charged and $1.765995 remaining. This is evidence for an intent-output truncation, not a program-generation result.

The targeted remedy uses medium intent reasoning, a strict 4,000-token ceiling, and a typed `MODEL_INCOMPLETE` diagnostic. It has passed every no-cost gate but must be committed and revalidated by a live response before it changes the evidence boundary.

On clean commit `6537b46`, all three compiler controls passed. The exact intent passed 16/16 requirements, and Sol completed one compact program response in about 71 seconds. Deterministic expansion rejected it as `model_invalid_plan` before compilation, repair, or export. The exact intent and program calls cost $0.19071875; cumulative new-ledger spend is $0.542165 with $1.457835 remaining. This proves the compact program call can complete inside the bounded runtime, but it does not prove a valid program.

The next build records only bounded invalid-plan phase/code/path diagnostics and asks Sol to audit the exact semantic plan against deterministic expansion invariants before its single function call. The failed model body remains unlogged and unrecoverable under `store:false`; no unmodified retry is permitted.

On clean commit `21c82f7`, the compiler controls passed and the exact intent again passed 16/16. The complete strict program response was rejected with the newly isolated expansion detail `packing_failed` at `panels/base`: its connected flat net did not fit in the authored orientation. Those two calls cost $0.1735275, bringing cumulative spend to $0.795658 with $1.204342 remaining.

The deterministic packer now evaluates both 0° and 90° orientations for every connected flat component and composes the chosen rotation into every panel transform. A focused regression proves a 110 × 60 mm connected net fits a 62 × 112 mm printable area only after the legal quarter-turn. This is a general compiler fix, not a prompt or object-specific route.

On clean commit `1af1551`, the compiler controls and 16/16 exact intent checks passed. The Sol plan then passed strict schema and deterministic expansion, producing one topology fingerprint. Deterministic verification rejected the candidate before export, and no repair call ran because the failure exposed no bounded program path. These calls cost $0.1715125; cumulative spend is $1.044196 with $0.955804 remaining.

Failed live evidence now retains the initial verifier stage, stable failure IDs, measured actual/expected fields, and repairable paths even when no repair cycle can begin. It still does not retain prompt bodies, model bodies, private reasoning, or arbitrary provider error text.

On clean commit `0f78b02`, compiler controls and 16/16 exact intent checks passed, but OpenAI reported 4,007 output tokens against a 4,000-token model request. The guard charged the actual $0.14747 usage, sealed the ledger at $1.360834, and stopped before parsing. The ledger retains $0.639166 under the $2 ceiling but cannot continue in place.

The next build reserves a separate 32-token provider accounting allowance without raising the `max_output_tokens` sent to Sol. Usage inside that allowance is charged normally; larger or structurally invalid usage still halts. Any further call must use the one-time immutable continuation carrying all $1.360834 already spent.

On clean commit `f880d20`, the compiler controls passed again and the exact intent recalled 16/16 requirements. Sol completed a strict compact semantic plan, which deterministic expansion rejected as `edge_length_mismatch` at `joints/rightFold`: the chosen short child edge could not attach to the base's full-height edge. The exact intent and plan calls cost $0.1821925, bringing cumulative spend to $1.617172 with $0.382828 remaining under the unchanged $2 ceiling.

The deterministic mapper now considers an alternative child edge only after the authored angular edge has a physical-length mismatch. It accepts only a same-length boundary edge whose aligned panel lies outside the parent, with deterministic tie-breaking; if none exists, the original typed failure remains. The exact six-panel box regression deliberately supplies Sol's wrong right-panel edge and still passes exact dimensions, ordered verification, SVG/DXF/GLB/JSON finalization, and source-equivalence checks offline. This fix is not a template, prompt-keyword route, or live success claim.

On clean commit `2357c2f`, all three compiler responses were schema-valid and completed. The supported case and prompt-injection refusal passed, but the plain powered-robot request was classified `needs_clarification` instead of `unsupported`. The gate failed and stopped before the exact acceptance prompt. These controls cost $0.11447125, bringing cumulative spend to $1.73164325 and leaving $0.26835675. The intent instructions now make unsupported essential behavior take precedence over absent measurements; clarification is reserved for representable requests missing an essential choice. That contract correction passes offline tests but has not been paid-revalidated.

Guardrails:

- use a fresh exclusive ledger and report path tied to one clean commit;
- run sequentially with model-generation retries disabled;
- reserve conservatively before each call and reconcile provider-reported usage afterward;
- charge an uncertain started request at its reservation and stop;
- never overwrite or continue the historical ledger;
- stop on the first provider, schema, budget, requirement, verifier, or consumer failure; and
- do not spend remaining allowance merely because it exists.

Execution order:

1. one supported compiler case plus bounded refusal/injection controls;
2. one exact playing-card-box acceptance case;
3. deterministic expansion and full verification or report-grounded bounded repair;
4. exact SVG/DXF/GLB/JSON generation and conditional FOLD status;
5. independent checks on those exact live-selected bytes; and
6. only if local acceptance passes, one clean-browser hosted run while total new spend remains below $2.00.

Expected playing-card-box assertions include the original prompt requirements, six named enclosure panels, five fold relationships, one A4 sheet with 5 mm margins and 0.4 mm stock, and exact 70 × 95 × 25 mm closed spans. The verifier, not the model, decides whether they pass.

The interactive app separately enforces best-effort per-session quotas, a distinct deployment-wide warm-instance ceiling, conservative token reservations, bounded concurrency, and duplicate request protection. Its default implementation is process-local and cannot be described as a durable cross-instance or account-level dollar cap.

## Live acceptance classifications

- **Blocked before provider start:** no live behavior and no paid model evidence.
- **Provider started, no usable response:** record the bounded failure and charged reservation; do not retry blindly.
- **Strict plan received, verifier failed:** evidence of plan generation only, not a valid design.
- **Exact case passed:** a successful acceptance smoke for that prompt and build.
- **Five-case suite with at least four full successes:** broader reliability evidence, still subject to every export, hosted-build, security, accessibility, and judge gate.

No report is called release-ready while production is kill-switched, the exact hosted prompt has not passed, or the deployed SHA differs from the evidence build.

## Reproduction without paid calls

```bash
pnpm run check
pnpm run coverage
FC_SEED=20260714 FC_NUM_RUNS=1000 pnpm run test:property
pnpm run eval:offline
pnpm run eval:compiler
pnpm run eval:repair
pnpm run eval:e2e
pnpm run eval:ablation
pnpm run test:e2e
pnpm run validate:consumers
pnpm audit --prod
```

Do not run paid commands from this document without the builder's explicit authorization, the required live flags, a clean committed build, and a fresh run-specific ledger.
