import { z } from "zod";
import { kycReviewRowSchema } from "./compliance.js";
import { featureFlagRowSchema } from "./engineering.js";
import { refundTransactionRowSchema } from "./finance.js";
import { isoDateTimeSchema } from "./primitives.js";

/**
 * Runtime schemas of every request/response body exchanged between an app and its BFF. Apps
 * parse responses with these (`apiClient.getParsed(url, schema)`); services validate bodies.
 */

/** `GET /health` on every service. */
export const healthResponseSchema = z.object({
  service: z.string().min(1),
  status: z.literal("ok"),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: isoDateTimeSchema,
});

const reasonSchema = z.string().trim().min(1, "reason is required").max(2000, "Must be at most 2000 characters");

// Compliance — services/compliance (:4000)

/** `GET /api/kyc/verifications`. */
export const kycReviewQueueResponseSchema = z.object({ rows: z.array(kycReviewRowSchema) });

export const KYC_REVIEW_DECISIONS = ["approve", "reject", "escalate"] as const;
export const kycDecisionOutcomeSchema = z.enum(KYC_REVIEW_DECISIONS);
export type KycDecisionOutcomeValue = z.infer<typeof kycDecisionOutcomeSchema>;

/** Body of `POST /api/kyc/verifications/:applicantId/decisions`; responds with the updated `KycReviewRow`. */
export const kycDecisionRequestSchema = z.object({ outcome: kycDecisionOutcomeSchema, reason: reasonSchema }).strict();
export type KycDecisionRequest = z.infer<typeof kycDecisionRequestSchema>;

// Finance — services/finance (:4001)

/** `GET /api/refunds`. */
export const refundTransactionsResponseSchema = z.object({ rows: z.array(refundTransactionRowSchema) });

export const REFUND_DECISIONS = ["approve", "reject"] as const;
/** Distinct approvals that release a refund for processing (dual control). */
export const REFUND_APPROVALS_REQUIRED = 2;

/** Body of `POST /api/refunds/:refundId/decisions`; responds with the updated `RefundTransactionRow`. */
export const refundDecisionRequestSchema = z
  .object({ decision: z.enum(REFUND_DECISIONS), reason: reasonSchema.optional() })
  .strict()
  .refine((body) => body.decision !== "reject" || body.reason !== undefined, {
    path: ["reason"],
    message: "reason is required to reject a refund",
  });
export type RefundDecisionRequest = z.infer<typeof refundDecisionRequestSchema>;

// Engineering — services/engineering (:4002)

/** `GET /api/feature-flags`. */
export const featureFlagsResponseSchema = z.object({ rows: z.array(featureFlagRowSchema) });

/** Body of `POST /api/feature-flags/:flagId/toggle`; responds with the updated `FeatureFlagRow`. */
export const featureFlagToggleRequestSchema = z.object({ enabled: z.boolean() }).strict();
export type FeatureFlagToggleRequest = z.infer<typeof featureFlagToggleRequestSchema>;
