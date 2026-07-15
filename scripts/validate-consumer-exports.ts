import DxfParser from "dxf-parser";
import fold from "fold";
import { validateBytes, version as gltfValidatorVersion } from "gltf-validator";
import { z } from "zod";

import {
  buildFabricationCandidate,
  finalizeFabricationCandidate,
} from "../src/core/fabrication/candidate";
import { createOfflineFabricationShowcases } from "../src/core/fabrication/examples";
import type { FabricationExportArtifact } from "../src/core/fabrication/export";

const GLTF_VALIDATION_REPORT_SCHEMA = z
  .object({
    validatorVersion: z.string().min(1),
    issues: z
      .object({
        numErrors: z.number().int().nonnegative(),
        numWarnings: z.number().int().nonnegative(),
        numInfos: z.number().int().nonnegative(),
        numHints: z.number().int().nonnegative(),
        messages: z.array(
          z
            .object({
              code: z.string(),
              severity: z.number().int().min(0).max(3),
              message: z.string(),
            })
            .passthrough(),
        ),
        truncated: z.boolean(),
      })
      .strict(),
  })
  .passthrough();

const FOLD_GRAPH_SCHEMA = z
  .object({
    vertices_coords: z.array(z.tuple([z.number(), z.number()])),
    edges_vertices: z.array(
      z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
    ),
    edges_assignment: z.array(z.enum(["B", "C", "F", "J", "M", "U", "V"])),
    edges_foldAngle: z.array(z.number()).optional(),
  })
  .passthrough();

const REQUIRED_DXF_LAYERS = ["CUT", "SCORE", "PERFORATION", "ENGRAVE"] as const;
const REQUIRED_DXF_LAYER_SET: ReadonlySet<string> = new Set(
  REQUIRED_DXF_LAYERS,
);

interface ConsumerValidationResult {
  readonly showcaseId: string;
  readonly glb: { readonly errors: number; readonly warnings: number };
  readonly dxf: {
    readonly entityCount: number;
    readonly layers: readonly string[];
  };
  readonly fold: {
    readonly edgeCount: number;
    readonly faceCount: number;
  } | null;
  readonly foldOmissionCode: string | null;
}

const artifactByFormat = (
  artifacts: readonly FabricationExportArtifact[],
  format: FabricationExportArtifact["format"],
): FabricationExportArtifact => {
  const artifact = artifacts.find((candidate) => candidate.format === format);
  if (!artifact) throw new Error(`Expected a generated ${format} artifact.`);
  return artifact;
};

const artifactText = (artifact: FabricationExportArtifact): string => {
  if (artifact.text === undefined) {
    throw new Error(`${artifact.format} artifact has no text representation.`);
  }
  return artifact.text;
};

const validateGlb = async (
  showcaseId: string,
  artifact: FabricationExportArtifact,
): Promise<{ readonly errors: number; readonly warnings: number }> => {
  const report = GLTF_VALIDATION_REPORT_SCHEMA.parse(
    await validateBytes(artifact.bytes, {
      uri: `${showcaseId}.glb`,
      format: "glb",
      maxIssues: 0,
      writeTimestamp: false,
    }),
  );
  if (
    report.issues.numErrors !== 0 ||
    report.issues.numWarnings !== 0 ||
    report.issues.truncated
  ) {
    const seriousMessages = report.issues.messages
      .filter((message) => message.severity <= 1)
      .map((message) => `${message.code}: ${message.message}`)
      .join("; ");
    throw new Error(
      `${showcaseId} GLB failed Khronos validation with ${report.issues.numErrors} errors and ${report.issues.numWarnings} warnings${seriousMessages ? `: ${seriousMessages}` : "."}`,
    );
  }
  return {
    errors: report.issues.numErrors,
    warnings: report.issues.numWarnings,
  };
};

const validateDxf = (
  showcaseId: string,
  artifact: FabricationExportArtifact,
): { readonly entityCount: number; readonly layers: readonly string[] } => {
  const parsed = new DxfParser().parseSync(artifactText(artifact));
  if (!parsed) throw new Error(`${showcaseId} DXF did not parse.`);
  if (parsed.header.$INSUNITS !== 4) {
    throw new Error(
      `${showcaseId} DXF declares $INSUNITS=${String(parsed.header.$INSUNITS)} instead of millimetres (4).`,
    );
  }
  const layers = Object.keys(parsed.tables.layer.layers).toSorted();
  const missingLayers = REQUIRED_DXF_LAYERS.filter(
    (layer) => !layers.includes(layer),
  );
  if (missingLayers.length > 0) {
    throw new Error(
      `${showcaseId} DXF is missing layers: ${missingLayers.join(", ")}.`,
    );
  }
  const unknownEntityLayer = parsed.entities.find(
    (entity) => !REQUIRED_DXF_LAYER_SET.has(entity.layer),
  );
  if (unknownEntityLayer) {
    throw new Error(
      `${showcaseId} DXF entity uses unknown layer ${unknownEntityLayer.layer}.`,
    );
  }
  return { entityCount: parsed.entities.length, layers };
};

const validateFold = (
  showcaseId: string,
  artifact: FabricationExportArtifact,
): { readonly edgeCount: number; readonly faceCount: number } => {
  const graph = FOLD_GRAPH_SCHEMA.parse(JSON.parse(artifactText(artifact)));
  const populated = fold.convert.edges_vertices_to_faces_vertices(
    structuredClone(graph),
  );
  const edgeCount = fold.filter.numEdges(populated);
  const faceCount = fold.filter.numFaces(populated);
  if (edgeCount !== graph.edges_vertices.length || faceCount <= 0) {
    throw new Error(
      `${showcaseId} FOLD did not preserve ${graph.edges_vertices.length} edges or construct a bounded face in the official FOLD library.`,
    );
  }
  const assignedEdgeCount = ["B", "C", "F", "J", "M", "U", "V"].reduce(
    (count, assignment) =>
      count + fold.filter.edgesAssigned(populated, assignment).length,
    0,
  );
  if (assignedEdgeCount !== edgeCount) {
    throw new Error(
      `${showcaseId} FOLD assignments cover ${assignedEdgeCount} of ${edgeCount} edges.`,
    );
  }
  return { edgeCount, faceCount };
};

const showcases = createOfflineFabricationShowcases();
const results: ConsumerValidationResult[] = [];
let generatedFoldCount = 0;
for (const [index, showcase] of showcases.entries()) {
  const candidateId = `consumer-validation-${showcase.showcaseId}`;
  const candidate = buildFabricationCandidate({
    candidateId,
    intent: showcase.intent,
    program: showcase.program,
    rank: 1,
    selectionStatus: "selected",
    provenance: {
      compilerVersion: "foldforge-consumer-validation-v1",
      generatedAtIso: "2026-07-15T00:00:00.000Z",
      deterministicSeed: 20_260_714 + index,
      modelId: null,
      modelResponseId: null,
      parentCandidateId: null,
      appliedPatchIds: [],
      repairCycle: 0,
    },
  });
  if (!candidate.ok) throw new Error(JSON.stringify(candidate.error));
  const finalized = finalizeFabricationCandidate({
    candidate: candidate.value,
    requestedFormats: ["dxf", "glb", "fold"],
  });
  if (!finalized.ok) throw new Error(JSON.stringify(finalized.error));

  const glb = await validateGlb(
    showcase.showcaseId,
    artifactByFormat(finalized.value.artifacts, "glb"),
  );
  const dxf = validateDxf(
    showcase.showcaseId,
    artifactByFormat(finalized.value.artifacts, "dxf"),
  );
  const foldArtifact = finalized.value.artifacts.find(
    (artifact) => artifact.format === "fold",
  );
  const fold = foldArtifact
    ? validateFold(showcase.showcaseId, foldArtifact)
    : null;
  if (fold) generatedFoldCount += 1;
  if ((fold === null) !== (finalized.value.foldOmission !== null)) {
    throw new Error(
      `${showcase.showcaseId} FOLD artifact and omission status disagree.`,
    );
  }
  results.push({
    showcaseId: showcase.showcaseId,
    glb,
    dxf,
    fold,
    foldOmissionCode: finalized.value.foldOmission?.code ?? null,
  });
}

const foldShowcase = results.find((result) => result.fold !== null);
if (
  generatedFoldCount !== 1 ||
  foldShowcase?.showcaseId !== "faceted-duck-gift-box"
) {
  throw new Error(
    "Exactly the fold-only duck showcase must produce the lossless FOLD profile.",
  );
}

process.stdout.write(
  `${JSON.stringify({
    gltfValidatorVersion: gltfValidatorVersion(),
    dxfParserVersion: "1.1.2",
    foldLibraryVersion: "0.12.0",
    showcaseCount: results.length,
    generatedFoldCount,
    results,
  })}\n`,
);
