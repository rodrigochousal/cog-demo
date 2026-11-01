import type { Refund, RefundStatus } from "@platform/backend-common";
import { refundTransactionRowSchema, type RefundTransactionRow, type RefundTransactionStatus } from "@platform/shared-types";

/** The table shows three states; approved-but-unsettled refunds count as processed. */
const ROW_STATUS: Record<RefundStatus, RefundTransactionStatus> = {
  pending_review: "PENDING_APPROVAL",
  approved: "PROCESSED",
  processing: "PROCESSED",
  completed: "PROCESSED",
  rejected: "FAILED",
  failed: "FAILED",
};

/** Every platform currency has two decimals. */
const MINOR_PER_MAJOR = 100;

/** Backend `Refund` → client row, validated against the row contract before it leaves the BFF. */
export function toRefundTransactionRow(refund: Refund): RefundTransactionRow {
  return refundTransactionRowSchema.parse({
    id: refund.id,
    amount: refund.amount.amountMinor / MINOR_PER_MAJOR,
    status: ROW_STATUS[refund.status],
    currency: refund.amount.currency,
    customerId: refund.customerId,
    createdTimestamp: refund.createdAt,
    approvalsReceived: refund.approvals,
  });
}
