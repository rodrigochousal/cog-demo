import { createAccessCheckRouter } from "@platform/backend-common";
import { Router } from "express";

/**
 * Screen-shaped endpoints for apps/engineering, mounted at /api.
 * Business rules for this surface live in this service; anything reusable by
 * another surface belongs in @platform/backend-common instead.
 *
 * Every route here runs behind `injectMockUser`; guard each one with `requirePermission`.
 */
export function createApiRouter(): Router {
  const router = Router();
  router.use("/access", createAccessCheckRouter("engineering"));
  return router;
}
