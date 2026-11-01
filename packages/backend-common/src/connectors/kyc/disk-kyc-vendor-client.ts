import { KYC_DECISION_OUTCOMES, KYC_FINAL_STATUSES, KYC_VENDORS, KYC_VERIFICATION_STATUSES } from "@platform/shared-types";
import type {
  KycDecisionOutcome,
  KycManualDecisionInput,
  KycVerificationPayload,
  KycVerificationStatus,
} from "@platform/shared-types";
import { DomainError } from "../../errors.js";
import { indexOrThrow, invalidInput, requireId } from "../errors.js";
import type { DiskConnectorOptions, IKycVendorClient, InitializableConnector } from "../interfaces.js";
import { JsonCollection } from "../json-collection.js";
import {
  defineSchema,
  isArrayOf,
  isIntegerBetween,
  isIsoDate,
  isNonEmptyString,
  isOneOf,
  isShape,
  isString,
} from "../schema.js";
import { seedKycVerifications } from "./seed.js";

const ENTITY = "KYC applicant";

const isDecision = isShape({
  outcome: isOneOf(KYC_DECISION_OUTCOMES),
  reviewerId: isNonEmptyString,
  reason: isNonEmptyString,
  decidedAt: isIsoDate,
});

export const kycVerificationSchema = defineSchema<KycVerificationPayload>({
  applicantId: isNonEmptyString,
  vendorReference: isNonEmptyString,
  vendor: isOneOf(KYC_VENDORS),
  status: isOneOf(KYC_VERIFICATION_STATUSES),
  riskLevel: isOneOf(["low", "medium", "high"]),
  riskScore: isIntegerBetween(0, 100),
  applicant: isShape({
    firstName: isNonEmptyString,
    lastName: isNonEmptyString,
    dateOfBirth: isIsoDate,
    email: isNonEmptyString,
    phone: isNonEmptyString,
    nationality: isNonEmptyString,
    address: isShape({
      line1: isNonEmptyString,
      city: isNonEmptyString,
      region: isString,
      postalCode: isString,
      country: isNonEmptyString,
    }),
  }),
  document: isShape({
    type: isOneOf(["passport", "drivers_license", "national_id", "residence_permit"]),
    issuingCountry: isNonEmptyString,
    maskedNumber: isNonEmptyString,
    expiresOn: isIsoDate,
  }),
  checks: isArrayOf(
    isShape({
      type: isOneOf(["document_authenticity", "selfie_match", "watchlist", "address", "database"]),
      result: isOneOf(["pass", "fail", "needs_review"]),
      detail: isString,
      completedAt: isIsoDate,
    }),
  ),
  decisions: isArrayOf(isDecision),
  submittedAt: isIsoDate,
  updatedAt: isIsoDate,
});

const STATUS_AFTER: Record<KycDecisionOutcome, KycVerificationStatus> = {
  approve: "approved",
  reject: "rejected",
  escalate: "escalated",
};

const isFinal = (status: KycVerificationStatus) => (KYC_FINAL_STATUSES as readonly KycVerificationStatus[]).includes(status);

function assertValidDecision(decision: KycManualDecisionInput): KycManualDecisionInput {
  if (!(KYC_DECISION_OUTCOMES as readonly string[]).includes(decision.outcome)) {
    throw invalidInput(`Decision outcome must be one of ${KYC_DECISION_OUTCOMES.join(", ")}`);
  }
  if (typeof decision.reviewerId !== "string" || decision.reviewerId.trim() === "") throw invalidInput("Decision reviewerId is required");
  if (typeof decision.reason !== "string" || decision.reason.trim() === "") throw invalidInput("Decision reason is required");
  return { outcome: decision.outcome, reviewerId: decision.reviewerId.trim(), reason: decision.reason.trim() };
}

/** IKycVendorClient over `<data dir>/kyc-vendor.json`. Stands in for Persona / Alloy REST APIs. */
export class DiskKycVendorClient implements IKycVendorClient, InitializableConnector {
  readonly #collection: JsonCollection<KycVerificationPayload>;
  readonly #now: () => Date;

  constructor({ filePath, latency, now = () => new Date() }: DiskConnectorOptions) {
    this.#now = now;
    this.#collection = new JsonCollection({
      label: "kyc-vendor",
      filePath,
      latency,
      schema: kycVerificationSchema,
      seed: seedKycVerifications,
    });
  }

  async initialize(): Promise<void> {
    return this.#collection.initialize();
  }

  async listVerificationPayloads(): Promise<KycVerificationPayload[]> {
    const records = await this.#collection.readAll();
    return records.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  }

  async getVerificationPayload(applicantId: string): Promise<KycVerificationPayload> {
    requireId(ENTITY, applicantId);
    const records = await this.#collection.readAll();
    return records[indexOrThrow(records, ENTITY, applicantId, (r) => r.applicantId)] as KycVerificationPayload;
  }

  async submitManualDecision(applicantId: string, decision: KycManualDecisionInput): Promise<KycVerificationPayload> {
    requireId(ENTITY, applicantId);
    const input = assertValidDecision(decision);
    return this.#collection.mutate((records) => {
      const payload = records[indexOrThrow(records, ENTITY, applicantId, (r) => r.applicantId)] as KycVerificationPayload;
      if (isFinal(payload.status)) {
        throw new DomainError("CONFLICT", `${ENTITY} '${applicantId}' is already ${payload.status}; no further decisions are accepted`);
      }
      const decidedAt = this.#now().toISOString();
      payload.decisions.push({ ...input, decidedAt });
      payload.status = STATUS_AFTER[input.outcome];
      payload.updatedAt = decidedAt;
      return structuredClone(payload);
    });
  }
}
