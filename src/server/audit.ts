import { createHash } from "node:crypto";

import type { AccessSessionSubject } from "@/server/access";

export interface AuditEventContext {
  readonly version: 1;
  readonly occurredAtMs: number;
  readonly requestId: string;
  readonly route: string;
  readonly subjectId?: string;
}

export interface AccessAuditEvent extends AuditEventContext {
  readonly kind: "access";
  readonly outcome: "granted" | "denied" | "misconfigured";
}

export interface MutationGuardAuditEvent extends AuditEventContext {
  readonly kind: "mutation_guard";
  readonly outcome: "allowed" | "blocked";
  readonly reason?:
    | "cross_site"
    | "invalid_fetch_metadata"
    | "invalid_origin"
    | "missing_request_provenance"
    | "origin_mismatch";
}

export interface QuotaAuditEvent extends AuditEventContext {
  readonly kind: "quota";
  readonly outcome: "allowed" | "blocked";
  readonly reason?:
    | "capacity"
    | "global_concurrency"
    | "request_quota"
    | "session_concurrency"
    | "token_quota";
  readonly reservedTokens: number;
}

export interface ModelAuditEvent extends AuditEventContext {
  readonly kind: "model";
  readonly outcome: "blocked" | "failed" | "started" | "succeeded";
  readonly model: "gpt-5.6-sol";
  readonly durationMs?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly reason?:
    | "access_configuration"
    | "disabled"
    | "kill_switch"
    | "missing_api_key"
    | "provider_error"
    | "schema_error";
}

export type AuditEvent =
  | AccessAuditEvent
  | ModelAuditEvent
  | MutationGuardAuditEvent
  | QuotaAuditEvent;

export const auditSubjectId = (subject: AccessSessionSubject): string =>
  `ffa_${createHash("sha256")
    .update(`foldforge:audit-subject:${subject.value}`)
    .digest("hex")
    .slice(0, 24)}`;
