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

| Evaluation                                |               Result |     Threshold | Status |
| ----------------------------------------- | -------------------: | ------------: | ------ |
| Deterministic candidates                  | 900 across 100 seeds |             — | Pass   |
| Valid in-range geometry                   |               99.89% |          ≥90% | Pass   |
| Supported-request no-crash                |                 100% |          ≥95% | Pass   |
| Identical-seed repeatability              |                 100% |          100% | Pass   |
| False-valid candidates                    |                    0 |             0 | Pass   |
| Offline compiler schema validity          |           100% of 28 |          100% | Pass   |
| Offline compiler unit normalization       |                 100% |          ≥95% | Pass   |
| Offline compiler explicit recall          |                 100% |          ≥95% | Pass   |
| Repair outcome accuracy                   |           100% of 10 |             — | Pass   |
| Repairable failures fixed within 3 cycles |                 100% |          ≥80% | Pass   |
| End-to-end pipeline                       |              15 / 15 |      ≥12 / 15 | Pass   |
| Full-feedback repair ablation             |      100% vs 0% / 0% | material lift | Pass   |
| Browser flows                             |                5 / 5 |           all | Pass   |

The browser suite covers generation, real failure highlighting, three-cycle repair, refresh restore, deterministic finalization, SVG/FOLD downloads, 1440/1280/768/390 px layouts, keyboard operation, persistent sound preference, reduced motion, and malformed API data. Manual rendered inspection confirmed no horizontal overflow at any required width.

Core coverage is recorded after the final full-suite run. Machine-readable reports are generated under ignored `artifacts/evals/` so evaluation output does not become application source.

## Live compiler status

Live GPT-5.6 evaluation is **not run**. The model integration is implemented, but live use is gated by `ENABLE_LIVE_OPENAI=true`, valid model access, and usable credits. Offline fixtures cover 28 metric, imperial, mixed, missing-essential, contradictory, and unsupported cases. This is contract evidence, not a claim of live model performance.

## Suites

- Geometry properties: 1,000 fast-check cases with `FC_SEED=20260714`.
- Compiler: 28 offline cases; 25 live cases pending credits.
- Repair: 10 seeded hard failures, including three correct infeasible outcomes.
- End-to-end: 15 held-out constraint variations through generation, measured failure, repair, ranking, and both exports.
- Ablation: no feedback vs pass/fail only vs complete structured verifier report.
- Browser: rendered responsive, accessibility, persistence, error, and download states.

## Reproduce

```bash
pnpm run coverage
FC_SEED=20260714 FC_NUM_RUNS=1000 pnpm run test:property
pnpm run eval:offline
pnpm run eval:compiler -- --cases 25
pnpm run eval:repair -- --fixtures 10 --max-iterations 5
pnpm run eval:e2e -- --cases 15
pnpm run eval:ablation
pnpm run test:e2e
```
