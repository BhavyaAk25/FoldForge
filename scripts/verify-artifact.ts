import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { stableHash } from "../src/core/canonical";
import { exportFold, verifyFoldReference } from "../src/core/export/fold";
import { exportSvg, verifySvgScale } from "../src/core/export/svg";
import { buildStandGeometry } from "../src/core/geometry";
import {
  CandidateParametersSchema,
  DesignConstraintSchema,
} from "../src/core/schemas";
import type { Candidate } from "../src/core/types";
import { verifyCandidate } from "../src/core/verification";

const ManifestSchema = z
  .object({
    version: z.literal(1),
    fixture: z.literal("phone-letter-110lb"),
    seed: z.number().int(),
    constraint: DesignConstraintSchema,
    constraintHash: z.string().length(8),
    candidates: z.array(
      z
        .object({
          id: z.string().min(1),
          strategy: z.enum(["stable", "balanced", "compact"]),
          variant: z.number().int().min(0).max(2),
          parameters: CandidateParametersSchema,
          svgFile: z.string().min(1),
          foldFile: z.string().min(1),
          svgHash: z.string().length(8),
          foldHash: z.string().length(8),
        })
        .passthrough(),
    ),
    passingCandidateId: z.string().min(1),
    failingCandidateId: z.string().min(1),
    physicalStatus: z.literal("awaiting_user"),
  })
  .passthrough();

const manifestPath = process.argv
  .slice(2)
  .find((value) => value !== "--" && !value.startsWith("-"));
if (!manifestPath) throw new Error("Usage: verify-artifact <manifest.json>");

const absoluteManifestPath = path.resolve(manifestPath);
const directory = path.dirname(absoluteManifestPath);
const manifest = ManifestSchema.parse(
  JSON.parse(await readFile(absoluteManifestPath, "utf8")),
);

if (stableHash(manifest.constraint) !== manifest.constraintHash) {
  throw new Error("Constraint hash mismatch.");
}

const validity = new Map<string, boolean>();
for (const entry of manifest.candidates) {
  const [svg, fold] = await Promise.all([
    readFile(path.join(directory, entry.svgFile), "utf8"),
    readFile(path.join(directory, entry.foldFile), "utf8"),
  ]);
  if (
    stableHash(svg) !== entry.svgHash ||
    stableHash(fold) !== entry.foldHash
  ) {
    throw new Error(`Artifact hash mismatch for ${entry.id}.`);
  }

  const candidate: Candidate = {
    id: entry.id,
    strategy: entry.strategy,
    variant: entry.variant,
    seed: manifest.seed,
    parameters: entry.parameters,
    geometry: buildStandGeometry(entry.parameters),
  };
  if (
    svg !== exportSvg(candidate, manifest.constraint) ||
    fold !== exportFold(candidate) ||
    !verifySvgScale(svg, manifest.constraint, candidate).valid ||
    !verifyFoldReference(candidate, fold).valid
  ) {
    throw new Error(`Stored export is not source-equivalent for ${entry.id}.`);
  }
  validity.set(entry.id, verifyCandidate(candidate, manifest.constraint).valid);
}

if (validity.get(manifest.passingCandidateId) !== true) {
  throw new Error(
    "Declared passing candidate did not pass deterministic verification.",
  );
}
if (validity.get(manifest.failingCandidateId) !== false) {
  throw new Error(
    "Declared failing candidate did not fail deterministic verification.",
  );
}

process.stdout.write(
  `${JSON.stringify({
    verified: true,
    candidateCount: manifest.candidates.length,
    passingCandidateId: manifest.passingCandidateId,
    failingCandidateId: manifest.failingCandidateId,
    physicalStatus: manifest.physicalStatus,
  })}\n`,
);
