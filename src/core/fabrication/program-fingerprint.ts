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
  // Array.indexOf yields -1 for an unresolved reference, which still hashes
  // deterministically; the compiler rejects such programs separately.
  const panelIds = program.blueprint.panels.map((panel) => panel.panelId);
  const bodyIds = program.blueprint.bodies.map((body) => body.bodyId);
  const jointIds = program.blueprint.joints.map((joint) => joint.jointId);
  return sha256Hex(
    canonicalSerialize({
      behavior: program.behavior,
      panels: program.blueprint.panels.map((panel) => ({
        body: bodyIds.indexOf(panel.bodyId),
        role: panel.role,
        outerVertexCount: panel.contour.vertices.length,
        innerVertexCounts: panel.innerCutContours.map(
          (contour) => contour.vertices.length,
        ),
      })),
      bodies: program.blueprint.bodies.map((body) => ({
        grounded: body.grounded,
        panels: body.panelIds.map((panelId) => panelIds.indexOf(panelId)),
      })),
      joints: program.blueprint.joints.map((joint) => ({
        kind: joint.kind,
        parent: bodyIds.indexOf(joint.parentBodyId),
        child: bodyIds.indexOf(joint.childBodyId),
      })),
      connectors: program.blueprint.connectors.map((connector) => ({
        kind: connector.kind,
        panel: panelIds.indexOf(connector.panelId),
      })),
      driver: program.blueprint.driver
        ? {
            control: program.blueprint.driver.control,
            joint: jointIds.indexOf(program.blueprint.driver.jointId),
          }
        : null,
      outputs: program.blueprint.outputs.map((output) => ({
        joint: jointIds.indexOf(output.jointId),
        body: bodyIds.indexOf(output.bodyId),
        unit: output.unit,
      })),
      couplings: program.blueprint.couplings.map((coupling) => coupling.kind),
      assemblyStrategy: program.assemblyStrategy,
    }),
  );
};
