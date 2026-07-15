# FoldForge evaluations

## Evidence status

The generalized prompt-to-fabrication compiler passes its deterministic, mocked-contract, repair, export, browser, and offline end-to-end gates. GPT-5.6 Sol live behavior is the only unrun gate and is explicitly blocked on user activation.

All generated reports are written under ignored `artifacts/evals/`. Offline evidence never counts as live model evidence.

## Release rule

Release requires:

- no hard-invalid candidate labelled valid, ranked, shown, finalized, or exported;
- exact selected-candidate source equivalence across every export;
- no serious security, accessibility, privacy, or licensing issue;
- at least 92/100 in the internal harsh review, with no official criterion below 22/25; and
- a passing sealed live suite before claiming arbitrary GPT-5.6 Sol generation.

## Current results

### Deterministic compiler, verifier, and exports

| Gate                                | Result                                  | Threshold | Status |
| ----------------------------------- | --------------------------------------- | --------: | ------ |
| Independently varied valid controls | 120/120 accepted                        |      ≥98% | Pass   |
| Hard-invalid adversarial mutations  | 0/560 accepted                          |         0 | Pass   |
| Correct fail-fast verifier stage    | 560/560                                 |      100% | Pass   |
| Export source equivalence           | 120/120                                 |      100% | Pass   |
| Canonical repeatability             | 50 programs × 10 repeats; 0 differences |      100% | Pass   |
| Compile + verify p95                | 75.521 ms                               | ≤2,000 ms | Pass   |
| Offline crashes                     | 0                                       |         0 | Pass   |
| Strict coverage                     | 96.72% statements / 90.19% branches     | 95% / 90% | Pass   |

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

The browser suite has seven passing Chromium tests. It includes the three named prompts, live-off disclosure, prepared flower and duck results, working 3D motion/orbit/pan/zoom controls, assistive view announcements, pattern-only pan/zoom/layer controls, offline SVG and FOLD downloads, exact live-result export controls, access/prompt focus, matched visual and accessible motion values, and proof that opening a saved example makes no intent-model request. The complete unit/integration suite has 284 passing tests across 37 files. The rendered in-app review also checks clipping, mobile horizontal scrolling, control behavior, export availability, and console output at the required widths.

### External export-consumer checks

| Artifact | Independent consumer                    | Result                                                                    |
| -------- | --------------------------------------- | ------------------------------------------------------------------------- |
| GLB      | Khronos glTF Validator `2.0.0-dev.3.10` | All three showcase files: 0 errors, 0 warnings                            |
| DXF      | `dxf-parser` `1.1.2`                    | All three parsed as millimetres with CUT/SCORE/PERFORATION/ENGRAVE layers |
| FOLD     | Official FOLD JS library `0.12.0`       | Fold-only duck parsed with all assignments and bounded faces populated    |

These are file-level compatibility checks, not claims that every downstream GUI or fabrication machine was exercised. The motion-rich flower and organizer use revolute/prismatic semantics outside the lossless FOLD profile, so their UI and API report FOLD as unavailable with a specific reason. Their SVG, DXF, GLB, and canonical JSON exports remain available and source-checked.

The committed `validate:consumers` command regenerates the three canonical showcases in memory and exercises the independent parsers directly; these results are not self-certified screenshots.

### Live GPT-5.6 Sol

| Gate                                                       | Current                            |
| ---------------------------------------------------------- | ---------------------------------- |
| Strict response or explicit refusal                        | Blocked — user activation required |
| Supported brief yields valid candidate or grounded failure | Blocked — user activation required |
| Explicit constraint recall and unit normalization          | Blocked — user activation required |
| Prompt-injection/contract escape                           | Blocked — user activation required |
| Prompt, response, or secret content in production logs     | Blocked — user activation required |

No paid live result is claimed. After enabling model access, run:

```bash
ENABLE_LIVE_OPENAI=true ENABLE_LIVE_OPENAI_EVALS=true pnpm run eval:live
```

The sealed readiness suite runs five bounded supported prompts and requires at least four complete successes. Each success requires three distinct verified candidates, bounded repair when needed, selected-candidate GLB/SVG/DXF/JSON/FOLD handling, source equivalence, and a strict final narrative. The report stores prompt hashes and bounded metrics, not prompt or response content. `eval:compiler` remains the focused intent-contract evaluation and defaults to only five supported plus five boundary calls in live mode.

Do not record or submit a live-generation claim until this report passes on the submission build.

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
pnpm run eval:live # zero calls and a blocked report until both live opt-ins are true
pnpm run test:e2e
pnpm run validate:consumers
pnpm audit --prod
```

Each report records its mode and evidence boundary. The offline E2E report explicitly says its showcase controls are not arbitrary-prompt results.
