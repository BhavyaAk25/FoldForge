import { z } from "zod";

/** The /api/origami/[id] response, checked before the browser draws it. */

const PointSchema = z.object({ x: z.number(), y: z.number() });
const IsometrySchema = z.object({
  a: z.number(),
  b: z.number(),
  c: z.number(),
  d: z.number(),
  tx: z.number(),
  ty: z.number(),
});

export const OrigamiPayloadSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
  viewDeg: z.number(),
  pattern: z.object({
    version: z.literal("1"),
    vertices: z.array(PointSchema),
    edges: z.array(
      z.object({
        a: z.number().int(),
        b: z.number().int(),
        assignment: z.enum(["M", "V", "B", "F"]),
      }),
    ),
    faces: z.array(z.array(z.number().int())),
  }),
  steps: z.array(
    z.object({ instruction: z.string(), added: z.array(z.number().int()) }),
  ),
  animation: z.object({
    collapse: z.array(z.array(z.number())).nullable(),
    collapseStrain: z.number().nullable(),
    keyframes: z.array(
      z.object({
        transforms: z.array(IsometrySchema),
        layers: z.array(z.number()),
      }),
    ),
    moves: z.array(
      z.object({
        line: z.object({ from: PointSchema, to: PointSchema }),
        moving: z.array(z.boolean()),
        swing: z.union([z.literal(1), z.literal(-1)]),
        endDeg: z.number(),
      }),
    ),
  }),
  verification: z.object({
    stepsChecked: z.number().int(),
    mountains: z.number().int(),
    valleys: z.number().int(),
    interiorVertices: z.number().int(),
  }),
});

export type OrigamiPayloadResponse = z.infer<typeof OrigamiPayloadSchema>;

/** The /api/origami/choose response: the AI's pick, or nulls for none. */
export const OrigamiChoiceResponseSchema = z.object({
  modelId: z.string().nullable(),
  paperSizeMm: z.number().nullable(),
  reason: z.string().nullable(),
});
