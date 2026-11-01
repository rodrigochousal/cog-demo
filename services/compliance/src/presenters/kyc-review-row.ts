import type { KycVerification, KycVerificationStatus } from "@platform/backend-common";
import { kycReviewRowSchema, type KycReviewRow, type KycReviewStatus } from "@platform/shared-types";

/** Escalated reviews are still awaiting a decision. */
const ROW_STATUS: Record<KycVerificationStatus, KycReviewStatus> = {
  pending_review: "PENDING",
  escalated: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
};

const UNASSIGNED = "Unassigned";

/** Backend `KycVerification` → client row, validated against the row contract before it leaves the BFF. */
export function toKycReviewRow(verification: KycVerification): KycReviewRow {
  return kycReviewRowSchema.parse({
    id: verification.applicantId,
    status: ROW_STATUS[verification.status],
    applicantName: `${verification.applicant.firstName} ${verification.applicant.lastName}`,
    documentUrl: verification.documentUrl,
    riskScore: verification.riskScore,
    assignedTo: verification.assignedTo ?? UNASSIGNED,
    notes: verification.notes,
  });
}
