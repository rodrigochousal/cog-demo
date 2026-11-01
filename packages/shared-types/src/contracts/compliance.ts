import { z } from "zod";
import { httpUrlSchema, optionalText, recordIdSchema, requiredText } from "./primitives.js";

/**
 * Client-only row of the compliance KYC review queue, as services/compliance returns it to
 * apps/compliance. The BFF maps the backend `KycVerification` (whatever vendor ran it) to this.
 */

export const KYC_REVIEW_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export const kycReviewStatusSchema = z.enum(KYC_REVIEW_STATUSES);

export const kycReviewRowSchema = z.object({
  id: recordIdSchema,
  status: kycReviewStatusSchema,
  applicantName: requiredText(200),
  /** Link to the applicant's identity document in the vendor portal. */
  documentUrl: httpUrlSchema,
  /** 0 (safe) – 100 (high risk). */
  riskScore: z.number().min(0, "Must be between 0 and 100").max(100, "Must be between 0 and 100"),
  /** Reviewer the record is assigned to. */
  assignedTo: requiredText(128),
  /** Reviewer notes; optional, defaults to `""`. */
  notes: optionalText(5000),
});

export type KycReviewStatus = z.infer<typeof kycReviewStatusSchema>;
/** A validated KYC review row (schema output: trimmed, defaults applied). */
export type KycReviewRow = z.infer<typeof kycReviewRowSchema>;
