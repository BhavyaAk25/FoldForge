import earcut from "earcut";

import type { CreaseAssignment, CreasePatternV1 } from "./crease-pattern";

/**
 * Bar-and-hinge folding simulation, solved with position-based dynamics.
 *
 * Each face is triangulated; every triangle edge is a stiff bar (paper does
 * not stretch) and every interior edge is a hinge. Crease hinges are driven
 * toward their target fold angle as `progress` goes from 0 to 1; facet hinges
 * (triangulation diagonals and flat reference lines) are held flat. Bar
 * strain after solving measures how far the motion is from rigid paper, the
 * same quantity Origami Simulator reports.
 */

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Hinge {
  /** Edge endpoints, then the opposite vertex of each adjacent triangle. */
  readonly edge: readonly [number, number];
  readonly wings: readonly [number, number];
  /**
   * Sign of the target dihedral angle. The dihedral is positive when the
   * crease rises toward a viewer in front of the sheet (a mountain), so
   * mountain = +1, valley = -1, and 0 is a facet held flat.
   */
  readonly sign: -1 | 0 | 1;
}

export interface FoldFrame {
  readonly progress: number;
  /** Flattened x, y, z per vertex, in unit-sheet coordinates. */
  readonly positions: readonly number[];
}

export interface FoldSimulation {
  readonly triangles: readonly (readonly [number, number, number])[];
  readonly frames: readonly FoldFrame[];
  /** Largest relative bar length change at any frame. */
  readonly maxStrain: number;
  /** Relative bar length change at the final frame. */
  readonly finalStrain: number;
  /** Largest crease angle error at the final frame, in degrees. */
  readonly finalCreaseErrorDeg: number;
}

/**
 * Creases stop short of 180 degrees: exactly flat layers would sit on top of
 * each other and the signed dihedral angle would wrap at +/-180.
 */
const MAX_FOLD_ANGLE = (170 * Math.PI) / 180;
const BAR_STIFFNESS = 1;
const CREASE_STIFFNESS = 0.2;
const FACET_STIFFNESS = 0.6;

const sub = (p: Vec3, q: Vec3): Vec3 => ({
  x: p.x - q.x,
  y: p.y - q.y,
  z: p.z - q.z,
});
const dot = (p: Vec3, q: Vec3): number => p.x * q.x + p.y * q.y + p.z * q.z;
const cross = (p: Vec3, q: Vec3): Vec3 => ({
  x: p.y * q.z - p.z * q.y,
  y: p.z * q.x - p.x * q.z,
  z: p.x * q.y - p.y * q.x,
});
const scale = (p: Vec3, s: number): Vec3 => ({
  x: p.x * s,
  y: p.y * s,
  z: p.z * s,
});
const norm = (p: Vec3): number => Math.sqrt(dot(p, p));

const triangulate = (cp: CreasePatternV1): [number, number, number][] =>
  cp.faces.flatMap((face) => {
    const flat = face.flatMap((vertex) => [
      cp.vertices[vertex]!.x,
      cp.vertices[vertex]!.y,
    ]);
    const local = earcut(flat);
    const triangles: [number, number, number][] = [];
    for (let i = 0; i + 2 < local.length; i += 3) {
      triangles.push([
        face[local[i]!]!,
        face[local[i + 1]!]!,
        face[local[i + 2]!]!,
      ]);
    }
    return triangles;
  });

const hingesFor = (
  cp: CreasePatternV1,
  triangles: readonly (readonly [number, number, number])[],
): Hinge[] => {
  const assignments = new Map<string, CreaseAssignment>();
  for (const edge of cp.edges) {
    assignments.set(
      `${Math.min(edge.a, edge.b)}-${Math.max(edge.a, edge.b)}`,
      edge.assignment,
    );
  }
  // For each directed edge, the opposite vertex of the triangle on its left.
  const leftOpposite = new Map<string, number>();
  for (const [a, b, c] of triangles) {
    for (const [p, q, r] of [
      [a, b, c],
      [b, c, a],
      [c, a, b],
    ] as const) {
      leftOpposite.set(`${p}-${q}`, r);
    }
  }
  const hinges: Hinge[] = [];
  for (const [key, left] of leftOpposite) {
    const [p, q] = key.split("-").map(Number) as [number, number];
    if (p > q) continue;
    const right = leftOpposite.get(`${q}-${p}`);
    if (right === undefined) continue;
    const assignment = assignments.get(`${p}-${q}`);
    hinges.push({
      edge: [p, q],
      wings: [left, right],
      sign: assignment === "M" ? 1 : assignment === "V" ? -1 : 0,
    });
  }
  return hinges;
};

/**
 * Signed dihedral angle of a hinge and its gradient with respect to the four
 * vertices (Bridson et al. 2003), returned as [edge0, edge1, wing0, wing1].
 */
export const dihedral = (
  points: readonly Vec3[],
  hinge: Hinge,
): { readonly angle: number; readonly gradient: readonly Vec3[] } | null => {
  const x3 = points[hinge.edge[0]]!;
  const x4 = points[hinge.edge[1]]!;
  const x1 = points[hinge.wings[0]]!;
  const x2 = points[hinge.wings[1]]!;
  const e = sub(x4, x3);
  const eLength = norm(e);
  const n1 = cross(sub(x1, x3), sub(x1, x4));
  const n2 = cross(sub(x2, x4), sub(x2, x3));
  const n1Squared = dot(n1, n1);
  const n2Squared = dot(n2, n2);
  if (eLength < 1e-12 || n1Squared < 1e-20 || n2Squared < 1e-20) return null;
  const n1Hat = scale(n1, 1 / Math.sqrt(n1Squared));
  const n2Hat = scale(n2, 1 / Math.sqrt(n2Squared));
  const angle = Math.atan2(
    dot(cross(n1Hat, n2Hat), scale(e, 1 / eLength)),
    dot(n1Hat, n2Hat),
  );
  // Each wing moves along its triangle's normal with magnitude 1/height;
  // the hinge endpoints take the opposite, split by where each wing projects
  // onto the hinge, so the gradient sums to zero (translation invariance).
  const g1 = scale(n1, -eLength / n1Squared);
  const g2 = scale(n2, -eLength / n2Squared);
  const t1 = dot(sub(x1, x3), e) / (eLength * eLength);
  const t2 = dot(sub(x2, x3), e) / (eLength * eLength);
  const g3 = {
    x: -(1 - t1) * g1.x - (1 - t2) * g2.x,
    y: -(1 - t1) * g1.y - (1 - t2) * g2.y,
    z: -(1 - t1) * g1.z - (1 - t2) * g2.z,
  };
  const g4 = {
    x: -t1 * g1.x - t2 * g2.x,
    y: -t1 * g1.y - t2 * g2.y,
    z: -t1 * g1.z - t2 * g2.z,
  };
  return { angle, gradient: [g3, g4, g1, g2] };
};

const maxStrainOf = (
  points: readonly Vec3[],
  bars: readonly (readonly [number, number, number])[],
): number =>
  bars.reduce(
    (worst, [p, q, rest]) =>
      Math.max(
        worst,
        Math.abs(norm(sub(points[p]!, points[q]!)) - rest) / rest,
      ),
    0,
  );

export const simulateFolding = (
  cp: CreasePatternV1,
  options: {
    readonly frames?: number;
    readonly iterations?: number;
    /** Vertices held in place, which fixes the frame the result is in. */
    readonly pinned?: readonly number[];
  } = {},
): FoldSimulation => {
  const frameCount = options.frames ?? 24;
  const iterations = options.iterations ?? 160;
  const pinned = new Set(options.pinned ?? []);
  const triangles = triangulate(cp);
  const hinges = hingesFor(cp, triangles);
  const points: Vec3[] = cp.vertices.map(({ x, y }) => ({ x, y, z: 0 }));
  const barKeys = new Set<string>();
  const bars: [number, number, number][] = [];
  for (const [a, b, c] of triangles) {
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = `${Math.min(p, q)}-${Math.max(p, q)}`;
      if (barKeys.has(key)) continue;
      barKeys.add(key);
      bars.push([p, q, norm(sub(points[p]!, points[q]!))]);
    }
  }

  const frames: FoldFrame[] = [];
  let maxStrain = 0;
  let finalCreaseErrorDeg = 0;
  for (let frame = 0; frame <= frameCount; frame += 1) {
    const progress = frame / frameCount;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (const [p, q, rest] of bars) {
        const delta = sub(points[q]!, points[p]!);
        const distance = norm(delta);
        if (distance < 1e-12) continue;
        // A pinned end does not move, so the free end takes the whole correction.
        const share = pinned.has(p) || pinned.has(q) ? 1 : 0.5;
        const correction = scale(
          delta,
          (BAR_STIFFNESS * (distance - rest) * share) / distance,
        );
        if (!pinned.has(p))
          points[p] = {
            x: points[p]!.x + correction.x,
            y: points[p]!.y + correction.y,
            z: points[p]!.z + correction.z,
          };
        if (!pinned.has(q))
          points[q] = {
            x: points[q]!.x - correction.x,
            y: points[q]!.y - correction.y,
            z: points[q]!.z - correction.z,
          };
      }
      for (const hinge of hinges) {
        const state = dihedral(points, hinge);
        if (!state) continue;
        const target = hinge.sign * MAX_FOLD_ANGLE * progress;
        const stiffness = hinge.sign === 0 ? FACET_STIFFNESS : CREASE_STIFFNESS;
        const denominator = state.gradient.reduce(
          (sum, g) => sum + dot(g, g),
          0,
        );
        if (denominator < 1e-20) continue;
        const s = (stiffness * (state.angle - target)) / denominator;
        const vertices = [
          hinge.edge[0],
          hinge.edge[1],
          hinge.wings[0],
          hinge.wings[1],
        ];
        vertices.forEach((vertex, i) => {
          if (pinned.has(vertex)) return;
          const g = state.gradient[i]!;
          points[vertex] = {
            x: points[vertex]!.x - s * g.x,
            y: points[vertex]!.y - s * g.y,
            z: points[vertex]!.z - s * g.z,
          };
        });
      }
    }
    maxStrain = Math.max(maxStrain, maxStrainOf(points, bars));
    finalCreaseErrorDeg = hinges.reduce((worst, hinge) => {
      if (hinge.sign === 0) return worst;
      const state = dihedral(points, hinge);
      const target = hinge.sign * MAX_FOLD_ANGLE * progress;
      return state
        ? Math.max(worst, (Math.abs(state.angle - target) * 180) / Math.PI)
        : worst;
    }, 0);
    frames.push({
      progress,
      positions: points.flatMap(({ x, y, z }) => [x, y, z]),
    });
  }
  return {
    triangles,
    frames,
    maxStrain,
    finalStrain: maxStrainOf(points, bars),
    finalCreaseErrorDeg,
  };
};
