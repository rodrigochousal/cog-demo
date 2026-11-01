import type { ISODateString, Money } from "../common.js";

/**
 * One immutable line in a local transactional ledger (append-only).
 * Starter shape — extend it as surfaces that need ledgers are built.
 */
export interface LedgerEntry {
  id: string;
  accountId: string;
  /** Positive = credit, negative = debit, in minor units. */
  amount: Money;
  reference: string;
  createdAt: ISODateString;
}
