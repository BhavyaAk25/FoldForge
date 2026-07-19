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
| Vitest           | 452/452 passing                     |
| Statements       | 96.95%                              |
| Branches         | 90.37%                              |
| Functions        | 97.85%                              |
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
