import { describe, expect, it } from "vitest";

import { compileFabricationProgram } from "@/core/fabrication/compiler";
import { evaluateMotionState } from "@/core/fabrication/kinematics";
import {
  expandFabricationPlan,
  fabricationPlanFromProgram,
} from "@/core/fabrication/planning";
import { normalizeFoldOnlyPlan } from "@/core/fabrication/plan-normalization";
import { transformPoint2 } from "@/core/fabrication/polygon";
import { verifyFabricationIr } from "@/core/fabrication/verification";
import { fixtureIntent, fixtureProgram } from "../../fixtures/fabrication";

describe("fold-only plan normalization", () => {
  it("derives a non-flat home state for a static 30 mm deep fold", () => {
    const sourceIntent = fixtureIntent();
    const intent = {
      ...sourceIntent,
      intentId: "intent-static-folded-depth",
      behavior: "static" as const,
      requestedSize: { widthMm: 70, heightMm: 95, depthMm: 30 },
    };
    const source = fabricationPlanFromProgram(fixtureProgram());
    const plan = {
      ...source,
      candidateLabel: "Static folded depth",
      topologyId: "static-right-angle-fold",
      panels: source.panels.map((panel, index) => ({
        ...panel,
        widthMm: index === 0 ? 70 : 30,
        heightMm: 95,
        flatTransform: {
          translationMm: { xMm: 5, yMm: 5 },
          rotationDeg: 17,
        },
      })),
      bodies: source.bodies.map((body) => ({
        ...body,
        initialTransform: {
          translationMm: { xMm: 0, yMm: 0, zMm: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        },
      })),
      joints: source.joints.map((joint) =>
        joint.kind === "fold"
          ? {
              ...joint,
              axis: {
                startMm: { xMm: 1, yMm: 2, zMm: 0 },
                endMm: { xMm: 3, yMm: 4, zMm: 0 },
              },
              homeAngleDeg: 90,
              minAngleDeg: 90,
              maxAngleDeg: 90,
            }
          : joint,
      ),
      driver: null,
      outputs: [],
      couplings: [],
    };

    const expanded = expandFabricationPlan(intent, plan, 1);
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return;
    const movingBody = expanded.value.blueprint.bodies.find(
      (body) => body.bodyId === "body-wing",
    );
    expect(movingBody?.initialTransform.rotation.w).toBeCloseTo(
      Math.SQRT1_2,
      9,
    );
    const compatiblePlan = fabricationPlanFromProgram(expanded.value);
    const renormalized = normalizeFoldOnlyPlan(
      {
        ...compatiblePlan,
        bodies: compatiblePlan.bodies.map((body) => ({
          ...body,
          initialTransform: {
            translationMm: { xMm: 0, yMm: 0, zMm: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
        })),
      },
      intent.stockOptions,
      intent.requestedSize,
    );
    expect(renormalized.ok).toBe(true);
    if (!renormalized.ok) return;
    expect(
      renormalized.value.bodies.find((body) => body.bodyId === "body-wing")
        ?.initialTransform.rotation.w,
    ).toBeCloseTo(Math.SQRT1_2, 9);

    const compiled = compileFabricationProgram(intent, expanded.value);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const state = evaluateMotionState(compiled.value);
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    const vertices = Object.values(state.value.panelVertices).flat();
    const depthMm =
      Math.max(...vertices.map((point) => point.zMm)) -
      Math.min(...vertices.map((point) => point.zMm));
    expect(depthMm).toBeCloseTo(30, 6);

    const report = verifyFabricationIr(compiled.value, "candidate-static-fold");
    expect(report.valid).toBe(true);
    expect(
      report.failures.find(
        (failure) => failure.failureId === "semantics.requested_size#depth",
      ),
    ).toBeUndefined();
  });

  it("selects the planar net that matches the requested swept envelope", () => {
    const intent = fixtureIntent();
    const source = fabricationPlanFromProgram(fixtureProgram());
    const expanded = expandFabricationPlan(
      intent,
      {
        ...source,
        panels: source.panels.map((panel) => ({
          ...panel,
          flatTransform: {
            translationMm: { xMm: 5, yMm: 5 },
            rotationDeg: 17,
          },
        })),
        joints: source.joints.map((joint) =>
          joint.kind === "fold"
            ? {
                ...joint,
                axis: {
                  startMm: { xMm: 1, yMm: 2, zMm: 0 },
                  endMm: { xMm: 3, yMm: 4, zMm: 0 },
                },
              }
            : joint,
        ),
      },
      1,
    );

    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return;
    const compiled = compileFabricationProgram(intent, expanded.value);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const homeState = evaluateMotionState(compiled.value, 0);
    expect(homeState.ok).toBe(true);
    if (!homeState.ok) return;
    expect(
      Math.max(
        ...Object.values(homeState.value.panelVertices)
          .flat()
          .map((point) => Math.abs(point.zMm)),
      ),
    ).toBeCloseTo(0, 9);
    const openState = evaluateMotionState(compiled.value, 90);
    expect(openState.ok).toBe(true);
    if (!openState.ok) return;
    const openVertices = Object.values(openState.value.panelVertices).flat();
    expect(
      Math.max(...openVertices.map((point) => point.zMm)) -
        Math.min(...openVertices.map((point) => point.zMm)),
    ).toBeCloseTo(30, 6);
    const report = verifyFabricationIr(
      compiled.value,
      "candidate-requested-envelope",
    );
    expect(report.valid).toBe(true);
    expect(
      report.metrics
        .filter((metric) => metric.metricId.startsWith("requested_size_"))
        .map((metric) => [metric.metricId, metric.value]),
    ).toEqual([
      ["requested_size_width", 110],
      ["requested_size_height", 60],
      ["requested_size_depth", 30],
    ]);
  });

  it("lays out a fold tree without rewriting invalid connector geometry", () => {
    const source = fabricationPlanFromProgram(fixtureProgram());
    const wing = source.panels[1]!;
    const plan = {
      ...source,
      assemblyStrategy: "articulated_tab_slot" as const,
      panels: [
        ...source.panels.map((panel) => ({
          ...panel,
          flatTransform: {
            translationMm: { xMm: 5, yMm: 5 },
            rotationDeg: 17,
          },
        })),
        {
          ...wing,
          panelId: "panel-tail",
          bodyId: "body-tail",
          label: "Tail panel",
          widthMm: 20,
          heightMm: 30,
          semanticPartIds: ["part-tail"],
        },
      ],
      bodies: [
        ...source.bodies,
        {
          ...source.bodies[1]!,
          bodyId: "body-tail",
          label: "Tail body",
          panelIds: ["panel-tail"],
          semanticPartIds: ["part-tail"],
        },
      ],
      joints: [
        {
          ...source.joints[0]!,
          axis: {
            startMm: { xMm: 1, yMm: 2, zMm: 0 },
            endMm: { xMm: 3, yMm: 4, zMm: 0 },
          },
        },
        {
          ...source.joints[0]!,
          jointId: "joint-tail",
          parentBodyId: "body-wing",
          childBodyId: "body-tail",
          creasePathId: "crease-tail",
          axis: {
            startMm: { xMm: 5, yMm: 6, zMm: 0 },
            endMm: { xMm: 7, yMm: 8, zMm: 0 },
          },
        },
      ],
      connectors: [
        {
          connectorId: "unused-tab",
          kind: "tab" as const,
          panelId: "panel-base",
          mateConnectorId: "unused-slot",
          contour: {
            vertices: [
              { xMm: 0, yMm: 0 },
              { xMm: 4, yMm: 0 },
              { xMm: 4, yMm: 4 },
              { xMm: 0, yMm: 4 },
            ],
          },
          rootEdge: {
            start: { xMm: 0, yMm: 0 },
            end: { xMm: 4, yMm: 0 },
          },
          insertionDirection: { x: 1, y: 0, z: 0 },
          clearanceMm: 0.5,
        },
        {
          connectorId: "unused-slot",
          kind: "slot" as const,
          panelId: "panel-wing",
          mateConnectorId: "unused-tab",
          centerline: {
            start: { xMm: 1, yMm: 1 },
            end: { xMm: 5, yMm: 1 },
          },
          widthMm: 1,
          insertionDirection: { x: -1, y: 0, z: 0 },
          clearanceMm: 0.5,
        },
      ],
      semanticParts: [
        ...source.semanticParts,
        {
          semanticPartId: "part-tail",
          label: "Tail",
          role: "secondary moving panel",
          geometryRefs: [
            { kind: "panel" as const, id: "panel-tail" },
            { kind: "connector" as const, id: "unused-tab" },
            { kind: "connector" as const, id: "unused-slot" },
          ],
        },
      ],
    };

    const expanded = expandFabricationPlan(fixtureIntent(), plan, 1);
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return;
    expect(
      expanded.value.blueprint.connectors.map(
        (connector) => connector.connectorId,
      ),
    ).toEqual(["unused-tab", "unused-slot"]);
    expect(expanded.value.assemblyStrategy).toBe("articulated_tab_slot");
    expect(
      expanded.value.blueprint.panels.map((panel) => panel.panelId),
    ).toEqual(["panel-base", "panel-wing", "panel-tail"]);
    expect(expanded.value.blueprint.bodies.map((body) => body.bodyId)).toEqual([
      "body-base",
      "body-wing",
      "body-tail",
    ]);
    expect(expanded.value.blueprint.panels[2]).toMatchObject({
      widthMm: 20,
      heightMm: 30,
      semanticPartIds: ["part-tail"],
    });

    const compiled = compileFabricationProgram(fixtureIntent(), expanded.value);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const report = verifyFabricationIr(compiled.value, "candidate-normalized");
    expect(
      report.failures.filter(
        (failure) =>
          failure.failureId.startsWith("connections.fold_edge") ||
          failure.failureId.startsWith("packing.panel_overlap") ||
          failure.failureId.startsWith("packing.sheet_bounds"),
      ),
    ).toEqual([]);
    expect(report.failures.map((failure) => failure.failureId)).toEqual(
      expect.arrayContaining([
        "connections.connector_fit#unused-tab:unused-slot",
        "connections.tab_attachment#unused-tab",
      ]),
    );
    expect(
      report.failures.some((failure) =>
        failure.failureId.startsWith("connections.connector_mate_reach"),
      ),
    ).toBe(true);

    for (const joint of compiled.value.joints) {
      if (joint.kind !== "fold") continue;
      const childBody = compiled.value.bodies.find(
        (body) => body.bodyId === joint.childBodyId,
      )!;
      const child = compiled.value.panels.find(
        (panel) => panel.panelId === childBody.panelIds[0],
      )!;
      const placedEdges = child.contour.vertices.map((point, index) => ({
        start: transformPoint2(point, child.flatTransform),
        end: transformPoint2(
          child.contour.vertices[(index + 1) % child.contour.vertices.length]!,
          child.flatTransform,
        ),
      }));
      const axisLengthMm = Math.hypot(
        joint.axis.endMm.xMm - joint.axis.startMm.xMm,
        joint.axis.endMm.yMm - joint.axis.startMm.yMm,
      );
      expect(
        placedEdges.some(
          (edge) =>
            Math.abs(
              Math.hypot(
                edge.end.xMm - edge.start.xMm,
                edge.end.yMm - edge.start.yMm,
              ) - axisLengthMm,
            ) < 1e-6,
        ),
      ).toBe(true);
    }

    const withoutConnectorSemantics = expandFabricationPlan(
      fixtureIntent(),
      {
        ...plan,
        semanticParts: plan.semanticParts.map((part) => ({
          ...part,
          geometryRefs: part.geometryRefs.filter(
            (reference) => reference.kind !== "connector",
          ),
        })),
      },
      1,
    );
    expect(withoutConnectorSemantics.ok).toBe(true);
    if (withoutConnectorSemantics.ok) {
      expect(withoutConnectorSemantics.value.blueprint.connectors).toEqual([]);
    }
  });

  it("fails closed when a connected fold body contains multiple panels", () => {
    const source = fabricationPlanFromProgram(fixtureProgram());
    const expanded = expandFabricationPlan(
      fixtureIntent(),
      {
        ...source,
        panels: source.panels.map((panel) => ({
          ...panel,
          flatTransform: {
            translationMm: { xMm: 0, yMm: 0 },
            rotationDeg: 0,
          },
        })),
        bodies: source.bodies.map((body, index) =>
          index === 0
            ? { ...body, panelIds: ["panel-base", "panel-wing"] }
            : body,
        ),
      },
      1,
    );

    expect(expanded).toMatchObject({
      ok: false,
      error: {
        kind: "contract_validation",
        contract: "FabricationPlanV1",
      },
    });
  });

  it("does not treat a static multi-panel body as a fold tree", () => {
    const source = fabricationPlanFromProgram(fixtureProgram());
    const staticPlan = {
      ...source,
      panels: source.panels.map((panel) => ({
        ...panel,
        bodyId: "body-base",
      })),
      bodies: [
        {
          ...source.bodies[0]!,
          panelIds: source.panels.map((panel) => panel.panelId),
          semanticPartIds: source.semanticParts.map(
            (part) => part.semanticPartId,
          ),
        },
      ],
      joints: [],
      driver: null,
      outputs: [],
      couplings: [],
    };

    expect(
      normalizeFoldOnlyPlan(staticPlan, fixtureIntent().stockOptions),
    ).toEqual({ ok: true, value: staticPlan });
  });

  it("preserves valid expressive contours and refuses to rewrite invalid ones", () => {
    const source = fabricationPlanFromProgram(fixtureProgram());
    const triangularWing = {
      ...source.panels[1]!,
      contour: {
        vertices: [
          { u: 0, v: 0 },
          { u: 1, v: 0 },
          { u: 0, v: 1 },
        ],
      },
    };
    const validPlan = {
      ...source,
      panels: [source.panels[0]!, triangularWing],
    };

    expect(
      normalizeFoldOnlyPlan(validPlan, fixtureIntent().stockOptions),
    ).toEqual({ ok: true, value: validPlan });

    const invalidPlan = {
      ...validPlan,
      panels: validPlan.panels.map((panel) => ({
        ...panel,
        flatTransform: {
          translationMm: { xMm: 5, yMm: 5 },
          rotationDeg: 17,
        },
      })),
    };
    expect(
      normalizeFoldOnlyPlan(invalidPlan, fixtureIntent().stockOptions),
    ).toMatchObject({
      ok: false,
      path: ["panels", "panel-wing", "contour"],
    });
  });

  it("uses all four parent sides when a fold star requires them", () => {
    const source = fabricationPlanFromProgram(fixtureProgram());
    const sourceIntent = fixtureIntent();
    const intent = {
      ...sourceIntent,
      fabricationBudget: {
        ...sourceIntent.fabricationBudget,
        maximumPanels: 24,
        maximumJointAndConnectorCount: 24,
      },
    };
    const root = source.panels[0]!;
    const childSource = source.panels[1]!;
    const childCount = 5;
    const panels = [
      root,
      ...Array.from({ length: childCount }, (_, index) => ({
        ...childSource,
        panelId: `panel-child-${index + 1}`,
        bodyId: `body-child-${index + 1}`,
        label: `Child ${index + 1}`,
        widthMm: 80,
        heightMm: 20,
        semanticPartIds: [`part-child-${index + 1}`],
        flatTransform: {
          translationMm: { xMm: 10, yMm: 10 },
          rotationDeg: 0,
        },
      })),
    ];
    const bodies = [
      source.bodies[0]!,
      ...Array.from({ length: childCount }, (_, index) => ({
        ...source.bodies[1]!,
        bodyId: `body-child-${index + 1}`,
        label: `Child body ${index + 1}`,
        panelIds: [`panel-child-${index + 1}`],
        semanticPartIds: [`part-child-${index + 1}`],
      })),
    ];
    const fold = source.joints[0]!;
    expect(fold.kind).toBe("fold");
    if (fold.kind !== "fold") return;
    const joints = Array.from({ length: childCount }, (_, index) => ({
      ...fold,
      jointId: index === 0 ? fold.jointId : `joint-child-${index + 1}`,
      parentBodyId: source.bodies[0]!.bodyId,
      childBodyId: `body-child-${index + 1}`,
      creasePathId: `crease-child-${index + 1}`,
      axis: {
        startMm: { xMm: 0, yMm: 0, zMm: 0 },
        endMm: { xMm: 2, yMm: 2, zMm: 0 },
      },
    }));
    const expanded = expandFabricationPlan(
      intent,
      {
        ...source,
        panels,
        bodies,
        joints,
        connectors: [],
        semanticParts: [
          source.semanticParts[0]!,
          ...Array.from({ length: childCount }, (_, index) => ({
            semanticPartId: `part-child-${index + 1}`,
            label: `Child ${index + 1}`,
            role: "fold branch",
            geometryRefs: [
              {
                kind: "panel" as const,
                id: `panel-child-${index + 1}`,
              },
            ],
          })),
        ],
      },
      1,
    );

    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return;
    const compiled = compileFabricationProgram(intent, expanded.value);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const report = verifyFabricationIr(compiled.value, "candidate-fold-star");
    expect(
      report.failures.filter(
        (failure) =>
          failure.failureId.startsWith("connections.fold_edge") ||
          failure.failureId.startsWith("packing."),
      ),
    ).toEqual([]);
  });

  it("returns typed failures for disconnected, orphaned, and unplaceable trees", () => {
    const source = fabricationPlanFromProgram(fixtureProgram());
    const sheet = fixtureIntent().stockOptions[0]!;
    expect(
      normalizeFoldOnlyPlan({ ...source, joints: [] }, [sheet]),
    ).toMatchObject({ ok: true });
    expect(
      normalizeFoldOnlyPlan(
        {
          ...source,
          panels: [
            ...source.panels,
            {
              ...source.panels[1]!,
              panelId: "panel-orphan",
              bodyId: "body-orphan",
            },
          ],
        },
        [sheet],
      ),
    ).toMatchObject({ ok: false, path: ["panels"] });
    expect(normalizeFoldOnlyPlan(source, [])).toMatchObject({
      ok: false,
      path: ["panels", "panel-base", "sheetId"],
    });
    expect(
      normalizeFoldOnlyPlan(
        {
          ...source,
          panels: source.panels.map((panel, index) =>
            index === 0
              ? {
                  ...panel,
                  widthMm: sheet.widthMm * 2,
                  flatTransform: {
                    translationMm: { xMm: 0, yMm: 0 },
                    rotationDeg: 0,
                  },
                }
              : panel,
          ),
        },
        [sheet],
      ),
    ).toMatchObject({ ok: false, path: ["panels"] });
  });

  it("leaves unresolved and undersized semantic connectors unchanged", () => {
    const source = fabricationPlanFromProgram(fixtureProgram());
    const sheet = fixtureIntent().stockOptions[0]!;
    const invalidTransforms = source.panels.map((panel) => ({
      ...panel,
      flatTransform: {
        translationMm: { xMm: 2, yMm: 2 },
        rotationDeg: 17,
      },
    }));
    const unresolvedTab = {
      connectorId: "semantic-tab",
      kind: "tab" as const,
      panelId: "panel-wing",
      mateConnectorId: "missing-slot",
      contour: {
        vertices: [
          { xMm: 0, yMm: 0 },
          { xMm: 2, yMm: 0 },
          { xMm: 2, yMm: 2 },
          { xMm: 0, yMm: 2 },
        ],
      },
      rootEdge: {
        start: { xMm: 0, yMm: 0 },
        end: { xMm: 2, yMm: 0 },
      },
      insertionDirection: { x: 0, y: 0, z: 1 },
      clearanceMm: 0.5,
    };
    const unresolved = normalizeFoldOnlyPlan(
      {
        ...source,
        panels: invalidTransforms,
        connectors: [unresolvedTab],
        semanticParts: source.semanticParts.map((part, index) =>
          index === 0
            ? {
                ...part,
                geometryRefs: [
                  ...part.geometryRefs,
                  { kind: "connector" as const, id: "semantic-tab" },
                ],
              }
            : part,
        ),
      },
      [sheet],
    );
    expect(unresolved.ok).toBe(true);
    if (unresolved.ok) {
      expect(unresolved.value.connectors).toEqual([unresolvedTab]);
    }

    const tab = {
      ...unresolvedTab,
      mateConnectorId: "semantic-slot",
    };
    const slot = {
      connectorId: "semantic-slot",
      kind: "slot" as const,
      panelId: "panel-base",
      mateConnectorId: "semantic-tab",
      centerline: {
        start: { xMm: 2, yMm: 2 },
        end: { xMm: 4, yMm: 2 },
      },
      widthMm: 1,
      insertionDirection: { x: 0, y: 0, z: -1 },
      clearanceMm: 0.5,
    };
    const undersized = normalizeFoldOnlyPlan(
      {
        ...source,
        panels: invalidTransforms.map((panel) =>
          panel.panelId === "panel-wing" ? { ...panel, heightMm: 4.5 } : panel,
        ),
        connectors: [tab, slot],
        semanticParts: source.semanticParts.map((part, index) =>
          index === 0
            ? {
                ...part,
                geometryRefs: [
                  ...part.geometryRefs,
                  { kind: "connector" as const, id: "semantic-tab" },
                  { kind: "connector" as const, id: "semantic-slot" },
                ],
              }
            : part,
        ),
      },
      [sheet],
    );
    expect(undersized.ok).toBe(true);
    if (undersized.ok) {
      expect(undersized.value.connectors).toEqual([tab, slot]);
    }
  });
});
