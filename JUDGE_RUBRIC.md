# FoldForge judge rubric

This internal rubric maps FoldForge evidence to the four equally weighted OpenAI Build Week criteria published on the [official challenge page](https://openai.devpost.com/) and in the [official rules](https://openai.devpost.com/rules). It does not replace the official rules.

## Stage 1 — viability gate

Before scoring, the submission must be a working project that uses Codex and GPT-5.6, fits the selected **Work & Productivity** track, and includes the required project description, repository access, README, public YouTube demo under three minutes with audio covering Codex and GPT-5.6, and the requested Codex `/feedback` session ID.

Current status: **not ready**. The generalized compiler is not implemented, live GPT-5.6 Sol is disabled, and the hosted URL is still the legacy stand prototype. A documentation plan cannot pass this gate.

## Scoring method

Two reviewers score independently and cite a screen, test, report, or source location for every awarded point. They lock scores before comparison. The release score uses the **lower** score for each criterion and overall.

Release requires:

- at least 92/100 overall;
- at least 22/25 in every criterion; and
- every hard gate in [EVALS.md](./EVALS.md).

The official rules use Technological Implementation as the first tie-break criterion, followed by the remaining criteria in listed order.

## 1. Technological Implementation — 25 points

Official question: how thoroughly and skillfully does the project use Codex, and does the code show genuine effort and a working, non-trivial implementation?

| Evidence                                                                                                                     | Points |
| ---------------------------------------------------------------------------------------------------------------------------- | -----: |
| A live unseen supported brief becomes a strict `FabricationProgramV1`, with Sol’s role visible and no hidden template match  |    0–5 |
| Pure deterministic compiler produces versioned IR, transforms, panels, joints, connectors, and motion                        |    0–5 |
| Ordered verifier demonstrates closure, collision, clearance, reachability, semantics, and independent mutation rejection     |    0–5 |
| Bounded structured repair fixes a real measured failure and reruns every check                                               |    0–4 |
| GLB/SVG/DXF/JSON are hash- and source-equivalent to the exact selected IR                                                    |    0–3 |
| Repository explains where Codex accelerated work, key decisions, tests, security, and limitations with reproducible evidence |    0–3 |

Full credit requires a working live path plus deterministic authority. Strict model JSON alone is not a compiler, and an offline fixture cannot be presented as live interpretation.

## 2. Design — 25 points

Official question: does the project deliver a working, runnable, complete, coherent product experience rather than only a technical proof of concept?

| Evidence                                                                                           | Points |
| -------------------------------------------------------------------------------------------------- | -----: |
| Describe → Forge → Export has clear stage transitions, progress, errors, refusal, and recovery     |    0–5 |
| Up to three candidates are understandable and meaningfully distinct, with no invalid option shown  |    0–4 |
| 3D, pattern, program, motion, verifier evidence, and selection remain synchronized                 |    0–5 |
| Export pack is legible, print-scale, calibrated, layered, and accompanied by grounded instructions |    0–4 |
| Keyboard, screen-reader, reduced-motion, and responsive checks pass at all four required widths    |    0–4 |
| `USER` / `AI` / `CODE` provenance and offline/live state are clear without clutter                 |    0–3 |

Full credit requires a coherent software handoff whose evidence and files agree.

## 3. Potential Impact — 25 points

Official question: does the project make a credible, specific case for a real problem and audience, and does the demonstrated solution address it?

| Evidence                                                                                                                            | Points |
| ----------------------------------------------------------------------------------------------------------------------------------- | -----: |
| Names a specific audience: product, operations, packaging, exhibit, and fabrication teams prototyping bounded flat-sheet mechanisms |    0–4 |
| Shows the current pain: translating briefs across design, geometry checking, iteration, and fabrication handoff                     |    0–5 |
| Demonstrates an end-to-end reduction in handoff steps with a timed baseline and FoldForge task on the same brief                    |    0–5 |
| Produces actionable files/evidence a teammate can inspect without trusting model prose                                              |    0–5 |
| Defines credible adoption boundaries, privacy, unsupported requests, and no material-performance claim                              |    0–3 |
| Reports outcome metrics on sealed tasks rather than projected market claims                                                         |    0–3 |

The minimum impact study before submission is five representative briefs completed by at least three target-role reviewers. Median time-to-first-verified-export must be at least 50% lower than the documented manual baseline, with zero hard-invalid export. Until run, impact claims remain hypotheses.

## 4. Quality of the Idea — 25 points

Official question: is the project creative, and does the team show genuine understanding of the problem space?

| Evidence                                                                                                            | Points |
| ------------------------------------------------------------------------------------------------------------------- | -----: |
| The prompt-to-typed-program-to-proof framing is clear and differentiated from text-to-image or generic CAD copilots |    0–5 |
| The bounded grammar is broad enough for useful variety yet narrow enough for deterministic proof                    |    0–5 |
| Candidate topology diversity and verifier-grounded repair reveal meaningful design exploration                      |    0–4 |
| Research and prior-art boundaries show understanding without claiming borrowed work as novel                        |    0–4 |
| Honest exclusions—physics, closed loops, electronics, hidden templates—strengthen rather than obscure the thesis    |    0–4 |
| Demo presents a memorable mechanism and a credible next step without overclaiming current results                   |    0–3 |

## Required evidence packet

- Submission build SHA and deployed URL.
- Target schema/compiler/verifier/exporter versions and canonical candidate hash.
- Sealed offline, live, adversarial, browser, accessibility, security, export-equivalence, repeatability, performance, and ablation reports.
- A saved unseen-prompt trace showing `USER`, `AI`, and `CODE` contributions.
- Selected candidate GLB/SVG/DXF/JSON and manifest hashes.
- Two locked reviewer scorecards using this rubric.
- Public video under three minutes following [submission/VIDEO_SCRIPT.md](./submission/VIDEO_SCRIPT.md).
- README and BUILD_LOG entries identifying Codex work, key decisions, limitations, and the live-model status.

## Automatic score blockers

Do not release or submit as complete if any of these is true:

- the demo prompt maps to a hidden/canned topology without going through the disclosed program;
- live Sol is disabled but narration says the prompt was interpreted live;
- a hard-invalid candidate is shown, ranked, or exported;
- any export differs from the selected verified IR;
- the hosted URL points to the legacy stand while the description claims the generalized compiler;
- a secret or prompt/response body reaches the client bundle or production logs;
- a serious accessibility, security, privacy, or licensing issue remains unresolved; or
- a photographed artifact is used as a substitute for the required software or live-model evidence.
