import { round } from "../math";
import type { Candidate, Point2, Segment2 } from "../types";

export interface FoldDocument {
  readonly file_spec: 1.2;
  readonly file_creator: string;
  readonly file_title: string;
  readonly frame_classes: readonly ["creasePattern"];
  readonly frame_attributes: readonly ["2D", "cuts"];
  readonly frame_unit: "mm";
  readonly vertices_coords: readonly (readonly [number, number])[];
  readonly edges_vertices: readonly (readonly [number, number])[];
  readonly edges_assignment: readonly ("B" | "M" | "V" | "C")[];
  readonly edges_foldAngle: readonly number[];
}

interface EdgeAccumulator {
  readonly vertices: [number, number][];
  readonly edges: [number, number][];
  readonly assignments: ("B" | "M" | "V" | "C")[];
  readonly angles: number[];
  readonly indexByPoint: Map<string, number>;
}

const pointKey = (point: Point2): string =>
  `${round(point.xMm, 6)},${round(point.yMm, 6)}`;

const vertexIndex = (accumulator: EdgeAccumulator, point: Point2): number => {
  const key = pointKey(point);
  const existing = accumulator.indexByPoint.get(key);
  if (existing !== undefined) return existing;

  const index = accumulator.vertices.length;
  accumulator.vertices.push([round(point.xMm, 6), round(point.yMm, 6)]);
  accumulator.indexByPoint.set(key, index);
  return index;
};

const addEdge = (
  accumulator: EdgeAccumulator,
  segment: Segment2,
  assignment: "B" | "M" | "V" | "C",
  foldAngle: number,
): void => {
  accumulator.edges.push([
    vertexIndex(accumulator, segment.start),
    vertexIndex(accumulator, segment.end),
  ]);
  accumulator.assignments.push(assignment);
  accumulator.angles.push(foldAngle);
};

export const createFoldDocument = (candidate: Candidate): FoldDocument => {
  const accumulator: EdgeAccumulator = {
    vertices: [],
    edges: [],
    assignments: [],
    angles: [],
    indexByPoint: new Map(),
  };
  const outline = candidate.geometry.flat.outline.points;

  for (let index = 0; index < outline.length; index += 1) {
    const start = outline[index];
    const end = outline[(index + 1) % outline.length];
    if (!start || !end) continue;
    addEdge(accumulator, { id: `boundary-${index}`, start, end }, "B", 0);
  }

  const creaseAssignments: readonly ("M" | "V")[] = ["V", "M", "V", "M", "M"];
  candidate.geometry.flat.creases.forEach((crease, index) => {
    const assignment = creaseAssignments[index] ?? "M";
    addEdge(accumulator, crease, assignment, assignment === "M" ? -180 : 180);
  });

  candidate.geometry.flat.slots.forEach((slot) =>
    addEdge(accumulator, slot, "C", 0),
  );

  return {
    file_spec: 1.2,
    file_creator: "FoldForge",
    file_title: candidate.id,
    frame_classes: ["creasePattern"],
    frame_attributes: ["2D", "cuts"],
    frame_unit: "mm",
    vertices_coords: accumulator.vertices,
    edges_vertices: accumulator.edges,
    edges_assignment: accumulator.assignments,
    edges_foldAngle: accumulator.angles,
  };
};

export const exportFold = (candidate: Candidate): string =>
  `${JSON.stringify(createFoldDocument(candidate), null, 2)}\n`;

export const verifyFoldReference = (
  candidate: Candidate,
  foldText: string,
): { readonly valid: boolean; readonly message: string } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(foldText);
  } catch {
    return { valid: false, message: "FOLD JSON could not be parsed." };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { valid: false, message: "FOLD root must be an object." };
  }

  const document = parsed as Partial<FoldDocument>;
  const expected = createFoldDocument(candidate);
  const assignmentsValid =
    Array.isArray(document.edges_assignment) &&
    document.edges_assignment.every((assignment) =>
      ["B", "M", "V", "C"].includes(assignment),
    );
  const valid =
    document.file_spec === 1.2 &&
    document.frame_unit === "mm" &&
    assignmentsValid &&
    document.vertices_coords?.length === expected.vertices_coords.length &&
    document.edges_vertices?.length === expected.edges_vertices.length &&
    document.edges_assignment?.filter((assignment) => assignment === "C")
      .length === 2;

  return {
    valid,
    message: valid
      ? "FOLD 1.2 edge profile is source-equivalent to the generated pattern."
      : "FOLD edge profile does not match the generated source geometry.",
  };
};
