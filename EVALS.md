# FoldForge evaluations

## Evidence status

The generalized prompt-to-fabrication compiler passes its deterministic, mocked-contract, repair, export, browser, and offline end-to-end gates. On exact paid build `1041e13`, the retained GPT-5.6 Sol intent summary records 3/3 cases for **$0.11435875**, and the guarded readiness intent recalled all 18 explicit constraints for **$0.08897875**. The compiler raw source report was later overwritten by an offline run, so the 3/3 result is now summary-only; the cumulative ledger remains preserved. The first program response was incomplete with `max_output_tokens`; the budget layer rejected it as `budget_usage_invalid`, and no program reached validation. No live program, repair, artifact, or end-to-end success is claimed. The third chained continuation is sealed at a conservative cumulative **$3.6134275** against the **$3.70** pre-request reservation ceiling and the builder's **$4.00** authorization. Its remaining **$0.0865725** cannot satisfy another conservative paid-request reservation.

Detailed generated reports are written under ignored `artifacts/evals/`. A sanitized, response-ID-free summary with retained source-artifact hashes is committed at [submission/evidence/sol-live-evidence.json](./submission/evidence/sol-live-evidence.json). Offline evidence never counts as live model evidence.

## Release rule

Release requires:

- no hard-invalid candidate labelled valid, ranked, shown, finalized, or exported;
- exact selected-candidate source equivalence across every export;
- no serious security, accessibility, privacy, or licensing issue;
- at least 92/100 in the internal harsh review, with no official criterion below 22/25; and
- a passing five-case sealed live suite, with at least four complete successes, before claiming release-ready GPT-5.6 Sol generation.

A one-case or budget-truncated run is a **live smoke**, not the sealed release suite. It may prove that the model path works for the cases actually executed, but it cannot satisfy the 4/5 release gate or support a general live-quality claim.

## Current results

### Deterministic compiler, verifier, and exports

| Gate                                | Result                                  | Threshold | Status |
| ----------------------------------- | --------------------------------------- | --------: | ------ |
| Independently varied valid controls | 120/120 accepted                        |      ≥98% | Pass   |
| Hard-invalid adversarial mutations  | 0/560 accepted                          |         0 | Pass   |
| Correct fail-fast verifier stage    | 560/560                                 |      100% | Pass   |
| Export source equivalence           | 120/120                                 |      100% | Pass   |
| Canonical repeatability             | 50 programs × 10 repeats; 0 differences |      100% | Pass   |
| Compile + verify p95                | 140.813 ms                              | ≤2,000 ms | Pass   |
| Offline crashes                     | 0                                       |         0 | Pass   |
| Strict coverage                     | 96.72% statements / 90.13% branches     | 95% / 90% | Pass   |

The 560 mutations cover schema, topology, panel geometry, connections, sheet packing, rigid transforms, motion, collision, semantics, and export equivalence with 56 cases per phase.

### Intent contract

| Gate                                 | Result  | Threshold | Status |
| ------------------------------------ | ------- | --------: | ------ |
| Mocked strict schema validity        | 140/140 |      100% | Pass   |
| Supported cases                      | 100     |         — | —      |
| Boundary/refusal/clarification cases | 40      |         — | —      |
| Explicit constraint recall           | 100%    |      ≥98% | Pass   |
| Unit normalization                   | 100%    |      ≥99% | Pass   |
| Correct status/refusal/clarification | 100%    |      ≥95% | Pass   |

These are mocked contract tests. They establish schema and deterministic normalization behavior, not GPT-5.6 Sol accuracy.

### Repair and ablation

| Gate                                       | Result                  |      Threshold | Status |
| ------------------------------------------ | ----------------------- | -------------: | ------ |
| Repairable seeded failures within 3 cycles | 40/40; all in one cycle |           ≥85% | Pass   |
| Correct non-repairable exhaustion          | 20/20                   |           100% | Pass   |
| Adversarial patches accepted               | 0/120                   |              0 | Pass   |
| Bounded termination                        | 100%                    |           100% | Pass   |
| Full-report repair ablation                | 100% vs 0% / 0%         | ≥20-point lift | Pass   |

Repair fixtures cover packing, connector clearance, and motion. Adversarial patches cover schema, base hash, failure reference, grounding, unit, and duplicate-input attacks.

### End-to-end and browser

| Gate                                                    | Result                         | Status |
| ------------------------------------------------------- | ------------------------------ | ------ |
| Offline showcase compile → verify → rank → export       | 15/15; 3 topology fingerprints | Pass   |
| Main access/generate/repair/checkpoint/export journey   | 1/1                            | Pass   |
| Duplicate topology rejection                            | 1/1                            | Pass   |
| Plain-language examples and honest saved-example flow   | 1/1                            | Pass   |
| Malformed strict API response                           | 1/1                            | Pass   |
| 390 / 768 / 1280 / 1440 px horizontal overflow          | 0                              | Pass   |
| Keyboard focus and reduced motion                       | 1/1                            | Pass   |
| Axe serious or critical violations, before/after result | 0                              | Pass   |

The browser suite has seven passing Chromium tests. It includes the three named prompts, live-off disclosure, prepared flower and duck results, conditional 3D motion/orbit/pan/zoom controls, assistive view announcements, pattern-only pan/zoom/layer controls, offline SVG and FOLD downloads, exact live-result export controls, access/prompt focus, matched visual and accessible motion values, and proof that opening a saved example makes no intent-model request. The complete unit/integration suite has 352 passing tests across 50 files. The rendered in-app review also checks clipping, mobile horizontal scrolling, control behavior, export availability, and console output at the required widths.

### External export-consumer checks

| Artifact | Independent consumer                    | Result                                                                    |
| -------- | --------------------------------------- | ------------------------------------------------------------------------- |
| GLB      | Khronos glTF Validator `2.0.0-dev.3.10` | All three showcase files: 0 errors, 0 warnings                            |
| DXF      | `dxf-parser` `1.1.2`                    | All three parsed as millimetres with CUT/SCORE/PERFORATION/ENGRAVE layers |
| FOLD     | Official FOLD JS library `0.12.0`       | Fold-only duck parsed with all assignments and bounded faces populated    |

These are file-level compatibility checks, not claims that every downstream GUI or fabrication machine was exercised. The motion-rich flower and organizer use revolute/prismatic semantics outside the lossless FOLD profile, so their UI and API report FOLD as unavailable with a specific reason. Their SVG, DXF, GLB, and canonical JSON exports remain available and source-checked.

The committed `validate:consumers` command regenerates the three canonical showcases in memory and exercises the independent parsers directly; these results are not self-certified screenshots.

### Live GPT-5.6 Sol

| Gate                                                                  | Current                                            |
| --------------------------------------------------------------------- | -------------------------------------------------- |
| Supported brief produces a strict intent or a grounded failure        | Pass — latest guarded intent completed             |
| Explicit constraint recall and unit normalization                     | Pass — 18/18 on the guarded complex intent         |
| Unsupported request is refused or clarified without schema escape     | Pass — 1/1 unsupported request refused             |
| Prompt-injection attempt cannot escape the strict contract            | Pass — 1/1 remained an unsupported strict response |
| Three generated programs are structurally distinct and all verified   | Blocked — first response incomplete at token limit |
| Real measured failure receives a grounded patch and full revalidation | Not reached                                        |
| Exact live SVG/DXF/GLB/JSON and conditional FOLD pass consumer checks | Not reached                                        |
| Usage ledger proves model, response IDs, tokens, and cost             | Pass — 24 entries, $3.6134275, sealed              |
| Production logs contain no prompt, response, or secret content        | Not run in production                              |

#### Paid-run budget contract

The user authorization is a hard external maximum of **$4.00**. The executable evaluation limit was deliberately lower. This is the historical run configuration; do not run it against the sealed final ledger:

```bash
LIVE_EVAL_BUDGET_USD=3.70 \
ENABLE_LIVE_OPENAI=true \
ENABLE_LIVE_OPENAI_EVALS=true \
LIVE_MODEL_KILL_SWITCH=false \
pnpm run eval:live
```

Paid requests run sequentially with model-generation retries disabled. Before each request, the budget guard reserves a conservative maximum derived from the serialized request and that exact request object's `max_output_tokens`; the same object is then passed to the provider callback. After a response, it charges the provider-reported input, cached-input, cache-write, output, and reasoning usage. Missing or malformed usage and unsettled request failures charge the reservation, seal the budget, and prevent another request. Structurally valid usage that exceeds its reservation is recorded at the actual calculated cost, even if that puts the read-only sealed ledger above the authorized ceiling; it can never authorize a continuation or another call. Both paid evaluation commands share the ignored persistent ledger selected by `LIVE_EVAL_LEDGER_PATH`, defaulting to `artifacts/evals/live-cost-ledger.json`; the companion `.lock` prevents concurrent paid runs. The ledger retains only response identifiers, token counts, calculated cost, operation names, and bounded evidence metadata; it does not retain prompt or response bodies. A crash with a pending reservation is charged at that reservation's conservative maximum and seals subsequent paid calls.

After the synchronous program boundary failed twice, program synthesis moved to OpenAI's [background mode](https://developers.openai.com/api/docs/guides/background): one generation is started with `background:true`, then response retrieval is polled to a terminal state for at most 210 seconds. Retrieval-only retries cannot create duplicate model work. Requests still set `store:false`; OpenAI temporarily retains background response state for polling. A previous paid background attempt reached its guard without usable completion usage. The final paid attempt used medium reasoning and an 8,000-token combined reasoning/output ceiling; the provider returned an incomplete response with reason `max_output_tokens`. FoldForge accepted neither partial text nor coordinates. The budget layer classified the unusable response as `budget_usage_invalid`, charged the full **$0.687725** reservation, and sealed the ledger before schema validation, compilation, candidate construction, repair, or export.

After that failure, the model-facing contract was reduced without narrowing the fabrication grammar. Sol now submits one strict `FabricationPlanV1` function call containing only design judgment: panels, contours, transforms, bodies, joints, connectors, motion, semantic parts, and assembly strategy. Pure code deterministically supplies intent-owned fields, referenced stock, stable identifiers, administrative arrays, and ordered assembly operations before validating the unchanged canonical `FabricationProgramV1`. All three offline showcases preserve their kinematics, compile, verify, and serialize byte-stably through this lowering. Malformed, missing, duplicate, wrong-tool, unresolved-sheet, and token-overage cases fail closed. This is an offline-tested mitigation, not new paid evidence; the sealed live result above remains the only truthful live-program status.

A sealed ledger is never edited or reset. After explicit authorization, `eval:continue-ledger` creates a new ledger that copies the complete charged history, records the SHA-256 of the sealed source, atomically claims that source against branching, clears only the new ledger's run halt, and keeps the original cumulative cap:

```bash
ACKNOWLEDGE_SEALED_LEDGER_CONTINUATION=true \
LIVE_EVAL_BUDGET_USD=3.70 \
pnpm run eval:continue-ledger -- \
  --source artifacts/evals/live-cost-ledger.json \
  --target artifacts/evals/live-cost-ledger-continuation-1.json
```

Three authorized, non-branching continuations were created and sealed in sequence. The third preserves all 24 entries and records `$3.6134275` cumulatively, leaving `$0.0865725` below the pre-request reservation ceiling. No further paid request is allowed under that ledger because the remainder cannot satisfy the conservative reservation guard. Every source ledger and continuation claim remains immutable; creating another continuation would neither create budget nor authorize a provider request. The final raw compiler report was not preserved: a later offline evaluation overwrote the shared path. The public packet marks that gap explicitly, and current runners write paid compiler and readiness reports to exclusive run-specific paths and require readiness to name the exact compiler source.

The five-case sealed readiness suite requires at least four complete successes. Each success requires three structurally distinct verified candidates, deterministic compile and verification, bounded repair when needed, exact selected-candidate exports, source equivalence, and a strict final narrative. The full report must also include:

- expected-versus-observed checks for every explicit dimension, unit, material, sheet, motion, cut, glue, and semantic-landmark constraint;
- at least one real failed report with its stable failure ID, measured value, limit, repairable path, typed Sol patch, before/after program hashes, and passing full revalidation;
- model and response provenance plus per-operation and cumulative token/cost totals;
- the selected IR hash attached to SVG, DXF, GLB, JSON, and FOLD compatibility status; and
- independent consumer results for the exact live-selected artifact bytes, not only the prepared showcase fixtures.

Prompt hashes and bounded metrics may be stored, but production reports and logs must not retain prompt or model-response content. `eval:compiler` remains the focused intent-contract evaluation for supported, refusal/clarification, and prompt-injection behavior.

The following focused command documents the historical paid-intent procedure. Do not run it against the sealed final ledger:

```bash
LIVE_EVAL_BUDGET_USD=3.70 \
ENABLE_LIVE_OPENAI=true \
ENABLE_LIVE_OPENAI_EVALS=true \
LIVE_MODEL_KILL_SWITCH=false \
pnpm run eval:compiler
```

#### Smoke versus sealed evidence

- **Budgeted live smoke:** one or more completed paid cases under the ledger. Report only the exact cases and operations observed. This can establish API access, schema validity, and limited model behavior.
- **Sealed release suite:** all five cases were attempted under one auditable budget ledger, at least four completed the entire pipeline, every paid-evidence requirement above passed, and the exact submission build was used.
- **Budget exhaustion:** a safe and expected stop. It is not a model failure, but it leaves the sealed release gate incomplete. Do not relabel a truncated smoke as a 4/5 pass.

Do not record or submit a release-ready live-generation claim until the five-case report passes on the submission build. A successful smoke may be described only as a successful smoke.

#### Exact-artifact consumer proof

Prepared showcase validation remains useful regression evidence, but it does not prove that a newly generated winner works in downstream tools. Before release, the exact live-selected bytes must be checked as follows:

- SVG: millimetre scale, fabrication layers, printable bounds, and the 50 mm calibration line;
- DXF: parse successfully with millimetre units and CUT/SCORE/PERFORATION/ENGRAVE layer semantics, then open the same file in LibreCAD;
- GLB: pass the Khronos glTF Validator with zero errors and warnings, then play the included animation clip in an animation-capable viewer when motion exists;
- JSON: contain the selected intent, program, IR, report, score, provenance, export hashes, and the same selected IR hash; and
- FOLD: parse with the official FOLD library and open in compatible software only when the topology is losslessly representable; otherwise preserve and show the exact omission reason.

Parser acceptance is not evidence of manufacturing performance. No live result may be described as strength-tested, durability-tested, production-ready, universally fabricable, or compatible with every downstream machine.

## Reproduction

```bash
pnpm run check
pnpm run coverage
FC_SEED=20260714 FC_NUM_RUNS=1000 pnpm run test:property
pnpm run eval:offline
pnpm run eval:compiler
pnpm run eval:repair
pnpm run eval:e2e
pnpm run eval:ablation
# No further paid command is permitted under the sealed $3.70 ledger.
pnpm run test:e2e
pnpm run validate:consumers
pnpm audit --prod
```

Each report records its mode and evidence boundary. The offline E2E report explicitly says its showcase controls are not arbitrary-prompt results.
