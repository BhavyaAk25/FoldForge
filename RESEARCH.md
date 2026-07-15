# FoldForge research and source record

This record captures the primary sources that shape the product contract, submission plan, standards support, and prior-art boundaries. It separates sourced facts from FoldForge design choices. Last checked: 2026-07-14.

## OpenAI Build Week

Primary sources:

- [OpenAI Build Week challenge page](https://openai.devpost.com/)
- [OpenAI Build Week official rules](https://openai.devpost.com/rules)
- [Official GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6)

Verified implications:

- The submission deadline is July 21, 2026 at 5:00 PM Pacific.
- The selected track is **Work & Productivity**, described as tools that make teams faster or more effective, including workflow automation and back-office work.
- Required submission materials include a working project, category, description, public YouTube demo under three minutes with audio covering Codex and GPT-5.6, repository access with a usable README, and a Codex `/feedback` session ID.
- Stage 1 is a pass/fail viability/compliance review. Stage 2 uses four equally weighted criteria: Technological Implementation, Design, Potential Impact, and Quality of the Idea.
- Technological Implementation is the first official tie-break criterion.

FoldForge decision: position the compiler as a fabrication-team handoff tool and map every demo beat to those four criteria. Do not submit the legacy stand under a generalized description.

## OpenAI API architecture

Primary sources:

- [Responses API — create a response](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Safety best practices](https://developers.openai.com/api/docs/guides/safety-best-practices)
- [API data controls](https://developers.openai.com/api/docs/guides/your-data)

Verified implications:

- The Responses API exposes `store`, bounded output controls, structured text formats, and `safety_identifier`.
- Strict JSON Schema output reduces format variance but does not make model-proposed semantics, identifiers, dimensions, or geometry trusted. FoldForge validates and recompiles everything.
- OpenAI recommends a stable privacy-preserving user or session safety identifier; a random server-issued session subject avoids sending direct identity.
- `store:false` prevents later response retrieval, but provider abuse-monitoring retention may still apply. API inputs/outputs are not used for training by default unless the organization opts in. [PRIVACY.md](./PRIVACY.md) carries the product disclosure.
- Official GPT-5.6 guidance supports the model family used by the challenge. The repository’s configured `gpt-5.6-sol` live path remains disabled and unevaluated, so model-specific performance is not claimed.

## File and interchange standards

Primary specifications:

- [W3C SVG 2](https://www.w3.org/TR/SVG2/) — vector geometry and physical-length semantics.
- [Autodesk AutoCAD Developer Help — DXF Reference](https://help.autodesk.com/view/OARX/2025/ENU/) — DXF group-code, file-section, and entity conventions.
- [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) — GLB scene, hierarchy, transform, and animation container.
- [FOLD specification](https://github.com/edemaine/fold/blob/main/doc/spec.md) — origami/fold graph vocabulary and interchange context.

FoldForge implications:

- SVG and DXF are fabrication views in millimetres with explicit cut/fold/score/annotation/calibration layers.
- GLB is an interactive/portable view of the same selected IR, not an independently authored mesh.
- `fabrication.json` is the canonical lossless artifact. FOLD remains optional because the target grammar includes sliders, connectors, and semantics that FOLD may not represent without loss.
- Format conformance is necessary but not sufficient: independent source-equivalence checks compare each file with the selected IR and manifest hash.

## Geometry and mechanism prior art

Primary papers/projects used for problem-space understanding:

- [OrigamiSimulator](https://erikdemaine.org/papers/OrigamiSimulator_Origami7/) — interactive simulation of origami crease patterns.
- [Origamizer](https://erikdemaine.org/papers/Origamizer_SoCG2017/) — algorithmic folding of polyhedral surfaces.
- [TreeMaker](https://langorigami.com/article/treemaker/) — computational origami design around a tree method.
- [Rigid origami design optimization](https://www.ijcai.org/proceedings/2023/645) — optimization context for rigid-foldable structures.
- [COrigami](https://arxiv.org/abs/2606.26299) — contemporary computational-origami context.
- [Learn2Fold](https://arxiv.org/abs/2603.29585) — learned folding/planning context.

Boundary and differentiation:

- FoldForge is not a rigid-origami theorem prover, general mesh-to-crease-pattern solver, robotics planner, or replacement for those systems.
- Its thesis is a typed, bounded language spanning panels, cuts, folds, tabs, slots, revolute and prismatic motion, followed by deterministic compile/verify/repair/export and explicit provenance.
- No code, assets, benchmark results, or design files from the cited work are incorporated. Citations provide vocabulary and comparison context only.
- Novelty is not claimed for individual geometry algorithms, file formats, or kinematic concepts. The submission claim is the integrated prompt-to-program-to-proof workflow and its product execution.

## Problem and impact hypotheses

These are hypotheses until the target user study in [JUDGE_RUBRIC.md](./JUDGE_RUBRIC.md) is run:

1. Small product/fabrication teams lose time translating a brief into constrained geometry, checking motion, and preparing handoff files.
2. A model is useful for interpreting intent and proposing topology, but trust improves when deterministic code owns geometry and validity.
3. Synchronized evidence and exact exports reduce review loops more than a conversational design description alone.
4. A bounded language with honest refusal is more useful than an unrestricted generator that produces plausible but unverified artifacts.

Required validation: at least three target-role reviewers complete five representative briefs using their current workflow and FoldForge. Record time-to-first-verified-export, correction loops, invalid exports, task completion, and qualitative trust. Do not convert this hypothesis into an impact result until the study is run.

## Open questions

- Which 20 prompts can independently establish that at least two topology-distinct solutions are feasible?
- What deterministic adaptive-sampling policy catches near-contact events without unbounded work?
- Which minimum feature/material profiles are safe to describe as geometric fabrication defaults without implying strength?
- Which cam-slot subset remains expressive while preserving analytic reachability and branch checks?
- How should GLB animation encode driver semantics so it remains equivalent to the canonical IR?
- Can the live Sol suite meet the release thresholds within the approved token and cost budget?

These questions are implementation/evaluation work, not reasons to broaden the grammar or weaken the verifier.
