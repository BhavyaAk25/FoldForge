# FoldForge

**AI-guided design and repair for one-sheet functional structures**

Tell FoldForge what you need to prop up and how. With live access enabled, FoldForge compiles the request into strict constraints. In controls mode, prompt text remains editable as notes while exact measurements drive generation. FoldForge generates deterministic one-sheet phone/light-tablet stands, measures failures, repairs bounded parameters, and exports the selected printable pattern.

> Describe it. Verify it. Fold it.

Production: [foldforge.vercel.app](https://foldforge.vercel.app) — deployed in deterministic offline mode while live GPT-5.6 access remains gated.

## Supported scope

FoldForge supports one procedural family: a continuous-strip, dual-tab, fold-flat stand for phones and light tablets up to 500 g. It varies width, base depth, backrest rise and angle, lip, tabs, and clearances within documented bounds.

It is not unrestricted text-to-origami, an industrial CAD system, a material-strength simulator, or a load certification tool. FoldForge performs geometric and kinematic verification. Real load capacity depends on material, print accuracy, and fold quality and must be confirmed through physical prototyping.

## Architecture

```text
natural-language request
        ↓ GPT-5.6 Sol (strict interpretation)
DesignConstraint in mm / g / degrees
        ↓ deterministic generator
9 procedural samples → 3 visible strategies
        ↓ deterministic verifier
machine-readable failure report
        ↓ GPT-5.6 Sol (causal diagnosis + bounded patch)
code applies patch → regenerates → re-verifies
        ↓ deterministic ranking
SVG / FOLD / geometry-grounded instructions
```

GPT-5.6 interprets language, detects conflicts, diagnoses a supplied verifier report, proposes an allowlisted patch, and explains tradeoffs. It never emits coordinates, edits an export, declares validity, or overrides the code-owned ranking.

`src/core` owns unit conversion, geometry, deployment sampling, sheet and feature checks, contact overlap, support-polygon estimates, scoring, canonical serialization, and exports. The OpenAI SDK is confined to server modules.

## Deterministic topology

The flat order is:

`two releasable tabs → backrest → rear brace → base/front toe → lip`

The design has five active crease components and two internal slot cuts. “Fold flat” means unlocking both tabs and returning to the planar strip; assembled collapse is not supported.

## Setup

Requirements: Node 22+, pnpm 11+, and an OpenAI project with access to `gpt-5.6-sol`.

```bash
pnpm install
cp .env.example .env.local
pnpm run dev
```

Set these server-only variables in `.env.local`:

- `OPENAI_API_KEY` — OpenAI project key.
- `ENABLE_LIVE_OPENAI` — set to `true` only when model access and usable credits are confirmed; the default offline mode makes no paid calls.
- `DEMO_ACCESS_CODE` — required for live model calls; use at least 12 random characters.
- `ACCESS_COOKIE_SECRET` — at least 32 random bytes for the signed access cookie.

Never prefix them with `NEXT_PUBLIC_`.

## Verification

```bash
pnpm run check
pnpm run coverage
FC_SEED=20260714 FC_NUM_RUNS=1000 pnpm run test:property
pnpm run fixture -- --fixture phone-letter-110lb --seed 20260714 --output artifacts/kill-test
pnpm run verify:artifact -- artifacts/kill-test/manifest.json
pnpm run test:e2e
pnpm run eval:offline
pnpm run eval:compiler -- --cases 25
pnpm run eval:repair -- --fixtures 11 --max-iterations 5
pnpm run eval:e2e -- --cases 15
pnpm run eval:ablation
```

The fixture emits a passing SVG/FOLD pair, a geometry-derived aggressive compact candidate rejected for a measured rear-run failure, a manifest, and physical folding instructions. The verifier requires stored exports to be byte/source-equivalent to the parameter-owned geometry. Repeated generation with the same seed is byte-stable.

## Sample prompts

- “A portrait stand for my 71.5 × 147.6 × 7.8 mm, 172 g phone, about 65°, on US Letter 110 lb cardstock. No glue, two cuts maximum, and it must return flat.”
- “Use A4 80 lb cover for a 160 × 80 × 9 mm, 220 g phone in landscape. Prioritize stability at 60 degrees.”
- “Make the smallest simple stand for a 135 × 210 × 8 mm, 420 g light tablet on A3 cardstock.”

Unsupported objects, missing essential measurements, conflicting limits, and infeasible requests are refused or receive one minimal clarifying question.

## Physical status

**Physical validation pending.** No load-bearing or tablet-performance claim is made. Follow [PHYSICAL_TEST.md](./PHYSICAL_TEST.md); a result is not recorded as passed until the user confirms the printed scale, material, folds, and timed hold.

## Evaluation and build evidence

- [EVALS.md](./EVALS.md) — datasets, thresholds, ablations, and actual results.
- [BUILD_LOG.md](./BUILD_LOG.md) — how Codex contributed, tests, browser QA, commits, and risks.
- [DECISIONS.md](./DECISIONS.md) — topology, geometry, API, export, and experience decisions.
- [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) — dependency licenses and related-work boundaries.

## Related work

FoldForge builds on the vocabulary and interchange goals of the [FOLD specification](https://github.com/edemaine/fold/blob/main/doc/spec.md) and acknowledges [OrigamiSimulator](https://erikdemaine.org/papers/OrigamiSimulator_Origami7/), [COrigami](https://arxiv.org/abs/2606.26299), [Learn2Fold](https://arxiv.org/abs/2603.29585), [rigid-origami optimization](https://www.ijcai.org/proceedings/2023/645), [TreeMaker](https://langorigami.com/article/treemaker/), and [Origamizer](https://erikdemaine.org/papers/Origamizer_SoCG2017/). These systems are cited for context; their code or designs are not incorporated.

## Live-model status and deployment

The full GPT-5.6 Sol integration, strict prompts, schemas, safety identifier, access gate, and mocked/offline contracts are implemented. The configured key can authenticate and list `gpt-5.6-sol`, but live calls remain disabled until paid usage is explicitly approved and usable API credits are confirmed. Hosted software must not imply a compliant live run until that external gate is cleared.

Production is deployed at [foldforge.vercel.app](https://foldforge.vercel.app). Live mode cannot become active unless the API key, explicit opt-in, access code, and 32-character cookie secret are all present. The hosted deployment deliberately sets `ENABLE_LIVE_OPENAI=false`, so it uses deterministic structured controls and cannot make paid model calls. The landing page remains public; the access code protects only paid model calls after live mode is explicitly enabled. Live routes also use bounded JSON bodies, best-effort per-instance rate limits, no SDK retries, and a 60-second SDK timeout; provider-side spend limits remain required for production.

## License

MIT. See [LICENSE](./LICENSE).
