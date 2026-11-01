import { createAccessCheckRouter, type ILedgerDatabase } from "@platform/backend-common";
import { Router } from "express";
import { createRefundsRouter } from "./refunds.js";

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
  router.use("/refunds", createRefundsRouter(deps.ledger));
  return router;
}
