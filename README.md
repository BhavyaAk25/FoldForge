# FoldForge

**Turn an idea into a buildable paper design.**

Describe a small object made from paper or thin cardboard. FoldForge creates three checked designs, shows how they move or assemble, and gives you a printable cutting pattern plus 3D and CAD files.

> Let AI explore. Make code prove.

## Status

The generalized compiler, verifier, repair loop, responsive studio, and export pipeline are implemented. Offline and mocked release suites pass. The sole live-model gate is user activation of GPT-5.6 Sol:

```dotenv
ENABLE_LIVE_OPENAI=true
LIVE_MODEL_KILL_SWITCH=false
```

`OPENAI_API_KEY`, `DEMO_ACCESS_CODE`, and `ACCESS_COOKIE_SECRET` must also be configured server-side. The repository and deployment keep live generation off until that explicit switch is made, so no offline fixture is presented as an arbitrary prompt result.

FoldForge proves bounded geometry, kinematics, clearances, and export equivalence. It does not claim material strength, friction, fatigue, or manufacturing performance.

## What it makes

The V1 grammar supports:

- one to four sheets, at most 24 panels, and bounded cuts, folds, tabs, and slots;
- acyclic fold, revolute, and prismatic mechanisms;
- static, open/close, flap, rotate, slide, and expand/collapse behavior;
- direct-ratio, mirrored-pair, pull-tab, and cam-slot couplings; and
- up to three verified, topology-distinct candidates when feasible.

Examples include organizers, fold-flat displays, pop-up cards, moving packages, sample sorters, and small sheet-built boxes. Requests requiring smooth solids, deformable physics, electronics, motors, force simulation, or general closed-loop mechanisms are refused or clarified. There is no prompt-keyword routing to hidden templates.

## How it works

```text
brief
  → GPT-5.6 Sol: FabricationIntentV1 + FabricationProgramV1
  → deterministic compiler: FabricationIRV1
  → ordered verifier: geometry + packing + motion + semantics + exports
  → bounded, report-grounded repair when needed
  → deterministic ranking of valid candidates only
  → selected-candidate GLB + SVG + DXF + JSON + optional FOLD
```

Sol interprets intent, proposes bounded programs, diagnoses measured failures, and writes concise build notes. It never declares validity, mutates trusted coordinates, chooses export bytes, or overrides ranking. Every model response is strict-schema validated before deterministic code can use it.

The verifier checks schema, topology, panel geometry, cutout ligaments, cut/score separation, connector-to-body binding, sheet packing, rigid transforms, motion, collision, requested semantics, and source-equivalent exports in a fixed fail-fast order. Static designs use one canonical state; moving designs use 201 fixed states plus bounded event samples. A failed or over-budget candidate cannot be shown, ranked, finalized, or exported.

## Studio

The one-page flow uses plain task language:

1. **Describe** the object and motion.
2. **Create** three different checked designs.
3. **Compare** the 3D result and cut-and-fold pattern.
4. **Download** the exact selected design.

When live generation is off, the first screen still offers a prepared pop-up flower example. It is clearly labelled as saved—not as a result of the user’s prompt—and can be moved, rotated, inspected, and exported without an OpenAI call.

The first screen also includes three editable, concrete prompts—a playing-card box, pop-up flower card, and duck-shaped gift box—shown with real example images. The interface passes mocked end-to-end tests at 390, 768, 1280, and 1440 px, keyboard and reduced-motion checks, and automated serious/critical accessibility scanning.

## Local setup

Requirements: Node 22+ and pnpm 11+.

```bash
pnpm install
cp .env.example .env.local
pnpm run dev
```

Server-only configuration:

- `OPENAI_API_KEY` — OpenAI project key.
- `ENABLE_LIVE_OPENAI` — explicit live-model opt-in; defaults to `false`.
- `LIVE_MODEL_KILL_SWITCH` — emergency stop; defaults to `false`.
- `DEMO_ACCESS_CODE` — at least 12 random characters.
- `ACCESS_COOKIE_SECRET` — at least 32 random bytes.

Never use a `NEXT_PUBLIC_` prefix for secrets, print them, commit them, or store them in browser storage. See [PRIVACY.md](./PRIVACY.md).

## Verification

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
pnpm audit --prod
```

Generate and verify the deterministic showcase pack:

```bash
pnpm run fixture -- --fixture fabrication-showcase-pack --seed 20260714 --output artifacts/fabrication-showcase-pack
pnpm run verify:artifact -- artifacts/fabrication-showcase-pack/manifest.json
```

Current offline evidence includes 280 passing tests, 120 valid controls, 560 adversarial verifier mutations, 50 programs repeated ten times, 40 repairable failures, 20 non-repairable cases, 120 adversarial patches, 140 strict intent-contract cases, 15 end-to-end showcase runs, and seven browser flows. Exact results and evidence boundaries are in [EVALS.md](./EVALS.md).

To run the sealed live readiness suite after enabling Sol:

```bash
ENABLE_LIVE_OPENAI=true ENABLE_LIVE_OPENAI_EVALS=true pnpm run eval:live
```

The suite is capped at five prompts and requires four complete prompt → three candidates → verify/repair → exact exports → narrative runs to pass. It makes no model request unless both opt-in variables are exactly `true`.

## Project documents

- [FABRICATION_SPEC.md](./FABRICATION_SPEC.md) — normative grammar and verifier contract.
- [PLANS.md](./PLANS.md) — completed implementation and the live activation gate.
- [DECISIONS.md](./DECISIONS.md) — architecture and product decisions.
- [EVALS.md](./EVALS.md) — reproducible release evidence.
- [JUDGE_RUBRIC.md](./JUDGE_RUBRIC.md) — harsh scoring against the official criteria.
- [JUDGE_SCORECARD.md](./JUDGE_SCORECARD.md) — current 83/100 and evidence required for 94/100.
- [RESEARCH.md](./RESEARCH.md) — sources and prior-art boundaries.
- [PRIVACY.md](./PRIVACY.md) — live data flow and security controls.
- [BUILD_LOG.md](./BUILD_LOG.md) — chronological implementation record.
- [submission/VIDEO_SCRIPT.md](./submission/VIDEO_SCRIPT.md) — concise sub-three-minute demo script.
- [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) — dependencies and attribution.

## Submission position

FoldForge competes in **Work & Productivity**. It removes the manual handoff between a design brief, mechanism geometry, verification, and fabrication-ready files. Its core idea is not unrestricted text-to-CAD: it is prompt-to-typed-program-to-proof, with AI exploration bounded by deterministic evidence.

## License

MIT. See [LICENSE](./LICENSE).
