# FoldForge physical test protocol

Status: **awaiting user — no physical validation claimed**

FoldForge performs geometric and kinematic verification. Real load capacity depends on material, print accuracy, and fold quality and must be confirmed through physical prototyping.

## Generate the controlled test artifact

From the repository root:

```bash
pnpm install
pnpm run fixture -- --fixture phone-letter-110lb --seed 20260714 --output artifacts/kill-test
pnpm run verify:artifact -- artifacts/kill-test/manifest.json
```

Use the passing SVG inside `artifacts/kill-test`. Do not substitute a manually edited or rescaled export.

## Procedure

1. Use 110 lb cover cardstock and print the SVG at 100% / actual size with no “fit to page.”
2. Measure the 50 mm calibration line. Accept 49.5–50.5 mm; otherwise stop and correct printer scaling.
3. Record the target device width, height, depth, mass, and intended viewing angle before folding.
4. Score the crease lines, cut the perimeter and two slots, then fold using the generated legend.
5. Engage both tabs. Unlock and return to a flat sheet ten times.
6. Confirm base lift is under 2 mm and backrest angle is within ±5° of target.
7. Test the device centered for 60 seconds.
8. Offset the device by 5 mm toward the front and test for 60 seconds.
9. Offset the device by 5 mm toward the rear and test for 60 seconds.
10. Photograph or record the calibration line, assembled stand, centered hold, and both offset holds.

## Failure criteria

Fail the candidate on any of the following:

- collapse;
- tab release;
- tear or slot propagation;
- device slip greater than 3 mm;
- visible panel buckling;
- tipping;
- calibration outside 49.5–50.5 mm;
- backrest angle outside ±5° of target;
- base lift greater than 2 mm;
- inability to complete ten lock/unlock cycles.

A failed physical test must remain recorded. Do not replace it silently with a different candidate. Generate a bounded revision, document the changed parameters, and repeat the protocol.

## Result record

- Artifact manifest/hash: pending
- Printer/model: pending
- Print settings: pending
- Cardstock brand and stated weight: pending
- Calibration measurement: pending
- Device model: pending
- Device dimensions: pending
- Device mass: pending
- Target angle: pending
- Measured angle: pending
- Base lift: pending
- Ten-cycle lock result: pending
- Centered 60-second result: pending
- Front-offset 60-second result: pending
- Rear-offset 60-second result: pending
- Photos/video: pending
- User confirmation: pending
- Overall result: pending
- Failure observations: none recorded
- Modifications: none

## Claim boundary

Until the result above is completed and confirmed by the user, public documentation and demos must say **physical validation pending**. A passing result applies only to the recorded artifact, cardstock, printer settings, device, and folding execution; it is not a general load certification.
