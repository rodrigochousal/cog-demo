import { z } from "zod";
import { httpUrlSchema, optionalText, recordIdSchema, requiredText } from "./primitives.js";

/** API contract for a row in the compliance KYC review queue (apps/compliance ↔ services/compliance). */

export const KYC_RECORD_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export const kycRecordStatusSchema = z.enum(KYC_RECORD_STATUSES);

export const kycRecordSchema = z.object({
  id: recordIdSchema,
  status: kycRecordStatusSchema,
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

export type KYCRecordStatus = z.infer<typeof kycRecordStatusSchema>;
/** A validated KYC record (schema output: trimmed, defaults applied). */
export type KYCRecord = z.infer<typeof kycRecordSchema>;
/** What a client may send before parsing (e.g. `notes` may be omitted). */
export type KYCRecordInput = z.input<typeof kycRecordSchema>;
