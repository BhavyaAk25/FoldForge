import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { canonicalSerialize } from "../src/core/canonical";
import {
  buildFabricationCandidate,
  finalizeFabricationCandidate,
} from "../src/core/fabrication/candidate";
import {
  compileFabricationProgram,
  fabricationIrHash,
} from "../src/core/fabrication/compiler";
import {
  createOfflineFabricationShowcases,
  type OfflineFabricationShowcase,
} from "../src/core/fabrication/examples";
import { scoreFabricationCandidate } from "../src/core/fabrication/scoring";
import type {
  FabricationIntentV1,
  FabricationIRV1,
  FabricationProgramV1,
  VerificationStage,
} from "../src/core/fabrication/types";
import { verifyFabricationIr } from "../src/core/fabrication/verification";
import { sha256Hex } from "../src/core/sha256";

const GENERATED_AT_ISO = "2026-07-14T12:00:00.000Z";
const CONTROL_VARIANTS_PER_SHOWCASE = 40;
const MUTATIONS_PER_CATEGORY = 56;
const REPEATABILITY_PROGRAMS = 50;
const REPEATS_PER_PROGRAM = 10;

const percentile = (values: readonly number[], fraction: number): number => {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil(ordered.length * fraction) - 1),
  );
  return ordered[index] ?? Number.POSITIVE_INFINITY;
};

const variantFor = (
  showcase: OfflineFabricationShowcase,
  variant: number,
): {
  readonly intent: FabricationIntentV1;
  readonly program: FabricationProgramV1;
  readonly candidateId: string;
} => {
  const suffix = `${showcase.showcaseId}-${variant + 1}`;
  const dimensionDeltaMm = variant * 0.125;
  const sheets = showcase.program.sheets.map((sheet) => ({
    ...sheet,
    widthMm: sheet.widthMm + dimensionDeltaMm,
    heightMm: sheet.heightMm + dimensionDeltaMm,
  }));
  const intentId = `intent-eval-${suffix}`;
  return {
    intent: {
      ...showcase.intent,
      intentId,
      stockOptions: sheets,
    },
    program: {
      ...showcase.program,
      programId: `program-eval-${suffix}`,
      intentId,
      candidateLabel: `${showcase.program.candidateLabel} · control ${variant + 1}`,
      sheets,
    },
    candidateId: `candidate-eval-${suffix}`,
  };
};

const compileOrThrow = (
  intent: FabricationIntentV1,
  program: FabricationProgramV1,
): FabricationIRV1 => {
  const compiled = compileFabricationProgram(intent, program);
  if (!compiled.ok) throw new Error(canonicalSerialize(compiled.error));
  return compiled.value;
};

const evaluationFingerprint = (
  intent: FabricationIntentV1,
  program: FabricationProgramV1,
  candidateId: string,
): string => {
  const ir = compileOrThrow(intent, program);
  const report = verifyFabricationIr(ir, candidateId);
  const score = scoreFabricationCandidate(ir, report, intent);
  const built = buildFabricationCandidate({
    candidateId,
    intent,
    program,
    selectionStatus: "selected",
    provenance: {
      compilerVersion: "foldforge-fabrication-v1",
      generatedAtIso: GENERATED_AT_ISO,
      deterministicSeed: 20_260_714,
      modelId: null,
      modelResponseId: null,
      modelPlanHash: null,
      planExpanderVersion: null,
      parentCandidateId: null,
      appliedPatchIds: [],
      repairCycle: 0,
    },
  });
  if (!built.ok) throw new Error(canonicalSerialize(built.error));
  const finalized = finalizeFabricationCandidate({
    candidate: built.value,
    requestedFormats: ["svg", "dxf", "glb", "json", "fold"],
  });
  if (!finalized.ok) throw new Error(canonicalSerialize(finalized.error));
  return sha256Hex(
    canonicalSerialize({
      ir,
      report,
      score,
      candidate: finalized.value.candidate,
      artifactHashes: finalized.value.artifacts.map(
        (artifact) => artifact.metadata.sha256,
      ),
      foldOmission: finalized.value.foldOmission,
    }),
  );
};

interface MutationCase {
  readonly category: string;
  readonly expectedStage: VerificationStage;
  readonly ir: FabricationIRV1;
  readonly exportMismatch?: boolean;
}

const mutationCases = (
  duck: FabricationIRV1,
  organizer: FabricationIRV1,
  flower: FabricationIRV1,
): readonly MutationCase[] => {
  const cases: MutationCase[] = [];
  for (let index = 0; index < MUTATIONS_PER_CATEGORY; index += 1) {
    const mutationNumber = index + 1;
    cases.push(
      {
        category: "schema",
        expectedStage: "schema",
        ir: {
          ...duck,
          irId: `!invalid-schema-${mutationNumber}`,
        },
      },
      {
        category: "topology",
        expectedStage: "topology",
        ir: {
          ...duck,
          bodies: [
            { ...duck.bodies[0]!, label: `Duplicate ${mutationNumber}` },
            duck.bodies[0]!,
            ...duck.bodies.slice(2),
          ],
        },
      },
      {
        category: "panel_geometry",
        expectedStage: "panel_geometry",
        ir: {
          ...duck,
          panels: duck.panels.map((panel, panelIndex) =>
            panelIndex === 0
              ? {
                  ...panel,
                  contour: {
                    vertices: panel.contour.vertices.map((_, vertexIndex) => ({
                      xMm: vertexIndex * mutationNumber * 0.001,
                      yMm: 0,
                    })),
                  },
                }
              : panel,
          ),
        },
      },
      {
        category: "connections",
        expectedStage: "connections",
        ir: {
          ...organizer,
          connectors: organizer.connectors.map((connector, connectorIndex) =>
            connectorIndex === 0
              ? { ...connector, clearanceMm: mutationNumber * 0.003 }
              : connector,
          ),
        },
      },
      {
        category: "sheet_packing",
        expectedStage: "sheet_packing",
        ir: {
          ...duck,
          sheets: duck.sheets.map((sheet) => ({
            ...sheet,
            widthMm: 70 + mutationNumber * 0.1,
          })),
        },
      },
      {
        category: "rigid_transforms",
        expectedStage: "rigid_transforms",
        ir: {
          ...duck,
          bodies: duck.bodies.map((body, bodyIndex) =>
            bodyIndex === 0
              ? {
                  ...body,
                  label: `${body.label} invalid ${mutationNumber}`,
                  initialTransform: {
                    ...body.initialTransform,
                    rotation: { x: 0, y: 0, z: 0, w: 0 },
                  },
                }
              : body,
          ),
        },
      },
      {
        category: "motion",
        expectedStage: "motion",
        ir: {
          ...flower,
          driver: flower.driver
            ? {
                ...flower.driver,
                maximumValue: 31 + mutationNumber * 0.1,
              }
            : null,
        },
      },
      {
        category: "collision",
        expectedStage: "collision",
        ir: {
          ...flower,
          bodies: flower.bodies.map((body) =>
            body.bodyId === "body-flower-crown"
              ? {
                  ...body,
                  initialTransform: {
                    ...body.initialTransform,
                    translationMm: {
                      ...body.initialTransform.translationMm,
                      zMm: (mutationNumber - 1) * (0.49 / 55),
                    },
                  },
                }
              : body,
          ),
        },
      },
      {
        category: "semantics",
        expectedStage: "semantics",
        ir: {
          ...flower,
          semanticConstraints: flower.semanticConstraints.map((constraint) =>
            constraint.kind === "motion"
              ? {
                  ...constraint,
                  maximumValue: 32 + mutationNumber * 0.1,
                }
              : constraint,
          ),
        },
      },
      {
        category: "export_equivalence",
        expectedStage: "export_equivalence",
        ir: duck,
        exportMismatch: true,
      },
    );
  }
  return cases;
};

const showcases = createOfflineFabricationShowcases();
const baselineIr = new Map(
  showcases.map((showcase) => [
    showcase.showcaseId,
    compileOrThrow(showcase.intent, showcase.program),
  ]),
);
const duck = baselineIr.get("faceted-duck-gift-box")!;
const organizer = baselineIr.get("modular-cable-organizer")!;
const flower = baselineIr.get("pull-tab-pop-up-flower")!;

let crashCount = 0;
let validControlFailures = 0;
let exportEquivalenceFailures = 0;
const compileVerifyDurationsMs: number[] = [];
const controls = showcases.flatMap((showcase) =>
  Array.from({ length: CONTROL_VARIANTS_PER_SHOWCASE }, (_, variant) =>
    variantFor(showcase, variant),
  ),
);
for (const control of controls) {
  const startedAt = performance.now();
  try {
    const ir = compileOrThrow(control.intent, control.program);
    const report = verifyFabricationIr(ir, control.candidateId);
    compileVerifyDurationsMs.push(performance.now() - startedAt);
    if (!report.valid) {
      validControlFailures += 1;
      continue;
    }
    const built = buildFabricationCandidate({
      candidateId: control.candidateId,
      intent: control.intent,
      program: control.program,
      selectionStatus: "selected",
      provenance: {
        compilerVersion: "foldforge-fabrication-v1",
        generatedAtIso: GENERATED_AT_ISO,
        deterministicSeed: 20_260_714,
        modelId: null,
        modelResponseId: null,
        modelPlanHash: null,
        planExpanderVersion: null,
        parentCandidateId: null,
        appliedPatchIds: [],
        repairCycle: 0,
      },
    });
    const finalized = built.ok
      ? finalizeFabricationCandidate({
          candidate: built.value,
          requestedFormats: ["svg", "dxf", "glb", "json", "fold"],
        })
      : built;
    if (
      !finalized.ok ||
      !finalized.value.candidate.exportMetadata.sourceEquivalent
    ) {
      exportEquivalenceFailures += 1;
    }
  } catch {
    crashCount += 1;
  }
}

const stageCounts: Record<string, number> = {};
let acceptedHardInvalidCount = 0;
let unexpectedMutationStageCount = 0;
const mutations = mutationCases(duck, organizer, flower);
mutations.forEach((mutation, index) => {
  try {
    const candidateId = `mutation-${mutation.category}-${index + 1}`;
    const report = mutation.exportMismatch
      ? verifyFabricationIr(mutation.ir, candidateId, {
          exportEquivalence: [
            {
              format: "svg",
              status: "fail",
              sourceIrHash: fabricationIrHash(mutation.ir),
              artifactHash: null,
              message: `Injected source mismatch ${index + 1}.`,
            },
          ],
        })
      : verifyFabricationIr(mutation.ir, candidateId);
    if (report.valid) acceptedHardInvalidCount += 1;
    if (report.failedAtStage !== mutation.expectedStage) {
      unexpectedMutationStageCount += 1;
    }
    const stage = report.failedAtStage ?? "none";
    stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;
  } catch {
    crashCount += 1;
  }
});

let repeatabilityFailures = 0;
for (const control of controls.slice(0, REPEATABILITY_PROGRAMS)) {
  const fingerprints = Array.from({ length: REPEATS_PER_PROGRAM }, () =>
    evaluationFingerprint(control.intent, control.program, control.candidateId),
  );
  if (new Set(fingerprints).size !== 1) repeatabilityFailures += 1;
}

const validControlRejectionRate = validControlFailures / controls.length;
const report = {
  reportVersion: 1,
  mode: "fabrication-compiler-offline",
  schemaVersion: "FabricationIRV1",
  compilerVersion: "foldforge-fabrication-v1",
  verifierVersion: "VerificationReportV2",
  exporterVersion: "1",
  deterministicSeed: 20_260_714,
  environment: `node-${process.version}`,
  controlCount: controls.length,
  validControlFailures,
  validControlRejectionRate,
  mutationCount: mutations.length,
  mutationCategories: Object.keys(stageCounts).sort(),
  mutationStageCounts: stageCounts,
  acceptedHardInvalidCount,
  unexpectedMutationStageCount,
  exportControlCount: controls.length,
  exportEquivalenceFailures,
  repeatabilityProgramCount: REPEATABILITY_PROGRAMS,
  repeatsPerProgram: REPEATS_PER_PROGRAM,
  repeatabilityFailures,
  deterministicRepeatabilityRate:
    (REPEATABILITY_PROGRAMS - repeatabilityFailures) / REPEATABILITY_PROGRAMS,
  compileVerifyP95Ms: Number(
    percentile(compileVerifyDurationsMs, 0.95).toFixed(3),
  ),
  crashCount,
  gates: {
    hardInvalidAccepted: acceptedHardInvalidCount === 0,
    expectedFailFastStage:
      unexpectedMutationStageCount === 0 &&
      Object.keys(stageCounts).length === 10,
    validControlRejected: validControlRejectionRate <= 0.02,
    sourceEquivalentExports: exportEquivalenceFailures === 0,
    repeatability: repeatabilityFailures === 0,
    performance: percentile(compileVerifyDurationsMs, 0.95) <= 2_000,
    noCrash: crashCount === 0,
  },
};
const passed = Object.values(report.gates).every(Boolean);

await mkdir(path.resolve("artifacts/evals"), { recursive: true });
await writeFile(
  path.resolve("artifacts/evals/offline.json"),
  `${JSON.stringify({ ...report, passed }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify({ ...report, passed })}\n`);
if (!passed) process.exitCode = 1;
