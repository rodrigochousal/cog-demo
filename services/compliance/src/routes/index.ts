import { createAccessCheckRouter, requirePermission, type IKycVendorClient } from "@platform/backend-common";
import type { KycReviewQueueResponse } from "@platform/shared-types";
import { Router } from "express";
import { toKycReviewRow } from "../presenters/kyc-review-row.js";

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
  router.get("/kyc-reviews", requirePermission("compliance", "read"), async (_req, res) => {
    const body: KycReviewQueueResponse = { rows: (await deps.kyc.listVerifications()).map(toKycReviewRow) };
    res.json(body);
  });
  return router;
}
