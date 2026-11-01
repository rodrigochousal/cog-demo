import type { RefundTransactionRow } from "../contracts/finance.js";

/** Screen-shaped DTOs exchanged between apps/finance and services/finance. */

/** `GET /api/refunds`: the refunds table. */
export interface RefundTransactionsResponse {
  rows: RefundTransactionRow[];
}
