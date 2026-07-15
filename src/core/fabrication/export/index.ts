export {
  CALIBRATION_LENGTH_MM,
  FABRICATION_EXPORTER_VERSION,
  sourceIrHash,
  type FabricationExportArtifact,
  type FabricationExportError,
  type FabricationExportResult,
  type VerifiedFabricationExportSource,
} from "./artifact";
export { exportFabricationDxf } from "./dxf";
export {
  exportFabricationFold,
  type FoldExportResult,
  type FoldOmissionCode,
  type FoldOmissionReason,
} from "./fold";
export { exportFabricationGlb, glbArtifactMatchesSource } from "./glb";
export {
  exportFabricationJson,
  type FabricationJsonExportSource,
} from "./json";
export { exportFabricationSvg } from "./svg";
