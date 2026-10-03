import { canonicalSerialize } from "../canonical";
import { sha256Hex } from "../sha256";
import { FabricationProgramV1Schema } from "./schemas";
import type { FabricationProgramV1 } from "./types";

/**
 * Hash of a program's structure (panel roles, body/joint graph, connectors,
 * driver, outputs) with identifiers replaced by indexes, so two programs that
 * differ only in names or dimensions share a fingerprint.
 */
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
