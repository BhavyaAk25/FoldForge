# FoldForge evaluations

## Release thresholds

- 100% schema-valid model responses reaching normalization.
- At least 95% unit-normalization accuracy and explicit-constraint recall.
- At least 90% valid in-range deterministic geometry.
- At least 80% seeded failures repaired within three cycles.
- At least 95% no-crash completion for supported requests.
- Four of five unseen judge prompts succeed or correctly refuse.
- No hard verifier failure is labelled valid.

## Suites

- Geometry properties: 1,000 generated cases with seed `20260714`.
- Compiler: at least 25 metric, imperial, mixed, vague, contradictory, and unsupported cases.
- Repair: at least 10 seeded hard failures.
- Hidden E2E: at least 15 prompts held outside implementation routing.
- Ablation: no feedback vs pass/fail vs complete structured verifier report.
- Browser: 1440, 1280, 768, and 390 px plus keyboard, reduced motion, audio, error, refresh, access, print, and download states.

## Results

Results are intentionally blank until the corresponding command has run. See `artifacts/evals` for machine-readable output once generated.
