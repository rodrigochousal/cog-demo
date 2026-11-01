import type { ISODateString } from "@platform/shared-types";
import type { Money } from "./common.js";

export const REFUND_STATUSES = ["pending_review", "approved", "processing", "completed", "rejected", "failed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_REASONS = [
  "duplicate_charge",
  "fraudulent_transaction",
  "service_not_rendered",
  "product_defective",
  "billing_error",
  "customer_request",
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export const PAYMENT_RAILS = ["card", "ach", "wire", "rtp"] as const;
export type PaymentRail = (typeof PAYMENT_RAILS)[number];

/** Payment processors refunds are settled through. A refund always goes back through the processor of its original charge. */
export const PAYMENT_PROCESSORS = ["stripe", "paypal"] as const;
export type PaymentProcessor = (typeof PAYMENT_PROCESSORS)[number];

/** The platform's processor-agnostic refund. Money is always in minor units. */
export interface Refund {
  /** Platform id, e.g. `rf_8f2c41a9d0b1`. */
  id: string;
  processor: PaymentProcessor;
  /** The processor's own id for the refund (Stripe `re_…`, PayPal 17-char id). */
  processorReference: string;
  /** The settled transaction being (partially) reversed. */
  transactionId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  merchantName: string;
  /** ISO-18245 merchant category code of the original charge. */
  merchantCategoryCode: string;
  amount: Money;
  originalAmount: Money;
  reason: RefundReason;
  status: RefundStatus;
  paymentRail: PaymentRail;
  /** Last four digits of the card or account the refund is paid to. */
  destinationLast4: string;
  /** 0 (safe) – 100 (very likely abuse), from the upstream risk engine. */
  riskScore: number;
  requestedBy: string;
  reviewedBy: string | null;
  /** Handles of the approvers who signed off, in order; distinct. */
  approvals: string[];
  notes: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Fields the ledger assigns itself (`id`, `processorReference`, timestamps) are excluded. */
export type CreateRefundInput = Omit<Refund, "id" | "processorReference" | "createdAt" | "updatedAt">;

/** Partial update; `processor` is immutable and `updatedAt` is set by the ledger. */
export type UpdateRefundInput = Partial<Omit<CreateRefundInput, "processor">>;
