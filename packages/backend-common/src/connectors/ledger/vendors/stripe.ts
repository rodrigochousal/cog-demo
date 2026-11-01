import { z } from "zod";
import {
  REFUND_REASONS,
  type CurrencyCode,
  type PaymentRail,
  type Refund,
  type RefundReason,
  type RefundStatus,
} from "../../../domain/index.js";
import { createId } from "../../../util.js";
import { bijection, fromEpochSeconds, toEpochSeconds } from "../../vendor-collection.js";
import type { RefundProcessorAdapter } from "../processor.js";
import { seedRefunds } from "../seed.js";

/**
 * Edge: Stripe. Modelled on Stripe's Refund object (with its charge expanded). Stripe only
 * knows processing states and three coarse reasons, so the platform's review workflow fields
 * ride along in `metadata`, which Stripe stores as strings.
 */

const STRIPE_CURRENCIES = ["usd", "eur", "gbp"] as const;
const STRIPE_STATUSES = ["pending", "succeeded", "failed", "canceled"] as const;
const STRIPE_REASONS = ["duplicate", "fraudulent", "requested_by_customer"] as const;
const STRIPE_PAYMENT_METHODS = ["card", "us_bank_account", "wire_transfer", "instant_bank_transfer"] as const;
/** Platform states during which Stripe still reports the refund as `pending`. */
const REVIEW_STATES = ["pending_review", "approved", "processing"] as const;

type ReviewState = (typeof REVIEW_STATES)[number];
type StripeStatus = (typeof STRIPE_STATUSES)[number];

const CURRENCY = bijection<CurrencyCode, (typeof STRIPE_CURRENCIES)[number]>({ USD: "usd", EUR: "eur", GBP: "gbp" });
const PAYMENT_METHOD = bijection<PaymentRail, (typeof STRIPE_PAYMENT_METHODS)[number]>({
  card: "card",
  ach: "us_bank_account",
  wire: "wire_transfer",
  rtp: "instant_bank_transfer",
});
const SETTLED_STATUS = bijection<Exclude<RefundStatus, ReviewState>, Exclude<StripeStatus, "pending">>({
  completed: "succeeded",
  failed: "failed",
  rejected: "canceled",
});
const STRIPE_REASON: Record<RefundReason, (typeof STRIPE_REASONS)[number]> = {
  duplicate_charge: "duplicate",
  fraudulent_transaction: "fraudulent",
  service_not_rendered: "requested_by_customer",
  product_defective: "requested_by_customer",
  billing_error: "requested_by_customer",
  customer_request: "requested_by_customer",
};

const isReviewState = (status: RefundStatus): status is ReviewState => (REVIEW_STATES as readonly string[]).includes(status);

export const stripeRefundSchema = z.object({
  id: z.string().regex(/^re_[A-Za-z0-9]+$/),
  object: z.literal("refund"),
  /** Minor units. */
  amount: z.number().int().positive(),
  currency: z.enum(STRIPE_CURRENCIES),
  status: z.enum(STRIPE_STATUSES),
  reason: z.enum(STRIPE_REASONS),
  /** Unix seconds. */
  created: z.number().int().nonnegative(),
  charge: z.object({
    id: z.string().min(1),
    amount: z.number().int().positive(),
    customer: z.string().min(1),
    billing_details: z.object({ name: z.string().min(1), email: z.string().min(1) }),
    payment_method_details: z.object({ type: z.enum(STRIPE_PAYMENT_METHODS), last4: z.string().regex(/^\d{4}$/) }),
  }),
  metadata: z.object({
    platform_refund_id: z.string().min(1),
    /** Present only while `status` is `pending`. */
    review_status: z.enum(REVIEW_STATES).optional(),
    reason_code: z.enum(REFUND_REASONS),
    risk_score: z.string().regex(/^(?:100|[1-9]?\d)$/),
    requested_by: z.string().min(1),
    reviewed_by: z.string().min(1).optional(),
    /** Comma-separated approver handles. */
    approvals: z.string().min(1).optional(),
    notes: z.string(),
    merchant_name: z.string().min(1),
    merchant_category_code: z.string().regex(/^\d{4}$/),
    updated_at: z.iso.datetime(),
  }),
});

export type StripeRefund = z.infer<typeof stripeRefundSchema>;

function statusOf(edge: StripeRefund): RefundStatus {
  if (edge.status !== "pending") return SETTLED_STATUS.from(edge.status);
  if (!edge.metadata.review_status) throw new Error(`pending refund ${edge.id} has no metadata.review_status`);
  return edge.metadata.review_status;
}

export const stripeRefunds: RefundProcessorAdapter<StripeRefund> = {
  vendor: "stripe",
  fileName: "stripe-refunds.json",
  schema: stripeRefundSchema,
  seed: () =>
    seedRefunds()
      .filter((refund) => refund.processor === "stripe")
      .map((refund) => stripeRefunds.toEdge(refund)),
  newReference: () => createId("re"),

  toDomain(edge) {
    const { metadata, charge } = edge;
    const currency = CURRENCY.from(edge.currency);
    return {
      id: metadata.platform_refund_id,
      processor: "stripe",
      processorReference: edge.id,
      transactionId: charge.id,
      customerId: charge.customer,
      customerName: charge.billing_details.name,
      customerEmail: charge.billing_details.email,
      merchantName: metadata.merchant_name,
      merchantCategoryCode: metadata.merchant_category_code,
      amount: { amountMinor: edge.amount, currency },
      originalAmount: { amountMinor: charge.amount, currency },
      reason: metadata.reason_code,
      status: statusOf(edge),
      paymentRail: PAYMENT_METHOD.from(charge.payment_method_details.type),
      destinationLast4: charge.payment_method_details.last4,
      riskScore: Number(metadata.risk_score),
      requestedBy: metadata.requested_by,
      reviewedBy: metadata.reviewed_by ?? null,
      approvals: metadata.approvals ? metadata.approvals.split(",") : [],
      notes: metadata.notes,
      createdAt: fromEpochSeconds(edge.created),
      updatedAt: metadata.updated_at,
    };
  },

  toEdge(refund: Refund): StripeRefund {
    const pending = isReviewState(refund.status);
    return {
      id: refund.processorReference,
      object: "refund",
      amount: refund.amount.amountMinor,
      currency: CURRENCY.to(refund.amount.currency),
      status: isReviewState(refund.status) ? "pending" : SETTLED_STATUS.to(refund.status),
      reason: STRIPE_REASON[refund.reason],
      created: toEpochSeconds(refund.createdAt),
      charge: {
        id: refund.transactionId,
        amount: refund.originalAmount.amountMinor,
        customer: refund.customerId,
        billing_details: { name: refund.customerName, email: refund.customerEmail },
        payment_method_details: { type: PAYMENT_METHOD.to(refund.paymentRail), last4: refund.destinationLast4 },
      },
      metadata: {
        platform_refund_id: refund.id,
        ...(pending ? { review_status: refund.status as ReviewState } : {}),
        reason_code: refund.reason,
        risk_score: String(refund.riskScore),
        requested_by: refund.requestedBy,
        ...(refund.reviewedBy === null ? {} : { reviewed_by: refund.reviewedBy }),
        ...(refund.approvals.length ? { approvals: refund.approvals.join(",") } : {}),
        notes: refund.notes,
        merchant_name: refund.merchantName,
        merchant_category_code: refund.merchantCategoryCode,
        updated_at: refund.updatedAt,
      },
    };
  },
};
