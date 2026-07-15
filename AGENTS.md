# FoldForge engineering guide

## Product objective

Build a prompt-to-fabrication compiler for bounded flat-sheet objects. A user describes an object or mechanism; FoldForge produces distinct candidate programs, compiles the selected program into deterministic geometry and kinematics, verifies every hard constraint, previews the result, and exports a source-equivalent fabrication pack.

The product competes in **Work & Productivity**. It must demonstrate that GPT-5.6 Sol contributes real design reasoning while deterministic software owns validity, motion, ranking, and files.

## Supported fabrication grammar

The accepted grammar contains panels, cuts, folds, tabs, slots, revolute hinges, and prismatic sliders. A request may be attempted when it can be represented within these limits:

- one to four flat sheets;
- at most 24 panels, 64 vertices per panel, and 24 joints or connectors;
- simple polygons expressed in millimetres;
- an acyclic rigid-body graph;
- zero or one motion driver and at most six driven outputs;
- fold, revolute, or prismatic joints;
- direct-ratio, mirrored-pair, pull-tab, or cam-slot couplings;
- static, open/close, flap, rotate, slide, or expand/collapse behaviour.

Reject honestly when a request requires arbitrary smooth solids, deformable surfaces, electronics, motors, force-dependent behaviour, or a general closed-loop mechanism. Do not route prompts to hidden templates, keywords, canned winners, or fabricated examples.

## Domain boundaries

- `src/core` owns units, schemas, canonical serialization, compilation, geometry, kinematics, verification, scoring, repair application, and exporters. It stays pure and independent of React, browser APIs, and OpenAI.
- `src/server/fabrication-ai` owns OpenAI requests, prompts, response validation, tool orchestration, token limits, and model-specific behavior. Shared client construction remains under `src/server/ai`. No OpenAI import may enter the core or client bundle.
- API routes authenticate, enforce origin/body/quota/concurrency controls, call typed services, and translate typed results to HTTP responses.
- The UI renders typed application state. It never invents a successful result, mutates canonical geometry, or exports a different candidate from the one selected.

GPT-5.6 Sol may author a normalized intent, bounded fabrication programs, semantic critiques, causal diagnoses, and typed patches. Every response is validated before use. The model may not declare a design valid, edit compiled coordinates or export bytes, suppress a verifier failure, override deterministic ranking, or expose chain-of-thought.

## Canonical contracts

Keep versioned Zod and TypeScript definitions for:

- `FabricationIntentV1`
- `FabricationProgramV1`
- `FabricationIRV1`
- `VerificationReportV2`
- `ProgramPatchV1`
- `CandidateV2`

All externally stored or transferred data includes a version. Expected failures use exhaustive typed results. Exceptions are reserved for violated internal invariants. Hashes and repeatability use one canonical serializer.

## Verification order

Verification is deterministic and fail-fast:

1. schema, version, units, finite values, and grammar limits;
2. identifiers, references, connectivity, and acyclic topology;
3. nondegenerate simple panels and minimum features;
4. shared edges, joints, connectors, and clearances;
5. sheet packing and printable margins;
6. rigid transforms, closure residuals, and requested dimensions;
7. one canonical state for static objects, or 201 motion states plus bounded adaptive samples near events;
8. collision, clearance, slider travel, branch continuity, and dead states;
9. explicit semantic constraints;
10. export/source equivalence;
11. scoring only after every hard check passes.

Hard kinematic limits are a closure residual of at most 0.1 mm, no collision, at least 0.5 mm requested moving clearance, angle error at most 2 degrees, travel error at most 1 mm, no branch jump, and no unreachable or dead driver state. A hard-invalid candidate can never be recommended or exported as validated.

## Candidate and repair rules

Generate at most three visible candidates, aimed at fabrication efficiency, mechanical simplicity, and visual expression. At least two must be topology-distinct when the intent admits more than one topology. Rank only verified candidates.

The repair loop permits five cycles and at most three typed patch operations per cycle. Reject unknown paths, unrelated changes, invalid references, out-of-range values, repeated canonical tool inputs, and patches that change the user intent. Recompile and rerun every hard check after each patch. Exhaustion returns a clear infeasible result.

## Export contract

A successful fabrication pack contains:

- interactive articulated 3D preview and GLB;
- print-scale SVG and DXF patterns;
- canonical `fabrication.json` containing the selected intent, program, IR, report, score, provenance, and hashes;
- concise assembly and operation instructions;
- FOLD only when the design is genuinely representable without losing source semantics.

Export the exact selected candidate. SVG and DXF units, calibration geometry, layer semantics, and hashes are tested. GLB surfaces, fabrication paths, connectors, hierarchy, and motion are derived from and source-checked against the same selected IR.

## Interface contract

Use one concise three-stage flow: **Describe → Forge → Export**.

- Describe accepts a natural-language prompt, useful starter examples, and optional advanced constraints.
- Forge synchronizes 3D, pattern, and program views; exposes rotate, zoom, explode, and motion scrub; displays measured verifier failures and bounded repair ancestry.
- Export provides the validated fabrication pack, limitations, exact scale checks, and provenance.

Trace labels are `USER`, `AI`, and `CODE`. Show concise conclusions and report fields, never private reasoning. Offline mode must say that live AI is unavailable and may offer deterministic examples; it must never pretend that an arbitrary prompt was interpreted.

The interface must be understandable in ten seconds, responsive at 390, 768, 1280, and 1440 px, keyboard accessible, screen-reader coherent, reduced-motion aware, and free of filler copy, layout jumps, horizontal scrolling, and console errors. Decorative sound and effects are out of scope until core quality gates pass.

## Security and privacy

`OPENAI_API_KEY`, `DEMO_ACCESS_CODE`, and `ACCESS_COOKIE_SECRET` are server-only. Store them only in ignored environment files or the hosting secret store. Never print, commit, expose through `NEXT_PUBLIC_`, or persist them in browser storage.

Use a short-lived signed `__Host-` HttpOnly access cookie and derive the OpenAI `safety_identifier` from its random server-issued subject. Enforce same-origin or Fetch Metadata checks, route-specific body caps, per-session request and token quotas, bounded concurrency, a live-model kill switch, and metadata-only production logs. Public deterministic compile/export routes also require a verifier work budget and best-effort request/concurrency controls. Health responses include the deployed build SHA without secrets.

## Evaluation gates

Maintain sealed offline, live, adversarial, browser, accessibility, security, export-equivalence, repeatability, performance, and ablation suites. The release gate is the lowest score assigned by independent reviewers under the four official criteria: technical implementation, design, impact, and idea.

Release requires at least 92/100 overall, no category below 22/25, no hard-invalid result labelled valid, no serious unresolved security/accessibility/licensing issue, and all documented quantitative thresholds in `EVALS.md`. Evidence must distinguish passing results from blocked live-Sol results.

## Engineering rules

- Strict TypeScript with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; no production `any`.
- Numeric identifiers include units where ambiguity is possible.
- Small cohesive modules, exhaustive discriminated unions, and no duplicated conversion, scoring, or validation logic.
- Comments explain geometry, kinematics, constraints, and non-obvious trade-offs rather than syntax.
- No dead code, commented-out implementation, unexplained constants, unsafe type assertions, or test-only production branches.
- Prefer permissive dependencies and original assets; update documentation in the same milestone as behaviour.
- Run the narrow test first, then coverage and the complete check before a milestone commit.
- Inspect `git diff --check`, status, and the staged diff. Never commit secrets or unrelated files.

## Standard commands

- `pnpm run dev` — local application
- `pnpm run check` — lint, types, formatting, tests, and production build
- `pnpm run coverage` — coverage gates
- `FC_SEED=20260714 FC_NUM_RUNS=1000 pnpm run test:property` — deterministic properties
- `pnpm run eval:offline` — sealed offline suite
- `pnpm run eval:live` — sealed Sol suite, only after live access is enabled
- `pnpm run eval:ablation` — full-feedback versus reduced-feedback comparison
- `pnpm run test:e2e` — rendered application flows

## Git and delivery

Work on a task-specific `codex/` branch. Commit small passing milestones and push each one. Never force-push. Keep the PR in draft until every release gate passes; merge to `main` only after explicit user authorization and a final hosted-build check. Production may be deployed with live AI disabled; the only final enablement action should be turning on Sol after credentials and billing permit it.

## Definition of done

A previously unseen supported prompt is strictly compiled by GPT-5.6 Sol into distinct programs; deterministic code compiles and verifies articulated geometry; a real measured failure can be diagnosed and repaired with a bounded patch; the selected verified candidate is previewed and exported as source-equivalent SVG, DXF, GLB, and JSON; unsupported requests are refused honestly; every automated, browser, security, accessibility, licensing, provenance, and harsh judging gate passes; production and submission evidence are current.

Geometry verification demonstrates geometric and kinematic correctness within the documented model. FoldForge does not simulate material deformation, force, fatigue, durability, or manufacturing tolerances beyond explicit geometric clearances, and it makes no claim that it does.

## Subagents

Use bounded, non-overlapping reviews and implementation lanes for core geometry, AI contracts, frontend/accessibility, security/compliance, exports, evaluation, and skeptical judging. The primary agent integrates interfaces and serious findings. No subagent may silently narrow the product back to a stand, add a material-testing completion gate, or weaken a hard verifier rule.
