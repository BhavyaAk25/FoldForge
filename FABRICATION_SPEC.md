# FoldForge fabrication compiler specification

Status: **approved target contract; implementation pending**. This document is normative for the pivot. “Must” and “must not” are release requirements. Current legacy phone-stand behavior is not evidence of conformance.

## 1. Scope

FoldForge compiles a natural-language brief into a bounded flat-sheet object whose geometry, assembly, and requested motion can be deterministically checked. It targets lightweight prototype handoffs for product, operations, and fabrication teams.

The compiler reasons about dimensions, connectivity, rigid transforms, collision, clearance, and kinematic reachability. It does not predict material strength, force, friction, fatigue, durability, manufacturing process capability, or safety for a real-world load.

## 2. Canonical contracts

Every external object must include an exact schema version. Unknown or partially migrated versions fail closed.

| Contract               | Authority                                        | Purpose                                                                                                       |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `FabricationIntentV1`  | User constraints normalized by code              | Requested dimensions, behavior, sheets, fabrication constraints, priorities, and explicit unknowns            |
| `FabricationProgramV1` | Untrusted Sol proposal validated by code         | Panels, joints, connectors, driver, couplings, outputs, semantic requirements, and design rationale           |
| `FabricationIRV1`      | Deterministic compiler                           | Canonical panel geometry, graph, transforms, motion functions, layer semantics, provenance, and export inputs |
| `VerificationReportV2` | Deterministic verifier                           | Ordered hard failures, measurements, witnesses, semantic results, export equivalence, and soft metrics        |
| `ProgramPatchV1`       | Untrusted Sol proposal validated/applied by code | At most eight typed, local operations against existing program identifiers                                    |
| `CandidateV2`          | Deterministic pipeline                           | Intent/program/IR/report/score bundle with canonical hashes and provenance                                    |

The canonical serializer must:

- sort maps, identifiers, and unordered collections by documented stable keys;
- use finite decimal numbers in millimetres or degrees and reject `NaN`, infinity, negative zero, and implicit units;
- preserve array order only where the schema declares it semantic;
- omit no required field and admit no unknown field; and
- produce byte-stable output and hashes for equivalent inputs.

## 3. Supported grammar

### 3.1 Cardinality and geometry

| Element               |        Limit |
| --------------------- | -----------: |
| Flat sheets           |          1–4 |
| Panels                |     24 total |
| Vertices              | 64 per panel |
| Joints and connectors |     24 total |
| Motion drivers        |       0 or 1 |
| Driven outputs        |            6 |

All fabrication geometry uses millimetres. A panel is a non-degenerate simple polygon in a sheet-local 2D frame. A program may contain perimeter cuts, internal cuts, fold lines, tabs, and slots. Minimum feature sizes and printable margins are explicit intent/material-profile values; missing values use a versioned conservative profile, never a model guess hidden from the report.

### 3.2 Graph and joints

The rigid-body graph must be connected for each assembled component and acyclic. Supported joint types are:

- `fold`: a sheet crease with a bounded fold angle;
- `revolute`: one rotational degree of freedom about a declared axis; and
- `prismatic`: one translational degree of freedom along a declared axis with bounded travel.

Tabs and slots are typed connectors with mating identifiers, engagement direction, insertion clearance, and active state. Connector references must resolve exactly once and cannot create an unsupported kinematic loop.

### 3.3 Motion and couplings

A program is static or has one scalar driver over the normalized interval `[0, 1]`. At most six output measurements may be requested. Supported coupling families are:

- `direct-ratio` — an affine joint response to the driver within declared limits;
- `mirrored-pair` — equal-magnitude, opposite-sign responses around a declared symmetry plane;
- `pull-tab` — a prismatic input mapped to one or more bounded joint responses;
- `cam-slot` — a declared piecewise analytic slot path mapped to a follower; no arbitrary free-form spline; and
- no coupling for independently fixed/static joints.

Supported behavior labels are `static`, `open-close`, `flap`, `rotate`, `slide`, and `expand-collapse`. Labels are semantic requirements, not substitutes for measurable motion targets.

### 3.4 Unsupported requests

The compiler must refuse or request one minimal clarification for:

- arbitrary smooth solids or unrestricted mesh synthesis;
- deformable, elastic, cloth, fluid, or force-dependent behavior;
- electronics, motors, powered actuation, or sensor logic;
- friction-, torque-, strength-, fatigue-, or load-bearing guarantees;
- general closed-loop mechanisms or underconstrained multi-driver motion;
- more than four sheets or any other cardinality above this specification; and
- a request whose essential dimensions, output behavior, or fabrication limits cannot be inferred without inventing intent.

Refusal must name the unsupported feature and, when possible, the nearest supported reformulation. Prompt keywords must not select hidden templates or bypass compilation.

## 4. Compilation

Compilation is a pure deterministic function of the normalized intent, validated program, material/profile version, compiler version, and explicit seed. It must:

1. normalize units and constraint precedence;
2. allocate stable identifiers;
3. construct panel polygons and fabrication features;
4. resolve joints, connectors, driver, couplings, and outputs;
5. build sheet-local, assembly, and motion transforms;
6. preserve `USER`, `AI`, and `CODE` provenance for each constraint and derived value; and
7. emit canonical `FabricationIRV1` or a typed compilation failure.

Compilation must not make a network call, depend on UI state, or mutate the input. Same canonical inputs, seed, and version must produce byte-identical IR.

## 5. Verification

Verification is deterministic, fail-fast by phase, and independent of model explanations. A report may retain every failure within the current phase for repair evidence, but no later phase may turn an earlier hard failure into a pass.

### 5.1 Required order

1. **Contract:** schema/version, units, finite numbers, cardinality, enums, and grammar.
2. **Graph:** unique IDs, exact references, connectivity, and acyclicity.
3. **Panel geometry:** non-degenerate simple polygons and minimum feature sizes.
4. **Interfaces:** shared edges, joints, connector mating, insertion direction, and clearances.
5. **Sheet packing:** bounds, non-overlap, printable margins, units, and calibration space across 1–4 sheets.
6. **Assembly transforms:** rigid transforms, closure, and requested static dimensions.
7. **Motion:** 201 uniformly spaced driver states plus adaptive refinement near contact, clearance minima, joint limits, discontinuities, and branch events.
8. **Dynamic validity:** collision, requested moving clearance, slider travel, branch continuity, and unreachable/dead states.
9. **Semantics:** requested behaviors, outputs, directions, angles, travels, symmetry, and user hard constraints.
10. **Export equivalence:** every exported coordinate, unit, layer, transform, motion state, identifier, and hash traces to the selected IR.
11. **Scoring:** soft objectives only after phases 1–10 pass.

### 5.2 Hard numeric tolerances

| Check                      | Passing requirement                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Closure residual           | ≤0.1 mm at every declared closure/interface                                                                                                        |
| Collision                  | No interpenetration at any fixed or adaptive sample; intended joint/contact pairs are explicitly exempted only for their declared contact manifold |
| Requested moving clearance | ≥0.5 mm at every sampled state                                                                                                                     |
| Requested output angle     | Absolute error ≤2 degrees                                                                                                                          |
| Requested output travel    | Absolute error ≤1 mm                                                                                                                               |
| Branch continuity          | No discontinuous transform, sign reversal, or unrequested solution-branch switch                                                                   |
| Driver reachability        | Every state in `[0, 1]` reachable; no dead interval or singular state that prevents traversal                                                      |

Passing sampled motion is a verified result for the bounded analytic model, not proof of real material behavior. Adaptive refinement must be deterministic and bounded; exhaustion or numerical ambiguity fails closed.

### 5.3 Failure evidence

Each hard failure must include a stable code, phase, involved IDs, measured and required values with units, driver state or sheet location when relevant, a geometric witness usable by the UI, and provenance. Human-readable copy cannot replace these fields.

## 6. Candidates and ranking

The pipeline may show zero to three candidates. Every visible candidate must pass all hard verification phases.

The three intended search directions are:

1. fabrication efficiency — fewer sheets/features, compact packing, lower cut/fold complexity;
2. mechanical simplicity — fewer joints/connectors/couplings and a shorter assembly path; and
3. visual expression — distinct silhouette and motion presentation without sacrificing hard validity.

When feasible, at least two visible candidates must be topology-distinct: a different panel/joint graph, connector strategy, or coupling family. Numeric tweaks, color, labels, or mirrored presentation do not establish topology diversity. If fewer than two distinct valid topologies exist within the bounded search, the report must say so.

Ranking is deterministic and versioned. It may combine fabrication efficiency, mechanical simplicity, geometric margin, semantic fit, and visual-expression proxies only after hard validity. The UI must expose the score components and cannot rank a failed candidate.

## 7. Repair

Repair is bounded to five cycles. Each `ProgramPatchV1` contains at most eight typed operations. Allowed operation families may adjust an existing numeric parameter within its declared range, replace an existing supported coupling with another supported coupling, add/remove an optional existing-schema fabrication feature, or select an enumerated supported topology variant exposed by the program.

Code must reject a patch that:

- contains an unknown field or operation;
- references an unknown or unrelated ID;
- changes the normalized user intent or drops a hard constraint;
- exceeds a parameter range, cardinality, or operation count;
- repeats an already attempted canonical program/IR;
- edits derived coordinates or export bytes directly; or
- claims success without a new verification report.

After an accepted patch, code recompiles and reruns phases 1–11. Reaching five cycles, repeating canonical state, or exhausting allowed operations returns explicit infeasibility with the best grounded failure evidence; it never returns the least-invalid artifact as valid.

## 8. Export pack

Only the exact selected verified `CandidateV2` is exportable. Required outputs are:

- interactive 3D rendered from the selected IR;
- binary GLB from the same panels, transforms, hierarchy, and selected motion state/range;
- print-scale SVG in millimetres with explicit cut/fold/score/annotation/calibration layers;
- DXF with explicit units and corresponding fabrication layers;
- canonical `fabrication.json` containing selected intent, program, IR, report, score, provenance, versions, seed, and hashes; and
- assembly and operation instructions grounded in identifiers and verified motion.

Every file must include or be covered by a manifest containing the build SHA, schema/compiler/verifier/exporter versions, selected candidate hash, byte hash, units, and generation time. SVG and DXF must include a labelled calibration length. GLB must be generated from the same IR, not a visually similar reconstruction.

FOLD is optional. It may be emitted only if the source joint, assignment, cut, and motion semantics can be represented without loss and an equivalence verifier passes. Otherwise the exporter must omit FOLD with an explicit reason.

## 9. Product behavior

The target stages are Describe, Forge, and Export. The product must:

- synchronize the interactive 3D view, flat pattern, typed program, motion scrubber, verifier highlights, and selected candidate;
- support rotate, zoom, explode, and full-driver motion scrub;
- expose `USER`, `AI`, and `CODE` provenance;
- preserve keyboard operation, visible focus, screen-reader names/status, and reduced motion;
- render without horizontal overflow at 390, 768, 1280, and 1440 px; and
- state when live Sol is unavailable. Offline fixtures must be labelled and cannot impersonate arbitrary prompt interpretation.

Decorative sound is outside the pivot scope.

## 10. Security, privacy, and release

The exact server and privacy limits are normative in [PRIVACY.md](./PRIVACY.md). The exact test and judge thresholds are normative in [EVALS.md](./EVALS.md) and [JUDGE_RUBRIC.md](./JUDGE_RUBRIC.md).

A release must not claim conformance until the generalized source, sealed offline/live/adversarial suites, exports, browser experience, security checks, and independent review all pass.
