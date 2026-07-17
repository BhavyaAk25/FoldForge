export {
  CALIBRATION_LENGTH_MM,
  FABRICATION_EXPORTER_VERSION,
  sourceIrHash,
  type FabricationExportArtifact,
  type FabricationExportError,
  type FabricationExportResult,
  type VerifiedFabricationExportSource,
} from "./artifact";
export { dxfArtifactMatchesSource, exportFabricationDxf } from "./dxf";
export {
  exportFabricationFold,
  FOLD_EXTENSION_KEYS,
  foldArtifactMatchesSource,
  inspectFabricationFoldCompatibility,
  type FabricationFoldCompatibilitySource,
  type FoldCompatibilityResult,
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
