import type { ISODateString } from "../common.js";

export const KYC_VENDORS = ["persona", "alloy"] as const;
export type KycVendor = (typeof KYC_VENDORS)[number];

export const KYC_VERIFICATION_STATUSES = ["pending_review", "escalated", "approved", "rejected"] as const;
export type KycVerificationStatus = (typeof KYC_VERIFICATION_STATUSES)[number];

/** Statuses after which the vendor no longer accepts manual decisions. */
export const KYC_FINAL_STATUSES = ["approved", "rejected"] as const satisfies readonly KycVerificationStatus[];

export type KycRiskLevel = "low" | "medium" | "high";
export type KycDocumentType = "passport" | "drivers_license" | "national_id" | "residence_permit";
export type KycCheckType = "document_authenticity" | "selfie_match" | "watchlist" | "address" | "database";
export type KycCheckResult = "pass" | "fail" | "needs_review";

export interface KycAddress {
  line1: string;
  city: string;
  region: string;
  postalCode: string;
  /** ISO-3166 alpha-2. */
  country: string;
}

export interface KycApplicantProfile {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  /** ISO-3166 alpha-2. */
  nationality: string;
  address: KycAddress;
}

export interface KycIdentityDocument {
  type: KycDocumentType;
  issuingCountry: string;
  /** Masked by the vendor, e.g. `•••••4821`. */
  maskedNumber: string;
  expiresOn: string;
}

export interface KycCheck {
  type: KycCheckType;
  result: KycCheckResult;
  detail: string;
  completedAt: ISODateString;
}

export const KYC_DECISION_OUTCOMES = ["approve", "reject", "escalate"] as const;
export type KycDecisionOutcome = (typeof KYC_DECISION_OUTCOMES)[number];

/** What a compliance analyst submits to the vendor. */
export interface KycManualDecisionInput {
  outcome: KycDecisionOutcome;
  reviewerId: string;
  reason: string;
}

export interface KycManualDecision extends KycManualDecisionInput {
  decidedAt: ISODateString;
}

/** The verification payload a KYC vendor (Persona inquiry / Alloy evaluation) returns for an applicant. */
export interface KycVerificationPayload {
  applicantId: string;
  /** The vendor's own reference, e.g. `inq_…` (Persona) or `ev_…` (Alloy). */
  vendorReference: string;
  vendor: KycVendor;
  status: KycVerificationStatus;
  riskLevel: KycRiskLevel;
  /** 0 (safe) – 100 (high risk). */
  riskScore: number;
  applicant: KycApplicantProfile;
  document: KycIdentityDocument;
  checks: KycCheck[];
  decisions: KycManualDecision[];
  submittedAt: ISODateString;
  updatedAt: ISODateString;
}
