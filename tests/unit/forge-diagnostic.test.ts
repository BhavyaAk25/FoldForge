import { describe, expect, it } from "vitest";

import {
  compilationFailureDiagnostic,
  modelFailureDiagnostic,
} from "@/server/api/forge-diagnostic";
import { FabricationProgramModelError } from "@/server/fabrication-ai/plan-response";

describe("safe fabrication diagnostics", () => {
  it("preserves exact compile limit values", () => {
    expect(
      compilationFailureDiagnostic({
        kind: "limit_exceeded",
        limit: "intent.maximumJointAndConnectorCount",
        actual: 11,
        maximum: 7,
      }),
    ).toMatchObject({
      code: "PROGRAM_LIMIT_EXCEEDED",
      message:
        "The generated program uses 11 combined joints and connectors; the permitted maximum is 7. Limit: intent.maximumJointAndConnectorCount.",
      failureIds: [
        "compile.limit_exceeded",
        "compile.limit_exceeded#intent.maximumJointAndConnectorCount",
      ],
    });
  });

  it("preserves safe preflight limits at the program boundary", () => {
    const error = new FabricationProgramModelError(
      "invalid_plan",
      "private model detail",
      {
        phase: "expansion",
        code: "limit_exceeded",
        path: [],
        limit: {
          name: "intent.maximumPanels",
          actual: 8,
          maximum: 6,
        },
      },
    );

    expect(modelFailureDiagnostic("program", error)).toMatchObject({
      kind: "compilation",
      code: "PROGRAM_LIMIT_EXCEEDED",
      message:
        "The generated program uses 8 panels; the permitted maximum is 6. Limit: intent.maximumPanels.",
      modelCall: "attempted",
    });
  });
});
