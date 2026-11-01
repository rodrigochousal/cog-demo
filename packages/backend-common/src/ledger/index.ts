import type { LedgerEntry } from "@platform/shared-types";
import { openStore, type DocumentStore, type StoreOptions } from "../storage/index.js";

/** Local stand-in for a transactional ledger database. */
export interface LedgerDocument {
  entries: LedgerEntry[];
}

export const emptyLedger = (): LedgerDocument => ({ entries: [] });

/** Persisted to `<data dir>/ledger.json` (or in memory with PLATFORM_STORAGE=memory). */
export function openLedgerStore(options?: StoreOptions): DocumentStore<LedgerDocument> {
  return openStore("ledger", emptyLedger, options);
}
