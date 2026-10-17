/** Identifiers and prompt shared by the UI and the saved-example route. */
export const SAVED_EXAMPLE_IDS = ["duck", "flower"] as const;

export type SavedExampleId = (typeof SAVED_EXAMPLE_IDS)[number];

export const DUCK_CREASE_PATTERN_PROMPT =
  "Make a static, faceted duck crease pattern from one sheet of cardstock. It should look like a simple duck using a body, head, and beak. Keep it fold-only and avoid glue.";
