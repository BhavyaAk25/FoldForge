import { z } from "zod";

import { FabricationDesignSpecV3Schema } from "@/core/fabrication/design-spec";
import { TEMPLATE_ARCHETYPES } from "@/core/fabrication/design-templates";
import { PANEL_SILHOUETTES } from "@/core/fabrication/silhouettes";

/** What the design model returns; server-only (never imported by the UI). */
export const FabricationDesignSpecProposalV3Schema = z
  .object({
    diversityClaim: z.string().min(1).max(500),
    designSpec: FabricationDesignSpecV3Schema,
    // The model's pick of the closest ready-made family and outline, used
    // only if its own design cannot be built.
    fallback: z
      .object({
        archetype: z.enum(TEMPLATE_ARCHETYPES),
        silhouette: z.enum(PANEL_SILHOUETTES).nullable(),
      })
      .strict()
      .nullish(),
  })
  .strict();

export type FabricationDesignSpecProposalV3 = z.infer<
  typeof FabricationDesignSpecProposalV3Schema
>;
