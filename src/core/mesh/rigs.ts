import type { Vec3 } from "./geometry";
import type { DecalSpec, PapercraftSpec, PartSpec, Shape } from "./model";

/**
 * Body types for 3D papercraft. Each rig turns a few bounded parameters
 * (overall length, colours, feature choices) into parts, so every
 * combination stays a good-looking, buildable model. x points forward
 * (the face), y to the left, z up; the model rests on z = 0.
 */

export interface Colors {
  /** Main surface. */
  readonly primary: string;
  /** Contrast surface: belly, snout, cabin, roof. */
  readonly secondary: string;
  /** Small details: beak, nose, wheels, eyes are always near-black. */
  readonly accent: string;
}

export type RigParams =
  | {
      readonly rig: "quadruped";
      readonly ears: "pointy" | "round" | "long" | "floppy" | "small";
      readonly snout: "short" | "long" | "flat";
      readonly tail: "thin" | "bushy" | "short" | "curly";
      readonly legs: "short" | "long";
    }
  | {
      readonly rig: "bird";
      readonly neck: "none" | "long";
      readonly beak: "flat" | "pointed";
      readonly stance: "sitting" | "upright";
      readonly crest: boolean;
    }
  | { readonly rig: "fish"; readonly fins: "small" | "tall" }
  | { readonly rig: "vehicle"; readonly cabin: "car" | "bus" | "truck" }
  | { readonly rig: "building"; readonly roof: "pyramid" | "tower" }
  | { readonly rig: "tree"; readonly crown: "round" | "pine" }
  | { readonly rig: "figure"; readonly build: "robot" | "snowman" | "person" }
  | { readonly rig: "cardbox" };

export interface FigureSpec {
  readonly title: string;
  /** Overall length (or height for upright figures), mm. */
  readonly sizeMm: number;
  readonly colors: Colors;
  readonly params: RigParams;
}

const EYE = "#1d1d1d";
const ELLIPSOID: Shape = { kind: "ellipsoid", segments: 8, rings: 5 };
/** Small parts (ears, feet) need fewer, larger faces to leave room for tabs. */
const PEBBLE: Shape = { kind: "ellipsoid", segments: 6, rings: 4 };
const taper = (sides: number, top: number): Shape => ({
  kind: "taper",
  sides,
  top,
});

interface Builder {
  readonly parts: PartSpec[];
  readonly decals: DecalSpec[];
}

const make = (): Builder => ({ parts: [], decals: [] });
const add = (
  b: Builder,
  id: string,
  name: string,
  shape: Shape,
  size: Vec3,
  position: Vec3,
  color: string,
  rotation?: Vec3,
) =>
  b.parts.push({
    id,
    name,
    shape,
    size,
    position,
    color,
    ...(rotation ? { rotation } : {}),
  });
const eyes = (
  b: Builder,
  part: string,
  forward: number,
  side: number,
  up: number,
  radius: number,
) => {
  b.decals.push({
    part,
    direction: [forward, side, up],
    radiusMm: radius,
    color: EYE,
  });
  b.decals.push({
    part,
    direction: [forward, -side, up],
    radiusMm: radius,
    color: EYE,
  });
};

/**
 * Height of a smooth ellipsoid's top surface above (x, y), or its centre
 * height outside it. The faceted part lies inside the smooth one, so a part
 * placed here sinks slightly into its parent and can be glued.
 */
const surfaceZ = (centre: Vec3, size: Vec3, x: number, y: number): number => {
  const [rx, ry, rz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const t = 1 - ((x - centre[0]) / rx) ** 2 - ((y - centre[1]) / ry) ** 2;
  return centre[2] + rz * Math.sqrt(Math.max(0, t));
};

const quadruped = (
  b: Builder,
  L: number,
  c: Colors,
  p: Extract<RigParams, { rig: "quadruped" }>,
) => {
  const legH = p.legs === "long" ? 0.32 * L : 0.16 * L;
  const body: Vec3 = [L, 0.5 * L, 0.42 * L];
  const bodyAt: Vec3 = [0, 0, legH + body[2] / 2 - 0.04 * L];
  add(b, "body", "Body", ELLIPSOID, body, bodyAt, c.primary);
  for (const [x, y, name] of [
    [0.27, 0.15, "Front leg"],
    [-0.27, 0.15, "Back leg"],
  ] as const) {
    for (const side of [1, -1]) {
      add(
        b,
        `${name.toLowerCase().replace(" ", "-")}-${side > 0 ? "l" : "r"}`,
        name,
        taper(6, 0.85),
        [0.12 * L, 0.12 * L, legH + 0.06 * L],
        [x * L, side * y * L, (legH + 0.06 * L) / 2],
        c.primary,
      );
    }
  }
  const head: Vec3 = [0.36 * L, 0.34 * L, 0.32 * L];
  const headAt: Vec3 = [0.48 * L, 0, bodyAt[2] + 0.2 * L];
  add(b, "head", "Head", ELLIPSOID, head, headAt, c.primary);
  const snoutLength = { short: 0.12, long: 0.24, flat: 0.06 }[p.snout] * L;
  const snoutAt: Vec3 = [
    headAt[0] + head[0] * 0.42 + snoutLength / 2,
    0,
    headAt[2] - 0.05 * L,
  ];
  add(
    b,
    "snout",
    "Snout",
    taper(6, p.snout === "long" ? 0.45 : 0.75),
    [0.16 * L, 0.15 * L, snoutLength + 0.04 * L],
    snoutAt,
    c.secondary,
    [0, 90, 0],
  );
  b.decals.push({
    part: "snout",
    direction: [1, 0, 0.15],
    radiusMm: 0.035 * L,
    color: c.accent,
  });
  eyes(b, "head", 0.75, 0.45, 0.35, 0.035 * L);
  const earTop = surfaceZ(headAt, head, headAt[0] - 0.04 * L, 0.1 * L);
  for (const side of [1, -1]) {
    const y = side * 0.1 * L;
    const id = side > 0 ? "ear-l" : "ear-r";
    if (p.ears === "pointy")
      add(
        b,
        id,
        "Ear",
        taper(4, 0),
        [0.13 * L, 0.07 * L, 0.16 * L],
        [headAt[0] - 0.04 * L, y, earTop + 0.05 * L],
        c.primary,
        [side * -12, 0, 45],
      );
    if (p.ears === "small")
      add(
        b,
        id,
        "Ear",
        taper(4, 0),
        [0.08 * L, 0.05 * L, 0.09 * L],
        [headAt[0] - 0.04 * L, y, earTop + 0.02 * L],
        c.primary,
        [0, 0, 45],
      );
    if (p.ears === "round")
      add(
        b,
        id,
        "Ear",
        PEBBLE,
        [0.09 * L, 0.16 * L, 0.16 * L],
        [headAt[0] - 0.05 * L, side * 0.13 * L, earTop + 0.03 * L],
        c.secondary,
        [side * -20, 0, 0],
      );
    if (p.ears === "long")
      add(
        b,
        id,
        "Ear",
        taper(4, 0.5),
        [0.09 * L, 0.05 * L, 0.34 * L],
        [headAt[0] - 0.06 * L, side * 0.07 * L, earTop + 0.14 * L],
        c.primary,
        [side * -10, -12, 0],
      );
    if (p.ears === "floppy")
      add(
        b,
        id,
        "Ear",
        PEBBLE,
        [0.11 * L, 0.08 * L, 0.22 * L],
        [headAt[0] - 0.02 * L, side * 0.19 * L, headAt[2] - 0.02 * L],
        c.secondary,
        [side * 15, 0, 0],
      );
  }
  const back = -L / 2;
  if (p.tail === "thin")
    add(
      b,
      "tail",
      "Tail",
      taper(4, 0.25),
      [0.05 * L, 0.05 * L, 0.6 * L],
      [back - 0.22 * L, 0, bodyAt[2] - 0.08 * L],
      c.secondary,
      [0, -105, 0],
    );
  if (p.tail === "bushy")
    add(
      b,
      "tail",
      "Tail",
      ELLIPSOID,
      [0.45 * L, 0.2 * L, 0.2 * L],
      [back - 0.08 * L, 0, bodyAt[2] + 0.12 * L],
      c.secondary,
      [0, -35, 0],
    );
  if (p.tail === "short")
    add(
      b,
      "tail",
      "Tail",
      PEBBLE,
      [0.14 * L, 0.12 * L, 0.12 * L],
      [back + 0.02 * L, 0, bodyAt[2] + 0.08 * L],
      c.secondary,
    );
  if (p.tail === "curly")
    add(
      b,
      "tail",
      "Tail",
      taper(4, 0),
      [0.08 * L, 0.08 * L, 0.14 * L],
      [back - 0.02 * L, 0, bodyAt[2] + 0.06 * L],
      c.secondary,
      [0, -60, 0],
    );
};

const bird = (
  b: Builder,
  L: number,
  c: Colors,
  p: Extract<RigParams, { rig: "bird" }>,
) => {
  const upright = p.stance === "upright";
  const body: Vec3 = upright ? [0.62 * L, 0.56 * L, L] : [L, 0.7 * L, 0.6 * L];
  const bodyAt: Vec3 = [0, 0, body[2] / 2];
  add(b, "body", "Body", ELLIPSOID, body, bodyAt, c.primary);
  if (upright)
    add(
      b,
      "belly",
      "Belly",
      ELLIPSOID,
      [0.36 * L, 0.42 * L, 0.78 * L],
      [0.16 * L, 0, bodyAt[2] - 0.04 * L],
      c.secondary,
    );
  const headSize = (upright ? 0.4 : 0.46) * L;
  let headAt: Vec3 = upright
    ? [0.04 * L, 0, body[2] + 0.12 * L]
    : [0.36 * L, 0, surfaceZ(bodyAt, body, 0.36 * L, 0) + 0.15 * L];
  if (p.neck === "long") {
    add(
      b,
      "neck",
      "Neck",
      taper(6, 0.7),
      [0.13 * L, 0.13 * L, 0.55 * L],
      [0.38 * L, 0, body[2] + 0.12 * L],
      c.primary,
      [0, 18, 0],
    );
    headAt = [0.48 * L, 0, body[2] + 0.42 * L];
  }
  add(
    b,
    "head",
    "Head",
    ELLIPSOID,
    [headSize, headSize * 0.92, headSize * 0.95],
    headAt,
    c.primary,
  );
  if (p.beak === "flat")
    add(
      b,
      "beak",
      "Beak",
      taper(4, 0.35),
      [0.2 * L, 0.24 * L, 0.2 * L],
      [headAt[0] + headSize * 0.5 + 0.05 * L, 0, headAt[2] - 0.05 * L],
      c.accent,
      [45, 90, 0],
    );
  else
    add(
      b,
      "beak",
      "Beak",
      taper(6, 0),
      [0.11 * L, 0.11 * L, 0.18 * L],
      [headAt[0] + headSize * 0.5 + 0.06 * L, 0, headAt[2] - 0.03 * L],
      c.accent,
      [0, 90, 0],
    );
  eyes(b, "head", 0.55, 0.75, 0.35, 0.04 * L);
  if (p.crest)
    add(
      b,
      "crest",
      "Crest",
      taper(4, 0),
      [0.14 * L, 0.05 * L, 0.18 * L],
      [headAt[0], 0, headAt[2] + headSize * 0.5],
      "#d8342b",
      [0, 0, 45],
    );
  for (const side of [1, -1]) {
    add(
      b,
      side > 0 ? "wing-l" : "wing-r",
      "Wing",
      ELLIPSOID,
      upright ? [0.3 * L, 0.08 * L, 0.6 * L] : [0.6 * L, 0.08 * L, 0.32 * L],
      [
        upright ? -0.02 * L : -0.06 * L,
        side * body[1] * 0.48,
        bodyAt[2] + (upright ? 0 : 0.04 * L),
      ],
      c.secondary,
      upright ? [side * 12, 0, 0] : [side * 10, -12, 0],
    );
  }
  if (!upright)
    add(
      b,
      "tail",
      "Tail",
      taper(4, 0),
      [0.32 * L, 0.3 * L, 0.3 * L],
      [-0.55 * L, 0, bodyAt[2] + 0.12 * L],
      c.primary,
      [45, -65, 0],
    );
  if (upright) {
    for (const side of [1, -1])
      add(
        b,
        side > 0 ? "foot-l" : "foot-r",
        "Foot",
        PEBBLE,
        [0.22 * L, 0.13 * L, 0.08 * L],
        [0.12 * L, side * 0.12 * L, 0.04 * L],
        c.accent,
      );
  }
};

const fish = (
  b: Builder,
  L: number,
  c: Colors,
  p: Extract<RigParams, { rig: "fish" }>,
) => {
  const body: Vec3 = [L, 0.26 * L, 0.5 * L];
  const bodyAt: Vec3 = [0, 0, 0.25 * L + (p.fins === "tall" ? 0 : 0)];
  add(b, "body", "Body", ELLIPSOID, body, bodyAt, c.primary);
  add(
    b,
    "tail",
    "Tail fin",
    taper(4, 0),
    [0.06 * L, 0.38 * L, 0.42 * L],
    [-0.6 * L, 0, bodyAt[2]],
    c.secondary,
    [0, 90, 0],
  );
  const fin = p.fins === "tall" ? 0.32 : 0.18;
  add(
    b,
    "fin",
    "Back fin",
    taper(4, 0),
    [0.32 * L, 0.04 * L, fin * L],
    [-0.05 * L, 0, bodyAt[2] + 0.25 * L + fin * L * 0.3],
    c.secondary,
    [0, -15, 45],
  );
  eyes(b, "body", 0.8, 0.35, 0.25, 0.04 * L);
};

const vehicle = (
  b: Builder,
  L: number,
  c: Colors,
  p: Extract<RigParams, { rig: "vehicle" }>,
) => {
  const r = 0.11 * L;
  const bodyH = p.cabin === "bus" ? 0.42 * L : 0.2 * L;
  add(
    b,
    "body",
    "Body",
    { kind: "box" },
    [L, 0.44 * L, bodyH],
    [0, 0, r + bodyH / 2],
    c.primary,
  );
  if (p.cabin === "car")
    add(
      b,
      "cabin",
      "Cabin",
      taper(4, 0.62),
      [0.78 * L, 0.56 * L, 0.2 * L],
      [-0.06 * L, 0, r + bodyH + 0.08 * L],
      c.secondary,
      [0, 0, 45],
    );
  if (p.cabin === "truck")
    add(
      b,
      "cabin",
      "Cab",
      { kind: "box" },
      [0.3 * L, 0.42 * L, 0.24 * L],
      [0.33 * L, 0, r + bodyH + 0.11 * L],
      c.secondary,
    );
  for (const [x, side] of [
    [0.3, 1],
    [0.3, -1],
    [-0.3, 1],
    [-0.3, -1],
  ] as const) {
    add(
      b,
      `wheel-${x > 0 ? "f" : "b"}${side > 0 ? "l" : "r"}`,
      "Wheel",
      taper(8, 1),
      [2 * r, 2 * r, 0.1 * L],
      [x * L, side * 0.22 * L, r],
      c.accent,
      [90, 0, 0],
    );
  }
  b.decals.push({
    part: "body",
    direction: [1, 0.6, 0],
    radiusMm: 0.035 * L,
    color: "#fff6c8",
  });
  b.decals.push({
    part: "body",
    direction: [1, -0.6, 0],
    radiusMm: 0.035 * L,
    color: "#fff6c8",
  });
  if (p.cabin === "bus") {
    // A row of round windows down each side.
    for (const x of [-1.5, -0.5, 0.5, 1.5]) {
      for (const side of [1, -1])
        b.decals.push({
          part: "body",
          direction: [x, side, 0.25],
          radiusMm: 0.05 * L,
          color: "#a9d3ee",
        });
    }
  }
};

const building = (
  b: Builder,
  L: number,
  c: Colors,
  p: Extract<RigParams, { rig: "building" }>,
) => {
  const wall: Vec3 =
    p.roof === "tower" ? [0.6 * L, 0.6 * L, L] : [L, 0.72 * L, 0.55 * L];
  add(
    b,
    "walls",
    "Walls",
    { kind: "box" },
    wall,
    [0, 0, wall[2] / 2],
    c.primary,
  );
  add(
    b,
    "roof",
    "Roof",
    taper(4, 0),
    [wall[0] * 1.5, wall[1] * 1.5, p.roof === "tower" ? 0.5 * L : 0.36 * L],
    [0, 0, wall[2] + (p.roof === "tower" ? 0.25 : 0.18) * L - 0.01 * L],
    c.secondary,
    [0, 0, 45],
  );
  if (p.roof === "pyramid")
    add(
      b,
      "chimney",
      "Chimney",
      { kind: "box" },
      [0.1 * L, 0.1 * L, 0.3 * L],
      [-0.25 * L, 0.12 * L, wall[2] + 0.18 * L],
      c.accent,
    );
  for (const x of p.roof === "tower" ? [0] : [-0.22, 0.22]) {
    b.decals.push({
      part: "walls",
      direction: [x, -1, 0.2],
      radiusMm: 0.06 * L,
      color: "#8ec5e8",
    });
  }
};

const tree = (
  b: Builder,
  L: number,
  c: Colors,
  p: Extract<RigParams, { rig: "tree" }>,
) => {
  add(
    b,
    "trunk",
    "Trunk",
    taper(6, 0.8),
    [0.16 * L, 0.16 * L, 0.38 * L],
    [0, 0, 0.19 * L],
    c.secondary,
  );
  if (p.crown === "round")
    add(
      b,
      "crown",
      "Crown",
      ELLIPSOID,
      [0.7 * L, 0.7 * L, 0.66 * L],
      [0, 0, 0.62 * L],
      c.primary,
    );
  else
    for (const [i, w] of [0.7, 0.55, 0.38].entries())
      add(
        b,
        `crown-${i + 1}`,
        "Crown",
        taper(8, 0),
        [w * L, w * L, 0.36 * L],
        [0, 0, (0.42 + i * 0.2) * L],
        c.primary,
      );
};

const figure = (
  b: Builder,
  L: number,
  c: Colors,
  p: Extract<RigParams, { rig: "figure" }>,
) => {
  if (p.build === "snowman") {
    for (const [i, s] of [0.5, 0.38, 0.28].entries()) {
      const z = [0.25, 0.65, 0.95][i]! * L;
      add(
        b,
        ["base", "middle", "head"][i]!,
        ["Base", "Middle", "Head"][i]!,
        ELLIPSOID,
        [s * L, s * L, s * L],
        [0, 0, z],
        c.primary,
      );
    }
    add(
      b,
      "nose",
      "Nose",
      taper(6, 0),
      [0.06 * L, 0.06 * L, 0.16 * L],
      [0.2 * L, 0, 0.95 * L],
      c.accent,
      [0, 90, 0],
    );
    eyes(b, "head", 0.75, 0.4, 0.4, 0.025 * L);
    return;
  }
  const robot = p.build === "robot";
  const shell: Shape = robot ? { kind: "box" } : ELLIPSOID;
  add(
    b,
    "torso",
    robot ? "Body" : "Torso",
    robot ? { kind: "box" } : taper(8, 0.75),
    [0.36 * L, 0.24 * L, 0.38 * L],
    [0, 0, 0.55 * L],
    c.primary,
  );
  add(
    b,
    "head",
    "Head",
    shell,
    [0.26 * L, 0.24 * L, 0.24 * L],
    [0, 0, 0.86 * L],
    robot ? c.primary : c.secondary,
  );
  eyes(b, "head", 1, 0.35, 0.15, 0.03 * L);
  for (const side of [1, -1]) {
    add(
      b,
      side > 0 ? "arm-l" : "arm-r",
      "Arm",
      taper(6, 0.85),
      [0.09 * L, 0.09 * L, 0.34 * L],
      [0, side * 0.23 * L, 0.56 * L],
      robot ? c.secondary : c.primary,
    );
    add(
      b,
      side > 0 ? "leg-l" : "leg-r",
      "Leg",
      robot ? { kind: "box" } : taper(6, 0.9),
      [0.12 * L, 0.11 * L, 0.38 * L],
      [0, side * 0.08 * L, 0.19 * L],
      c.accent,
    );
  }
  if (robot)
    add(
      b,
      "antenna",
      "Antenna",
      taper(4, 0),
      [0.04 * L, 0.04 * L, 0.12 * L],
      [0, 0, 1.02 * L],
      c.accent,
    );
};

/**
 * A sleeve open at both ends and a tray open on top that slides out of it,
 * sized round a deck L long (a playing card is 63 x 88 mm, a deck about 19
 * mm thick), with 1 mm of play each way. Suits are printed on the sleeve.
 */
const cardbox = (b: Builder, L: number, c: Colors) => {
  const tray: Vec3 = [L + 2, 0.72 * L + 2, 0.22 * L + 1];
  const sleeve: Vec3 = [tray[0] + 1, tray[1] + 2, tray[2] + 2];
  add(
    b,
    "sleeve",
    "Sleeve",
    { kind: "box", open: ["left", "right"] },
    sleeve,
    [0, 0, sleeve[2] / 2],
    c.primary,
  );
  b.parts.push({
    id: "tray",
    name: "Tray",
    shape: { kind: "box", open: ["top"] },
    size: tray,
    position: [0, 0, tray[2] / 2 + 1],
    color: c.secondary,
    slide: [0.7 * L, 0, 0],
  });
  const suits = [
    ["heart", -2.6, 1.7, "#c0392b"],
    ["spade", 2.6, 1.7, "#1d1d1d"],
    ["diamond", -2.6, -1.7, "#c0392b"],
    ["club", 2.6, -1.7, "#1d1d1d"],
  ] as const;
  for (const [shape, x, y, color] of suits)
    b.decals.push({
      part: "sleeve",
      direction: [x, y, 1],
      radiusMm: 0.12 * L,
      color,
      shape,
    });
  b.decals.push({
    part: "sleeve",
    direction: [0, 0, 1],
    radiusMm: 0.2 * L,
    color: c.accent,
    shape: "spade",
  });
};

/** The papercraft parts for a figure; every rig and option yields a valid model. */
export const rigSpec = (figure_: FigureSpec): PapercraftSpec => {
  const b = make();
  const { sizeMm: L, colors: c, params } = figure_;
  switch (params.rig) {
    case "quadruped":
      quadruped(b, L, c, params);
      break;
    case "bird":
      bird(b, L, c, params);
      break;
    case "fish":
      fish(b, L, c, params);
      break;
    case "vehicle":
      vehicle(b, L, c, params);
      break;
    case "building":
      building(b, L, c, params);
      break;
    case "tree":
      tree(b, L, c, params);
      break;
    case "figure":
      figure(b, L, c, params);
      break;
    case "cardbox":
      cardbox(b, L, c);
      break;
  }
  return { title: figure_.title, parts: b.parts, decals: b.decals };
};
