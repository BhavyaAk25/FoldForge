# FoldForge harsh judge rubric

This internal rubric maps reproducible FoldForge evidence to the four equally weighted OpenAI Build Week criteria on the [official challenge page](https://openai.devpost.com/) and in the [official rules](https://openai.devpost.com/rules). It is intentionally stricter than a normal project review.

## Viability gate

The project must run, use Codex and GPT-5.6, fit **Work & Productivity**, include the required repository and README, and have a public narrated demo under three minutes. An offline fixture cannot satisfy the GPT-5.6 requirement.

Current state: deterministic and offline evidence is strong, one exact live Sol path has completed, and the public workflow now has synthesis-first parametric fallbacks for three documented object classes. The screenshots in `docs/images/` show the product, verifier, exports, LibreCAD DXF handoff, and SVG pattern. Generic arbitrary-spec realization and broad live reliability remain unproven, and branch coverage is currently 89.84% against a 90% target.

## Scoring method

Two skeptical reviewers score independently and cite a screen, report, test, or source location for every point. The release score uses the lower score per criterion, not the average.

Release threshold:

- 92/100 overall;
- at least 22/25 in every criterion; and
- every hard gate in [EVALS.md](./EVALS.md).

## 1. Technological Implementation — 25 points

| Evidence                                                                                                                         | Points |
| -------------------------------------------------------------------------------------------------------------------------------- | -----: |
| An unseen brief becomes strict intent and a topology-free design spec through live GPT-5.6 Sol, with generation source disclosed |    0–5 |
| Pure deterministic compiler produces versioned panels, joints, connectors, transforms, motion, and provenance                    |    0–5 |
| Ordered verifier proves geometry, packing, kinematics, collision, semantics, and independent mutation rejection                  |    0–5 |
| Bounded Sol diagnosis repairs a real measured failure and code reruns every check                                                |    0–4 |
| GLB/SVG/DXF/JSON and profile-scoped FOLD are source-equivalent to the selected IR                                                |    0–3 |
| Codex work, architecture, tests, security, limitations, and reproduction are clear in the repository                             |    0–3 |

Automatic deductions:

- −5 if live Sol is replaced by mocked model output in the demo;
- −5 if model JSON is trusted as geometry or validity;
- −3 if a parametric result is described as model-authored topology; and
- score is capped at 10 if any hard-invalid candidate is presented as valid.

## 2. Design — 25 points

| Evidence                                                                                         | Points |
| ------------------------------------------------------------------------------------------------ | -----: |
| Describe → Forge → Export is obvious, concise, recoverable, and free of filler                   |    0–5 |
| The single returned design clearly identifies synthesis/template provenance and limitations      |    0–4 |
| 3D, pattern, program, motion, verifier, provenance, and exports stay synchronized                |    0–5 |
| Export controls are legible, exact, calibrated, and paired with grounded build notes             |    0–4 |
| Keyboard, reduced motion, automated accessibility, and four responsive widths pass               |    0–4 |
| `USER` / `AI` / `CODE` provenance and live/offline state are clear without overwhelming the user |    0–3 |

Automatic deductions:

- −3 for visible filler, repeated status copy, or explanation before the primary task;
- −4 if the user cannot tell why a candidate failed or changed; and
- score is capped at 12 if downloads can refer to a different candidate than the selected preview.

## 3. Potential Impact — 25 points

| Evidence                                                                                             | Points |
| ---------------------------------------------------------------------------------------------------- | -----: |
| Names a specific audience: product, operations, packaging, exhibit, and rapid-prototyping teams      |    0–4 |
| Shows the real handoff problem between a brief, geometry, checking, iteration, and fabrication files |    0–5 |
| Demonstrates the complete reduction from prompt to verified, inspectable handoff in one session      |    0–5 |
| Produces files and measurements a teammate can inspect without trusting model prose                  |    0–5 |
| Defines credible privacy, support, refusal, and geometry-only boundaries                             |    0–3 |
| Uses reproducible outcome evidence instead of projected market or performance claims                 |    0–3 |

Optional user timing studies can strengthen the impact story, but they are not invented as an official requirement. The demo must still show the removed workflow steps plainly.

## 4. Quality of the Idea — 25 points

| Evidence                                                                                                            | Points |
| ------------------------------------------------------------------------------------------------------------------- | -----: |
| The prompt-to-typed-program-to-proof framing is clear and differentiated from image generation and generic CAD chat |    0–5 |
| The grammar is broad enough for multiple objects and mechanisms but narrow enough for deterministic proof           |    0–5 |
| Generic synthesis, disclosed fallbacks, and verifier-grounded repair expose genuine engineering trade-offs          |    0–4 |
| Research and prior-art boundaries show technical understanding without borrowed novelty claims                      |    0–4 |
| Honest exclusions make the product thesis sharper                                                                   |    0–4 |
| The live demo is memorable, coherent, and ends on a usable artifact rather than a promise                           |    0–3 |

Automatic deductions:

- −5 if the product is described as “make anything” without its bounded grammar;
- −3 if the demo shows only one static topology; and
- −3 for any unsupported physics or material-performance claim.

## Required evidence packet

- submission build SHA and deployed URL;
- live unseen-prompt trace with `USER`, `AI`, and `CODE` contributions;
- offline, live, adversarial, repair, ablation, browser, accessibility, repeatability, and export-equivalence results;
- selected candidate hash plus GLB, SVG, DXF, JSON, and FOLD status;
- two locked reviewer scorecards;
- public narrated video under three minutes using [submission/VIDEO_SCRIPT.md](./submission/VIDEO_SCRIPT.md); and
- README, build log, limitations, licences, and Codex session evidence.

## Submission blockers

Do not release a final claim if:

- Sol is off but narration says the prompt was interpreted live;
- a parametric fallback is hidden or described as model-authored topology;
- a hard-invalid candidate is shown, ranked, finalized, or exported;
- export bytes differ from the exact selected IR;
- a secret or prompt/response body reaches client storage or production logs;
- a serious accessibility, security, privacy, or licensing finding remains; or
- the hosted build differs from the build shown in the evidence.
