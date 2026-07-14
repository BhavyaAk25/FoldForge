import { stableHash } from "@/core/canonical";
import { PRODUCT_LIMITS, TOPOLOGY } from "@/core/constants";
import { buildStandGeometry } from "@/core/geometry";
import { clamp, round } from "@/core/math";
import { applyParameterPatch, repairInputHash } from "@/core/repair";
import type {
  CandidateParameters,
  DesignConstraint,
  ParameterPatch,
} from "@/core/schemas";
import type { Candidate, TraceEvent, VerificationReport } from "@/core/types";
import { verifyCandidate } from "@/core/verification";
import type {
  RepairDiagnosisInput,
  RepairDiagnosisModel,
} from "@/server/ai/repair";

export interface RepairCycle {
  readonly cycle: number;
  readonly inputHash: string;
  readonly beforeCandidateId: string;
  readonly patch: ParameterPatch;
  readonly afterCandidate: Candidate;
  readonly report: VerificationReport;
}

export type RepairLoopOutcome =
  | {
      readonly status: "passed";
      readonly candidate: Candidate;
      readonly report: VerificationReport;
      readonly cycles: readonly RepairCycle[];
      readonly trace: readonly TraceEvent[];
    }
  | {
      readonly status: "infeasible";
      readonly candidate: Candidate;
      readonly report: VerificationReport;
      readonly cycles: readonly RepairCycle[];
      readonly trace: readonly TraceEvent[];
      readonly reason: string;
    };

export interface RepairLoopOptions {
  readonly maximumCycles?: number;
  readonly now?: () => string;
}

const traceEvent = (
  sequence: number,
  now: () => string,
  source: TraceEvent["source"],
  kind: string,
  summary: string,
  inputHash: string,
  candidateId: string | null,
): TraceEvent => ({
  id: `trace-${sequence}-${stableHash({ source, kind, inputHash, candidateId })}`,
  timestamp: now(),
  source,
  kind,
  summary,
  inputHash,
  candidateId,
});

const hardFailure = (report: VerificationReport): string | null =>
  report.hardFailures[0] ?? null;

export class RuleBasedRepairDiagnosisModel implements RepairDiagnosisModel {
  async diagnose(
    input: RepairDiagnosisInput,
    _safetyId: string,
  ): Promise<ParameterPatch | null> {
    const failure = hardFailure(input.report);
    if (!failure) return null;
    const operation = (
      parameter: ParameterPatch["operations"][number]["parameter"],
      value: number,
      expectedEffect: string,
    ): ParameterPatch => ({
      operations: [
        {
          operation: "set",
          parameter,
          value: round(value, 3),
          unit: parameter === "backrestAngleDeg" ? "deg" : "mm",
          verificationId: failure,
          reason: `Deterministic offline repair for ${failure}.`,
          expectedEffect,
          affectedConstraint: failure,
        },
      ],
    });
    const parameters = input.parameters;

    switch (failure) {
      case "geometry.rear_run": {
        const currentRearRun = Number(
          input.report.checks.find((check) => check.id === failure)?.actual ??
            0,
        );
        return operation(
          "baseDepthMm",
          clamp(
            parameters.baseDepthMm +
              (TOPOLOGY.minimumRearRunMm - currentRearRun) +
              3,
            45,
            130,
          ),
          "Increase the measured rear run above the 12 mm minimum.",
        );
      }
      case "sheet.bounds":
      case "sheet.margin":
        return operation(
          "backrestRiseMm",
          clamp(parameters.backrestRiseMm - 10, 35, 90),
          "Shorten the continuous strip so it fits inside the printable sheet.",
        );
      case "feature.minimum":
        return operation(
          "standWidthMm",
          clamp(parameters.standWidthMm + 20, 60, 160),
          "Increase the paper bridge between the two slots.",
        );
      case "retention.lip": {
        const required = Number(
          input.report.checks
            .find((check) => check.id === failure)
            ?.expected.match(/[\d.]+/)?.[0] ?? 18,
        );
        return operation(
          "lipHeightMm",
          clamp(required + 0.02, 8, 18),
          "Meet the report's device-depth retention height.",
        );
      }
      case "retention.toe": {
        const required = Number(
          input.report.checks
            .find((check) => check.id === failure)
            ?.expected.match(/[\d.]+/)?.[0] ?? 22,
        );
        if (required > 22) return null;
        return operation(
          "frontToeDepthMm",
          clamp(required + 0.02, 7, 22),
          "Meet the measured device-depth projection plus toe clearance.",
        );
      }
      case "angle.target":
        return operation(
          "backrestAngleDeg",
          input.constraint.targetViewingAngleDeg,
          "Bring the backrest angle to the requested target.",
        );
      case "fold.intersections":
        return operation(
          "lipHeightMm",
          clamp(parameters.lipHeightMm - 2, 8, 18),
          "Create deployment clearance between the lip and structural panels.",
        );
      case "contact.nominal":
        return operation(
          "backrestRiseMm",
          clamp(parameters.backrestRiseMm + 15, 35, 90),
          "Increase nominal backrest overlap with the device.",
        );
      case "stability.support_polygon": {
        if (input.report.frontStabilityMarginMm < 0) {
          return operation(
            "frontToeDepthMm",
            clamp(
              parameters.frontToeDepthMm -
                input.report.frontStabilityMarginMm +
                2,
              7,
              22,
            ),
            "Move the device centre projection behind the front reserve.",
          );
        }
        if (input.report.rearStabilityMarginMm < 0) {
          return operation(
            "baseDepthMm",
            clamp(
              parameters.baseDepthMm - input.report.rearStabilityMarginMm + 3,
              45,
              130,
            ),
            "Extend the rear support reserve behind the centre projection.",
          );
        }
        return operation(
          "standWidthMm",
          clamp(
            parameters.standWidthMm - input.report.sideStabilityMarginMm + 3,
            60,
            160,
          ),
          "Increase the side support reserve.",
        );
      }
      default:
        return null;
    }
  }
}

export const runRepairLoop = async (
  initialCandidate: Candidate,
  constraint: DesignConstraint,
  diagnosisModel: RepairDiagnosisModel,
  safetyId: string,
  options: RepairLoopOptions = {},
): Promise<RepairLoopOutcome> => {
  const maximumCycles = Math.min(
    PRODUCT_LIMITS.maximumRepairCycles,
    Math.max(1, options.maximumCycles ?? PRODUCT_LIMITS.maximumRepairCycles),
  );
  const now = options.now ?? (() => new Date().toISOString());
  const cycles: RepairCycle[] = [];
  const trace: TraceEvent[] = [];
  const seenInputs = new Set<string>();
  let candidate = initialCandidate;
  let report = verifyCandidate(candidate, constraint);

  trace.push(
    traceEvent(
      trace.length,
      now,
      "CODE",
      "verify_candidate",
      report.valid
        ? "Candidate passed every deterministic hard check."
        : `Candidate failed ${report.hardFailures.join(", ")}.`,
      repairInputHash(candidate.parameters, report),
      candidate.id,
    ),
  );

  if (report.valid)
    return { status: "passed", candidate, report, cycles, trace };

  for (let cycle = 1; cycle <= maximumCycles; cycle += 1) {
    const inputHash = repairInputHash(candidate.parameters, report);
    if (seenInputs.has(inputHash)) {
      return {
        status: "infeasible",
        candidate,
        report,
        cycles,
        trace,
        reason: "Duplicate canonical diagnosis input was blocked.",
      };
    }
    seenInputs.add(inputHash);

    const patch = await diagnosisModel.diagnose(
      { parameters: candidate.parameters, constraint, report },
      safetyId,
    );
    if (!patch) {
      return {
        status: "infeasible",
        candidate,
        report,
        cycles,
        trace,
        reason: `No bounded numeric repair is available for ${hardFailure(report) ?? "the report"}.`,
      };
    }

    trace.push(
      traceEvent(
        trace.length,
        now,
        diagnosisModel instanceof RuleBasedRepairDiagnosisModel ? "CODE" : "AI",
        "diagnose_failure",
        patch.operations.map((operation) => operation.reason).join(" "),
        inputHash,
        candidate.id,
      ),
    );
    const applied = applyParameterPatch(candidate.parameters, patch, report);
    if (!applied.ok) {
      return {
        status: "infeasible",
        candidate,
        report,
        cycles,
        trace,
        reason: `Rejected patch: ${applied.error.message}`,
      };
    }

    const nextParameters: CandidateParameters = applied.value;
    const nextId = `${initialCandidate.id}-r${cycle}-${stableHash(nextParameters)}`;
    candidate = {
      ...candidate,
      id: nextId,
      parameters: nextParameters,
      geometry: buildStandGeometry(nextParameters),
    };
    report = verifyCandidate(candidate, constraint);
    cycles.push({
      cycle,
      inputHash,
      beforeCandidateId:
        cycles.at(-1)?.afterCandidate.id ?? initialCandidate.id,
      patch,
      afterCandidate: candidate,
      report,
    });
    trace.push(
      traceEvent(
        trace.length,
        now,
        "CODE",
        "apply_parameter_patch",
        `Applied ${patch.operations.length} bounded operation${patch.operations.length === 1 ? "" : "s"}; regenerated all geometry.`,
        stableHash(patch),
        candidate.id,
      ),
      traceEvent(
        trace.length + 1,
        now,
        "CODE",
        "verify_candidate",
        report.valid
          ? "Regenerated candidate passed every deterministic hard check."
          : `Regenerated candidate failed ${report.hardFailures.join(", ")}.`,
        repairInputHash(candidate.parameters, report),
        candidate.id,
      ),
    );

    if (report.valid)
      return { status: "passed", candidate, report, cycles, trace };
  }

  return {
    status: "infeasible",
    candidate,
    report,
    cycles,
    trace,
    reason: `Repair exhausted the ${maximumCycles}-cycle limit.`,
  };
};
