import { randomUUID } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import "../auth/request.js";
import { computeDelta } from "./delta.js";
import { failureFromResponse } from "./failure.js";
import { DEFAULT_REDACT_KEYS, isRecord } from "./json.js";
import "./request.js";
import { createStdoutAuditSink, type AuditSink } from "./sink.js";
import { AuditTrail } from "./trail.js";
import {
  ANONYMOUS_ACTOR,
  AUDIT_LOG_KIND,
  AUDITED_METHODS,
  type AuditedMethod,
  type AuditFailure,
  type AuditLogPayload,
} from "./types.js";

export interface AuditLoggerOptions {
  /** Service name recorded as `targetService`, e.g. `finance-service`. */
  targetService: string;
  /** Where payloads go. Defaults to single-line JSON on `process.stdout`. */
  sink?: AuditSink;
  /** Called if building or writing an audit line throws. Defaults to a line on stderr. */
  onError?: (error: unknown) => void;
  /** Keys masked in deltas. Defaults to {@link DEFAULT_REDACT_KEYS}. */
  redactKeys?: readonly string[];
  /** Incoming correlation header, echoed back on the response. Defaults to `x-request-id`. */
  requestIdHeader?: string;
  /** Clock override for tests. */
  now?: () => Date;
}

const MAX_REQUEST_ID_LENGTH = 128;

const isAuditedMethod = (method: string): method is AuditedMethod =>
  (AUDITED_METHODS as readonly string[]).includes(method);

const reportToStderr = (error: unknown) => {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${new Date().toISOString()} ERROR [audit] failed to write audit line: ${detail}\n`);
};

/** `req.route` is untyped in Express' declarations; read its path defensively. */
function routePattern(req: Request): string | undefined {
  const route: unknown = req.route;
  return isRecord(route) && typeof route.path === "string" ? `${req.baseUrl}${route.path}` : undefined;
}

/** Records the matched route pattern (e.g. `/api/v1/refunds/:id`) unless one was already set. */
function bindRoute(req: Request, trail: AuditTrail): void {
  if (trail.state.endpoint) return;
  const pattern = routePattern(req);
  if (pattern) trail.endpoint(pattern);
}

/**
 * Audit Trail middleware. On every POST/PUT/PATCH/DELETE it attaches an {@link AuditTrail} to
 * `req.audit` and, once the response has been sent (or the client disconnected), writes exactly
 * one {@link AuditLogPayload}. The line is built from the trail, `req.user` and the response:
 *
 * - 2xx/3xx: `SUCCESS` (unless the handler called `trail.fail()`).
 * - 4xx/5xx — including RBAC 403s, zod/`parseOrThrow` 400s, malformed JSON and unknown routes:
 *   `FAILED`, with `error` taken from the response's error body.
 * - Connection closed before the response finished: `FAILED` / `CLIENT_CLOSED_REQUEST`.
 *
 * Writing is deferred with `setImmediate` after the response is flushed, so it never delays
 * the HTTP turnaround, and any error while auditing goes to `onError` instead of the request.
 *
 * Mount it before body parsing and identity so their failures are audited too
 * (`createServiceApp` does this automatically).
 */
export function auditLogger(options: AuditLoggerOptions): RequestHandler {
  const sink = options.sink ?? createStdoutAuditSink();
  const onError = options.onError ?? reportToStderr;
  const redactKeys = options.redactKeys ?? DEFAULT_REDACT_KEYS;
  const requestIdHeader = options.requestIdHeader ?? "x-request-id";
  const now = options.now ?? (() => new Date());

  return (req, res, next) => {
    const method = req.method.toUpperCase();
    if (!isAuditedMethod(method)) {
      next();
      return;
    }

    const startedAt = process.hrtime.bigint();
    const incomingId = req.get(requestIdHeader)?.trim();
    const requestId =
      incomingId && incomingId.length <= MAX_REQUEST_ID_LENGTH ? incomingId : randomUUID();
    const fallbackEndpoint = req.originalUrl.split("?")[0] ?? req.originalUrl;
    res.setHeader(requestIdHeader, requestId);

    const trail = new AuditTrail();
    req.audit = trail;
    const errorBody = captureErrorBody(res);

    let settled = false;
    const settle = (closedEarly: boolean) => {
      if (settled) return;
      settled = true;
      try {
        const state = trail.state;
        const httpStatus = res.statusCode;
        let error: AuditFailure | undefined = state.failure;
        if (!error && closedEarly) {
          error = { code: "CLIENT_CLOSED_REQUEST", message: "Connection closed before the response completed" };
        }
        if (!error && httpStatus >= 400) error = failureFromResponse(httpStatus, errorBody.value);

        const payload: AuditLogPayload = {
          kind: AUDIT_LOG_KIND,
          timestamp: now().toISOString(),
          actorId: req.user?.id ?? ANONYMOUS_ACTOR,
          actorRole: req.user?.role ?? ANONYMOUS_ACTOR,
          targetService: options.targetService,
          endpoint: state.endpoint ?? fallbackEndpoint,
          action: state.action ?? `HTTP_${method}`,
          status: error ? "FAILED" : "SUCCESS",
          delta: computeDelta(state.before, state.after, { redactKeys }),
          method,
          httpStatus,
          requestId,
          durationMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e5) / 10,
          ...(error && { error }),
        };
        setImmediate(() => {
          try {
            sink(payload);
          } catch (err) {
            onError(err);
          }
        });
      } catch (err) {
        onError(err);
      }
    };
    res.once("finish", () => settle(false));
    res.once("close", () => settle(!res.writableFinished));
    next();
  };
}

/** Remembers the body of any error response sent through `res.json` for the audit line. */
function captureErrorBody(res: Response): { value: unknown } {
  const captured: { value: unknown } = { value: undefined };
  const json = res.json;
  res.json = (body: unknown) => {
    if (res.statusCode >= 400) captured.value = body;
    return json.call(res, body);
  };
  return captured;
}

/**
 * Route-level middleware naming the business action and capturing the route pattern. Place it
 * first in the route's chain so the action is recorded even when a later guard (RBAC,
 * validation) rejects the request. A no-op on non-mutating requests.
 *
 * @example
 * router.post("/v1/refunds/:id/execute", auditAction("EXECUTE_REFUND"), requirePermission("finance", "execute"), handler);
 */
export function auditAction(action: string): RequestHandler {
  return (req, _res, next) => {
    if (req.audit) {
      req.audit.action(action);
      bindRoute(req, req.audit);
    }
    next();
  };
}

/**
 * Returns the request's {@link AuditTrail} for a handler to record snapshots on. Throws (→ 500)
 * if `auditLogger` is not mounted or the method is not audited, so a mutation can never
 * silently skip its audit line.
 *
 * @example
 * const audit = useAudit(req);
 * audit.before(await deps.ledger.findById(id));
 * const refund = await deps.ledger.updateRecord(id, { status: "approved" });
 * audit.after(refund);
 */
export function useAudit(req: Request): AuditTrail {
  const trail = req.audit;
  if (!trail) {
    throw new Error(`No audit trail on ${req.method} ${req.originalUrl}: is auditLogger mounted?`);
  }
  bindRoute(req, trail);
  return trail;
}
