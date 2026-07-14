# FoldForge decisions

## Product and topology

- Support one full-width continuous strip: two releasable tabs → backrest → rear brace → base/front toe → lip.
- “Fold flat” means release both tabs and return to the planar sheet; locked collapse is unsupported.
- Five active crease components and two internal slot cuts are topology invariants. Perimeter trimming is reported separately.
- Device mass above 500 g is outside the supported product boundary, not evidence of load capacity.

## Geometry and verification

- Canonical units are millimetres, grams, and degrees.
- Candidate parameters stay within documented closed ranges. Derived rear run must be at least 12 mm.
- Deployment checks exactly 201 fixed side-profile states and all non-adjacent structural segment pairs. Tabs, device volume, paper thickness, friction, collinear near-clearance, and adaptive refinement are not modeled; this is a screen, not a rigid-foldability proof.
- Stability combines the device centre-of-mass projection with area-weighted deployed centroids for every paper panel and a conservative uncertainty reserve.
- Toe capture is a hard measured-angle check. Requests requiring more than the 22 mm topology limit are explicitly infeasible.
- Contact area is “nominal geometric overlap,” never pressure, friction, or load capacity.
- Verification is fail-fast and code-owned; failed candidates are ineligible for ranking.

## AI architecture

- Use `gpt-5.6-sol` through Responses with `store:false` and strict schemas.
- High reasoning for constraint compilation and repair diagnosis; medium for comparison and instructions. xhigh is eval-gated.
- Model output never supplies coordinates, validity, scores, or exports.
- Repair patches allow at most three operations and five cycles, with duplicate canonical inputs rejected.

## Export profile

- SVG declares millimetres, uses one viewBox unit per millimetre, and reserves a 10 mm footer for the 50 mm calibration line.
- FOLD uses `file_spec: 1.2`, millimetres, a crease-pattern frame, derived deployed fold angles, `B/M/V/C` edges, and no faces for the cut-bearing v1 profile.
- “FOLD-reference result” means FoldForge-profile source equivalence, not universal simulator compatibility.

## Experience

- Paper `#F4F0E6`, surface `#FBF8F1`, graphite `#20201D`, muted `#6E6A62`, border `#CFC7B8`, accent `#315F63`, success `#247A4A`, warning `#7A4B0E`, failure `#B43A32`.
- Geist Sans/Mono, 8 px spacing grid, limited shadows, restrained motion, synthesized interaction sounds, persistent mute, and immediate reduced-motion rendering.

## Rejected alternatives

- Unrestricted topology generation: unverifiable and outside the narrow product promise.
- GPT-authored geometry or validity: violates the deterministic source-of-truth boundary.
- Side cut wings: adds physical and export risk without enough expected demo value.
- Database/accounts: unnecessary for a local checkpointed single-session workflow.
