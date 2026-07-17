# FoldForge demo video script

Target: **2:35–2:50**. Keep the capture continuous, the cursor slow, and the evidence readable. Do not show secrets. Record only after the live Sol suite passes.

## Prompt

Use an unseen supported brief, not an example button:

> Make a one-sheet fold-flat desk nameplate, 180 millimetres wide, 70 millimetres high, and 55 millimetres deep. Opening the base should rotate a 150 by 60 millimetre display panel to 65 degrees. Use 0.45 millimetre cardstock, allow cuts, and use no glue. Show three buildable designs.

## Script

### 0:00–0:15 — problem

**Screen:** Empty Describe view.

**Say:** “Turning a product brief into moving geometry, checks, and fabrication files takes multiple tools and repeated handoffs. FoldForge compiles that work into one verified flow.”

### 0:15–0:35 — live intent

**Screen:** Type the unseen prompt. Show `Sol ready`. Select **Create 3 designs**.

**Say:** “GPT-5.6 Sol interprets this unseen request and proposes strict fabrication programs. It explores the design space, but it cannot declare a design valid or write trusted export geometry.”

### 0:35–1:00 — deterministic proof

**Screen:** Show the `USER`, `AI`, `CODE` trace, then the verifier summary.

**Say:** “Code compiles panels, joints, tabs, slots, and motion into one canonical IR. The verifier checks topology, manufacturable cut paths, packing, rigid transforms, and 201 motion states for collision, clearance, travel, and continuity. Failed candidates never reach ranking or export.”

### 1:00–1:22 — measured repair

**Screen:** Open the live-readiness report's explicitly labelled `deliberate_evaluation_probe`. Show the failure ID, measured limit violation, Sol response ID, typed patch path, before/after hashes, and passing revalidation. Do not present this evaluation-only probe as an app interaction or a naturally failed candidate.

**Say:** “To prove repair instead of waiting for a lucky failure, I deliberately push this verified design’s motion range beyond its joint limit. Code measures the failure. Sol cites that exact report field and proposes a typed local patch. Code rejects intent changes, applies only allowlisted parameters, regenerates the design, and reruns every check. Repair stops after three operations per cycle and five cycles.”

### 1:22–1:47 — product design

**Screen:** Switch candidates, press **Closed** and **Open**, rotate the 3D view, then switch to the cut-and-fold pattern and use its pan/zoom controls.

**Say:** “The three candidates differ by topology, not styling. The selected 3D view, flat pattern, motion, score, verifier evidence, and provenance stay synchronized because they share the same candidate IR.”

### 1:47–2:08 — exact handoff

**Screen:** Download GLB, SVG, DXF, and JSON. Show the selected hash and FOLD status.

**Say:** “Export produces the exact selected candidate: source-bound GLB, print-scale SVG and DXF, canonical fabrication JSON, and FOLD when the topology fits. Geometry, paths, motion, units, and hashes are verified before download.”

### 2:08–2:27 — evidence and impact

**Screen:** Briefly show `EVALS.md` numbers, then return to the moving result.

**Say:** “Offline release tests rejected all 560 hard-invalid mutations, reproduced 50 programs ten times byte-for-byte, repaired 40 measured failures, and passed all 317 tests and seven browser flows. Independent tools also parsed the DXF and FOLD files and validated every showcase GLB. FoldForge gives product and operations teams an inspectable handoff instead of model prose.”

### 2:27–2:43 — Codex and close

**Screen:** Show the build SHA, repository, and final moving candidate.

**Say:** “Codex helped build and review the contracts, compiler, verifier, repair loop, security boundary, tests, interface, and exports. The principle is simple: let AI explore; make code prove. This is FoldForge.”

## Recording checklist

- Under 3:00 with audible narration and corrected captions.
- Public YouTube link; Work & Productivity named in the title or description.
- `Sol ready` visible and the prompt is genuinely unseen.
- Submission build SHA matches the deployed build and repository.
- Failure ID, patch path, passing report, selected hash, and downloads are readable.
- No access code, API key, cookie, private tab, notification, or personal data appears.
- Do not claim force, strength, durability, or material validation.
- Include the requested Codex session ID in the submission form, not on screen if it harms readability.
