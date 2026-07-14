# FoldForge

**A prompt-to-fabrication compiler for bounded flat-sheet mechanisms.**

FoldForge is being rebuilt for the OpenAI Build Week **Work & Productivity** track. A product or fabrication team describes a small flat-sheet object; GPT-5.6 Sol turns that brief into a typed fabrication program; deterministic code compiles, simulates, verifies, ranks, repairs, and exports the exact selected design.

> Describe it. Prove it. Fabricate it.

## Status: approved pivot, implementation pending

The repository currently contains a deployed, deterministic one-sheet phone-stand prototype. The generalized compiler described below is the approved target contract in [FABRICATION_SPEC.md](./FABRICATION_SPEC.md), but its source implementation and target evaluation results are not complete.

- [foldforge.vercel.app](https://foldforge.vercel.app) is the **legacy stand prototype**, not evidence that arbitrary supported prompts compile.
- Production sets `ENABLE_LIVE_OPENAI=false`. No generalized live GPT-5.6 Sol evaluation or paid model call has been completed.
- Existing stand results remain recorded as a legacy baseline in [EVALS.md](./EVALS.md); all compiler-pivot results are pending.
- Scope ends at geometric and kinematic verification; FoldForge does not claim strength, force, friction, fatigue, or material performance.

## Product contract

The supported grammar deliberately covers a useful, testable subset of flat-sheet design:

- 1–4 sheets, at most 24 panels, 64 vertices per panel, and 24 joints/connectors;
- simple panel polygons in millimetres with cuts, folds, tabs, and slots;
- an acyclic rigid-body graph with fold, revolute, and prismatic joints;
- zero or one motion driver and at most six driven outputs;
- direct-ratio, mirrored-pair, pull-tab, and cam-slot couplings; and
- static, open/close, flap, rotate, slide, and expand/collapse behaviors.

Requests for arbitrary smooth solids, deformable or force-dependent behavior, electronics, motors, or general closed-loop mechanisms are refused. There are no hidden prompt keywords, winning templates, or canned designs.

Example target requests:

- “Make a two-sheet desk organizer whose front tray slides out 70 mm and opens two mirrored side wings.”
- “Design a fold-flat status sign with one pull tab that rotates three indicator panels by 90 degrees.”
- “Create a four-compartment sample sorter that expands from a flat envelope and fits on A4 sheets.”

## Compiler architecture

```text
user brief
    ↓ GPT-5.6 Sol: typed intent and fabrication program
FabricationIntentV1 + FabricationProgramV1
    ↓ deterministic compiler
FabricationIRV1: panels, joints, connectors, motion, provenance
    ↓ deterministic verification
schema → graph → geometry → packing → transforms → motion → semantics → exports
    ↓ bounded candidate generation and repair
up to 3 verified, visibly distinct candidates
    ↓ exact selected candidate
interactive 3D + GLB + print-scale SVG/DXF + fabrication.json
```

GPT-5.6 Sol contributes design reasoning, constraint interpretation, topology proposals, and typed repair patches. It does **not** author trusted coordinates, declare a design valid, rank invalid candidates, or alter exports. `src/core` is the authority for geometry, kinematics, verification, scoring, repair application, canonical serialization, and export equivalence.

The OpenAI integration uses the [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create), strict [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), `store:false`, bounded output, and a privacy-preserving `safety_identifier`. Live availability is a separate gate from the deterministic compiler.

## Hard verifier guarantees

A candidate is visible or exportable only after every hard check passes. In particular:

- closure residual is at most 0.1 mm;
- no sampled collision is permitted;
- requested moving clearance is at least 0.5 mm;
- requested angle error is at most 2 degrees;
- requested travel error is at most 1 mm;
- no kinematic branch jump is permitted; and
- the driver has no unreachable or dead state.

Motion is sampled at 201 states plus adaptive samples near contact, clearance, and branch events. Scoring starts only after schema, topology, geometry, packing, transform, motion, semantic, and export/source-equivalence checks pass. The full normative order is in [FABRICATION_SPEC.md](./FABRICATION_SPEC.md).

## Experience and outputs

The target flow is **Describe → Forge → Export**:

1. Describe the object, dimensions, motion, sheets, and fabrication constraints.
2. Compare up to three verified candidates optimized for fabrication efficiency, mechanical simplicity, and visual expression.
3. Inspect synchronized 3D, flat pattern, motion scrubber, verifier evidence, and `USER` / `AI` / `CODE` provenance.
4. Export the exact selected candidate as GLB, print-scale SVG, DXF, and canonical `fabrication.json`, with assembly and operation instructions.

Offline mode must say that live interpretation is unavailable. It may demonstrate checked fixtures, but it may not pretend to understand an arbitrary prompt.

## Local setup

Requirements: Node 22+ and pnpm 11+.

```bash
pnpm install
cp .env.example .env.local
pnpm run dev
```

The present source still launches the legacy stand prototype. The environment variables are server-only:

- `OPENAI_API_KEY` — OpenAI project key.
- `ENABLE_LIVE_OPENAI` — explicit live-model kill switch; defaults to `false`.
- `DEMO_ACCESS_CODE` — required for live calls; at least 12 random characters.
- `ACCESS_COOKIE_SECRET` — at least 32 random bytes.

Never prefix a secret with `NEXT_PUBLIC_`, print it, commit it, or place it in browser storage. See [PRIVACY.md](./PRIVACY.md) for the target route caps, quotas, concurrency, logging, cookie, and retention contract.

## Verification commands

These commands exist today. Until the pivot implementation lands, their results apply to the legacy stand baseline unless a report explicitly identifies the fabrication-compiler schema version.

```bash
pnpm run check
pnpm run coverage
FC_SEED=20260714 FC_NUM_RUNS=1000 pnpm run test:property
pnpm run eval:offline
pnpm run eval:ablation
pnpm run test:e2e
```

Target release requires at least 92/100 overall and 22/25 on each of the four official judging criteria, using the lower score from two independent reviewers, plus every hard gate in [EVALS.md](./EVALS.md).

## Project documents

- [FABRICATION_SPEC.md](./FABRICATION_SPEC.md) — normative grammar, contracts, verifier, repair, ranking, and export rules.
- [PLANS.md](./PLANS.md) — pivot milestones and blockers.
- [DECISIONS.md](./DECISIONS.md) — accepted product and architecture decisions.
- [EVALS.md](./EVALS.md) — target release thresholds and clearly separated legacy evidence.
- [JUDGE_RUBRIC.md](./JUDGE_RUBRIC.md) — official criteria mapped to required proof.
- [RESEARCH.md](./RESEARCH.md) — primary sources and prior-art boundaries.
- [PRIVACY.md](./PRIVACY.md) — data flow, security limits, and current gaps.
- [BUILD_LOG.md](./BUILD_LOG.md) — chronological implementation evidence.
- [submission/VIDEO_SCRIPT.md](./submission/VIDEO_SCRIPT.md) — sub-three-minute recording plan.
- [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) — dependency and attribution inventory.

## Submission position

FoldForge fits Work & Productivity because it turns an underspecified design brief into a reviewable, deterministic fabrication handoff for product, operations, and prototyping teams. The official Build Week page defines that track as tools that make teams faster or more effective and requires a working project, repository, README, and public demo video under three minutes. See [RESEARCH.md](./RESEARCH.md) for the primary links and claim boundaries.

## License

MIT. See [LICENSE](./LICENSE).
