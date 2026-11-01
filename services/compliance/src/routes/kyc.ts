import { auditAction, parseOrThrow, permissionDenied, requirePermission, useAudit } from "@platform/backend-common";
import type { KycManualDecisionInput } from "@platform/shared-types";
import { Router } from "express";
import type { ApiDependencies } from "./index.js";
import { applicantParamsSchema, manualDecisionBodySchema } from "./schemas.js";

/** KYC review queue endpoints, mounted at `/api/kyc`. */
export function createKycRouter({ kyc }: ApiDependencies): Router {
  const router = Router();

  router.get("/verifications", requirePermission("compliance", "read"), async (_req, res) => {
    res.json(await kyc.listVerificationPayloads());
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
      audit.before(await kyc.getVerificationPayload(applicantId));
      const updated = await kyc.submitManualDecision(applicantId, decision);
      audit.after(updated);
      res.json(updated);
    },
  );

  return router;
}
