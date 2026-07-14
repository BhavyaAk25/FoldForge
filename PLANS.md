# FoldForge implementation plan

| Milestone                              | Status        | Proof                                             |
| -------------------------------------- | ------------- | ------------------------------------------------- |
| Repository, branch, scaffold, guidance | Complete      | `pnpm run check`                                  |
| Deterministic geometry and kill test   | Complete      | mutation tests, artifact verifier, coverage       |
| GPT-5.6 constraint compiler            | Offline ready | 25-case contract eval; live access blocked        |
| Bounded repair loop                    | Complete      | 11 seeded fixtures, bounded exhaustion            |
| Workshop UI, preview, exports          | Complete      | concise audit and 6 Playwright flows              |
| Full eval and independent review       | Complete      | all serious findings fixed; release matrix passes |
| GitHub and draft PR                    | Complete      | public `BhavyaAk25/FoldForge`, draft PR #1        |
| Vercel and submission package          | Deployed      | production `foldforge.vercel.app` is ready        |
| Physical prototype                     | Awaiting user | signed physical protocol result                   |

## Dependencies and blockers

- Secure `OPENAI_API_KEY` is stored locally. Live calls remain gated on usable credit, model access, and explicit `ENABLE_LIVE_OPENAI=true` opt-in.
- Vercel production is deployed through the authenticated CLI. Automatic GitHub-to-Vercel deployment remains unlinked and is not required for the current production release.
- Physical printing is deliberately deferred without blocking software.

## Validation cadence

Each milestone runs formatting, lint, TypeScript, focused tests, applicable property/E2E tests, production build, diff inspection, then commit and push. No calendar date is a work gate.

## Pivots

- Replace the 3D preview with deterministic projected SVG polygons if it threatens the critical path.
- Keep the FOLD 1.2 edge profile without faces if slit topology becomes ambiguous.
- After two physical tab-lock failures, allow one clearance revision, then pivot once to the raised-cradle strip.
