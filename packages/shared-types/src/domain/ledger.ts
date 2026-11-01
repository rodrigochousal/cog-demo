import type { ISODateString, Money } from "../common.js";

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

/** A refund held in the finance ledger database. Money is always in minor units. */
export interface RefundRecord {
  id: string;
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
  notes: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Fields the database assigns itself (`id`, timestamps) are excluded. */
export type CreateRefundInput = Omit<RefundRecord, "id" | "createdAt" | "updatedAt">;

/** Partial update; `id` and `createdAt` are immutable and `updatedAt` is set by the database. */
export type UpdateRefundInput = Partial<CreateRefundInput>;
