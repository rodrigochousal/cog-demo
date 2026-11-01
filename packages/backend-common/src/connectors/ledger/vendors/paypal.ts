import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CURRENCY_CODES, type Money, type PaymentRail, type Refund, type RefundReason, type RefundStatus } from "../../../domain/index.js";
import { bijection } from "../../vendor-collection.js";
import type { RefundProcessorAdapter } from "../processor.js";
import { seedRefunds } from "../seed.js";

/**
 * Edge: PayPal. Modelled on PayPal's v2 Refund resource (with its capture expanded): decimal
 * string amounts, SCREAMING_CASE enums and ISO timestamps. The platform's review workflow is
 * kept in a mock `review` block.
 */

const PAYPAL_STATUSES = ["PENDING", "COMPLETED", "FAILED", "CANCELLED"] as const;
const PAYPAL_REVIEW_STATES = ["PENDING_REVIEW", "APPROVED", "PROCESSING", "CLOSED"] as const;
const PAYPAL_FUNDING_SOURCES = ["CARD", "BANK_ACH", "BANK_WIRE", "BANK_RTP"] as const;
const PAYPAL_REASON_CODES = [
  "DUPLICATE_CHARGE",
  "FRAUDULENT_TRANSACTION",
  "SERVICE_NOT_RENDERED",
  "PRODUCT_DEFECTIVE",
  "BILLING_ERROR",
  "CUSTOMER_REQUEST",
] as const;

type ReviewState = Extract<RefundStatus, "pending_review" | "approved" | "processing">;
type PayPalStatus = (typeof PAYPAL_STATUSES)[number];
type PayPalReviewState = (typeof PAYPAL_REVIEW_STATES)[number];

const REVIEW_STATE = bijection<ReviewState, Exclude<PayPalReviewState, "CLOSED">>({
  pending_review: "PENDING_REVIEW",
  approved: "APPROVED",
  processing: "PROCESSING",
});
const SETTLED_STATUS = bijection<Exclude<RefundStatus, ReviewState>, Exclude<PayPalStatus, "PENDING">>({
  completed: "COMPLETED",
  failed: "FAILED",
  rejected: "CANCELLED",
});
const FUNDING_SOURCE = bijection<PaymentRail, (typeof PAYPAL_FUNDING_SOURCES)[number]>({
  card: "CARD",
  ach: "BANK_ACH",
  wire: "BANK_WIRE",
  rtp: "BANK_RTP",
});
const REASON = bijection<RefundReason, (typeof PAYPAL_REASON_CODES)[number]>({
  duplicate_charge: "DUPLICATE_CHARGE",
  fraudulent_transaction: "FRAUDULENT_TRANSACTION",
  service_not_rendered: "SERVICE_NOT_RENDERED",
  product_defective: "PRODUCT_DEFECTIVE",
  billing_error: "BILLING_ERROR",
  customer_request: "CUSTOMER_REQUEST",
});

const isReviewState = (status: RefundStatus): status is ReviewState => status in { pending_review: 1, approved: 1, processing: 1 };

/** PayPal amounts are decimal strings in major units, e.g. `"489.00"`. */
const paypalMoneySchema = z.object({
  currency_code: z.enum(CURRENCY_CODES),
  value: z.string().regex(/^\d+\.\d{2}$/),
});
type PayPalMoney = z.infer<typeof paypalMoneySchema>;

/** Exact (string-based) minor ↔ major conversion; every platform currency has 2 decimals. */
const toPayPalMoney = ({ amountMinor, currency }: Money): PayPalMoney => ({
  currency_code: currency,
  value: `${Math.trunc(amountMinor / 100)}.${String(amountMinor % 100).padStart(2, "0")}`,
});
function fromPayPalMoney({ currency_code, value }: PayPalMoney): Money {
  const [major = "0", minor = "0"] = value.split(".");
  return { amountMinor: Number(major) * 100 + Number(minor), currency: currency_code };
}

export const paypalRefundSchema = z.object({
  id: z.string().regex(/^[A-Z0-9]{17}$/),
  status: z.enum(PAYPAL_STATUSES),
  amount: paypalMoneySchema,
  /** The platform's refund id. */
  invoice_id: z.string().min(1),
  note_to_payer: z.string(),
  capture: z.object({
    id: z.string().min(1),
    amount: paypalMoneySchema,
    payer: z.object({ payer_id: z.string().min(1), full_name: z.string().min(1), email_address: z.string().min(1) }),
    payee: z.object({ merchant_name: z.string().min(1), merchant_category_code: z.string().regex(/^\d{4}$/) }),
    funding_source: z.enum(PAYPAL_FUNDING_SOURCES),
    last_digits: z.string().regex(/^\d{4}$/),
  }),
  review: z.object({
    /** `CLOSED` once PayPal reports a final `status`. */
    state: z.enum(PAYPAL_REVIEW_STATES),
    reason_code: z.enum(PAYPAL_REASON_CODES),
    risk_score: z.number().int().min(0).max(100),
    requested_by: z.string().min(1),
    reviewed_by: z.string().min(1).nullable(),
    approvals: z.array(z.string().min(1)),
  }),
  create_time: z.iso.datetime(),
  update_time: z.iso.datetime(),
});

export type PayPalRefund = z.infer<typeof paypalRefundSchema>;

function statusOf({ id, status, review }: PayPalRefund): RefundStatus {
  if (status !== "PENDING") {
    if (review.state !== "CLOSED") throw new Error(`refund ${id} is ${status} but its review is still ${review.state}`);
    return SETTLED_STATUS.from(status);
  }
  if (review.state === "CLOSED") throw new Error(`refund ${id} is PENDING but its review is CLOSED`);
  return REVIEW_STATE.from(review.state);
}

export const paypalRefunds: RefundProcessorAdapter<PayPalRefund> = {
  vendor: "paypal",
  fileName: "paypal-refunds.json",
  schema: paypalRefundSchema,
  seed: () =>
    seedRefunds()
      .filter((refund) => refund.processor === "paypal")
      .map((refund) => paypalRefunds.toEdge(refund)),
  newReference: () => randomUUID().replace(/-/g, "").slice(0, 17).toUpperCase(),

  toDomain(edge) {
    const { capture, review } = edge;
    return {
      id: edge.invoice_id,
      processor: "paypal",
      processorReference: edge.id,
      transactionId: capture.id,
      customerId: capture.payer.payer_id,
      customerName: capture.payer.full_name,
      customerEmail: capture.payer.email_address,
      merchantName: capture.payee.merchant_name,
      merchantCategoryCode: capture.payee.merchant_category_code,
      amount: fromPayPalMoney(edge.amount),
      originalAmount: fromPayPalMoney(capture.amount),
      reason: REASON.from(review.reason_code),
      status: statusOf(edge),
      paymentRail: FUNDING_SOURCE.from(capture.funding_source),
      destinationLast4: capture.last_digits,
      riskScore: review.risk_score,
      requestedBy: review.requested_by,
      reviewedBy: review.reviewed_by,
      approvals: [...review.approvals],
      notes: edge.note_to_payer,
      createdAt: edge.create_time,
      updatedAt: edge.update_time,
    };
  },

  toEdge(refund: Refund): PayPalRefund {
    const pending = isReviewState(refund.status);
    return {
      id: refund.processorReference,
      status: isReviewState(refund.status) ? "PENDING" : SETTLED_STATUS.to(refund.status),
      amount: toPayPalMoney(refund.amount),
      invoice_id: refund.id,
      note_to_payer: refund.notes,
      capture: {
        id: refund.transactionId,
        amount: toPayPalMoney(refund.originalAmount),
        payer: { payer_id: refund.customerId, full_name: refund.customerName, email_address: refund.customerEmail },
        payee: { merchant_name: refund.merchantName, merchant_category_code: refund.merchantCategoryCode },
        funding_source: FUNDING_SOURCE.to(refund.paymentRail),
        last_digits: refund.destinationLast4,
      },
      review: {
        state: pending ? REVIEW_STATE.to(refund.status as ReviewState) : "CLOSED",
        reason_code: REASON.to(refund.reason),
        risk_score: refund.riskScore,
        requested_by: refund.requestedBy,
        reviewed_by: refund.reviewedBy,
        approvals: [...refund.approvals],
      },
      create_time: refund.createdAt,
      update_time: refund.updatedAt,
    };
  },
};
