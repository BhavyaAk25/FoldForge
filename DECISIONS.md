# FoldForge decisions

These decisions govern the prompt-to-fabrication compiler. They supersede the legacy phone-stand product decisions for future work without rewriting the historical evidence in [BUILD_LOG.md](./BUILD_LOG.md) or [EVALS.md](./EVALS.md).

## D-01 — Work & Productivity is the submission track

**Accepted.** FoldForge serves product, operations, and fabrication teams that need to turn a brief into a reviewable prototype handoff. The value proposition is shorter iteration time with explicit constraints and machine-checkable evidence, not consumer origami entertainment.

## D-02 — The product is a bounded compiler, not unrestricted text-to-CAD

**Accepted.** The target supports 1–4 flat sheets, simple polygonal panels, cuts, folds, tabs, slots, revolute hinges, prismatic sliders, an acyclic rigid-body graph, and a small coupling vocabulary. Exact cardinality and motion limits live in [FABRICATION_SPEC.md](./FABRICATION_SPEC.md). Unsupported physics or topology is refused rather than approximated silently.

Why: a narrow, explicit language can be compiled, tested, explained, and exported. An unrestricted promise would make validity and repeatability unauditable.

## D-03 — Sol reasons; deterministic code decides

**Accepted.** GPT-5.6 Sol may interpret the brief, propose typed programs, explain alternatives, and propose typed repair patches. Deterministic code owns normalization, geometry, kinematics, verification, ranking, patch application, canonical serialization, and exports.

Model output is untrusted. It cannot declare validity, suppress a failure, provide the authoritative score, or directly modify artifact bytes.

## D-04 — All external data is versioned and canonical

**Accepted.** `FabricationIntentV1`, `FabricationProgramV1`, `FabricationIRV1`, `VerificationReportV2`, `ProgramPatchV1`, and `CandidateV2` are explicit contracts. Unknown versions fail closed. Canonical serialization fixes ordering and numeric representation so hashes, repeatability, cache keys, and export provenance are testable.

## D-05 — Verification is fail-fast and precedes scoring

**Accepted.** The verifier runs the ordered sequence in [FABRICATION_SPEC.md](./FABRICATION_SPEC.md): contracts; graph; panel geometry; joints/connectors; sheet packing; transforms/closure; motion; collision/clearance/continuity; semantics; export equivalence; then scoring.

No invalid candidate can be rescued by a high soft score. Hard tolerances are 0.1 mm closure, zero collision, 0.5 mm requested moving clearance, 2 degrees requested angle error, and 1 mm requested travel error, with no branch jump or dead driver state.

## D-06 — Candidate variety is program-level, not cosmetic

**Accepted.** Show at most three verified candidates oriented toward fabrication efficiency, mechanical simplicity, and visual expression. When the feasible set permits it, at least two must differ in topology or coupling structure rather than color, labels, or tiny dimensions. “When feasible” is reported, never fabricated.

## D-07 — Repair is typed, local, bounded, and fully rechecked

**Accepted.** A repair cycle permits at most three allowlisted patch operations and the pipeline permits at most five cycles. Unknown or unrelated operations, intent changes, out-of-range values, repeated canonical inputs, and identifier drift are rejected. Every accepted patch recompiles and reruns all checks. Exhaustion returns explicit infeasibility.

## D-08 — One selected IR drives every view and file

**Accepted.** Interactive 3D, flat pattern, motion, verifier highlights, GLB, print-scale SVG/DXF, canonical JSON, and instructions all derive from the exact selected verified candidate. `fabrication.json` includes the selected intent, program, IR, verification report, score, provenance, and hashes. FOLD may be offered only when its semantics remain source-equivalent; it is not a required target format.

## D-09 — The UI exposes provenance and unavailable capabilities

**Accepted.** The flow is Describe → Forge → Export, with synchronized 3D/pattern/program views and `USER`, `AI`, and `CODE` labels. Offline mode must state that live interpretation is unavailable and may only run disclosed fixtures or deterministic controls. The interface may never claim that a prompt was interpreted when it was not.

## D-10 — Live AI is opt-in and fail-closed

**Accepted, revised after live evidence.** `ENABLE_LIVE_OPENAI` defaults to `false`. Live routes require a valid short-lived `__Host-` HttpOnly access cookie, same-origin or Fetch Metadata checks, route-specific body caps, per-session request and token quotas, bounded concurrency, no model-generation retries, and a statically declared 240-second route duration. Intent and repair remain synchronous. Large program synthesis starts one `background:true` Response with medium reasoning and an 8,000-token combined reasoning/output ceiling, then polls it for at most 210 seconds; only retrieval calls may retry. This follows OpenAI's documented long-running Responses pattern without creating duplicate generations or risking truncated strict JSON. Secrets remain server-only. Exact values and current implementation gaps are in [PRIVACY.md](./PRIVACY.md).

## D-11 — Privacy claims include provider retention limits

**Accepted.** Responses use `store:false` and a random server-issued privacy-preserving safety subject. FoldForge does not persist prompt or response content server-side or place secrets in browser storage. Documentation must still disclose that OpenAI may retain abuse-monitoring data according to its API data controls and temporarily retains background response state for polling; `store:false` is not described as zero retention.

## D-12 — Release is evidence-gated under the official criteria

**Accepted.** Two independent reviewers score Technological Implementation, Design, Potential Impact, and Quality of the Idea. Release needs at least 92/100 overall, at least 22/25 in every criterion, and the lower reviewer score is authoritative. Hard verifier, security, accessibility, licensing, live, export-equivalence, and repeatability gates cannot be averaged away.

## D-13 — Release evidence is software-based

**Accepted.** Release depends on the compiler, verifier, exports, browser experience, live-model evidence, and sealed evaluations. FoldForge makes no strength or force guarantee.

## D-14 — Expensive deterministic work is bounded

**Accepted.** Static objects are verified at one canonical state and moving objects at 201 fixed states plus bounded refinement. The verifier rejects a candidate before motion traversal when its estimated sampled triangle-pair work exceeds 2,000,000 units. Public deterministic compile/export routes also use best-effort process-local request and concurrency limits. These controls protect the submission service without weakening any hard geometric check.

## D-15 — Fabrication topology must be source-equivalent

**Accepted.** Fold edges cannot also be cut, tab roots remain attached, slots stay inside their source panel, holes need a safe ligament and useful net material, and joint/coupling connectors must be complete reciprocal pairs that physically span the bodies and axes they claim to constrain. Slot width clears tab stock thickness; slot length clears the widest full-tab span along its root tangent; declared pair clearance is exact; insertion axes and assembled-frame tab/slot spans must align. Slot material is removed consistently in verification, scoring, collision meshes, and GLB. GLB embeds the exact canonical fabrication profile, paths, connectors, hierarchy, and code-derived motion; source equivalence regenerates the complete canonical artifact and compares every byte, so caller-authored or mutated geometry and animation are rejected.

## Rejected alternatives

- **Rename the existing stand as a generalized compiler:** dishonest and unsupported by the source or evals.
- **Model-authored coordinates or export bytes:** breaks the deterministic authority and makes repair/equivalence unverifiable.
- **General closed-loop mechanism solving:** outside the bounded graph and verification budget.
- **Soft penalties for collision or closure:** allows invalid designs to rank; hard failures remain disqualifying.
- **Canned prompt-to-template routing:** undermines unseen-prompt evidence and Quality of the Idea.
- **Material load testing as release proof:** tests one material/build and cannot establish software correctness for the supported language.
