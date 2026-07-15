import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

import {
  compileFabricationProgram,
  fabricationProgramHash,
} from "@/core/fabrication/compiler";
import { scoreFabricationCandidate } from "@/core/fabrication/scoring";
import type {
  CandidateV2,
  ExportFormat,
  FabricationIntentV1,
  FabricationProgramV1,
} from "@/core/fabrication/types";
import { verifyFabricationIr } from "@/core/fabrication/verification";

import { fixtureIntent, fixtureProgram } from "../fixtures/fabrication";

interface StudioMockOptions {
  readonly duplicateSecondFingerprint?: boolean;
  readonly liveAiEnabled?: boolean;
  readonly malformedIntent?: boolean;
  readonly requireAccessOnce?: boolean;
}

interface ProgramRequestBody {
  readonly candidateOrdinal: number;
  readonly intent: FabricationIntentV1;
  readonly usedTopologyIds: readonly string[];
}

interface CompileRequestBody {
  readonly candidateId: string;
  readonly intent: FabricationIntentV1;
  readonly program: FabricationProgramV1;
}

interface RepairRequestBody extends CompileRequestBody {
  readonly repairCycle: number;
}

interface ExportRequest {
  readonly candidate: CandidateV2;
  readonly format: ExportFormat;
}

interface StudioMockState {
  readonly accessCodes: string[];
  readonly compileRequests: CompileRequestBody[];
  readonly endpointOrder: string[];
  readonly exportRequests: ExportRequest[];
  readonly intentPrompts: string[];
  readonly programRequests: ProgramRequestBody[];
  readonly repairRequests: RepairRequestBody[];
  readonly unexpectedPaths: string[];
}

const respondJson = (
  route: Route,
  json: unknown,
  status = 200,
): Promise<void> => route.fulfill({ status, json });

const programFor = (ordinal: number): FabricationProgramV1 => {
  const base = fixtureProgram();
  const labels = ["Direct fold", "Repaired narrow wing", "Wide fold"];
  const suffixes = ["a", "b", "c"];
  const panels = base.blueprint.panels.map((panel) => {
    if (panel.panelId === "panel-base") {
      return {
        ...panel,
        innerCutContours: [
          {
            vertices: [
              { u: 0.4, v: 0.4 },
              { u: 0.6, v: 0.4 },
              { u: 0.6, v: 0.6 },
              { u: 0.4, v: 0.6 },
            ],
          },
        ],
      };
    }
    return ordinal === 2 && panel.panelId === "panel-wing"
      ? { ...panel, widthMm: 0.5 }
      : panel;
  });
  return {
    ...base,
    programId: `program-winged-display-${suffixes[ordinal - 1]}`,
    candidateLabel: labels[ordinal - 1] ?? `Candidate ${ordinal}`,
    topologyId: `two-panel-fold-${suffixes[ordinal - 1]}`,
    blueprint: { ...base.blueprint, panels },
  };
};

const repairedProgram = (
  program: FabricationProgramV1,
): FabricationProgramV1 => ({
  ...program,
  blueprint: {
    ...program.blueprint,
    panels: program.blueprint.panels.map((panel) =>
      panel.panelId === "panel-wing" ? { ...panel, widthMm: 30 } : panel,
    ),
  },
});

const evaluateProgram = (body: CompileRequestBody) => {
  const compiled = compileFabricationProgram(body.intent, body.program);
  if (!compiled.ok) throw new Error("The E2E program fixture did not compile.");
  const report = verifyFabricationIr(compiled.value, body.candidateId);
  const score = scoreFabricationCandidate(compiled.value, report, body.intent);
  return {
    status: report.valid ? ("passed" as const) : ("invalid" as const),
    candidateId: body.candidateId,
    ir: compiled.value,
    report,
    score,
  };
};

const installStudioMocks = async (
  page: Page,
  options: StudioMockOptions = {},
): Promise<StudioMockState> => {
  const state: StudioMockState = {
    accessCodes: [],
    compileRequests: [],
    endpointOrder: [],
    exportRequests: [],
    intentPrompts: [],
    programRequests: [],
    repairRequests: [],
    unexpectedPaths: [],
  };
  const liveAiEnabled = options.liveAiEnabled ?? true;
  let deniedAccess = false;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === "/api/health") {
      state.endpointOrder.push("health");
      await respondJson(route, {
        status: "ok",
        service: "foldforge",
        liveAiEnabled,
        liveAiBlockReason: liveAiEnabled ? null : "disabled",
        buildSha: "e2e-mock",
      });
      return;
    }

    if (pathname === "/api/access") {
      const body = request.postDataJSON() as { readonly code: string };
      state.endpointOrder.push("access");
      state.accessCodes.push(body.code);
      await respondJson(route, { granted: true, required: true });
      return;
    }

    if (pathname === "/api/intent") {
      const body = request.postDataJSON() as { readonly prompt: string };
      state.intentPrompts.push(body.prompt);
      if (options.requireAccessOnce && !deniedAccess) {
        deniedAccess = true;
        state.endpointOrder.push("intent:access-required");
        await respondJson(
          route,
          {
            error: {
              code: "ACCESS_REQUIRED",
              message: "Studio access is required.",
              details: [],
            },
          },
          401,
        );
        return;
      }
      state.endpointOrder.push("intent");
      if (options.malformedIntent) {
        await respondJson(route, { scopeStatus: "supported" });
        return;
      }
      await respondJson(route, {
        ...fixtureIntent(),
        sourcePrompt: body.prompt,
      });
      return;
    }

    if (pathname === "/api/programs") {
      const body = request.postDataJSON() as ProgramRequestBody;
      state.programRequests.push(body);
      state.endpointOrder.push(`programs:${body.candidateOrdinal}`);
      const fingerprintOrdinal =
        options.duplicateSecondFingerprint && body.candidateOrdinal === 2
          ? 1
          : body.candidateOrdinal;
      await respondJson(route, {
        proposal: {
          diversityClaim: `Topology ${body.candidateOrdinal} uses a distinct panel program.`,
          program: programFor(body.candidateOrdinal),
        },
        programStructureFingerprint: String(fingerprintOrdinal).repeat(64),
      });
      return;
    }

    if (pathname === "/api/compile") {
      const body = request.postDataJSON() as CompileRequestBody;
      state.compileRequests.push(body);
      state.endpointOrder.push(`compile:${body.candidateId}`);
      await respondJson(route, evaluateProgram(body));
      return;
    }

    if (pathname === "/api/repair") {
      const body = request.postDataJSON() as RepairRequestBody;
      state.repairRequests.push(body);
      state.endpointOrder.push(
        `repair:${body.candidateId}:${body.repairCycle}`,
      );
      const program = repairedProgram(body.program);
      const evaluation = evaluateProgram({ ...body, program });
      if (evaluation.status !== "passed") {
        throw new Error("The E2E repair fixture remained invalid.");
      }
      await respondJson(route, {
        status: "passed",
        candidateId: body.candidateId,
        patch: {
          version: "1",
          patchId: `patch-wing-width-${body.repairCycle}`,
          programId: body.program.programId,
          baseProgramHash: fabricationProgramHash(body.program),
          repairCycle: body.repairCycle,
          diagnosis: "The wing edge is below the minimum feature size.",
          operations: [
            {
              operationId: "set-wing-width",
              path: "/blueprint/panels/panel-wing/widthMm",
              failureIds: ["geometry.minimum_feature#panel-wing"],
              reason: "Restore a cuttable wing width.",
              expectedEffect: "Clear the minimum-feature hard failure.",
              operation: "set_number",
              value: 30,
              expectedCurrentValue: 0.5,
              unit: "mm",
            },
          ],
          authoredBy: "ai",
          changesIntent: false,
        },
        program,
        ir: evaluation.ir,
        report: evaluation.report,
        score: evaluation.score,
      });
      return;
    }

    if (pathname === "/api/finalize") {
      const body = request.postDataJSON() as {
        readonly candidate: CandidateV2;
      };
      state.endpointOrder.push(`finalize:${body.candidate.candidateId}`);
      await respondJson(route, {
        narrative: {
          summary: "A compact, code-verified folding display.",
          mechanism: "The scored joint drives the wing through 90 degrees.",
          assemblySteps: [
            "Cut the perimeter and score the shared edge.",
            "Fold the wing slowly through its full range.",
          ],
          limitations: ["Use the specified 0.30 mm card stock."],
          sourceLabels: [
            { claim: "The fold travels 90 degrees.", source: "Calculated" },
          ],
        },
      });
      return;
    }

    if (pathname.startsWith("/api/export/")) {
      const format = pathname.split("/").at(-1) as ExportFormat;
      const body = request.postDataJSON() as {
        readonly candidate: CandidateV2;
      };
      state.endpointOrder.push(
        `export:${format}:${body.candidate.candidateId}`,
      );
      state.exportRequests.push({ format, candidate: body.candidate });
      await route.fulfill({
        status: 200,
        body:
          format === "svg"
            ? '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
            : `mock-${format}`,
        headers: {
          "Content-Disposition": `attachment; filename="foldforge-${body.candidate.candidateId}.${format}"`,
          "Content-Type": "application/octet-stream",
        },
      });
      return;
    }

    state.unexpectedPaths.push(pathname);
    await respondJson(
      route,
      { error: { code: "UNEXPECTED_API", message: pathname, details: [] } },
      500,
    );
  });

  return state;
};

test("runs access, sequential forge, real repair evidence, checkpoint, and exact exports", async ({
  page,
}) => {
  const state = await installStudioMocks(page, { requireAccessOnce: true });
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(
    page.getByText("Live generation ready", { exact: true }),
  ).toBeVisible();
  const prompt = page.getByLabel("What do you want to make?");
  await prompt.fill(
    "Build an arbitrary folding display with one moving cardstock wing.",
  );
  await page.getByRole("button", { name: "Create 3 designs" }).click();

  const access = page.getByLabel("Demo access code");
  await expect(access).toBeVisible();
  await expect(access).toBeFocused();
  await access.fill("e2e-secret");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByText("Access granted.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create 3 designs" }).click();

  await expect(
    page.getByRole("heading", { name: "Compare your designs." }),
  ).toBeFocused();
  await expect(page.getByTestId("candidate-card")).toHaveCount(3);
  await expect(page.getByTestId("fabrication-3d-preview")).toBeVisible();
  expect(state.programRequests.map((body) => body.usedTopologyIds)).toEqual([
    [],
    ["two-panel-fold-a"],
    ["two-panel-fold-a", "two-panel-fold-b"],
  ]);
  expect(state.endpointOrder.slice(0, 11)).toEqual([
    "health",
    "intent:access-required",
    "access",
    "intent",
    "programs:1",
    "compile:candidate-1-two-panel-fold-a",
    "programs:2",
    "compile:candidate-2-two-panel-fold-b",
    "repair:candidate-2-two-panel-fold-b:1",
    "programs:3",
    "compile:candidate-3-two-panel-fold-c",
  ]);
  expect(state.intentPrompts.at(-1)).toBe(
    "Build an arbitrary folding display with one moving cardstock wing.",
  );

  await page.getByTestId("candidate-card").nth(1).click();
  await expect(
    page.getByText("What FoldForge fixed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("geometry.minimum_feature#panel-wing", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("/blueprint/panels/panel-wing/widthMm", { exact: true }),
  ).toBeVisible();
  const verifier = page.locator("details").filter({
    hasText: "Technical checks",
  });
  await expect(verifier).not.toHaveAttribute("open", "");

  const assembledPreview = page.getByTestId("fabrication-3d-preview");
  await expect(assembledPreview).toBeVisible();
  const initialGeometrySignature = await assembledPreview.getAttribute(
    "data-state-signature",
  );
  await page.getByLabel("Open and close the design").fill("0.4");
  await expect(page.getByText("40%", { exact: true })).toBeVisible();
  await expect
    .poll(() => assembledPreview.getAttribute("data-state-signature"))
    .not.toBe(initialGeometrySignature);
  const initialRotation =
    await assembledPreview.getAttribute("data-rotation-deg");
  await page.getByRole("button", { name: "Rotate view right" }).click();
  await expect
    .poll(() => assembledPreview.getAttribute("data-rotation-deg"))
    .not.toBe(initialRotation);
  const initialPan = await assembledPreview.getAttribute("data-pan-x");
  await page.getByRole("button", { name: "Pan 3D view right" }).click();
  await expect
    .poll(() => assembledPreview.getAttribute("data-pan-x"))
    .not.toBe(initialPan);

  await page.getByRole("button", { name: "Cut-and-fold pattern" }).click();
  const patternPreview = page.getByRole("img", {
    name: /Repaired narrow wing pattern preview/iu,
  });
  await expect(patternPreview).toBeVisible();
  await expect(page.getByLabel("Open and close the design")).toHaveCount(0);
  await expect(page.getByLabel("3D view controls")).toHaveCount(0);
  const fittedViewBox = await patternPreview.getAttribute("viewBox");
  await page.getByRole("button", { name: "Zoom pattern in" }).click();
  await expect
    .poll(() => patternPreview.getAttribute("viewBox"))
    .not.toBe(fittedViewBox);
  await page.getByLabel("Cut lines").uncheck();
  await expect(page.getByTestId("pattern-cut-lines")).toHaveCount(0);
  await page.getByRole("button", { name: "Fit pattern" }).click();
  await expect(patternPreview).toHaveAttribute("viewBox", fittedViewBox ?? "");
  await expect(page.getByText("Pieces", { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: "Add plain-language build notes" })
    .click();
  await expect(
    page.getByText("A compact, code-verified folding display.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Use the specified 0.30 mm card stock.", { exact: true }),
  ).toBeVisible();

  for (const format of ["svg", "dxf", "glb", "json"] as const) {
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: `Download ${format.toUpperCase()}` })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`\\.${format}$`, "u"),
    );
    if (format === "svg") {
      const downloadPath = await download.path();
      expect(downloadPath).not.toBeNull();
      if (downloadPath) {
        expect(await readFile(downloadPath, "utf8")).toContain("<svg");
      }
    }
  }

  const unavailableFold = page.getByRole("button", {
    name: "FOLD unavailable",
  });
  await expect(unavailableFold).toBeDisabled();
  await expect(unavailableFold).toContainText(
    "Motion couplings cannot be represented losslessly",
  );

  expect(state.exportRequests.map((request) => request.format)).toEqual([
    "svg",
    "dxf",
    "glb",
    "json",
  ]);
  for (const request of state.exportRequests) {
    expect(request.candidate.candidateId).toBe("candidate-2-two-panel-fold-b");
    expect(request.candidate.selectionStatus).toBe("selected");
    expect(request.candidate.program.programId).toBe(
      "program-winged-display-b",
    );
    expect(request.candidate.provenance.appliedPatchIds).toEqual([
      "patch-wing-width-1",
    ]);
  }

  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("foldforge.studio.checkpoint.v4"),
      ),
    )
    .not.toBeNull();
  const checkpoint = await page.evaluate(() =>
    window.localStorage.getItem("foldforge.studio.checkpoint.v4"),
  );
  expect(checkpoint).not.toContain("e2e-secret");

  await page.reload();
  await expect(page.getByTestId("candidate-card")).toHaveCount(3);
  await expect(page.getByTestId("candidate-card").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByText("A compact, code-verified folding display.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(state.accessCodes).toEqual(["e2e-secret"]);
  expect(state.unexpectedPaths).toEqual([]);
  expect(consoleErrors.filter((entry) => !entry.includes("401"))).toEqual([]);
});

test("rejects duplicate program fingerprints before compile", async ({
  page,
}) => {
  const state = await installStudioMocks(page, {
    duplicateSecondFingerprint: true,
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Create 3 designs" }).click();
  await expect(page.getByTestId("candidate-card")).toHaveCount(2);
  expect(state.compileRequests.map((request) => request.candidateId)).toEqual([
    "candidate-1-two-panel-fold-a",
    "candidate-3-two-panel-fold-c",
  ]);
  expect(state.repairRequests).toEqual([]);
});

test("keeps prompt examples honest and provides a saved result when live generation is off", async ({
  page,
}) => {
  const state = await installStudioMocks(page, { liveAiEnabled: false });
  await page.goto("/");
  const prompt = page.getByLabel("What do you want to make?");
  await prompt.fill("A completely arbitrary paper mechanism.");
  const flowerExample = page.locator("article").filter({
    hasText: "Pop-up flower card",
  });
  await flowerExample.getByRole("button", { name: "Use this prompt" }).click();
  await expect(prompt).toBeFocused();
  await expect(prompt).toHaveValue(
    "Make a birthday card from one sheet of cardstock. When the card opens, a simple five-petal flower should rise from the center. It should fold flat again when the card closes. The finished card should fit inside an A6 envelope. Show me three buildable designs.",
  );
  await expect(
    page.getByRole("button", { name: "Create 3 designs" }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "Live generation is currently unavailable. You can still explore saved examples.",
      { exact: true },
    ),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Explore a finished example" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Explore the pop-up flower card." }),
  ).toBeFocused();
  await expect(page.getByTestId("candidate-card")).toHaveCount(1);
  await expect(
    page.getByText("This example is not a response to your current prompt.", {
      exact: false,
    }),
  ).toBeVisible();
  const savedAssembledPreview = page.getByTestId("fabrication-3d-preview");
  const savedInitialSignature = await savedAssembledPreview.getAttribute(
    "data-state-signature",
  );
  await page.getByLabel("Open and close the design").fill("0.4");
  await expect(page.getByText("40%", { exact: true })).toBeVisible();
  await expect
    .poll(() => savedAssembledPreview.getAttribute("data-state-signature"))
    .not.toBe(savedInitialSignature);
  await page.getByRole("button", { name: "Reset view" }).click();
  await expect(savedAssembledPreview).toHaveAttribute(
    "data-rotation-deg",
    "-18",
  );
  await page.getByRole("button", { name: "Cut-and-fold pattern" }).click();
  const savedPatternPreview = page.getByRole("img", {
    name: /Pop-up flower card pattern preview/iu,
  });
  await expect(savedPatternPreview).toBeVisible();
  await expect(page.getByLabel("Open and close the design")).toHaveCount(0);
  await expect(page.getByLabel("Pattern view controls")).toBeVisible();
  const savedFittedViewBox = await savedPatternPreview.getAttribute("viewBox");
  await page.getByRole("button", { name: "Pan pattern right" }).click();
  await expect
    .poll(() => savedPatternPreview.getAttribute("viewBox"))
    .not.toBe(savedFittedViewBox);
  const savedUnavailableFold = page.getByRole("button", {
    name: "FOLD unavailable",
  });
  await expect(savedUnavailableFold).toBeDisabled();
  await expect(savedUnavailableFold).toContainText(
    "Revolute and prismatic joints cannot be represented losslessly",
  );

  const savedDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download SVG" }).click();
  const savedDownload = await savedDownloadPromise;
  expect(savedDownload.suggestedFilename()).toMatch(/\.svg$/u);
  expect(state.exportRequests.map((request) => request.format)).toEqual([
    "svg",
  ]);
  expect(state.intentPrompts).toEqual([]);
});

test("fails safely on malformed strict API data", async ({ page }) => {
  await installStudioMocks(page, { malformedIntent: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Create 3 designs" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "could not be checked safely",
    }),
  ).toContainText("could not be checked safely");
  await expect(
    page.getByRole("heading", {
      name: "Turn an idea into a buildable paper design.",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("candidate-card")).toHaveCount(0);
});

test("has no horizontal overflow with results at required widths", async ({
  page,
}) => {
  await installStudioMocks(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Create 3 designs" }).click();
  await expect(page.getByTestId("candidate-card")).toHaveCount(3);

  for (const width of [390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const dimensions = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      rootScrollWidth: document.documentElement.scrollWidth,
    }));
    expect(
      dimensions.rootScrollWidth,
      `root overflow at ${width}px`,
    ).toBeLessThanOrEqual(dimensions.clientWidth);
    expect(
      dimensions.bodyScrollWidth,
      `body overflow at ${width}px`,
    ).toBeLessThanOrEqual(dimensions.clientWidth);
  }
});

test("supports keyboard focus and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installStudioMocks(page);
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to studio" }),
  ).toBeFocused();
  const prompt = page.getByLabel("What do you want to make?");
  await prompt.focus();
  expect(
    await prompt.evaluate((element) => getComputedStyle(element).outlineWidth),
  ).not.toBe("0px");
  const duckExample = page.locator("article").filter({
    hasText: "Duck-shaped gift box",
  });
  const duckPromptButton = duckExample.getByRole("button", {
    name: "Use this prompt",
  });
  await duckPromptButton.focus();
  await page.keyboard.press("Enter");
  await expect(prompt).toHaveValue(
    "Make a small duck-shaped gift box from cardstock. It should hold a small present and look like a simple duck when assembled. Add a lid that opens from the back. Use no more than two sheets and avoid glue where possible. Show me three different designs.",
  );

  const styles = await page.evaluate(() => {
    const button = document.querySelector("button");
    return {
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      transitionDuration: button
        ? getComputedStyle(button).transitionDuration
        : "missing",
    };
  });
  expect(styles.scrollBehavior).toBe("auto");
  expect(Number.parseFloat(styles.transitionDuration)).toBeLessThanOrEqual(
    0.00001,
  );
});

test("has no serious accessibility violations before or after forging", async ({
  page,
}) => {
  await installStudioMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const seriousViolations = async () => {
    const result = await new AxeBuilder({ page }).analyze();
    return result.violations.filter(
      (violation) =>
        violation.impact === "critical" || violation.impact === "serious",
    );
  };

  expect(await seriousViolations()).toEqual([]);

  await page.getByRole("button", { name: "Create 3 designs" }).click();
  await expect(page.getByTestId("candidate-card")).toHaveCount(3);
  expect(await seriousViolations()).toEqual([]);
});
