declare module "fold" {
  interface FoldGraph {
    readonly vertices_coords: readonly (readonly [number, number])[];
    readonly edges_vertices: readonly (readonly [number, number])[];
    readonly edges_assignment: readonly string[];
    readonly faces_vertices?: readonly (readonly number[])[];
    readonly [key: string]: unknown;
  }

  interface FoldLibrary {
    readonly convert: {
      readonly edges_vertices_to_faces_vertices: (
        graph: FoldGraph,
      ) => FoldGraph;
    };
    readonly filter: {
      readonly edgesAssigned: (
        graph: FoldGraph,
        assignment: string,
      ) => readonly number[];
      readonly numEdges: (graph: FoldGraph) => number;
      readonly numFaces: (graph: FoldGraph) => number;
    };
  }

  const fold: FoldLibrary;
  export default fold;
}
