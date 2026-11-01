import type { UserRole } from "@platform/shared-types";

/**
 * Audit payload contracts. They live in backend-common (not shared-types) because only the BFFs
 * produce them and no frontend consumes them; log shippers read them from stdout.
 */

/** HTTP methods that mutate state and therefore must leave an audit line. */
export const AUDITED_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;
export type AuditedMethod = (typeof AUDITED_METHODS)[number];

export type AuditStatus = "SUCCESS" | "FAILED";

/** Recorded as both id and role when a request fails before an identity was attached. */
export const ANONYMOUS_ACTOR = "anonymous";
export type AuditActorRole = UserRole | typeof ANONYMOUS_ACTOR;

/** A JSON-safe, redaction-ready copy of a record's state. */
export type AuditRecord = Record<string, unknown>;

/**
 * Before/after state of the audited record.
 * - create: `oldValue` is `null`, `newValue` is the full initial record.
 * - delete: `oldValue` is the full last-known record, `newValue` is `null`.
 * - update: both hold only the keys that changed, nested structure preserved.
 */
export interface AuditDelta {
  oldValue: AuditRecord | null;
  newValue: AuditRecord | null;
}

/** Why a mutation failed (validation, RBAC, business rule, ...). */
export interface AuditFailure {
  code: string;
  message: string;
  details?: unknown;
}

/** Discriminator so log pipelines can route audit lines away from ordinary application logs. */
export const AUDIT_LOG_KIND = "audit";

/** One audit event, written as a single JSON line on stdout per mutating request. */
export interface AuditLogPayload {
  kind: typeof AUDIT_LOG_KIND;
  /** ISO 8601. When the outcome was determined (response finished or connection closed). */
  timestamp: string;
  actorId: string;
  actorRole: AuditActorRole;
  /** The service name passed to `createServiceApp`, e.g. `finance-service`. */
  targetService: string;
  /** Route pattern when known (e.g. `/api/v1/refunds/:id`), otherwise the request path. */
  endpoint: string;
  /** e.g. `EXECUTE_REFUND`. Defaults to `HTTP_<METHOD>` when the route never named one. */
  action: string;
  status: AuditStatus;
  delta: AuditDelta;
  method: AuditedMethod;
  httpStatus: number;
  requestId: string;
  durationMs: number;
  /** Present only when `status` is `FAILED`. */
  error?: AuditFailure;
}
