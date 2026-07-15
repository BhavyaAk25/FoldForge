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
| Compile + verify p95                | 35.265 ms                               | ≤2,000 ms | Pass   |
| Offline crashes                     | 0                                       |         0 | Pass   |
| Strict coverage                     | 96.68% statements / 90.08% branches     | 95% / 90% | Pass   |

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

| Gate                                                   | Result                         | Status |
| ------------------------------------------------------ | ------------------------------ | ------ |
| Offline showcase compile → verify → rank → export      | 15/15; 3 topology fingerprints | Pass   |
| Main access/generate/repair/checkpoint/export journey  | 1/1                            | Pass   |
| Duplicate topology rejection                           | 1/1                            | Pass   |
| Honest Sol-off state                                   | 1/1                            | Pass   |
| Malformed strict API response                          | 1/1                            | Pass   |
| 390 / 768 / 1280 / 1440 px horizontal overflow         | 0                              | Pass   |
| Keyboard focus and reduced motion                      | 1/1                            | Pass   |
| Axe serious or critical violations, before/after forge | 0                              | Pass   |

The browser suite has seven passing Chromium tests. The rendered in-app review also found no console warnings, clipping, or mobile horizontal scrolling at the required widths.

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
pnpm audit --prod
```

Each report records its mode and evidence boundary. The offline E2E report explicitly says its showcase controls are not arbitrary-prompt results.
