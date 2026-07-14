# FoldForge demo video script

Target runtime: **2:50**. The official limit is under three minutes. The spoken script is 289 words—about 2:13 at 130 words per minute—leaving roughly 37 seconds for interaction and pauses.

## Recording gate

This is a future-state recording plan, not evidence that the pivot works today. Do not record the final narration until the generalized compiler is deployed, the shown unseen prompt passes the target live suite, and all exported hashes match. As of 2026-07-14, live GPT-5.6 Sol is disabled and the hosted URL is the legacy stand prototype.

Use one continuous submission-build capture where practical. Keep the build SHA and “Live GPT-5.6 Sol” status visible. Do not substitute an offline fixture while narrating a live prompt.

## Script and shots

### 0:00–0:18 — problem and audience

**Screen:** FoldForge Describe page; brief product-team context, empty prompt.

**Narration:** “A small product team can describe a moving paper prototype in seconds, then lose hours translating the brief into geometry, checking motion, and preparing fabrication files. FoldForge turns that handoff into a bounded, verifiable compiler.”

### 0:18–0:38 — unseen prompt

**Screen:** Enter a previously sealed prompt: “Make a two-sheet desk organizer whose front tray slides out 70 millimetres and opens two mirrored side wings. Fit A4, no glue.” Select Forge.

**Narration:** “This is an unseen request in the Work & Productivity track. GPT-5.6 Sol interprets the constraints and proposes a strict fabrication program. It does not draw trusted coordinates or declare success.”

### 0:38–1:04 — technological implementation

**Screen:** Show `USER`, `AI`, `CODE` trace, typed program, then compiler/verifier phases.

**Narration:** “Deterministic code compiles panels, tabs, slots, a prismatic driver, and mirrored revolute outputs. The verifier checks schema, graph, sheet packing, closure, then 201 motion states plus adaptive samples for collision, clearance, travel, and branch continuity. Only fully valid candidates can appear.”

### 1:04–1:30 — real failure and bounded repair

**Screen:** Reveal a rejected candidate with a measured clearance witness; run repair; show patch diff and new report.

**Narration:** “Here one topology misses the requested moving clearance. Sol receives that structured measurement and proposes a typed local patch. Code rejects intent changes, recompiles, and reruns every check. Repair is capped at eight operations per cycle and five cycles; failure stays failure.”

### 1:30–1:54 — design quality

**Screen:** Compare verified candidates; select one; scrub motion while 3D, flat pattern, and program stay synchronized. Brief keyboard interaction.

**Narration:** “The candidates optimize fabrication efficiency, mechanical simplicity, and visual expression, with topology differences—not cosmetic variants. The selected 3D view, printable pattern, program, motion, and verifier evidence all share one canonical IR.”

### 1:54–2:16 — exact fabrication handoff

**Screen:** Export GLB, SVG, DXF, and `fabrication.json`; show manifest candidate hash matching the selected card.

**Narration:** “Export produces a GLB, print-scale SVG and DXF, canonical JSON, and grounded assembly instructions. Units, layers, calibration, and hashes are checked against the exact selected candidate. FoldForge proves geometry and motion—not material strength.”

### 2:16–2:37 — impact

**Screen:** Compact results card with sealed-suite validity/export numbers and completed user-study metric; show only real submission-build results.

**Narration template:** “Across [N] sealed briefs, [X percent] produced a verified candidate or correct refusal, with zero hard-invalid exports. In our target-role study, median time to first verified handoff fell from [baseline] to [FoldForge].”

Do not fill placeholders until the reports pass.

### 2:37–2:50 — Codex, idea, and close

**Screen:** Repository evidence: BUILD_LOG, eval report, Codex session ID, then return to moving result.

**Narration:** “Codex helped build and independently review the contracts, verifier, tests, security boundaries, UI, and exports. The idea is simple: let AI explore the design space, but make code prove what gets fabricated. That’s FoldForge.”

## Criterion coverage

- **Technological Implementation:** live Sol, typed program, deterministic compiler/verifier, measured repair, exact exports, Codex evidence.
- **Design:** coherent flow, synchronized views, visible provenance, keyboard interaction, clear failure state.
- **Potential Impact:** named team workflow, same-task time study, verified handoff outcome.
- **Quality of the Idea:** prompt-to-program-to-proof thesis, topology diversity, bounded grammar, honest exclusions.

## Capture checklist

- Final cut is shorter than 3:00 and public on YouTube with audible narration.
- Opening or description names Work & Productivity.
- Screen shows the submission build SHA and real live/offline state.
- Prompt is sealed/unseen and not a hidden template trigger.
- Every narrated number appears in a target report for the same build.
- Candidate and export hashes match on camera.
- No secret, access code, API key, personal information, private prompt, browser notification, or unrelated tab appears.
- Captions are corrected manually; cursor and zoom keep evidence readable at 1080p.
- Repository, README, and `/feedback` session ID are ready for the submission form.
