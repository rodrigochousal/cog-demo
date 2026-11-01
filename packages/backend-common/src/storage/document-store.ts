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
  /** Runs `fn` against a mutable draft and commits it atomically if `fn` returns. */
  transact<R>(fn: (draft: D) => R): R;
}

export type Seed<D> = () => D;
