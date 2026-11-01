import { Router } from "express";

/**
 * Screen-shaped endpoints for apps/finance, mounted at /api.
 * Business rules for this surface live in this service; anything reusable by
 * another surface belongs in @platform/backend-common instead.
 */
export function createApiRouter(): Router {
  const router = Router();
  return router;
}
