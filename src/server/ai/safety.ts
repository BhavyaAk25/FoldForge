import { createHash } from "node:crypto";

import { readAccessSession, type AccessSessionSubject } from "@/server/access";
import { isLiveModelEnabled } from "@/server/live-model";

const OFFLINE_SAFETY_IDENTIFIER = `ff_${createHash("sha256")
  .update("foldforge:offline-safety-identifier")
  .digest("hex")
  .slice(0, 40)}`;

export const safetyIdentifierFromSubject = (
  subject: AccessSessionSubject,
): string =>
  `ff_${createHash("sha256")
    .update(`foldforge:access-subject:${subject.value}`)
    .digest("hex")
    .slice(0, 40)}`;

export const safetyIdentifier = (signedAccessToken: string): string => {
  const session = readAccessSession(signedAccessToken);
  if (!session) {
    if (!isLiveModelEnabled()) return OFFLINE_SAFETY_IDENTIFIER;
    throw new Error(
      "A valid signed access session is required for a safety identifier.",
    );
  }
  return safetyIdentifierFromSubject(session.subject);
};
