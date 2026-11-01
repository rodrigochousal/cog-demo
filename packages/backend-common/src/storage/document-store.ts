/**
 * A DocumentStore holds one JSON document (e.g. the whole ledger) and offers
 * all-or-nothing transactions over it. If the transaction callback throws,
 * nothing is persisted. This gives us multi-entity atomicity (e.g. "approve
 * refund + append ledger entry") without a database.
 */
export interface DocumentStore<D> {
  readonly name: string;
  /** Returns a deep copy of the current document. */
  read(): D;
  /**
   * Runs `fn` against a mutable draft and commits it atomically if `fn` returns.
   * `fn` must be synchronous: returning a Promise throws and commits nothing.
   */
  transact<R>(fn: (draft: D) => R): R;
}

export type Seed<D> = () => D;

/** Rejects async transaction callbacks, which would otherwise commit a half-finished draft. */
export function assertSynchronous<R>(result: R): R {
  if (typeof (result as { then?: unknown } | null)?.then === "function") {
    throw new TypeError("DocumentStore.transact callbacks must be synchronous; nothing was committed");
  }
  return result;
}
