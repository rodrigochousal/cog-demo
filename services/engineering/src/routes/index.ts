import { createAccessCheckRouter, requirePermission, type IFeatureFlagProvider } from "@platform/backend-common";
import type { FeatureFlagsResponse } from "@platform/shared-types";
import { Router } from "express";
import { toFeatureFlagRow } from "../presenters/feature-flag-row.js";

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
  router.get("/feature-flags", requirePermission("engineering", "read"), async (_req, res) => {
    const body: FeatureFlagsResponse = { rows: (await deps.featureFlags.getFlags()).map(toFeatureFlagRow) };
    res.json(body);
  });
  return router;
}
