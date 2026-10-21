import type { CreasePatternV1, Point2 } from "./crease-pattern";

/**
 * Placing faces in 3D by turning them about their creases. A flat-folded
 * base collapses this way in its illustration; a model that ends as a 3D
 * form (a box with its walls standing) is placed this way exactly, and its
 * closure proves rigid paper can hold it.
 */

/** How far the crease between two points folds when finished, in degrees: 180 lies flat, 90 stands a wall up. */
export type FormAngle = (from: Point2, to: Point2) => number;

/** Area centroid of a face on the sheet. */
const centroidOf = (cp: CreasePatternV1, face: number): Point2 => {
  const points = cp.faces[face]!.map((v) => cp.vertices[v]!);
  let [area, x, y] = [0, 0, 0];
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]!;
    const cross = p.x * q.y - q.x * p.y;
    area += cross;
    x += (p.x + q.x) * cross;
    y += (p.y + q.y) * cross;
  });
  return { x: x / (3 * area), y: y / (3 * area) };
};

/** 3x4, row-major: rotation then translation. */
export type Matrix = readonly number[];

const multiply = (m: Matrix, n: Matrix): number[] => {
  const out: number[] = [];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      let sum = c === 3 ? m[r * 4 + 3]! : 0;
      for (let k = 0; k < 3; k += 1) sum += m[r * 4 + k]! * n[k * 4 + c]!;
      out.push(sum);
    }
  }
  return out;
};

/** Rotation by `angle` about the in-plane line through p and q (Rodrigues). */
const rotationAbout = (p: Point2, q: Point2, angle: number): number[] => {
  const length = Math.hypot(q.x - p.x, q.y - p.y);
  const [ux, uy] = [(q.x - p.x) / length, (q.y - p.y) / length];
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const r = [
    c + ux * ux * (1 - c),
    ux * uy * (1 - c),
    uy * s,
    ux * uy * (1 - c),
    c + uy * uy * (1 - c),
    -ux * s,
    -uy * s,
    ux * s,
    c,
  ];
  // Fix p: translation = p - R p.
  const t = [
    p.x - (r[0]! * p.x + r[1]! * p.y),
    p.y - (r[3]! * p.x + r[4]! * p.y),
    -(r[6]! * p.x + r[7]! * p.y),
  ];
  return [
    r[0]!,
    r[1]!,
    r[2]!,
    t[0]!,
    r[3]!,
    r[4]!,
    r[5]!,
    t[1]!,
    r[6]!,
    r[7]!,
    r[8]!,
    t[2]!,
  ];
};

/**
 * Every face's placement after turning faces about their creases along a
 * spanning tree from the root face, each crease `progress` of the way to its
 * final angle (180 degrees, flat, unless `angle` says otherwise). At the end
 * this is the folded form; frames in between are an illustration, not a
 * simulation, since a tree ignores the creases that close loops.
 */
export const facePlacements = (
  base: CreasePatternV1,
  root: number,
  progress: number,
  angle: FormAngle | null = null,
): Matrix[] => {
  const transforms: (number[] | null)[] = base.faces.map(() => null);
  transforms[root] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  const edgeFaces = new Map<string, number[]>();
  base.faces.forEach((face, f) =>
    face.forEach((v, i) => {
      const w = face[(i + 1) % face.length]!;
      const key = v < w ? `${v}-${w}` : `${w}-${v}`;
      edgeFaces.set(key, [...(edgeFaces.get(key) ?? []), f]);
    }),
  );
  const queue = [root];
  while (queue.length > 0) {
    const face = queue.shift()!;
    for (const edge of base.edges) {
      const pair =
        edgeFaces.get(
          edge.a < edge.b ? `${edge.a}-${edge.b}` : `${edge.b}-${edge.a}`,
        ) ?? [];
      if (pair.length !== 2 || !pair.includes(face)) continue;
      const child = pair[0] === face ? pair[1]! : pair[0]!;
      if (transforms[child]) continue;
      const [p, q] = [base.vertices[edge.a]!, base.vertices[edge.b]!];
      let local = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
      if (edge.assignment === "M" || edge.assignment === "V") {
        // Valleys lift the child toward the viewer (+z), mountains lower it.
        const centre = centroidOf(base, child);
        const probe = rotationAbout(p, q, 0.1);
        const lifts =
          probe[8]! * centre.x + probe[9]! * centre.y + probe[11]! > 0;
        const sign = (edge.assignment === "V") === lifts ? 1 : -1;
        const deg = angle ? angle(p, q) : 180;
        local = rotationAbout(p, q, (sign * deg * Math.PI * progress) / 180);
      }
      transforms[child] = multiply(transforms[face]!, local);
      queue.push(child);
    }
  }
  return transforms.map((t) => t ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
};

/** A point of the sheet carried by a face's placement. */
export const place = (m: Matrix, p: Point2): [number, number, number] => [
  m[0]! * p.x + m[1]! * p.y + m[3]!,
  m[4]! * p.x + m[5]! * p.y + m[7]!,
  m[8]! * p.x + m[9]! * p.y + m[11]!,
];

/**
 * How far apart, in sheet widths, the two faces of any crease put its ends:
 * zero means every loop of faces closes, so rigid paper can hold the form.
 * The tree places each face through one path; this checks all the others.
 */
export const closure = (
  base: CreasePatternV1,
  placements: readonly Matrix[],
): number => {
  const facesOf = new Map<string, number[]>();
  base.faces.forEach((face, f) =>
    face.forEach((v, i) => {
      const w = face[(i + 1) % face.length]!;
      const key = v < w ? `${v}-${w}` : `${w}-${v}`;
      facesOf.set(key, [...(facesOf.get(key) ?? []), f]);
    }),
  );
  let worst = 0;
  for (const edge of base.edges) {
    const pair =
      facesOf.get(
        edge.a < edge.b ? `${edge.a}-${edge.b}` : `${edge.b}-${edge.a}`,
      ) ?? [];
    if (pair.length !== 2) continue;
    for (const v of [edge.a, edge.b]) {
      const [s, t] = [
        place(placements[pair[0]!]!, base.vertices[v]!),
        place(placements[pair[1]!]!, base.vertices[v]!),
      ];
      worst = Math.max(
        worst,
        Math.hypot(s[0] - t[0], s[1] - t[1], s[2] - t[2]),
      );
    }
  }
  return worst;
};
