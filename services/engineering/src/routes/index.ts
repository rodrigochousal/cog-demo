import { createAccessCheckRouter } from "@platform/backend-common";
import type { IFeatureFlagProvider } from "@platform/backend-common";
import { Router } from "express";

/** Connectors this surface may use, resolved by the backend-common hub. */
export interface ApiDependencies {
  featureFlags: IFeatureFlagProvider;
}

/**
 * Screen-shaped endpoints for apps/engineering, mounted at /api.
 * Business rules for this surface live in this service; anything reusable by
 * another surface belongs in @platform/backend-common instead.
 * Handlers read and write feature flags only through `deps.featureFlags`; storage stays opaque.
 *
 * Every route here runs behind the identity middleware `createServiceApp` mounts on `/api` (`injectMockUser`); guard each one with `requirePermission`.
 */
export function createApiRouter(deps: ApiDependencies): Router {
  const router = Router();
  router.use("/access", createAccessCheckRouter("engineering"));
  return router;
}
