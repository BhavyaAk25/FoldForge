# FoldForge implementation status

## Current state

FoldForge is a single-design prompt-to-fabrication application with a strict GPT-5.6 Sol boundary, deterministic synthesis and compilation, ordered verification, synchronized previews, and source-bound exports.

The post-PR #29 architecture is deliberately hybrid:

1. Sol returns strict intent plus a topology-free `FabricationDesignSpecV3`.
2. Code normalizes conflicts between the independently generated contracts.
3. The generic bounded synthesizer tries to realize the semantic specification.
4. If that search exhausts for a documented common class, code may use a parametric enclosure, faceted-figure, or pop-up-card family fitted to the requested dimensions.
5. Every result records whether its geometry came from `synthesis` or `template`.
6. Compilation and the complete hard verifier remain mandatory for both paths.

The latest merged snapshot reports **604 passing Vitest tests**. The existing browser, property, mutation, repeatability, export-equivalence, consumer, strict TypeScript, lint, formatting, and production-build gates remain part of the no-cost release workflow.

## Completed product areas

| Area                                                                 | Status                                 | Evidence boundary                                                      |
| -------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| Versioned intent, design spec, program, IR, report, patch, candidate | Complete                               | Strict Zod contracts and canonical serialization                       |
| Generic bounded synthesis                                            | Complete within documented work limits | May return typed infeasible/exhausted results                          |
| Parametric enclosure, faceted figure, and pop-up card families       | Complete                               | Used only after generic synthesis fails; provenance says `template`    |
| Pure compiler, geometry, and kinematics                              | Complete                               | No OpenAI or browser dependency in `src/core`                          |
| Ordered verifier and bounded repair                                  | Complete                               | Hard-invalid candidates cannot be selected or exported                 |
| SVG, DXF, GLB, JSON, conditional FOLD                                | Complete                               | All derive from the selected canonical IR                              |
| Describe → Forge → Export interface                                  | Complete                               | Responsive, keyboard and reduced-motion aware                          |
| OpenAI and production security boundary                              | Complete                               | Server-only secrets, access, origin/body limits, quota and kill switch |
| Exact live Sol acceptance                                            | Complete for the recorded case         | Not a universal-prompt or five-case reliability claim                  |
| Product and external-tool screenshots                                | Complete                               | Stored in `docs/images/` and explained in README                       |

## Reliability improvements after the original build

- **PR #20:** removed the cross-model material-thickness veto and reconciled tab/slot geometry in the folded home pose.
- **PRs #21–#22:** captured one sanitized failing spec, fixed unresolvable semantic references, then removed the temporary capture.
- **PRs #23–#24:** steered and normalized stock, sheet size, relation count, and locks into the synthesizer's feasible envelope.
- **PR #25:** added synthesis-first enclosure fallback.
- **PR #26:** made model-invented contact/clearance targets advisory without weakening structural checks.
- **PR #27:** exposed `generationSource`.
- **PRs #28–#29:** added verified parametric faceted-figure and pop-up-card families.

## Remaining engineering opportunities

These are improvements, not hidden completion claims:

1. Generalize beyond the three disclosed fallback families while keeping provenance explicit.
2. Replace keyword family matching with a strict model-authored object-class field or a deterministic semantic classifier.
3. Improve arbitrary `FabricationDesignSpecV3` realization rates without increasing the work budget or weakening the verifier.
4. Persist production quotas and deduplication across serverless instances.
5. Run a broader multi-prompt live reliability study only under a new explicit paid authorization.
6. Add real user workflow evidence before claiming quantified productivity impact.

## Evidence boundaries

- Passing deterministic tests prove code behavior, not arbitrary model reliability.
- A parametric fallback proves that family at the tested dimensions; it is not generic semantic synthesis.
- One successful live prompt proves that exact path, not universal generation.
- Parser and validator checks prove file structure and source equivalence, not material strength or manufacturing performance.
- FoldForge checks geometry and bounded rigid motion. It does not simulate force, friction, fatigue, durability, or deformable material behavior.

## No-cost verification

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

Paid evaluation is excluded from ordinary verification and requires explicit authorization, live flags, a clean committed build, and a new run-specific ledger.
