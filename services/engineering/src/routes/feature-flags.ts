import {
  auditAction,
  notFound,
  parseOrThrow,
  permissionDenied,
  requirePermission,
  useAudit,
  type IFeatureFlagProvider,
} from "@platform/backend-common";
import { featureFlagToggleRequestSchema, type FeatureFlagRow, type FeatureFlagsResponse } from "@platform/shared-types";
import { Router } from "express";
import { z } from "zod";
import { toFeatureFlagRow } from "../presenters/feature-flag-row.js";

const flagParamsSchema = z.object({ flagId: z.string().trim().min(1, "flagId is required") });

/** Feature-flag endpoints, mounted at `/api/feature-flags`. `:flagId` is the row `id` (the backend flag key). */
export function createFeatureFlagsRouter(featureFlags: IFeatureFlagProvider): Router {
  const router = Router();

  router.get("/", requirePermission("engineering", "read"), async (_req, res) => {
    const body: FeatureFlagsResponse = { rows: (await featureFlags.getFlags()).map(toFeatureFlagRow) };
    res.json(body);
  });

  router.post("/:flagId/toggle", auditAction("TOGGLE_FEATURE_FLAG"), requirePermission("engineering", "toggle"), async (req, res) => {
    const { flagId } = parseOrThrow(flagParamsSchema, req.params);
    const { enabled } = parseOrThrow(featureFlagToggleRequestSchema, req.body);
    if (!req.user) throw permissionDenied();

    const audit = useAudit(req);
    const current = (await featureFlags.getFlags()).find((flag) => flag.key === flagId);
    if (!current) throw notFound("Feature flag", flagId);
    audit.before(current);
    const updated = await featureFlags.toggleFlag(flagId, enabled, req.user.id);
    audit.after(updated);
    const row: FeatureFlagRow = toFeatureFlagRow(updated);
    res.json(row);
  });

  return router;
}
