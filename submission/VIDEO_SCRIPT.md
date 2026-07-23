# FoldForge demo video script

Target: **2:30–2:50**. Use one continuous screen recording with narration and captions.

## Before recording

- Open [foldforge.vercel.app](https://foldforge.vercel.app) in a clean browser session.
- Confirm the page says **Live generation ready**.
- Keep the access code, environment files, provider dashboard, response IDs, and credentials off-screen.
- Have one successful generated design open.
- Have its DXF ready in LibreCAD and its SVG ready in a browser.
- Do not describe a `template` result as model-authored topology. Say that Sol interpreted the request and code used a disclosed parametric family when that is what provenance records.

## Script

### 0:00–0:18 — the problem

**Screen:** FoldForge Describe page.

**Say:** “Turning a packaging idea into something a teammate can inspect usually means moving between a written brief, geometry tools, checks, and fabrication files. FoldForge puts that handoff into one flow: describe a paper object, inspect the checked design, and download the exact pattern.”

### 0:18–0:38 — the request and GPT-5.6 Sol

**Screen:** Show the playing-card-box prompt and press **Create design** once.

**Say:** “GPT-5.6 Sol reads the brief and returns strict intent plus a topology-free design specification: the required parts, their relationships, dimensions, motion, priorities, and tolerances. Sol does not write trusted coordinates and it cannot declare its own result valid.”

### 0:38–1:03 — the compiler and synthesizer

**Screen:** Move to the generated result and show the provenance trace.

**Say:** “Deterministic TypeScript owns the fabrication decisions. It normalizes incompatible model constraints, generates a connected panel graph, chooses fold directions and attachment edges, places tabs and slots, packs the sheet, and compiles one canonical program. Generic synthesis runs first. If it cannot realize a common enclosure, faceted figure, or pop-up card, FoldForge can use a disclosed parametric family fitted to the requested millimetres. Provenance records which path produced the geometry.”

### 1:03–1:28 — deterministic proof

**Screen:** Show the 3D result, use the open/close control, orbit the model, then expand the technical checks.

**Say:** “The verifier checks contracts, topology, feature sizes, packing, assembled transforms, connector reach, requested dimensions, and collision across 201 motion states with adaptive samples near clearance events. A hard-invalid candidate never reaches export. This panel shows measured code results, not an AI explanation.”

### 1:28–1:49 — one source for every view

**Screen:** Switch to **Cut-and-fold pattern**, pan or zoom, then return to 3D.

**Say:** “The articulated preview, flat pattern, measurements, report, and instructions all come from the same canonical fabrication IR. That prevents the common failure where the pretty preview and downloaded pattern describe different objects.”

### 1:49–2:15 — exact files

**Screen:** Show the export cards and assembly instructions. Open the downloaded DXF in LibreCAD, then show the SVG in a browser.

**Say:** “The same selected design exports as print-scale SVG, layered DXF, GLB for 3D handoff, and canonical JSON with provenance and hashes. Here is the DXF in LibreCAD with cut, score, perforation, and engrave layers. Here is the source-equivalent SVG pattern. FOLD is offered only when its format can preserve the design semantics.”

### 2:15–2:38 — engineering story

**Screen:** Briefly show the README architecture and the PR #20–#29 table.

**Say:** “Codex helped build the contracts, compiler, verifier, security boundary, interface, tests, and exports. Claude Code later reproduced real production failures and fixed the cross-model contract boundary, folded connector placement, feasibility normalization, transparent provenance, and common parametric fallbacks. I made the product decisions and kept one rule throughout: let AI interpret; make code prove.”

### 2:38–2:50 — honest close

**Screen:** Return to the generated result and downloads.

**Say:** “FoldForge is bounded, not make-anything CAD. It verifies geometry and motion, not material strength. What it does provide is a traceable path from one brief to one inspected design and files a teammate can actually open.”

## Recording checklist

- Final video is under 3:00, narrated, and captioned.
- The live/offline state and `synthesis`/`template` provenance are described truthfully.
- The prompt, generated result, verifier, pattern, export cards, LibreCAD DXF, and SVG are visible.
- No prepared image is presented as generated geometry.
- No secret, access code, cookie, environment value, response ID, or private dashboard is visible.
- No claim implies universal generation, strength, durability, material validation, or certified fabrication.
