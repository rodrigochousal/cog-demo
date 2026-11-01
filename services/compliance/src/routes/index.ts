import { createAccessCheckRouter, type IKycVendorClient } from "@platform/backend-common";
import { Router } from "express";

/** Connectors this surface may use, resolved by the backend-common hub. */
export interface ApiDependencies {
  kyc: IKycVendorClient;
}

/**
 * Screen-shaped endpoints for apps/compliance, mounted at /api.
 * Business rules for this surface live in this service; anything reusable by
 * another surface belongs in @platform/backend-common instead.
 * Handlers read and write KYC review queue only through `deps.kyc`; storage stays opaque.
 *
 * Every route here runs behind the identity middleware `createServiceApp` mounts on `/api` (`injectMockUser`); guard each one with `requirePermission`.
 */
export function createApiRouter(deps: ApiDependencies): Router {
  const router = Router();
  router.use("/access", createAccessCheckRouter("compliance"));
  return router;
}
