import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildFabricationCandidate,
  finalizeFabricationCandidate,
} from "../src/core/fabrication/candidate";
import type { CandidateV2, ExportFormat } from "../src/core/fabrication/types";
import { sha256Hex } from "../src/core/sha256";
import {
  FOLDFORGE_MODEL,
  OpenAIFabricationIntentModel,
  OpenAIFabricationNarrativeModel,
  OpenAIFabricationProgramModel,
  OpenAIFabricationRepairModel,
} from "../src/server/fabrication-ai/models";
import {
  generateDistinctFabricationPrograms,
  runFabricationRepairLoop,
} from "../src/server/fabrication-ai/orchestration";

const LIVE_CASES = [
  {
    caseId: "live-organizer",
    prompt:
      "Make a two-sheet desk organizer 210 mm wide, 110 mm high, and 95 mm deep. Pull the front tray 70 mm to open two mirrored side wings. Use 0.4 mm cardstock, allow cuts, and use no glue.",
  },
  {
    caseId: "live-popup-sign",
    prompt:
      "Design a one-sheet counter sign 160 mm wide, 120 mm high, and 45 mm deep. It must fold flat and open to rotate a 90 mm display panel by 65 degrees. Use 0.5 mm card, cuts allowed, no glue.",
  },
  {
    caseId: "live-sample-sorter",
    prompt:
      "Create a two-sheet sample sorter 190 mm wide, 80 mm high, and 120 mm deep. Sliding a 60 mm front control must separate three rigid trays without glue. Use 0.6 mm board and allow cuts.",
  },
  {
    caseId: "live-tabbed-box",
    prompt:
      "Make a one-sheet tab-locked box 120 mm wide, 75 mm high, and 55 mm deep. It is static, uses 0.4 mm cardstock, allows cuts, and must assemble without glue.",
  },
  {
    caseId: "live-expanding-display",
    prompt:
      "Build a two-sheet tabletop display 180 mm wide, 130 mm high, and 70 mm deep. A 50 mm pull tab must expand two mirrored side panels by 45 mm and collapse them flat. Use 0.5 mm card, allow cuts, no glue.",
  },
] as const;

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
};

const requestedCountValue = Number(argument("--cases") ?? LIVE_CASES.length);
if (!Number.isInteger(requestedCountValue)) {
  throw new Error("--cases must be an integer.");
}
const requestedCount = Math.max(
  1,
  Math.min(LIVE_CASES.length, requestedCountValue),
);
const selectedCases = LIVE_CASES.slice(0, requestedCount);
const reportPath = path.resolve("artifacts/evals/live-readiness.json");
const runStartedIso = new Date().toISOString();
const liveEnabled =
  process.env.ENABLE_LIVE_OPENAI === "true" &&
  process.env.ENABLE_LIVE_OPENAI_EVALS === "true" &&
  process.env.LIVE_MODEL_KILL_SWITCH !== "true";

const writeReport = async (report: unknown): Promise<void> => {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report)}\n`);
};

if (!liveEnabled) {
  await writeReport({
    reportVersion: 1,
    mode: "gpt-5.6-sol-live-readiness",
    model: FOLDFORGE_MODEL,
    liveStatus: "blocked-user-enable-required",
    evidenceBoundary: "No model request was made.",
    caseCount: selectedCases.length,
    passed: false,
  });
} else {
  const safetyIdentifier = `ff_live_eval_${randomBytes(16).toString("hex")}`;
  const intentModel = new OpenAIFabricationIntentModel();
  const programModel = new OpenAIFabricationProgramModel();
  const repairModel = new OpenAIFabricationRepairModel();
  const narrativeModel = new OpenAIFabricationNarrativeModel();
  const requestedFormats = [
    "svg",
    "dxf",
    "glb",
    "json",
    "fold",
  ] as const satisfies readonly ExportFormat[];
  const results = [];

  for (const liveCase of selectedCases) {
    const startedAt = performance.now();
    try {
      const intent = await intentModel.compileIntent(
        liveCase.prompt,
        safetyIdentifier,
      );
      if (intent.scopeStatus !== "supported") {
        results.push({
          caseId: liveCase.caseId,
          status: "failed",
          failureCode: `intent_${intent.scopeStatus}`,
          durationMs: Number((performance.now() - startedAt).toFixed(3)),
        });
        continue;
      }

      const proposals = await generateDistinctFabricationPrograms(
        intent,
        safetyIdentifier,
        programModel,
        3,
      );
      const generated = proposals.filter(
        (proposal) => proposal.status === "generated",
      );
      const verified: Array<{
        readonly candidate: CandidateV2;
        readonly repaired: boolean;
      }> = [];

      for (const [index, proposal] of generated.entries()) {
        const candidateId = `live:${liveCase.caseId}:${index + 1}`;
        const outcome = await runFabricationRepairLoop(
          intent,
          proposal.proposal.program,
          candidateId,
          safetyIdentifier,
          repairModel,
        );
        if (outcome.status !== "passed") continue;
        const candidate = buildFabricationCandidate({
          candidateId,
          intent,
          program: outcome.program,
          selectionStatus: "eligible",
          provenance: {
            compilerVersion: "foldforge-fabrication-v1",
            generatedAtIso: runStartedIso,
            deterministicSeed: 20_260_714 + index,
            modelId: FOLDFORGE_MODEL,
            modelResponseId: null,
            parentCandidateId: null,
            appliedPatchIds: outcome.cycles.map((cycle) => cycle.patch.patchId),
            repairCycle: outcome.cycles.length,
          },
        });
        if (candidate.ok) {
          verified.push({
            candidate: candidate.value,
            repaired: outcome.cycles.length > 0,
          });
        }
      }

      verified.sort(
        (left, right) =>
          (right.candidate.score.totalScore ?? 0) -
          (left.candidate.score.totalScore ?? 0),
      );
      const winner = verified[0];
      if (!winner || verified.length !== 3 || generated.length !== 3) {
        results.push({
          caseId: liveCase.caseId,
          status: "failed",
          failureCode: "three_verified_distinct_candidates_required",
          generatedCandidateCount: generated.length,
          verifiedCandidateCount: verified.length,
          durationMs: Number((performance.now() - startedAt).toFixed(3)),
        });
        continue;
      }

      const selected = buildFabricationCandidate({
        candidateId: winner.candidate.candidateId,
        intent,
        program: winner.candidate.program,
        rank: 1,
        selectionStatus: "selected",
        provenance: {
          compilerVersion: winner.candidate.provenance.compilerVersion,
          generatedAtIso: winner.candidate.provenance.generatedAtIso,
          deterministicSeed: winner.candidate.provenance.deterministicSeed,
          modelId: winner.candidate.provenance.modelId,
          modelResponseId: winner.candidate.provenance.modelResponseId,
          parentCandidateId: winner.candidate.provenance.parentCandidateId,
          appliedPatchIds: winner.candidate.provenance.appliedPatchIds,
          repairCycle: winner.candidate.provenance.repairCycle,
        },
      });
      if (!selected.ok) {
        throw new Error("selected_candidate_binding_failed");
      }
      const finalized = finalizeFabricationCandidate({
        candidate: selected.value,
        requestedFormats,
      });
      if (!finalized.ok) throw new Error("export_equivalence_failed");
      await narrativeModel.generateNarrative(
        finalized.value.candidate,
        safetyIdentifier,
      );

      results.push({
        caseId: liveCase.caseId,
        status: "passed",
        promptHash: sha256Hex(liveCase.prompt),
        generatedCandidateCount: generated.length,
        verifiedCandidateCount: verified.length,
        repairedCandidateCount: verified.filter((item) => item.repaired).length,
        selectedCandidateId: finalized.value.candidate.candidateId,
        selectedIrHash: finalized.value.candidate.verification.irHash,
        selectedScore: finalized.value.candidate.score.totalScore,
        exportFormats: finalized.value.artifacts.map(
          (artifact) => artifact.format,
        ),
        foldStatus: finalized.value.foldOmission ? "omitted" : "generated",
        sourceEquivalent:
          finalized.value.candidate.exportMetadata.sourceEquivalent,
        narrativeSchemaValid: true,
        durationMs: Number((performance.now() - startedAt).toFixed(3)),
      });
    } catch {
      results.push({
        caseId: liveCase.caseId,
        status: "failed",
        failureCode: "live_pipeline_error",
        durationMs: Number((performance.now() - startedAt).toFixed(3)),
      });
    }
  }

  const passedCount = results.filter(
    (result) => result.status === "passed",
  ).length;
  const passed = passedCount >= Math.ceil(selectedCases.length * 0.8);
  await writeReport({
    reportVersion: 1,
    mode: "gpt-5.6-sol-live-readiness",
    model: FOLDFORGE_MODEL,
    liveStatus: "run",
    evidenceBoundary:
      "Live model evidence; prompts and model responses are not stored in the report.",
    runStartedIso,
    caseCount: selectedCases.length,
    passedCount,
    requiredPassedCount: Math.ceil(selectedCases.length * 0.8),
    results,
    passed,
  });
  if (!passed) process.exitCode = 1;
}
