import type { ISODateString } from "@platform/shared-types";

export const KYC_VENDORS = ["persona", "alloy"] as const;
export type KycVendor = (typeof KYC_VENDORS)[number];

export const KYC_VERIFICATION_STATUSES = ["pending_review", "escalated", "approved", "rejected"] as const;
export type KycVerificationStatus = (typeof KYC_VERIFICATION_STATUSES)[number];

/** Statuses after which the vendor no longer accepts manual decisions. */
export const KYC_FINAL_STATUSES = ["approved", "rejected"] as const satisfies readonly KycVerificationStatus[];

export const KYC_RISK_LEVELS = ["low", "medium", "high"] as const;
export type KycRiskLevel = (typeof KYC_RISK_LEVELS)[number];
export const KYC_DOCUMENT_TYPES = ["passport", "drivers_license", "national_id", "residence_permit"] as const;
export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[number];
export const KYC_CHECK_TYPES = ["document_authenticity", "selfie_match", "watchlist", "address", "database"] as const;
export type KycCheckType = (typeof KYC_CHECK_TYPES)[number];
export const KYC_CHECK_RESULTS = ["pass", "fail", "needs_review"] as const;
export type KycCheckResult = (typeof KYC_CHECK_RESULTS)[number];

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

/** The platform's vendor-agnostic view of one applicant's identity verification. */
export interface KycVerification {
  applicantId: string;
  /** Which vendor ran the verification. */
  vendor: KycVendor;
  /** The vendor's own reference, e.g. `inq_…` (Persona) or `ev_…` (Alloy). */
  vendorReference: string;
  /** Link to the verification (and its identity document) in the vendor's dashboard. */
  documentUrl: string;
  status: KycVerificationStatus;
  riskLevel: KycRiskLevel;
  /** 0 (safe) – 100 (high risk). */
  riskScore: number;
  applicant: KycApplicantProfile;
  document: KycIdentityDocument;
  checks: KycCheck[];
  decisions: KycManualDecision[];
  /** Analyst handle the review is assigned to; `null` = unassigned. */
  assignedTo: string | null;
  notes: string;
  submittedAt: ISODateString;
  updatedAt: ISODateString;
}
