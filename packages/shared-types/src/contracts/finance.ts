import { z } from "zod";
import { currencyCodeSchema, isoDateTimeSchema, recordIdSchema, requiredText, uniqueArray } from "./primitives.js";

/**
 * Client-only row of the finance refunds table, as services/finance returns it to apps/finance.
 * The BFF maps the backend `Refund` (whatever processor settled it) to this.
 */

export const REFUND_TRANSACTION_STATUSES = ["PENDING_APPROVAL", "PROCESSED", "FAILED"] as const;
export const refundTransactionStatusSchema = z.enum(REFUND_TRANSACTION_STATUSES);

export const refundTransactionRowSchema = z.object({
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
/** A validated refund row (schema output: trimmed, currency upper-cased, defaults applied). */
export type RefundTransactionRow = z.infer<typeof refundTransactionRowSchema>;
