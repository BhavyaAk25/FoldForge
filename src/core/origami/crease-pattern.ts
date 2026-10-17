import { err, ok, type Result } from "../result";

/**
 * A crease pattern on one square sheet, in unit coordinates: the sheet is
 * [0, 1] x [0, 1] and is scaled to millimetres only for export.
 *
 * M = mountain, V = valley, B = sheet border, F = flat (drawn as a reference
 * line, never folded). Mountain/valley are as seen from the front of the sheet.
 */

export type CreaseAssignment = "M" | "V" | "B" | "F";

export interface Point2 {
  readonly x: number;
  readonly y: number;
}

export interface CreaseEdge {
  readonly a: number;
  readonly b: number;
  readonly assignment: CreaseAssignment;
}

export interface CreasePatternV1 {
  readonly version: "1";
  readonly vertices: readonly Point2[];
  readonly edges: readonly CreaseEdge[];
  /** Counter-clockwise vertex loops of the faces between creases. */
  readonly faces: readonly (readonly number[])[];
}

export interface CreaseSegment {
  readonly from: Point2;
  readonly to: Point2;
  readonly assignment: Exclude<CreaseAssignment, "B">;
}

export type CreasePatternError =
  | { readonly kind: "outside_sheet"; readonly segment: number }
  | { readonly kind: "degenerate_segment"; readonly segment: number }
  | { readonly kind: "conflicting_overlap"; readonly at: Point2 };

/** Coordinates closer than this are the same point (unit square). */
const EPSILON = 1e-9;

const sub = (p: Point2, q: Point2): Point2 => ({ x: p.x - q.x, y: p.y - q.y });
const cross = (p: Point2, q: Point2): number => p.x * q.y - p.y * q.x;
const dot = (p: Point2, q: Point2): number => p.x * q.x + p.y * q.y;
const length = (p: Point2): number => Math.hypot(p.x, p.y);

const inSheet = ({ x, y }: Point2): boolean =>
  x >= -EPSILON && x <= 1 + EPSILON && y >= -EPSILON && y <= 1 + EPSILON;

/**
 * Parameters t along `segment` where it meets other segments. A crease that
 * stops within `snap` of this one (a T-junction in a digitized drawing) still
 * splits it, so the two meet at a shared vertex.
 */
const splitParameters = (
  segment: { readonly from: Point2; readonly to: Point2 },
  others: readonly { readonly from: Point2; readonly to: Point2 }[],
  snap: number,
): number[] => {
  const d = sub(segment.to, segment.from);
  const cuts = [0, 1];
  for (const other of others) {
    const e = sub(other.to, other.from);
    const denominator = cross(d, e);
    const offset = sub(other.from, segment.from);
    if (Math.abs(denominator) > EPSILON) {
      const t = cross(offset, e) / denominator;
      const u = cross(offset, d) / denominator;
      const reach = snap / length(e);
      if (t > EPSILON && t < 1 - EPSILON && u > -reach && u < 1 + reach) {
        cuts.push(t);
      }
      continue;
    }
    // Parallel: if collinear, the other segment's endpoints split this one.
    if (Math.abs(cross(offset, d)) / length(d) > snap) continue;
    for (const end of [other.from, other.to]) {
      const t = dot(sub(end, segment.from), d) / dot(d, d);
      if (t > EPSILON && t < 1 - EPSILON) cuts.push(t);
    }
  }
  return [...new Set(cuts.map((t) => Math.round(t * 1e12) / 1e12))].sort(
    (a, b) => a - b,
  );
};

/** Planar faces: walk each directed edge, turning to the next edge clockwise. */
const facesOf = (
  vertices: readonly Point2[],
  edges: readonly CreaseEdge[],
): number[][] => {
  const neighbours = vertices.map(() => [] as number[]);
  for (const { a, b } of edges) {
    neighbours[a]!.push(b);
    neighbours[b]!.push(a);
  }
  const angleFrom = (from: number, to: number): number => {
    const d = sub(vertices[to]!, vertices[from]!);
    return Math.atan2(d.y, d.x);
  };
  for (const [vertex, list] of neighbours.entries()) {
    list.sort((p, q) => angleFrom(vertex, p) - angleFrom(vertex, q));
  }
  const visited = new Set<string>();
  const faces: number[][] = [];
  for (const { a, b } of edges) {
    for (const [start, next] of [
      [a, b],
      [b, a],
    ] as const) {
      if (visited.has(`${start},${next}`)) continue;
      const face: number[] = [];
      let from = start;
      let to = next;
      while (!visited.has(`${from},${to}`)) {
        visited.add(`${from},${to}`);
        face.push(from);
        // Arriving at `to`, leave by the edge just clockwise of the way back.
        const around = neighbours[to]!;
        const back = around.indexOf(from);
        const leave = around[(back - 1 + around.length) % around.length]!;
        from = to;
        to = leave;
      }
      const area = face.reduce((sum, vertex, index) => {
        const nextVertex = face[(index + 1) % face.length]!;
        return sum + cross(vertices[vertex]!, vertices[nextVertex]!);
      }, 0);
      // The unbounded outside face winds clockwise (negative area).
      if (area > EPSILON) faces.push(face);
    }
  }
  return faces;
};

/**
 * Builds a crease pattern from crease segments: adds the sheet border, splits
 * every segment where it crosses another, and merges coincident vertices.
 */
export const buildCreasePattern = (
  segments: readonly CreaseSegment[],
  options: {
    /**
     * Points closer than this merge into one vertex. Exact constructions use
     * the default; drawings digitized to ~1e-5 of the sheet need ~1e-4.
     */
    readonly snapTolerance?: number;
  } = {},
): Result<CreasePatternV1, CreasePatternError> => {
  const snap = options.snapTolerance ?? 1e-7;
  const corners: Point2[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const all = [
    ...corners.map((from, index) => ({
      from,
      to: corners[(index + 1) % 4]!,
      assignment: "B" as CreaseAssignment,
    })),
    ...segments,
  ];
  for (const [index, segment] of segments.entries()) {
    if (!inSheet(segment.from) || !inSheet(segment.to)) {
      return err({ kind: "outside_sheet", segment: index });
    }
    if (length(sub(segment.to, segment.from)) < 1e-6) {
      return err({ kind: "degenerate_segment", segment: index });
    }
  }

  const vertices: Point2[] = [];
  const vertexAt = (p: Point2): number => {
    const found = vertices.findIndex(
      (v) => Math.abs(v.x - p.x) < snap && Math.abs(v.y - p.y) < snap,
    );
    if (found >= 0) return found;
    vertices.push({ x: p.x, y: p.y });
    return vertices.length - 1;
  };
  const edgesByKey = new Map<string, CreaseEdge>();
  for (const [index, segment] of all.entries()) {
    const others = all.filter((_, otherIndex) => otherIndex !== index);
    const cuts = splitParameters(segment, others, snap);
    const d = sub(segment.to, segment.from);
    for (let i = 0; i + 1 < cuts.length; i += 1) {
      const at = (t: number) => ({
        x: segment.from.x + d.x * t,
        y: segment.from.y + d.y * t,
      });
      const a = vertexAt(at(cuts[i]!));
      const b = vertexAt(at(cuts[i + 1]!));
      if (a === b) continue;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const existing = edgesByKey.get(key);
      if (existing && existing.assignment !== segment.assignment) {
        return err({ kind: "conflicting_overlap", at: vertices[a]! });
      }
      edgesByKey.set(key, { a, b, assignment: segment.assignment });
    }
  }
  const edges = [...edgesByKey.values()];
  return ok({ version: "1", vertices, edges, faces: facesOf(vertices, edges) });
};

export const isFolded = (assignment: CreaseAssignment): boolean =>
  assignment === "M" || assignment === "V";

export const onBorder = ({ x, y }: Point2): boolean =>
  x < 1e-7 || y < 1e-7 || x > 1 - 1e-7 || y > 1 - 1e-7;
