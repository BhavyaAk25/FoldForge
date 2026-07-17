# FoldForge skeptical scorecard

Snapshot: 2026-07-17, repaired production build, API credit active, GPT-5.6 Sol paid evaluation not yet run.

This is not a prediction of the judges. It applies the four equally weighted criteria on the [OpenAI Build Week page](https://openai.devpost.com/) and awards points only for reproducible evidence. The official requirements also ask the README and video to distinguish Codex acceleration, human decisions, and GPT-5.6 use.

## Current evidence score: 84/100

| Criterion                    | Score | Evidence earned                                                                                                                         | Evidence missing                                                                        |
| ---------------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Technological Implementation | 20/25 | Non-trivial typed compiler, ordered verifier, bounded repair, source-bound exports, adversarial tests, clear Codex workflow             | No unseen live GPT-5.6 run; intent quality and model repair causality remain unproven   |
| Design                       | 23/25 | Concise flow; real 3D motion/orbit; separate pattern controls; conditional exports; responsive, keyboard, reduced-motion, and Axe gates | Full three-candidate journey is browser-tested with mocks rather than demonstrated live |
| Potential Impact             | 18/25 | Specific flat-sheet handoff problem; inspectable geometry and standard files replace model prose                                        | No external user, fabrication-team trial, time comparison, or live task evidence        |
| Quality of the Idea          | 23/25 | Clear prompt → typed program → proof thesis; bounded breadth; topology-aware exploration; honest refusal                                | The demo must prove that breadth memorably rather than relying on prepared examples     |

The repaired previews, reproducible consumer checks, and two prepared examples improve the evidence, but **84 is still not winning-ready**. The live-model gap weakens both technical implementation and the credibility of the complete product story.

There is a harsher eligibility interpretation: if the submission video never shows GPT-5.6 operating, the project may fail the working-project requirement regardless of offline engineering. Therefore the current build should not be submitted as complete.

## Conditional release score: 92/100

This is achievable only if the exact submission build passes the full sealed gate and the video makes the proof understandable. The release rule is both **92/100 overall** and **at least 22/25 in every criterion**; a high total cannot compensate for a weak category.

| Criterion                    | Target | Required evidence                                                                                                                                             |
| ---------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Technological Implementation |  24/25 | Five-case usage-backed Sol report with ≥4 complete passes, strict intent/programs, a measured failure, grounded patch, deterministic recheck, exact artifacts |
| Design                       |  23/25 | Smooth deployed journey, visibly different candidates, readable repair, synchronized preview/pattern/downloads, no broken or misleading control               |
| Potential Impact             |  22/25 | Show one continuous brief-to-handoff workflow and open the exact live artifact in a real downstream tool; make no adoption or time-saving claim               |
| Quality of the Idea          |  23/25 | Show multiple mechanism/topology types and explain why a bounded typed-program-to-proof compiler is different from generic text-to-CAD                        |

Total: **92/100**. Competitive is not guaranteed. A real target-user or fabrication-team trial would strengthen Potential Impact further, but the minimum 22/25 requires at least a clearly demonstrated external-tool handoff using the exact live-selected files.

## Paid evidence gate

The user authorized no more than **$4.00** of API spend. FoldForge must enforce `LIVE_EVAL_BUDGET_USD=3.70`, leaving a $0.30 reserve. The ledger must be cumulative across the paid evaluation, record provider usage and response IDs without prompt/response bodies, and stop before a request whose conservative maximum could cross the cap. Missing usage or an uncertain provider failure seals the run.

Evidence is classified strictly:

- A **live smoke** proves only the paid cases and operations it actually completed.
- The **sealed release suite** attempts all five cases, completes at least four full prompt → programs → verify/repair → rank → narrative → export journeys, and passes the exact-artifact consumer checks.
- A budget-truncated run is neither a 4/5 pass nor evidence that arbitrary supported prompts work reliably.

## Severe deductions

- **−5 or disqualification risk:** a prepared fixture is narrated as an unseen GPT-5.6 result.
- **−5 or eligibility risk:** a budgeted smoke is narrated as the passing five-case sealed suite.
- **−5:** candidate coordinates or validity are trusted directly from the model.
- **−4:** the demo does not show a real measured failure and deterministic recheck.
- **−4:** downloaded artifacts cannot be tied to the selected candidate.
- **−3:** only prepared-fixture consumer checks are presented as proof for a live-selected artifact.
- **−3:** candidates are cosmetic variants rather than different programs/topologies.
- **−3:** the pitch says “make anything” despite the bounded grammar.
- **−3:** the project claims strength, force, durability, or fabrication performance it does not measure.
- **Score cap 10/25 technical:** any hard-invalid candidate is presented as valid.

## Score bands

- **65 or lower:** GPT-5.6 repeatedly fails, a saved example is disguised as live, or exports do not work.
- **70–78:** one live run works, but candidates look canned or repair is only narration.
- **79–86:** serious engineering, incomplete live proof or weak audience/impact demonstration.
- **87–91:** polished live product, but novelty or impact remains generic.
- **92+:** live use is real, proof is visible, artifacts are usable, and the audience/problem are clear in one viewing.

## Questions before recording

1. Did the full five-case Sol report run under the persistent $3.70 ledger, with at least four complete passes?
2. Did supported, unsupported, and prompt-injection cases stay inside their strict contracts?
3. Did code reject or repair a real measured failure, and does the trace show the exact failure field and patch path?
4. Are at least two candidate topologies visibly and structurally different?
5. Does every downloaded artifact match the selected IR hash and compatibility status?
6. Did independent consumers check the exact live SVG, DXF, GLB, JSON, and conditional FOLD bytes?
7. Does the deployed build SHA match the repository and recorded evidence?
8. Can a skeptical judge explain the audience, problem, removed handoffs, and prompt-to-proof idea after one viewing?

If any answer is no, do not call the build winning-ready.

## Claims the evidence does not support

Even after a passing Sol suite, FoldForge must not claim universal “make anything” generation, certified fabrication, load-bearing performance, material strength, friction, fatigue, durability, manufacturing tolerance beyond explicit geometric clearance, compatibility with every downstream machine, measured adoption, or quantified time savings. FOLD remains conditional. A prepared example remains prepared, and parser validation remains narrower than a user successfully opening the exact live file in an external application.
