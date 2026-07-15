# FoldForge skeptical scorecard

Snapshot: 2026-07-14, generalized compiler working tree, live GPT-5.6 Sol disabled.

This is not a prediction of the judges. It applies the four criteria currently published on the [OpenAI Build Week page](https://openai.devpost.com/) and awards points only for reproducible evidence.

## Current score: 83/100

| Criterion                    | Score | Why it earns points                                                                 | Why it loses points                                                         |
| ---------------------------- | ----: | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Technological Implementation | 20/25 | Non-trivial typed compiler, ordered verifier, measured repair, exact exports, tests | No live unseen GPT-5.6 Sol run; model quality and repair causality unproven |
| Design                       | 22/25 | Concise coherent studio; synchronized evidence; responsive/a11y/browser gates pass  | Result journey is browser-tested with mocks, not yet visually proven live   |
| Potential Impact             | 18/25 | Specific team handoff problem; inspectable outputs replace prose                    | No live task or external adoption evidence yet; impact is still inferred    |
| Quality of the Idea          | 23/25 | Distinct prompt-to-program-to-proof thesis; bounded variety; honest exclusions      | V1 object grammar is intentionally narrow and must be shown memorably       |

An 83 is strong engineering but not winning-ready. The missing live model evidence matters twice: it directly weakens Technological Implementation and makes the product/impact story less credible.

## Conditional winning case: 94/100

This score is achievable only if the exact submission build passes an unseen live prompt and the video makes the proof legible.

| Criterion                    | Target | Required evidence                                                                 |
| ---------------------------- | -----: | --------------------------------------------------------------------------------- |
| Technological Implementation |  25/25 | Live strict intent/program, real failed candidate, grounded Sol patch, full pass  |
| Design                       |  24/25 | Smooth live flow, readable comparison/motion/repair, exact downloads              |
| Potential Impact             |  21/25 | Demonstrate removed handoff steps and a usable artifact; avoid unsupported claims |
| Quality of the Idea          |  24/25 | Show topology diversity and explain why bounded proof is the novel idea           |

Total: **94/100**. This is competitive, not guaranteed.

## Harsh failure scenarios

- **65 or lower:** Sol returns invalid programs repeatedly, the demo uses a fixture, or repair is narrated without a measured failure.
- **70–78:** live generation works once but candidates look like cosmetic variants or outputs are not visibly tied to selection.
- **79–86:** excellent compiler, weak product story; judges understand the tests but not why a real team needs it.
- **87–91:** polished live demo, but novelty or impact is explained generically.
- **92+:** the live path works, the proof is visible, the handoff is useful, and the idea is explained in one sentence.

## Submission test

Before recording, answer yes to all five:

1. Did an unseen prompt go through live GPT-5.6 Sol?
2. Did code reject or repair a real measured failure?
3. Are at least two candidate topologies visibly different?
4. Does every downloaded artifact match the selected hash?
5. Can a judge explain the audience, problem, and prompt-to-proof idea after one viewing?

If any answer is no, do not call the build winning-ready.
