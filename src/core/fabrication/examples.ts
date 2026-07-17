import type {
  FabricationIntentV1,
  FabricationProgramV1,
  SemanticConstraintV1,
  SheetV1,
} from "./types";

export type OfflineFabricationShowcaseId =
  | "faceted-duck-gift-box"
  | "modular-cable-organizer"
  | "pull-tab-pop-up-flower";

export interface OfflineFabricationShowcase {
  readonly showcaseId: OfflineFabricationShowcaseId;
  readonly availability: "offline_showcase_only";
  readonly livePromptRouting: false;
  readonly prompt: string;
  readonly limitation: string | null;
  readonly intent: FabricationIntentV1;
  readonly program: FabricationProgramV1;
}

const identityTransform = {
  translationMm: { xMm: 0, yMm: 0, zMm: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
} as const;

const showcaseSheet = (
  sheetId: string,
  widthMm: number,
  heightMm: number,
  thicknessMm: number,
): SheetV1 => ({
  sheetId,
  widthMm,
  heightMm,
  printableMarginMm: 5,
  material: {
    materialId: `showcase-card-${String(thicknessMm).replace(".", "-")}`,
    label: `${thicknessMm.toFixed(2)} mm showcase card`,
    thicknessMm,
    grainDirection: "y",
  },
});

export const createFacetedDuckGiftBoxShowcase =
  (): OfflineFabricationShowcase => {
    const prompt =
      "Make a faceted duck gift box from one sheet with a lid I can open.";
    const sheet = showcaseSheet("sheet-duck-box", 260, 190, 0.4);
    const constraints: readonly SemanticConstraintV1[] = [
      {
        constraintId: "constraint-duck-form",
        kind: "recognizable_form",
        hard: false,
        source: "program",
        label: "Faceted duck gift-box silhouette",
        semanticPartIds: ["part-duck-tray", "part-duck-lid", "part-duck-beak"],
        requiredLandmarks: ["duck", "lid", "beak"],
        evaluation: "landmark_geometry",
      },
      {
        constraintId: "constraint-duck-width",
        kind: "dimension",
        hard: true,
        source: "program",
        geometryRef: { kind: "panel", id: "panel-duck-tray" },
        dimension: "width",
        minimumMm: null,
        maximumMm: null,
        targetMm: 100,
        toleranceMm: 0.1,
      },
    ];
    const intent: FabricationIntentV1 = {
      version: "1",
      intentId: "intent-showcase-duck-box",
      sourcePrompt: prompt,
      title: "Faceted duck gift box",
      objectLabel: "duck gift box",
      functionalGoal:
        "Fold a small flat-gift tray with a manually openable scored duck lid.",
      visualDescription:
        "An octagonal duck-body tray footprint, faceted head lid, and triangular beak.",
      behavior: "static",
      requestedSize: { widthMm: 100, heightMm: 142, depthMm: null },
      stockOptions: [sheet],
      fabricationBudget: {
        maximumSheets: 1,
        maximumPanels: 3,
        maximumJointAndConnectorCount: 2,
        cutsAllowed: true,
        glueAllowed: false,
      },
      semanticConstraints: constraints,
      priorities: ["visual_expression", "mechanical_simplicity"],
      scopeStatus: "supported",
      clarificationQuestion: null,
      unsupportedReason: null,
    };
    const program: FabricationProgramV1 = {
      version: "1",
      programId: "program-showcase-duck-box",
      intentId: intent.intentId,
      candidateLabel: "Offline showcase · faceted scored lid",
      topologyId: "offline-duck-three-body-fold-chain",
      topologyVersion: 1,
      behavior: "static",
      sheets: [sheet],
      modules: [
        {
          moduleId: "module-duck-layout",
          registryId: "offline.faceted-duck-layout",
          registryVersion: 1,
          kind: "panel_layout",
          label: "Three-panel duck silhouette",
          parameters: [],
          ports: [
            {
              portId: "port-duck-layout-out",
              kind: "body",
              direction: "output",
            },
          ],
          semanticPartIds: [
            "part-duck-tray",
            "part-duck-lid",
            "part-duck-beak",
          ],
        },
        {
          moduleId: "module-duck-folds",
          registryId: "offline.manual-score-chain",
          registryVersion: 1,
          kind: "fold_structure",
          label: "Manual lid and beak score chain",
          parameters: [],
          ports: [
            {
              portId: "port-duck-fold-in",
              kind: "body",
              direction: "input",
            },
          ],
          semanticPartIds: ["part-duck-lid", "part-duck-beak"],
        },
      ],
      connections: [
        {
          connectionId: "connection-duck-layout-folds",
          fromModuleId: "module-duck-layout",
          fromPortId: "port-duck-layout-out",
          toModuleId: "module-duck-folds",
          toPortId: "port-duck-fold-in",
        },
      ],
      blueprint: {
        panels: [
          {
            panelId: "panel-duck-tray",
            sheetId: sheet.sheetId,
            bodyId: "body-duck-tray",
            label: "Faceted duck gift-tray footprint",
            role: "structural",
            widthMm: 100,
            heightMm: 70,
            contour: {
              vertices: [
                { u: 0, v: 0.25 },
                { u: 0.2, v: 0 },
                { u: 0.8, v: 0 },
                { u: 1, v: 0.25 },
                { u: 1, v: 0.75 },
                { u: 0.8, v: 1 },
                { u: 0.2, v: 1 },
                { u: 0, v: 0.75 },
              ],
            },
            innerCutContours: [],
            flatTransform: {
              translationMm: { xMm: 80, yMm: 80 },
              rotationDeg: 0,
            },
            semanticPartIds: ["part-duck-tray"],
          },
          {
            panelId: "panel-duck-lid",
            sheetId: sheet.sheetId,
            bodyId: "body-duck-lid",
            label: "Faceted duck head lid",
            role: "structural",
            widthMm: 60,
            heightMm: 50,
            contour: {
              vertices: [
                { u: 0, v: 1 },
                { u: 0, v: 0.3 },
                { u: 0.2, v: 0 },
                { u: 0.75, v: 0 },
                { u: 1, v: 0.25 },
                { u: 1, v: 1 },
              ],
            },
            innerCutContours: [],
            flatTransform: {
              translationMm: { xMm: 100, yMm: 30 },
              rotationDeg: 0,
            },
            semanticPartIds: ["part-duck-lid"],
          },
          {
            panelId: "panel-duck-beak",
            sheetId: sheet.sheetId,
            bodyId: "body-duck-beak",
            label: "Triangular duck beak facet",
            role: "decorative",
            widthMm: 33,
            heightMm: 22,
            contour: {
              vertices: [
                { u: 0, v: 1 },
                { u: 0.5, v: 0 },
                { u: 1, v: 1 },
              ],
            },
            innerCutContours: [],
            flatTransform: {
              translationMm: { xMm: 112, yMm: 8 },
              rotationDeg: 0,
            },
            semanticPartIds: ["part-duck-beak"],
          },
        ],
        bodies: [
          {
            bodyId: "body-duck-tray",
            label: "Duck gift-tray root",
            panelIds: ["panel-duck-tray"],
            initialTransform: identityTransform,
            grounded: true,
            semanticPartIds: ["part-duck-tray"],
          },
          {
            bodyId: "body-duck-lid",
            label: "Manual duck lid",
            panelIds: ["panel-duck-lid"],
            initialTransform: identityTransform,
            grounded: false,
            semanticPartIds: ["part-duck-lid"],
          },
          {
            bodyId: "body-duck-beak",
            label: "Duck beak flap",
            panelIds: ["panel-duck-beak"],
            initialTransform: identityTransform,
            grounded: false,
            semanticPartIds: ["part-duck-beak"],
          },
        ],
        joints: [
          {
            jointId: "joint-duck-lid",
            kind: "fold",
            parentBodyId: "body-duck-tray",
            childBodyId: "body-duck-lid",
            axis: {
              startMm: { xMm: 100, yMm: 80, zMm: 0 },
              endMm: { xMm: 160, yMm: 80, zMm: 0 },
            },
            creasePathId: "crease-duck-lid",
            foldDirection: "valley",
            homeAngleDeg: 0,
            minAngleDeg: 0,
            maxAngleDeg: 135,
          },
          {
            jointId: "joint-duck-beak",
            kind: "fold",
            parentBodyId: "body-duck-lid",
            childBodyId: "body-duck-beak",
            axis: {
              startMm: { xMm: 112, yMm: 30, zMm: 0 },
              endMm: { xMm: 145, yMm: 30, zMm: 0 },
            },
            creasePathId: "crease-duck-beak",
            foldDirection: "mountain",
            homeAngleDeg: 0,
            minAngleDeg: 0,
            maxAngleDeg: 90,
          },
        ],
        connectors: [],
        driver: null,
        outputs: [],
        couplings: [],
        semanticParts: [
          {
            semanticPartId: "part-duck-tray",
            label: "Duck gift tray",
            role: "faceted duck gift footprint",
            geometryRefs: [{ kind: "panel", id: "panel-duck-tray" }],
          },
          {
            semanticPartId: "part-duck-lid",
            label: "Faceted duck lid",
            role: "manually openable lid",
            geometryRefs: [
              { kind: "panel", id: "panel-duck-lid" },
              { kind: "joint", id: "joint-duck-lid" },
            ],
          },
          {
            semanticPartId: "part-duck-beak",
            label: "Duck beak",
            role: "triangular beak landmark",
            geometryRefs: [
              { kind: "panel", id: "panel-duck-beak" },
              { kind: "joint", id: "joint-duck-beak" },
            ],
          },
        ],
        assemblyOperations: [
          {
            operationId: "assembly-duck-cut",
            order: 1,
            kind: "cut",
            targetRefs: [
              { kind: "panel", id: "panel-duck-tray" },
              { kind: "panel", id: "panel-duck-lid" },
              { kind: "panel", id: "panel-duck-beak" },
            ],
            dependsOnOperationIds: [],
            instruction: "Cut the three faceted outlines at print scale.",
          },
          {
            operationId: "assembly-duck-score",
            order: 2,
            kind: "score",
            targetRefs: [
              { kind: "joint", id: "joint-duck-lid" },
              { kind: "joint", id: "joint-duck-beak" },
            ],
            dependsOnOperationIds: ["assembly-duck-cut"],
            instruction: "Score the lid and beak hinge axes without cutting.",
          },
          {
            operationId: "assembly-duck-fold",
            order: 3,
            kind: "fold",
            targetRefs: [
              { kind: "joint", id: "joint-duck-lid" },
              { kind: "joint", id: "joint-duck-beak" },
            ],
            dependsOnOperationIds: ["assembly-duck-score"],
            instruction:
              "Treat the lid and beak scores as crease annotations; this saved static study does not model articulated opening or closing.",
          },
          {
            operationId: "assembly-duck-verify",
            order: 4,
            kind: "verify",
            targetRefs: [{ kind: "semantic_part", id: "part-duck-lid" }],
            dependsOnOperationIds: ["assembly-duck-fold"],
            instruction:
              "Confirm the cut and score lines match the shown pattern; lid travel and material durability are not verified.",
          },
        ],
      },
      semanticConstraints: constraints,
      assemblyStrategy: "fold_only",
      designSummary:
        "Offline showcase only. The verified construction is a flat faceted tray footprint with a manually scored lid and beak; current static verification proves cut, score, packing, and landmark geometry, not volumetric box closure or repeated-fold durability.",
    };
    return {
      showcaseId: "faceted-duck-gift-box",
      availability: "offline_showcase_only",
      livePromptRouting: false,
      prompt,
      limitation:
        "Static verification does not simulate lid actuation, volumetric closure, material force, or fold fatigue.",
      intent,
      program,
    };
  };

export const createModularCableOrganizerShowcase =
  (): OfflineFabricationShowcase => {
    const prompt =
      "Make a modular cable organizer from cardstock with tab-and-slot connections.";
    const sheet = showcaseSheet("sheet-cable-organizer", 260, 180, 0.5);
    const constraints: readonly SemanticConstraintV1[] = [
      {
        constraintId: "constraint-organizer-length",
        kind: "dimension",
        hard: true,
        source: "program",
        geometryRef: { kind: "panel", id: "panel-organizer-module" },
        dimension: "length",
        minimumMm: null,
        maximumMm: null,
        targetMm: 130,
        toleranceMm: 0.1,
      },
      {
        constraintId: "constraint-organizer-form",
        kind: "recognizable_form",
        hard: false,
        source: "program",
        label: "Modular cable-channel tile",
        semanticPartIds: [
          "part-organizer-module",
          "part-cable-channels",
          "part-module-lock",
        ],
        requiredLandmarks: ["module", "cable", "channel"],
        evaluation: "landmark_geometry",
      },
    ];
    const intent: FabricationIntentV1 = {
      version: "1",
      intentId: "intent-showcase-cable-organizer",
      sourcePrompt: prompt,
      title: "Modular cable organizer",
      objectLabel: "cable organizer module",
      functionalGoal:
        "Cut one repeatable cable-channel tile whose tab mates with another tile's slot.",
      visualDescription:
        "A compact organizer tile with three cable channels and one keyed tab-slot edge.",
      behavior: "static",
      requestedSize: { widthMm: 130, heightMm: 80, depthMm: null },
      stockOptions: [sheet],
      fabricationBudget: {
        maximumSheets: 1,
        maximumPanels: 1,
        maximumJointAndConnectorCount: 2,
        cutsAllowed: true,
        glueAllowed: false,
      },
      semanticConstraints: constraints,
      priorities: ["fabrication_efficiency", "mechanical_simplicity"],
      scopeStatus: "supported",
      clarificationQuestion: null,
      unsupportedReason: null,
    };
    const program: FabricationProgramV1 = {
      version: "1",
      programId: "program-showcase-cable-organizer",
      intentId: intent.intentId,
      candidateLabel: "Offline showcase · repeatable tab-slot tile",
      topologyId: "offline-organizer-single-body-tab-slot",
      topologyVersion: 1,
      behavior: "static",
      sheets: [sheet],
      modules: [
        {
          moduleId: "module-organizer-tile",
          registryId: "offline.cable-channel-tile",
          registryVersion: 1,
          kind: "panel_layout",
          label: "Three-channel organizer tile",
          parameters: [],
          ports: [
            {
              portId: "port-organizer-edge",
              kind: "connector",
              direction: "bidirectional",
            },
          ],
          semanticPartIds: ["part-organizer-module", "part-cable-channels"],
        },
        {
          moduleId: "module-organizer-lock",
          registryId: "offline.repeating-tab-slot",
          registryVersion: 1,
          kind: "tab_slot_connector",
          label: "Repeatable module lock",
          parameters: [],
          ports: [
            {
              portId: "port-organizer-lock",
              kind: "connector",
              direction: "bidirectional",
            },
          ],
          semanticPartIds: ["part-module-lock"],
        },
      ],
      connections: [
        {
          connectionId: "connection-organizer-lock",
          fromModuleId: "module-organizer-tile",
          fromPortId: "port-organizer-edge",
          toModuleId: "module-organizer-lock",
          toPortId: "port-organizer-lock",
        },
      ],
      blueprint: {
        panels: [
          {
            panelId: "panel-organizer-module",
            sheetId: sheet.sheetId,
            bodyId: "body-organizer-module",
            label: "Cable organizer module",
            role: "structural",
            widthMm: 130,
            heightMm: 80,
            contour: {
              vertices: [
                { u: 0, v: 0 },
                { u: 0.9, v: 0 },
                { u: 0.9, v: 0.35 },
                { u: 1, v: 0.35 },
                { u: 1, v: 0.65 },
                { u: 0.9, v: 0.65 },
                { u: 0.9, v: 1 },
                { u: 0, v: 1 },
              ],
            },
            innerCutContours: [
              {
                vertices: [
                  { u: 0.18, v: 0.22 },
                  { u: 0.25, v: 0.22 },
                  { u: 0.25, v: 0.78 },
                  { u: 0.18, v: 0.78 },
                ],
              },
              {
                vertices: [
                  { u: 0.42, v: 0.22 },
                  { u: 0.49, v: 0.22 },
                  { u: 0.49, v: 0.78 },
                  { u: 0.42, v: 0.78 },
                ],
              },
              {
                vertices: [
                  { u: 0.66, v: 0.22 },
                  { u: 0.73, v: 0.22 },
                  { u: 0.73, v: 0.78 },
                  { u: 0.66, v: 0.78 },
                ],
              },
            ],
            flatTransform: {
              translationMm: { xMm: 30, yMm: 40 },
              rotationDeg: 0,
            },
            semanticPartIds: [
              "part-organizer-module",
              "part-cable-channels",
              "part-module-lock",
            ],
          },
        ],
        bodies: [
          {
            bodyId: "body-organizer-module",
            label: "Grounded organizer tile",
            panelIds: ["panel-organizer-module"],
            initialTransform: identityTransform,
            grounded: true,
            semanticPartIds: [
              "part-organizer-module",
              "part-cable-channels",
              "part-module-lock",
            ],
          },
        ],
        joints: [],
        connectors: [
          {
            connectorId: "connector-organizer-tab",
            kind: "tab",
            panelId: "panel-organizer-module",
            mateConnectorId: "connector-organizer-slot",
            contour: {
              vertices: [
                { xMm: 117, yMm: 28 },
                { xMm: 130, yMm: 28 },
                { xMm: 130, yMm: 52 },
                { xMm: 117, yMm: 52 },
              ],
            },
            rootEdge: {
              start: { xMm: 117, yMm: 28 },
              end: { xMm: 117, yMm: 52 },
            },
            insertionDirection: { x: 1, y: 0, z: 0 },
            clearanceMm: 0.4,
          },
          {
            connectorId: "connector-organizer-slot",
            kind: "slot",
            panelId: "panel-organizer-module",
            mateConnectorId: "connector-organizer-tab",
            centerline: {
              start: { xMm: 8, yMm: 27.5 },
              end: { xMm: 8, yMm: 52.5 },
            },
            widthMm: 3,
            insertionDirection: { x: 1, y: 0, z: 0 },
            clearanceMm: 0.4,
          },
        ],
        driver: null,
        outputs: [],
        couplings: [],
        semanticParts: [
          {
            semanticPartId: "part-organizer-module",
            label: "Repeatable organizer module",
            role: "single modular cable tile",
            geometryRefs: [{ kind: "panel", id: "panel-organizer-module" }],
          },
          {
            semanticPartId: "part-cable-channels",
            label: "Cable channels",
            role: "three cable channel cutouts",
            geometryRefs: [
              { kind: "path", id: "panel-organizer-module.cut.inner-1" },
              { kind: "path", id: "panel-organizer-module.cut.inner-2" },
              { kind: "path", id: "panel-organizer-module.cut.inner-3" },
            ],
          },
          {
            semanticPartId: "part-module-lock",
            label: "Module tab-slot lock",
            role: "repeatable module connection",
            geometryRefs: [
              { kind: "connector", id: "connector-organizer-tab" },
              { kind: "connector", id: "connector-organizer-slot" },
            ],
          },
        ],
        assemblyOperations: [
          {
            operationId: "assembly-organizer-cut",
            order: 1,
            kind: "cut",
            targetRefs: [
              { kind: "panel", id: "panel-organizer-module" },
              { kind: "connector", id: "connector-organizer-tab" },
              { kind: "connector", id: "connector-organizer-slot" },
            ],
            dependsOnOperationIds: [],
            instruction:
              "Cut the module perimeter, cable channels, tab, and mating slot.",
          },
          {
            operationId: "assembly-organizer-join",
            order: 2,
            kind: "insert_tab",
            targetRefs: [
              { kind: "connector", id: "connector-organizer-tab" },
              { kind: "connector", id: "connector-organizer-slot" },
            ],
            dependsOnOperationIds: ["assembly-organizer-cut"],
            instruction:
              "Repeat the tile as needed and insert one tile's tab into the next tile's slot.",
          },
          {
            operationId: "assembly-organizer-verify",
            order: 3,
            kind: "verify",
            targetRefs: [{ kind: "semantic_part", id: "part-cable-channels" }],
            dependsOnOperationIds: ["assembly-organizer-join"],
            instruction:
              "Check that each channel is clear and the modular joint seats without glue.",
          },
        ],
      },
      semanticConstraints: constraints,
      assemblyStrategy: "tab_slot",
      designSummary:
        "Offline showcase only. One verified repeatable tile carries three cable-channel cutouts and reciprocal tab-slot metadata; duplicate the exported tile to create a longer organizer. The verifier checks source paths and nominal clearance, not tab-root continuity, mating retention force, or cable friction.",
    };
    return {
      showcaseId: "modular-cable-organizer",
      availability: "offline_showcase_only",
      livePromptRouting: false,
      prompt,
      limitation:
        "Nominal tab-slot clearance is verified; tab-root continuity, retention force, cable friction, and repeated-module loading are not simulated.",
      intent,
      program,
    };
  };

export const createPullTabPopUpFlowerShowcase =
  (): OfflineFabricationShowcase => {
    const prompt =
      "Make a pull-tab pop-up flower card whose flower rises when I pull.";
    const sheet = showcaseSheet("sheet-popup-flower", 280, 190, 0.35);
    const constraints: readonly SemanticConstraintV1[] = [
      {
        constraintId: "constraint-flower-motion",
        kind: "motion",
        hard: true,
        source: "program",
        outputId: "output-flower-lift",
        minimumValue: 0,
        maximumValue: 30,
        unit: "mm",
      },
      {
        constraintId: "constraint-flower-clearance",
        kind: "clearance",
        hard: true,
        source: "program",
        geometryRefs: [
          { kind: "panel", id: "panel-flower-base" },
          { kind: "panel", id: "panel-flower-crown" },
        ],
        minimumClearanceMm: 1,
        during: "all_states",
      },
      {
        constraintId: "constraint-flower-form",
        kind: "recognizable_form",
        hard: false,
        source: "program",
        label: "Pull-tab flower lift",
        semanticPartIds: [
          "part-flower-base",
          "part-flower-petals",
          "part-flower-pull-tab",
        ],
        requiredLandmarks: ["flower", "petal", "pull tab"],
        evaluation: "landmark_geometry",
      },
    ];
    const intent: FabricationIntentV1 = {
      version: "1",
      intentId: "intent-showcase-popup-flower",
      sourcePrompt: prompt,
      title: "Pull-tab pop-up flower",
      objectLabel: "moving flower card",
      functionalGoal:
        "Raise a rigid flower crown 30 mm above a card through a pull-tab-controlled guide.",
      visualDescription:
        "A square card base beneath a broad eight-petal flower silhouette and guided pull-tab feature.",
      behavior: "slide",
      requestedSize: { widthMm: 90, heightMm: 90, depthMm: 30 },
      stockOptions: [sheet],
      fabricationBudget: {
        maximumSheets: 1,
        maximumPanels: 2,
        maximumJointAndConnectorCount: 3,
        cutsAllowed: true,
        glueAllowed: false,
      },
      semanticConstraints: constraints,
      priorities: ["motion_range", "visual_expression"],
      scopeStatus: "supported",
      clarificationQuestion: null,
      unsupportedReason: null,
    };
    const program: FabricationProgramV1 = {
      version: "1",
      programId: "program-showcase-popup-flower",
      intentId: intent.intentId,
      candidateLabel: "Offline showcase · guided rigid flower lift",
      topologyId: "offline-flower-two-body-prismatic-lift",
      topologyVersion: 1,
      behavior: "slide",
      sheets: [sheet],
      modules: [
        {
          moduleId: "module-flower-layout",
          registryId: "offline.flower-card-layout",
          registryVersion: 1,
          kind: "panel_layout",
          label: "Base and eight-petal flower crown",
          parameters: [],
          ports: [
            {
              portId: "port-flower-body",
              kind: "body",
              direction: "output",
            },
          ],
          semanticPartIds: ["part-flower-base", "part-flower-petals"],
        },
        {
          moduleId: "module-flower-slider",
          registryId: "offline.vertical-pull-tab-guide",
          registryVersion: 1,
          kind: "prismatic_mechanism",
          label: "Thirty millimetre flower lift",
          parameters: [],
          ports: [
            {
              portId: "port-flower-slider-body",
              kind: "body",
              direction: "input",
            },
            {
              portId: "port-flower-motion",
              kind: "motion",
              direction: "output",
            },
          ],
          semanticPartIds: ["part-flower-pull-tab"],
        },
        {
          moduleId: "module-flower-guide",
          registryId: "offline.tab-slot-guide",
          registryVersion: 1,
          kind: "tab_slot_connector",
          label: "Flower lift guide",
          parameters: [],
          ports: [
            {
              portId: "port-flower-guide",
              kind: "connector",
              direction: "bidirectional",
            },
          ],
          semanticPartIds: ["part-flower-pull-tab"],
        },
      ],
      connections: [
        {
          connectionId: "connection-flower-layout-slider",
          fromModuleId: "module-flower-layout",
          fromPortId: "port-flower-body",
          toModuleId: "module-flower-slider",
          toPortId: "port-flower-slider-body",
        },
      ],
      blueprint: {
        panels: [
          {
            panelId: "panel-flower-base",
            sheetId: sheet.sheetId,
            bodyId: "body-flower-base",
            label: "Pop-up flower card base",
            role: "structural",
            widthMm: 90,
            heightMm: 90,
            contour: {
              vertices: [
                { u: 0, v: 0 },
                { u: 1, v: 0 },
                { u: 1, v: 1 },
                { u: 0, v: 1 },
              ],
            },
            innerCutContours: [],
            flatTransform: {
              translationMm: { xMm: 20, yMm: 50 },
              rotationDeg: 0,
            },
            semanticPartIds: ["part-flower-base", "part-flower-pull-tab"],
          },
          {
            panelId: "panel-flower-crown",
            sheetId: sheet.sheetId,
            bodyId: "body-flower-crown",
            label: "Eight-petal flower crown",
            role: "output",
            widthMm: 70,
            heightMm: 70,
            contour: {
              vertices: [
                { u: 0.7679, v: 0.389 },
                { u: 0.9319, v: 0.416 },
                { u: 1, v: 0.5 },
                { u: 0.9319, v: 0.584 },
                { u: 0.7679, v: 0.611 },
                { u: 0.8648, v: 0.746 },
                { u: 0.8536, v: 0.8536 },
                { u: 0.746, v: 0.8648 },
                { u: 0.611, v: 0.7679 },
                { u: 0.584, v: 0.9319 },
                { u: 0.5, v: 1 },
                { u: 0.416, v: 0.9319 },
                { u: 0.389, v: 0.7679 },
                { u: 0.254, v: 0.8648 },
                { u: 0.1464, v: 0.8536 },
                { u: 0.1352, v: 0.746 },
                { u: 0.2321, v: 0.611 },
                { u: 0.0681, v: 0.584 },
                { u: 0, v: 0.5 },
                { u: 0.0681, v: 0.416 },
                { u: 0.2321, v: 0.389 },
                { u: 0.1352, v: 0.254 },
                { u: 0.1464, v: 0.1464 },
                { u: 0.254, v: 0.1352 },
                { u: 0.389, v: 0.2321 },
                { u: 0.416, v: 0.0681 },
                { u: 0.5, v: 0 },
                { u: 0.584, v: 0.0681 },
                { u: 0.611, v: 0.2321 },
                { u: 0.746, v: 0.1352 },
                { u: 0.8536, v: 0.1464 },
                { u: 0.8648, v: 0.254 },
              ],
            },
            innerCutContours: [],
            flatTransform: {
              translationMm: { xMm: 150, yMm: 60 },
              rotationDeg: 0,
            },
            semanticPartIds: ["part-flower-petals"],
          },
        ],
        bodies: [
          {
            bodyId: "body-flower-base",
            label: "Grounded flower card",
            panelIds: ["panel-flower-base"],
            initialTransform: identityTransform,
            grounded: true,
            semanticPartIds: ["part-flower-base", "part-flower-pull-tab"],
          },
          {
            bodyId: "body-flower-crown",
            label: "Moving flower crown",
            panelIds: ["panel-flower-crown"],
            initialTransform: {
              translationMm: { xMm: -120, yMm: 0, zMm: 1.5 },
              rotation: { x: 0, y: 0, z: 0, w: 1 },
            },
            grounded: false,
            semanticPartIds: ["part-flower-petals"],
          },
        ],
        joints: [
          {
            jointId: "joint-flower-lift",
            kind: "prismatic",
            parentBodyId: "body-flower-base",
            childBodyId: "body-flower-crown",
            originMm: { xMm: 65, yMm: 95, zMm: 1.5 },
            axis: { x: 0, y: 0, z: 1 },
            guideConnectorIds: [
              "connector-flower-guide-tab",
              "connector-flower-guide-slot",
            ],
            homeTravelMm: 0,
            minTravelMm: 0,
            maxTravelMm: 30,
          },
        ],
        connectors: [
          {
            connectorId: "connector-flower-guide-tab",
            kind: "tab",
            panelId: "panel-flower-crown",
            mateConnectorId: "connector-flower-guide-slot",
            contour: {
              vertices: [
                { xMm: 30, yMm: 30 },
                { xMm: 40, yMm: 30 },
                { xMm: 40, yMm: 40 },
                { xMm: 30, yMm: 40 },
              ],
            },
            rootEdge: {
              start: { xMm: 30, yMm: 30 },
              end: { xMm: 40, yMm: 30 },
            },
            insertionDirection: { x: 0, y: 0, z: 1 },
            clearanceMm: 0.4,
          },
          {
            connectorId: "connector-flower-guide-slot",
            kind: "slot",
            panelId: "panel-flower-base",
            mateConnectorId: "connector-flower-guide-tab",
            centerline: {
              start: { xMm: 28, yMm: 45 },
              end: { xMm: 62, yMm: 45 },
            },
            widthMm: 3,
            insertionDirection: { x: 0, y: 0, z: 1 },
            clearanceMm: 0.4,
          },
        ],
        driver: {
          driverId: "driver-flower-pull-tab",
          jointId: "joint-flower-lift",
          label: "Pull tab to raise flower",
          control: "pull_tab",
          minimumValue: 0,
          maximumValue: 30,
          homeValue: 0,
          unit: "mm",
          direction: 1,
        },
        outputs: [
          {
            outputId: "output-flower-lift",
            jointId: "joint-flower-lift",
            bodyId: "body-flower-crown",
            label: "Flower crown lift",
            minimumValue: 0,
            maximumValue: 30,
            unit: "mm",
            direction: 1,
          },
        ],
        couplings: [],
        semanticParts: [
          {
            semanticPartId: "part-flower-base",
            label: "Flower card base",
            role: "grounded flower card support",
            geometryRefs: [{ kind: "panel", id: "panel-flower-base" }],
          },
          {
            semanticPartId: "part-flower-petals",
            label: "Flower petals",
            role: "moving faceted flower petal crown",
            geometryRefs: [
              { kind: "panel", id: "panel-flower-crown" },
              { kind: "output", id: "output-flower-lift" },
            ],
          },
          {
            semanticPartId: "part-flower-pull-tab",
            label: "Pull tab guide",
            role: "pull tab prismatic guide",
            geometryRefs: [
              { kind: "driver", id: "driver-flower-pull-tab" },
              { kind: "connector", id: "connector-flower-guide-tab" },
              { kind: "connector", id: "connector-flower-guide-slot" },
            ],
          },
        ],
        assemblyOperations: [
          {
            operationId: "assembly-flower-cut",
            order: 1,
            kind: "cut",
            targetRefs: [
              { kind: "panel", id: "panel-flower-base" },
              { kind: "panel", id: "panel-flower-crown" },
            ],
            dependsOnOperationIds: [],
            instruction: "Cut the card base, flower crown, and guide features.",
          },
          {
            operationId: "assembly-flower-guide",
            order: 2,
            kind: "insert_tab",
            targetRefs: [
              { kind: "connector", id: "connector-flower-guide-tab" },
              { kind: "connector", id: "connector-flower-guide-slot" },
            ],
            dependsOnOperationIds: ["assembly-flower-cut"],
            instruction:
              "Engage the flower guide tab with its slot while preserving clearance.",
          },
          {
            operationId: "assembly-flower-slider",
            order: 3,
            kind: "engage_slider",
            targetRefs: [{ kind: "joint", id: "joint-flower-lift" }],
            dependsOnOperationIds: ["assembly-flower-guide"],
            instruction:
              "Engage the rigid lift guide and check the full 30 mm travel by hand.",
          },
          {
            operationId: "assembly-flower-verify",
            order: 4,
            kind: "verify",
            targetRefs: [{ kind: "output", id: "output-flower-lift" }],
            dependsOnOperationIds: ["assembly-flower-slider"],
            instruction:
              "Verify unobstructed flower travel from 0 to 30 mm without claiming force performance.",
          },
        ],
      },
      semanticConstraints: constraints,
      assemblyStrategy: "articulated_tab_slot",
      designSummary:
        "Offline showcase only. The deterministic mechanism is a rigid flower crown on a 30 mm vertical prismatic guide controlled as a pull tab. The current grammar does not model a paper linkage that converts a horizontal pull into vertical lift, spring force, or material deformation.",
    };
    return {
      showcaseId: "pull-tab-pop-up-flower",
      availability: "offline_showcase_only",
      livePromptRouting: false,
      prompt,
      limitation:
        "Verified motion is a rigid vertical prismatic lift; horizontal-to-vertical paper linkage forces and material spring behavior are not simulated.",
      intent,
      program,
    };
  };

export const createOfflineFabricationShowcases =
  (): readonly OfflineFabricationShowcase[] => [
    createFacetedDuckGiftBoxShowcase(),
    createModularCableOrganizerShowcase(),
    createPullTabPopUpFlowerShowcase(),
  ];
