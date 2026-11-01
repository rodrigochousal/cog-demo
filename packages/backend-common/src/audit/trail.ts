import { snapshotRecord } from "./delta.js";
import { toAuditFailure } from "./failure.js";
import type { AuditFailure, AuditRecord } from "./types.js";

/** What a handler has told the audit trail so far. */
export interface AuditTrailState {
  action?: string;
  endpoint?: string;
  before: AuditRecord | null;
  after: AuditRecord | null;
  failure?: AuditFailure;
}

/**
 * Per-request audit recorder, available as `req.audit` (or via `useAudit(req)`) on mutating
 * requests. Handlers hand it the record's state before and after the change; every method
 * takes a detached snapshot immediately, so mutating the record afterwards cannot rewrite
 * history. All methods are synchronous and safe to call inside `DocumentStore.transact`.
 */
export class AuditTrail {
  #state: AuditTrailState = { before: null, after: null };

  /** Names the business action, e.g. `EXECUTE_REFUND`. */
  action(name: string): this {
    this.#state.action = name;
    return this;
  }

  /** Overrides the endpoint pattern (normally captured from the matched route). */
  endpoint(pattern: string): this {
    this.#state.endpoint = pattern;
    return this;
  }

  /** Snapshot of the record before the change. Omit (or pass null) for creations. */
  before(state: unknown): this {
    this.#state.before = snapshotRecord(state);
    return this;
  }

  /** Snapshot of the record after the change. Omit (or pass null) for deletions. */
  after(state: unknown): this {
    this.#state.after = snapshotRecord(state);
    return this;
  }

  /** Shorthand for `before(before).after(after)`. */
  record(before: unknown, after: unknown): this {
    return this.before(before).after(after);
  }

  /**
   * Marks the mutation as FAILED with `error`'s details, even if the HTTP response is 2xx.
   * Usually unnecessary: 4xx/5xx responses are recorded as FAILED automatically.
   */
  fail(error: unknown): this {
    this.#state.failure = toAuditFailure(error);
    return this;
  }

  /** Read-only view used by the middleware when it writes the audit line. */
  get state(): Readonly<AuditTrailState> {
    return this.#state;
  }
}
