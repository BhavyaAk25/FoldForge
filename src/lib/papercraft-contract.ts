import { z } from "zod";

/**
 * Figures as they cross the network: from the router (or the AI) to the
 * papercraft route, and the built model back to the page. Every number is
 * bounded so any accepted figure is one the rigs can build.
 */

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/u);

export const ColorsSchema = z
  .object({ primary: Hex, secondary: Hex, accent: Hex })
  .strict();

export const RigParamsSchema = z.discriminatedUnion("rig", [
  z
    .object({
      rig: z.literal("quadruped"),
      ears: z.enum(["pointy", "round", "long", "floppy", "small"]),
      snout: z.enum(["short", "long", "flat"]),
      tail: z.enum(["thin", "bushy", "short", "curly"]),
      legs: z.enum(["short", "long"]),
    })
    .strict(),
  z
    .object({
      rig: z.literal("bird"),
      neck: z.enum(["none", "long"]),
      beak: z.enum(["flat", "pointed"]),
      stance: z.enum(["sitting", "upright"]),
      crest: z.boolean(),
    })
    .strict(),
  z
    .object({ rig: z.literal("fish"), fins: z.enum(["small", "tall"]) })
    .strict(),
  z
    .object({
      rig: z.literal("vehicle"),
      cabin: z.enum(["car", "bus", "truck"]),
    })
    .strict(),
  z
    .object({ rig: z.literal("building"), roof: z.enum(["pyramid", "tower"]) })
    .strict(),
  z
    .object({ rig: z.literal("tree"), crown: z.enum(["round", "pine"]) })
    .strict(),
  z
    .object({
      rig: z.literal("figure"),
      build: z.enum(["robot", "snowman", "person"]),
    })
    .strict(),
  z.object({ rig: z.literal("cardbox") }).strict(),
]);

export const FIGURE_SIZE_MM = { minimum: 80, maximum: 240 } as const;

export const FigureSpecSchema = z
  .object({
    title: z.string().trim().min(1).max(60),
    sizeMm: z.number().min(FIGURE_SIZE_MM.minimum).max(FIGURE_SIZE_MM.maximum),
    colors: ColorsSchema,
    params: RigParamsSchema,
  })
  .strict();

export const PapercraftRequestSchema = z
  .object({ figure: FigureSpecSchema })
  .strict();

export const PapercraftPayloadSchema = z.object({
  title: z.string(),
  sizeMm: z.number(),
  parts: z.array(
    z.object({
      id: z.string(),
      /** Open parts (a tray, a sleeve) show both sides. */
      open: z.boolean(),
      /** Travel for the preview's slider, mm. */
      slide: z.tuple([z.number(), z.number(), z.number()]).nullable(),
      name: z.string(),
      color: z.string(),
      /** x, y, z per vertex, mm, z up. */
      vertices: z.array(z.number()),
      faces: z.array(z.array(z.number().int())),
    }),
  ),
  decals: z.array(
    z.object({
      part: z.string(),
      points: z.array(z.tuple([z.number(), z.number(), z.number()])),
      normal: z.tuple([z.number(), z.number(), z.number()]),
      color: z.string(),
    }),
  ),
  /** One print-scale SVG per A4 page. */
  pages: z.array(z.string()),
  instructions: z.array(z.string()),
  checks: z.object({
    pieces: z.number().int(),
    seams: z.number().int(),
    faces: z.number().int(),
  }),
});

export type PapercraftPayload = z.infer<typeof PapercraftPayloadSchema>;

/** What the router decided for a prompt. */
export const RouteResponseSchema = z.discriminatedUnion("engine", [
  z.object({
    engine: z.literal("origami"),
    modelId: z.string(),
    paperSizeMm: z.number(),
    /** The paper's coloured side, #rrggbb. */
    paperColor: Hex,
    reason: z.string().nullable(),
  }),
  z.object({
    engine: z.literal("figure"),
    figure: FigureSpecSchema,
    reason: z.string().nullable(),
  }),
  z.object({
    engine: z.literal("popup"),
    card: z.lazy(() => PopupChoiceSchema),
    reason: z.string().nullable(),
  }),
  z.object({ engine: z.literal("mechanism") }),
]);

export type RouteResponse = z.infer<typeof RouteResponseSchema>;

const Point2 = z.tuple([z.number(), z.number()]);

export const CARD_DESIGNS = ["flower", "heart"] as const;

/** What the router picks for a pop-up card: a design, colours, and a title. */
export const PopupChoiceSchema = z
  .object({
    title: z.string().trim().min(1).max(60),
    design: z.enum(CARD_DESIGNS),
    colors: z.object({ card: Hex, main: Hex, second: Hex }).strict(),
  })
  .strict();

export type PopupChoice = z.infer<typeof PopupChoiceSchema>;

export const PopupPayloadSchema = z.object({
  card: z.object({
    title: z.string(),
    pageWidthMm: z.number(),
    pageHeightMm: z.number(),
    cardColor: z.string(),
    pieces: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        color: z.string(),
        apexMm: z.number(),
        alphaDeg: z.number(),
        phiDeg: z.number(),
        half: z.array(Point2),
        tabMm: z.number(),
        prints: z.array(
          z.object({ points: z.array(Point2), color: z.string() }),
        ),
      }),
    ),
  }),
  page: z.string(),
  instructions: z.array(z.string()),
});

export type PopupPayload = z.infer<typeof PopupPayloadSchema>;
