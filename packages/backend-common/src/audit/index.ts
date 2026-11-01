/**
 * Audit Trail / Change Log engine.
 *
 * `createServiceApp` mounts {@link auditLogger} for every service, so each POST/PUT/PATCH/DELETE
 * writes one JSON line to stdout. Handlers only add the business context:
 *
 * @example
 * router.put("/v1/flags/:id", auditAction("TOGGLE_FLAG"), requirePermission("engineering", "toggle"), (req, res) => {
 *   const audit = useAudit(req);
 *   const updated = flags.transact((draft) => {
 *     const flag = draft[req.params.id];
 *     audit.before(flag);
 *     flag.enabled = !flag.enabled;
 *     audit.after(flag);
 *     return flag;
 *   });
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
