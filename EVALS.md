# FoldForge evaluations

## Release thresholds

- 100% schema-valid model responses reaching normalization.
- At least 95% unit-normalization accuracy and explicit-constraint recall.
- At least 90% valid in-range deterministic geometry.
- At least 80% seeded failures repaired within three cycles.
- At least 95% no-crash completion for supported requests.
- Four of five unseen judge prompts succeed or correctly refuse.
- No hard verifier failure is labelled valid.

## Current results — 2026-07-14

| Evaluation                                   |                            Result |     Threshold | Status |
| -------------------------------------------- | --------------------------------: | ------------: | ------ |
| Deterministic candidates                     | 900 across 100 varied constraints |             — | Pass   |
| Supported requests with a valid candidate    |                               98% |          ≥90% | Pass   |
| Candidate pass rate                          |                            47.67% |    diagnostic | —      |
| Supported-request no-crash                   |                              100% |          ≥95% | Pass   |
| Identical-seed repeatability                 |                              100% |          100% | Pass   |
| Corrupted geometry/export mutations accepted |                           0 / 294 |             0 | Pass   |
| Offline compiler schema validity             |                        100% of 25 |          100% | Pass   |
| Offline compiler unit normalization          |                              100% |          ≥95% | Pass   |
| Offline compiler explicit recall             |                              100% |          ≥95% | Pass   |
| Repair outcome accuracy                      |                        100% of 11 |             — | Pass   |
| Repairable failures fixed within 3 cycles    |                              100% |          ≥80% | Pass   |
| End-to-end pipeline                          |                           15 / 15 |      ≥12 / 15 | Pass   |
| Full-feedback repair ablation                |                   100% vs 0% / 0% | material lift | Pass   |
| Browser flows                                |                             6 / 6 |           all | Pass   |
| Core statement / branch coverage             |                   97.81% / 91.05% |   ≥95% / ≥90% | Pass   |
| Production dependency audit                  |           0 known vulnerabilities |        0 high | Pass   |

The browser suite covers editable prompt notes in controls mode, generation, real failure highlighting, two-cycle repair, refresh restore, exact selected-candidate finalization, stage focus/scroll landing, SVG/FOLD downloads, 1440/1280/768/390 px layouts, keyboard focus visibility, persistent sound preference, reduced motion, and malformed API data. Manual rendered inspection confirmed no horizontal overflow at any required width. Native print handling reached the operating-system save sheet from the verified export guide and was cancelled without writing a file.

The final coverage run records 97.48% overall statements, 91.01% overall branches, 98.42% functions, and 98.29% lines. `src/core` records 97.81% statements, 91.05% branches, 98.13% functions, and 98.61% lines. Machine-readable reports are generated under ignored `artifacts/evals/` so evaluation output does not become application source.

## Live compiler status

Live GPT-5.6 evaluation is **not run**. The model integration is implemented, but live use is gated by `ENABLE_LIVE_OPENAI=true`, valid model access, usable credits, and a configured access gate. Offline fixtures cover 25 metric, imperial, mixed, missing-essential, contradictory, and unsupported cases. This is contract evidence, not a claim of live model performance.

## Suites

- Geometry properties: 1,000 fast-check cases with `FC_SEED=20260714`.
- Compiler: 25 offline contract cases; 25 live cases pending credits.
- Repair: 11 seeded hard failures spanning rear run, angle, slot bridge, lip, toe, contact, stability, sheet fit, and three correct infeasible outcomes.
- End-to-end: 15 cases across seven distinct measured failures through generation, repair, ranking, and both exports.
- Mutation oracle: zeroed folded panels, modified SVG fabrication IDs, and altered FOLD angles are required to be rejected for every request that yields a valid candidate.
- Ablation: no feedback vs pass/fail only vs complete structured verifier report.
- Browser: rendered responsive, accessibility, persistence, error, and download states.

## Reproduce

```bash
pnpm run coverage
FC_SEED=20260714 FC_NUM_RUNS=1000 pnpm run test:property
pnpm run eval:offline
pnpm run eval:compiler -- --cases 25
pnpm run eval:repair -- --fixtures 11 --max-iterations 5
pnpm run eval:e2e -- --cases 15
pnpm run eval:ablation
pnpm run test:e2e
```
