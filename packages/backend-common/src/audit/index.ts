/**
 * Audit Trail / Change Log engine.
 *
 * `createServiceApp` mounts {@link auditLogger} for every service, so each POST/PUT/PATCH/DELETE
 * writes one JSON line to stdout. Handlers only add the business context:
 *
 * @example
 * router.put("/v1/flags/:key", auditAction("TOGGLE_FLAG"), requirePermission("engineering", "toggle"), async (req, res) => {
 *   const audit = useAudit(req);
 *   const key = String(req.params.key);
 *   const flag = (await deps.featureFlags.getFlags()).find((f) => f.key === key);
 *   audit.before(flag ?? null);
 *   const updated = await deps.featureFlags.toggleFlag(key, !flag?.enabled);
 *   audit.after(updated);
 *   res.json(updated);
 * });
 */
export * from "./types.js";
export { computeDelta, snapshotRecord, type DeltaOptions } from "./delta.js";
export { DEFAULT_REDACT_KEYS, REDACTED } from "./json.js";
export { failureFromResponse, toAuditFailure } from "./failure.js";
export { AuditTrail, type AuditTrailState } from "./trail.js";
export { createStdoutAuditSink, formatAuditLine, type AuditSink, type LineWriter } from "./sink.js";
export { auditAction, auditLogger, useAudit, type AuditLoggerOptions } from "./middleware.js";
export * from "./request.js";
