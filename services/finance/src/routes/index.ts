import { createAccessCheckRouter, requirePermission, type ILedgerDatabase } from "@platform/backend-common";
import type { RefundTransactionsResponse } from "@platform/shared-types";
import { Router } from "express";
import { toRefundTransactionRow } from "../presenters/refund-transaction-row.js";

/** Connectors this surface may use, resolved by the backend-common hub. */
export interface ApiDependencies {
  ledger: ILedgerDatabase;
}

/**
 * Screen-shaped endpoints for apps/finance, mounted at /api.
 * Business rules for this surface live in this service; anything reusable by
 * another surface belongs in @platform/backend-common instead.
 * Handlers read and write refunds only through `deps.ledger`; storage stays opaque.
 *
 * Every route here runs behind the identity middleware `createServiceApp` mounts on `/api` (`injectMockUser`); guard each one with `requirePermission`.
 */
export function createApiRouter(deps: ApiDependencies): Router {
  const router = Router();
  router.use("/access", createAccessCheckRouter("finance"));
  router.get("/refunds", requirePermission("finance", "read"), async (_req, res) => {
    const body: RefundTransactionsResponse = { rows: (await deps.ledger.findAll()).map(toRefundTransactionRow) };
    res.json(body);
  });
  return router;
}
