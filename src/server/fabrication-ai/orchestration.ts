import { canonicalSerialize } from "@/core/canonical";
import {
  compileFabricationProgram,
  fabricationProgramHash,
} from "@/core/fabrication/compiler";
import { FABRICATION_LIMITS } from "@/core/fabrication/limits";
import { repairInputHash, applyProgramPatch } from "@/core/fabrication/repair";
import {
  FabricationIntentV1Schema,
  FabricationProgramV1Schema,
} from "@/core/fabrication/schemas";
import { fabricationIrHash } from "@/core/fabrication/compiler";
import type {
  FabricationIntentV1,
  FabricationIRV1,
  FabricationProgramV1,
  ProgramPatchV1,
  VerificationReportV2,
} from "@/core/fabrication/types";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import { sha256Hex } from "@/core/sha256";

import {
  DescribeFabricationRequestSchema,
  ProgramProposalV1Schema,
  type ProgramProposalV1,
} from "./contracts";
import type {
  FabricationIntentModel,
  FabricationProgramModel,
  FabricationRepairModel,
} from "./models";

export interface FabricationTraceEvent {
  readonly eventId: string;
  readonly sequence: number;
  readonly source: "AI" | "CODE";
  readonly operation:
    | "compile_intent"
    | "generate_program"
    | "compile_program"
    | "verify_candidate"
    | "diagnose_failure"
    | "apply_parameter_patch";
  readonly summary: string;
  readonly inputHash: string;
  readonly outputId: string | null;
}

export interface FabricationRepairCycle {
  readonly cycle: number;
  readonly inputHash: string;
  readonly beforeProgramHash: string;
  readonly patch: ProgramPatchV1;
  readonly afterProgramHash: string;
  readonly report: VerificationReportV2;
}

export type FabricationProgramOutcome =
  | {
      readonly status: "passed";
      readonly candidateId: string;
      readonly program: FabricationProgramV1;
      readonly ir: FabricationIRV1;
      readonly report: VerificationReportV2;
      readonly cycles: readonly FabricationRepairCycle[];
      readonly trace: readonly FabricationTraceEvent[];
    }
  | {
      readonly status: "infeasible";
      readonly candidateId: string;
      readonly program: FabricationProgramV1;
      readonly ir: FabricationIRV1 | null;
      readonly report: VerificationReportV2 | null;
      readonly cycles: readonly FabricationRepairCycle[];
      readonly trace: readonly FabricationTraceEvent[];
      readonly reason: string;
    };

export type ProgramGenerationOutcome =
  | {
      readonly status: "generated";
      readonly proposal: ProgramProposalV1;
      readonly structureFingerprint: string;
    }
  | {
      readonly status: "rejected";
      readonly proposal: ProgramProposalV1;
      readonly structureFingerprint: string;
      readonly reason: string;
    };

const traceEvent = (
  sequence: number,
  source: FabricationTraceEvent["source"],
  operation: FabricationTraceEvent["operation"],
  summary: string,
  inputHash: string,
  outputId: string | null,
): FabricationTraceEvent => ({
  eventId: `trace:${sha256Hex(
    canonicalSerialize({ sequence, source, operation, inputHash, outputId }),
  ).slice(0, 32)}`,
  sequence,
  source,
  operation,
  summary,
  inputHash,
  outputId,
});

const errorSummary = (error: unknown): string => {
  if (typeof error !== "object" || error === null) return "Compilation failed.";
  const kind = "kind" in error ? String(error.kind) : "compilation_error";
  if (kind === "contract_validation" && "issues" in error) {
    const issues = Array.isArray(error.issues) ? error.issues : [];
    const first = issues[0];
    if (typeof first === "object" && first !== null && "message" in first) {
      return `${kind}: ${String(first.message)}`;
    }
  }
  if ("reason" in error) return `${kind}: ${String(error.reason)}`;
  if ("referenceId" in error) {
    return `${kind}: unresolved ${String(error.referenceId)}`;
  }
  return kind;
};

export const programStructureFingerprint = (
  programInput: FabricationProgramV1,
): string => {
  const program = FabricationProgramV1Schema.parse(programInput);
  const panelIndex = new Map(
    program.blueprint.panels.map((panel, index) => [panel.panelId, index]),
  );
  const bodyIndex = new Map(
    program.blueprint.bodies.map((body, index) => [body.bodyId, index]),
  );
  const jointIndex = new Map(
    program.blueprint.joints.map((joint, index) => [joint.jointId, index]),
  );
  return sha256Hex(
    canonicalSerialize({
      behavior: program.behavior,
      panels: program.blueprint.panels.map((panel) => ({
        body: bodyIndex.get(panel.bodyId) ?? -1,
        role: panel.role,
        outerVertexCount: panel.contour.vertices.length,
        innerVertexCounts: panel.innerCutContours.map(
          (contour) => contour.vertices.length,
        ),
      })),
      bodies: program.blueprint.bodies.map((body) => ({
        grounded: body.grounded,
        panels: body.panelIds.map((panelId) => panelIndex.get(panelId) ?? -1),
      })),
      joints: program.blueprint.joints.map((joint) => ({
        kind: joint.kind,
        parent: bodyIndex.get(joint.parentBodyId) ?? -1,
        child: bodyIndex.get(joint.childBodyId) ?? -1,
      })),
      connectors: program.blueprint.connectors.map((connector) => ({
        kind: connector.kind,
        panel: panelIndex.get(connector.panelId) ?? -1,
      })),
      driver: program.blueprint.driver
        ? {
            control: program.blueprint.driver.control,
            joint: jointIndex.get(program.blueprint.driver.jointId) ?? -1,
          }
        : null,
      outputs: program.blueprint.outputs.map((output) => ({
        joint: jointIndex.get(output.jointId) ?? -1,
        body: bodyIndex.get(output.bodyId) ?? -1,
        unit: output.unit,
      })),
      couplings: program.blueprint.couplings.map((coupling) => coupling.kind),
      assemblyStrategy: program.assemblyStrategy,
    }),
  );
};

export const compileFabricationIntent = async (
  prompt: string,
  safetyIdentifier: string,
  model: FabricationIntentModel,
): Promise<{
  readonly intent: FabricationIntentV1;
  readonly trace: readonly FabricationTraceEvent[];
}> => {
  const request = DescribeFabricationRequestSchema.parse({ prompt });
  const inputHash = sha256Hex(canonicalSerialize(request));
  const intent = FabricationIntentV1Schema.parse(
    await model.compileIntent(request.prompt, safetyIdentifier),
  );
  return {
    intent,
    trace: [
      traceEvent(
        0,
        "AI",
        "compile_intent",
        "GPT-5.6 Sol translated the prompt into a strict fabrication intent.",
        inputHash,
        intent.intentId,
      ),
    ],
  };
};

export const generateDistinctFabricationPrograms = async (
  intentInput: FabricationIntentV1,
  safetyIdentifier: string,
  model: FabricationProgramModel,
  count = 3,
): Promise<readonly ProgramGenerationOutcome[]> => {
  const intent = FabricationIntentV1Schema.parse(intentInput);
  if (intent.scopeStatus !== "supported") return [];
  const boundedCount = Math.max(1, Math.min(3, Math.trunc(count)));
  const usedTopologyIds: string[] = [];
  const fingerprints = new Set<string>();
  const outcomes: ProgramGenerationOutcome[] = [];
  for (let ordinal = 1; ordinal <= boundedCount; ordinal += 1) {
    const proposal = ProgramProposalV1Schema.parse(
      await model.generateProgram(
        intent,
        ordinal,
        usedTopologyIds,
        safetyIdentifier,
      ),
    );
    const fingerprint = programStructureFingerprint(proposal.program);
    const repeatedTopology = usedTopologyIds.includes(
      proposal.program.topologyId,
    );
    const repeatedStructure = fingerprints.has(fingerprint);
    outcomes.push(
      repeatedTopology || repeatedStructure
        ? {
            status: "rejected",
            proposal,
            structureFingerprint: fingerprint,
            reason: repeatedTopology
              ? "The model repeated a topology identifier."
              : "The model repeated the same normalized structure.",
          }
        : {
            status: "generated",
            proposal,
            structureFingerprint: fingerprint,
          },
    );
    usedTopologyIds.push(proposal.program.topologyId);
    fingerprints.add(fingerprint);
  }
  return outcomes;
};

export const runFabricationRepairLoop = async (
  intentInput: FabricationIntentV1,
  initialProgramInput: FabricationProgramV1,
  candidateId: string,
  safetyIdentifier: string,
  model: FabricationRepairModel,
  maximumCycles: number = FABRICATION_LIMITS.maximumRepairCycles,
): Promise<FabricationProgramOutcome> => {
  const intent = FabricationIntentV1Schema.parse(intentInput);
  let program: FabricationProgramV1 =
    FabricationProgramV1Schema.parse(initialProgramInput);
  const cycles: FabricationRepairCycle[] = [];
  const trace: FabricationTraceEvent[] = [];
  const seenInputs = new Set<string>();
  const cycleLimit = Math.max(
    1,
    Math.min(FABRICATION_LIMITS.maximumRepairCycles, Math.trunc(maximumCycles)),
  );

  const evaluate = (): {
    readonly ir: FabricationIRV1 | null;
    readonly report: VerificationReportV2 | null;
    readonly error: string | null;
  } => {
    const compileHash = sha256Hex(canonicalSerialize({ intent, program }));
    const compiled = compileFabricationProgram(intent, program);
    trace.push(
      traceEvent(
        trace.length,
        "CODE",
        "compile_program",
        compiled.ok
          ? "Code compiled the strict program into canonical fabrication IR."
          : "Code rejected the program before geometry verification.",
        compileHash,
        compiled.ok ? compiled.value.irId : null,
      ),
    );
    if (!compiled.ok) {
      return { ir: null, report: null, error: errorSummary(compiled.error) };
    }
    const report = verifyFabricationIr(compiled.value, candidateId);
    trace.push(
      traceEvent(
        trace.length,
        "CODE",
        "verify_candidate",
        report.valid
          ? "Every deterministic hard verification stage passed."
          : `Verification stopped at ${report.failedAtStage ?? "an unknown stage"}.`,
        fabricationIrHash(compiled.value),
        report.reportId,
      ),
    );
    return { ir: compiled.value, report, error: null };
  };

  let evaluation = evaluate();
  if (evaluation.error || !evaluation.ir || !evaluation.report) {
    return {
      status: "infeasible",
      candidateId,
      program,
      ir: evaluation.ir,
      report: evaluation.report,
      cycles,
      trace,
      reason: evaluation.error ?? "Program compilation failed.",
    };
  }
  if (evaluation.report.valid) {
    return {
      status: "passed",
      candidateId,
      program,
      ir: evaluation.ir,
      report: evaluation.report,
      cycles,
      trace,
    };
  }

  for (let cycle = 1; cycle <= cycleLimit; cycle += 1) {
    const inputHash = repairInputHash(program, evaluation.report);
    if (seenInputs.has(inputHash)) {
      return {
        status: "infeasible",
        candidateId,
        program,
        ir: evaluation.ir,
        report: evaluation.report,
        cycles,
        trace,
        reason: "Duplicate canonical repair input was blocked.",
      };
    }
    seenInputs.add(inputHash);
    const patch = await model.diagnoseRepair(
      program,
      evaluation.report,
      cycle,
      safetyIdentifier,
    );
    if (!patch) {
      return {
        status: "infeasible",
        candidateId,
        program,
        ir: evaluation.ir,
        report: evaluation.report,
        cycles,
        trace,
        reason: "No report-grounded bounded repair was available.",
      };
    }
    trace.push(
      traceEvent(
        trace.length,
        "AI",
        "diagnose_failure",
        patch.diagnosis,
        inputHash,
        patch.patchId,
      ),
    );
    const beforeProgramHash = fabricationProgramHash(program);
    const applied = applyProgramPatch(program, patch, evaluation.report);
    if (!applied.ok) {
      return {
        status: "infeasible",
        candidateId,
        program,
        ir: evaluation.ir,
        report: evaluation.report,
        cycles,
        trace,
        reason: `Deterministic patch rejection: ${applied.error.id}.`,
      };
    }
    program = applied.value;
    const afterProgramHash = fabricationProgramHash(program);
    trace.push(
      traceEvent(
        trace.length,
        "CODE",
        "apply_parameter_patch",
        `Code applied ${patch.operations.length} bounded operation${patch.operations.length === 1 ? "" : "s"} and regenerated the entire design.`,
        sha256Hex(canonicalSerialize(patch)),
        afterProgramHash,
      ),
    );
    evaluation = evaluate();
    if (evaluation.error || !evaluation.ir || !evaluation.report) {
      return {
        status: "infeasible",
        candidateId,
        program,
        ir: evaluation.ir,
        report: evaluation.report,
        cycles,
        trace,
        reason: evaluation.error ?? "Patched program compilation failed.",
      };
    }
    cycles.push({
      cycle,
      inputHash,
      beforeProgramHash,
      patch,
      afterProgramHash,
      report: evaluation.report,
    });
    if (evaluation.report.valid) {
      return {
        status: "passed",
        candidateId,
        program,
        ir: evaluation.ir,
        report: evaluation.report,
        cycles,
        trace,
      };
    }
  }

  return {
    status: "infeasible",
    candidateId,
    program,
    ir: evaluation.ir,
    report: evaluation.report,
    cycles,
    trace,
    reason: `Repair exhausted the ${cycleLimit}-cycle limit.`,
  };
};
