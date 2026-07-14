# FoldForge evaluations

## Evidence status

The prompt-to-fabrication compiler has **no passing target result yet**. The current source and deployment are the legacy one-sheet stand. Results below are therefore split into:

- **Target gates:** normative thresholds for the generalized compiler; all are pending or blocked until rerun on target schemas.
- **Legacy baseline:** real 2026-07-14 stand evidence preserved for regression context; it must not be cited as generalized compiler performance.

Every target report must record the build SHA, schema/compiler/verifier/exporter versions, seed, environment, dataset hash, sample count, and whether model use was offline, mocked, or live.

## Release rule

Release requires all hard gates below, plus the lower of two independent judge reviews scoring:

- at least **92/100 overall**;
- at least **22/25** for each of Technological Implementation, Design, Potential Impact, and Quality of the Idea; and
- no unresolved serious security, accessibility, privacy, licensing, or evidence-integrity issue.

No aggregate score can compensate for a hard-invalid design labelled valid, an export that differs from the selected IR, or a required live run that was not performed.

## Target quantitative gates

### Contracts, compiler, and feasibility

| Gate                                                                      | Dataset                                                              |                                        Threshold | Current |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- | -----------------------------------------------: | ------- |
| Strict schema/version validity after normalization                        | 100 sealed supported prompts, including metric/imperial/mixed inputs |                                             100% | Not run |
| Explicit hard-constraint recall                                           | Same 100 prompts                                                     |  ≥98% micro-average; no safety-critical omission | Not run |
| Unit normalization                                                        | Same 100 prompts                                                     | ≥99%; zero silent unit assumption when ambiguous | Not run |
| Supported prompt yields ≥1 verified candidate or correct infeasibility    | Same 100 prompts                                                     |                                             ≥90% | Not run |
| Correct refusal/clarification                                             | 40 sealed unsupported, ambiguous, and over-limit prompts             |              ≥95%; zero hidden-template fallback | Not run |
| Canonical repeatability                                                   | 50 programs × 10 repeats, same version and seed                      |      100% byte-identical IR/report/score/exports | Not run |
| Program diversity when two valid topologies are oracle-confirmed feasible | 20 diversity prompts                                                 |   ≥18/20 produce ≥2 topology-distinct candidates | Not run |

### Deterministic verifier and exports

| Gate                                                      | Dataset                                                |                                                  Threshold | Current |
| --------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------: | ------- |
| Hard-invalid accepted as valid                            | ≥500 independent mutations across every verifier phase |                                                          0 | Not run |
| Valid control rejected                                    | ≥100 independently constructed valid controls          |                                                        ≤2% | Not run |
| Closure tolerance                                         | Boundary cases around 0.1 mm                           |                                100% correct classification | Not run |
| Collision and 0.5 mm moving-clearance boundaries          | Fixed plus adversarial near-contact cases              |                                100% correct classification | Not run |
| Angle/travel boundaries                                   | Cases around 2 degrees and 1 mm                        |                                100% correct classification | Not run |
| Branch jump, dead state, and unreachable driver detection | ≥30 targeted mechanisms                                |                                              100% detected | Not run |
| Motion sampling                                           | Every moving candidate                                 | 201 fixed states plus deterministic adaptive event samples | Not run |
| SVG/DXF/GLB/JSON source equivalence                       | Every export in sealed suite                           |                          100%; zero cross-candidate mix-up | Not run |
| Units, layers, calibration, manifest, and byte hashes     | Every export in sealed suite                           |                                                       100% | Not run |

### Repair, ranking, and ablation

| Gate                                                                                        | Dataset                                                  |                                    Threshold | Current |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------: | ------- |
| Repairable seeded failures valid within 3 cycles                                            | ≥40 failures covering all hard phases that permit repair |                                         ≥85% | Not run |
| Bounded termination                                                                         | All repair fixtures                                      | 100% within 5 cycles and ≤8 operations/cycle | Not run |
| Intent mutation, unknown operation, out-of-range edit, or repeated canonical input accepted | ≥100 adversarial patches                                 |                                            0 | Not run |
| Correct infeasibility after exhaustion                                                      | ≥20 non-repairable fixtures                              |                                         100% | Not run |
| Invalid candidate ranked or shown                                                           | All suites                                               |                                            0 | Not run |
| Structured-report repair lift                                                               | Full report vs pass/fail-only and no-feedback baselines  |    ≥20 percentage points over both baselines | Not run |

### Live Sol

The live suite uses 30 sealed supported prompts, 10 unsupported/ambiguous prompts, and 10 adversarial prompt-injection/contract-escape prompts. It must run with the submission model/configuration, `store:false`, strict schemas, a server-issued safety subject, and production-equivalent access, quota, concurrency, timeout, and logging controls.

| Gate                                                                           | Threshold | Current                     |
| ------------------------------------------------------------------------------ | --------: | --------------------------- |
| Responses parse into the strict target contract or explicit refusal            |      100% | **Blocked — live disabled** |
| Supported prompts yield ≥1 verified candidate or grounded infeasibility        |      ≥90% | **Blocked — live disabled** |
| Explicit hard-constraint recall                                                |      ≥95% | **Blocked — live disabled** |
| Unsupported/adversarial prompts escape grammar or alter system/security policy |         0 | **Blocked — live disabled** |
| Prompt/response/secret content appears in production logs                      |         0 | **Blocked — live disabled** |

Live GPT-5.6 Sol has not been evaluated for this pivot. `ENABLE_LIVE_OPENAI=false` remains the production setting, and no paid generalized compiler call has been completed. Offline fixtures can test contracts and deterministic behavior but cannot satisfy this section.

### Browser, accessibility, security, and performance

| Gate                                                                                                      |                           Threshold | Current |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------: | ------- |
| Critical Describe → Forge → inspect → select → Export flows                                               | 100% at 390, 768, 1280, and 1440 px | Not run |
| Keyboard-only completion and visible focus                                                                |            100% of critical actions | Not run |
| Automated accessibility scan                                                                              |    0 critical or serious violations | Not run |
| Screen-reader status/name audit and reduced motion                                                        |                 100% checklist pass | Not run |
| Offline-unavailable disclosure; arbitrary prompt never presented as interpreted                           |               100% of offline flows | Not run |
| Origin/Fetch Metadata, access cookie, body-cap, quota, token, concurrency, timeout, and kill-switch tests |                           100% pass | Not run |
| Secrets or prompt/response bodies in client bundle, storage, health output, or production logs            |                                   0 | Not run |
| Known production dependency vulnerabilities                                                               |                  0 high or critical | Not run |
| Deterministic compile + verify p95 on reference CI, excluding model/network                               |     ≤2.0 s for max-grammar fixtures | Not run |
| Motion scrub p95 frame time after load on reference browser                                               |                              ≤32 ms | Not run |

## Official judge review

Reviewers use [JUDGE_RUBRIC.md](./JUDGE_RUBRIC.md) after the hard gates pass. They score independently, cite visible or reproducible evidence, and cannot see each other’s scores until both are locked. The release score is the lower score for each criterion and overall, not an average. The official rules use Technological Implementation as the first tie-break criterion.

## Legacy stand baseline — 2026-07-14

These results apply only to the continuous-strip phone/light-tablet stand implementation that existed before the compiler pivot.

| Evaluation                                      |                                  Result | Legacy threshold | Status |
| ----------------------------------------------- | --------------------------------------: | ---------------: | ------ |
| Deterministic candidates                        | 900 across 100 varied stand constraints |                — | Pass   |
| Supported stand requests with a valid candidate |                                     98% |             ≥90% | Pass   |
| Stand candidate pass rate                       |                                  47.67% |       Diagnostic | —      |
| Supported-request no-crash                      |                                    100% |             ≥95% | Pass   |
| Identical-seed repeatability                    |                                    100% |             100% | Pass   |
| Corrupted geometry/export mutations accepted    |                                   0/294 |                0 | Pass   |
| Offline stand compiler schema validity          |                              100% of 25 |             100% | Pass   |
| Offline stand compiler unit normalization       |                                    100% |             ≥95% | Pass   |
| Offline stand compiler explicit recall          |                                    100% |             ≥95% | Pass   |
| Stand repair outcome accuracy                   |                                   11/11 |                — | Pass   |
| Repairable stand failures fixed within 3 cycles |                                    100% |             ≥80% | Pass   |
| Stand end-to-end pipeline                       |                                   15/15 |           ≥12/15 | Pass   |
| Full-feedback stand repair ablation             |                           100% vs 0%/0% |    Material lift | Pass   |
| Browser flows                                   |                                     6/6 |              All | Pass   |
| Stand core statement / branch coverage          |                         97.81% / 91.05% |      ≥95% / ≥90% | Pass   |
| Production dependency audit                     |                 0 known vulnerabilities |           0 high | Pass   |

The final legacy coverage run recorded 97.48% overall statements, 91.01% overall branches, 98.42% functions, and 98.29% lines. `src/core` recorded 97.81% statements, 91.05% branches, 98.13% functions, and 98.61% lines. Legacy browser coverage included generation, failure highlighting, repair, refresh restore, exact selected-candidate finalization, downloads, four responsive widths, keyboard focus, reduced motion, and malformed API data.

This evidence is useful for regression engineering, especially canonical hashing, mutation rejection, and selected-candidate export. It does not establish support for multiple sheets, general panel graphs, new joints/couplings, GLB/DXF, target security limits, target accessibility, or live Sol behavior.

## Reproduction

These scripts exist today and currently exercise the legacy implementation. Target reports must not reuse their result labels until their fixtures and schemas are migrated.

```bash
pnpm run check
pnpm run coverage
FC_SEED=20260714 FC_NUM_RUNS=1000 pnpm run test:property
pnpm run eval:offline
pnpm run eval:ablation
pnpm run test:e2e
```

Target artifacts belong under ignored `artifacts/evals/` and must include a machine-readable result, dataset hash, threshold table, and a plaintext status explaining any blocked live gate.
