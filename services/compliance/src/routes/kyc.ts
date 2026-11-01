import {
  auditAction,
  parseOrThrow,
  permissionDenied,
  requirePermission,
  useAudit,
  type KycManualDecisionInput,
} from "@platform/backend-common";
import type { KycReviewQueueResponse, KycReviewRow } from "@platform/shared-types";
import { Router } from "express";
import { toKycReviewRow } from "../presenters/kyc-review-row.js";
import type { ApiDependencies } from "./index.js";
import { applicantParamsSchema, manualDecisionBodySchema } from "./schemas.js";

/**
 * KYC review queue endpoints, mounted at `/api/kyc`. Responses are client rows
 * (`KycReviewRow`); the backend `KycVerification` only reaches the audit trail.
 */
export function createKycRouter({ kyc }: ApiDependencies): Router {
  const router = Router();

  router.get("/verifications", requirePermission("compliance", "read"), async (_req, res) => {
    const body: KycReviewQueueResponse = { rows: (await kyc.listVerifications()).map(toKycReviewRow) };
    res.json(body);
  });

  router.post(
    "/verifications/:applicantId/decisions",
    auditAction("SUBMIT_KYC_DECISION"),
    requirePermission("compliance", "approve"),
    async (req, res) => {
      const { applicantId } = parseOrThrow(applicantParamsSchema, req.params);
      const body = parseOrThrow(manualDecisionBodySchema, req.body);
      if (!req.user) throw permissionDenied();
      const decision: KycManualDecisionInput = { ...body, reviewerId: req.user.id };

      const audit = useAudit(req);
      audit.before(await kyc.getVerification(applicantId));
      const updated = await kyc.submitManualDecision(applicantId, decision);
      audit.after(updated);
      const row: KycReviewRow = toKycReviewRow(updated);
      res.json(row);
    },
  );

  return router;
}
