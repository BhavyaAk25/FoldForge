import { createHash } from "node:crypto";

export const safetyIdentifier = (installationId: string): string =>
  `ff_${createHash("sha256")
    .update(`foldforge:${installationId}`)
    .digest("hex")
    .slice(0, 40)}`;
