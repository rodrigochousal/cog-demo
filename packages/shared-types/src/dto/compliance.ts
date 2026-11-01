import type { KycReviewRow } from "../contracts/compliance.js";

/** Screen-shaped DTOs exchanged between apps/compliance and services/compliance. */

/** `GET /api/kyc-reviews`: the KYC review queue, oldest submission first. */
export interface KycReviewQueueResponse {
  rows: KycReviewRow[];
}
