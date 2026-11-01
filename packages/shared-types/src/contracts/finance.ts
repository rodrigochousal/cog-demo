import { z } from "zod";
import { currencyCodeSchema, isoDateTimeSchema, recordIdSchema, requiredText, uniqueArray } from "./primitives.js";

/** API contract for a refund on the finance refunds dashboard (apps/finance ↔ services/finance). */

export const REFUND_TRANSACTION_STATUSES = ["PENDING_APPROVAL", "PROCESSED", "FAILED"] as const;
export const refundTransactionStatusSchema = z.enum(REFUND_TRANSACTION_STATUSES);

export const refundTransactionSchema = z.object({
  id: recordIdSchema,
  /** Refund amount in major units of `currency` (e.g. `12.5` = 12.50 USD). */
  amount: z.number().positive("Must be greater than 0"),
  status: refundTransactionStatusSchema,
  currency: currencyCodeSchema,
  customerId: recordIdSchema,
  createdTimestamp: isoDateTimeSchema,
  /** Ids of the approvers who signed off so far; must be distinct. Defaults to `[]`. */
  approvalsReceived: uniqueArray(requiredText(128), "approver").default([]),
});

export type RefundTransactionStatus = z.infer<typeof refundTransactionStatusSchema>;
/** A validated refund transaction (schema output: trimmed, currency upper-cased, defaults applied). */
export type RefundTransaction = z.infer<typeof refundTransactionSchema>;
/** What a client may send before parsing (e.g. `approvalsReceived` may be omitted). */
export type RefundTransactionInput = z.input<typeof refundTransactionSchema>;
