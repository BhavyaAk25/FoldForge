/** Identifiers shared by the UI and the saved-example route. */
export const SAVED_EXAMPLE_IDS = ["flower"] as const;

export type SavedExampleId = (typeof SAVED_EXAMPLE_IDS)[number];
