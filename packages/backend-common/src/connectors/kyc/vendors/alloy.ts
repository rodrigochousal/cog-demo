import { z } from "zod";
import type { KycVerification, KycVerificationStatus } from "../../../domain/index.js";
import { bijection, fromEpochMs, toEpochMs, type VendorAdapter } from "../../vendor-collection.js";
import { seedKycVerifications, type KycVerificationSeed } from "../seed.js";

/**
 * Edge: Alloy. Modelled on an Alloy evaluation: a `summary` with a Title Case outcome and a
 * 0–1 score, the `supplied` applicant data, per-service results and epoch-millisecond
 * timestamps. Escalation is a `Manual Review` outcome tagged `Escalated`.
 */

const OUTCOMES = { pending_review: "Manual Review", approved: "Approved", rejected: "Denied" } as const;
const ESCALATED_TAG = "Escalated";
const RISK_LEVELS = { low: "Low", medium: "Medium", high: "High" } as const;
const DOCUMENT_TYPES = {
  passport: "Passport",
  drivers_license: "Driver's License",
  national_id: "National ID",
  residence_permit: "Residence Permit",
} as const;
const SERVICES = {
  document_authenticity: "Document Verification",
  selfie_match: "Selfie Match",
  watchlist: "Watchlist Screening",
  address: "Address Verification",
  database: "Identity Database",
} as const;
const SERVICE_STATUSES = { pass: "pass", fail: "fail", needs_review: "review" } as const;
const REVIEW_DECISIONS = { approve: "Approved", reject: "Denied", escalate: "Escalated" } as const;

const OUTCOME = bijection(OUTCOMES);
const RISK_LEVEL = bijection(RISK_LEVELS);
const DOCUMENT_TYPE = bijection(DOCUMENT_TYPES);
const SERVICE = bijection(SERVICES);
const SERVICE_STATUS = bijection(SERVICE_STATUSES);
const REVIEW_DECISION = bijection(REVIEW_DECISIONS);

const PORTAL_URL = "https://app.alloy.co/evaluations/";
const epochMs = z.number().int().nonnegative();

export const alloyEvaluationSchema = z.object({
  evaluation_token: z.string().regex(/^ev_[A-Za-z0-9]+$/),
  /** The platform's applicant id. */
  external_entity_id: z.string().min(1),
  summary: z.object({
    outcome: z.enum(OUTCOMES),
    tags: z.array(z.string()),
    /** 0 (safe) – 1 (high risk), two decimals. */
    score: z.number().min(0).max(1),
    risk_level: z.enum(RISK_LEVELS),
  }),
  supplied: z.object({
    name_first: z.string().min(1),
    name_last: z.string().min(1),
    birth_date: z.string().min(1),
    email_address: z.string().min(1),
    phone_number: z.string().min(1),
    nationality: z.string().min(1),
    address_line_1: z.string().min(1),
    address_city: z.string().min(1),
    address_state: z.string(),
    address_postal_code: z.string(),
    address_country_code: z.string().min(1),
    document: z.object({
      type: z.enum(DOCUMENT_TYPES),
      country: z.string().min(1),
      number_masked: z.string().min(1),
      expiration_date: z.string().min(1),
    }),
  }),
  services: z.array(
    z.object({ name: z.enum(SERVICES), status: z.enum(SERVICE_STATUSES), detail: z.string(), completed_at: epochMs }),
  ),
  reviews: z.array(
    z.object({ decision: z.enum(REVIEW_DECISIONS), analyst: z.string().min(1), reason: z.string().min(1), timestamp: epochMs }),
  ),
  assigned_analyst: z.string().min(1).nullable(),
  notes: z.string(),
  created_at: epochMs,
  updated_at: epochMs,
});

export type AlloyEvaluation = z.infer<typeof alloyEvaluationSchema>;

function statusOf({ summary }: AlloyEvaluation): KycVerificationStatus {
  if (summary.outcome === "Manual Review" && summary.tags.includes(ESCALATED_TAG)) return "escalated";
  return OUTCOME.from(summary.outcome);
}

function toAlloyEvaluation(record: KycVerificationSeed): AlloyEvaluation {
  const { applicant, document } = record;
  const escalated = record.status === "escalated";
  return {
    evaluation_token: record.vendorReference,
    external_entity_id: record.applicantId,
    summary: {
      outcome: escalated ? "Manual Review" : OUTCOME.to(record.status as Exclude<KycVerificationStatus, "escalated">),
      tags: escalated ? [ESCALATED_TAG] : [],
      score: record.riskScore / 100,
      risk_level: RISK_LEVEL.to(record.riskLevel),
    },
    supplied: {
      name_first: applicant.firstName,
      name_last: applicant.lastName,
      birth_date: applicant.dateOfBirth,
      email_address: applicant.email,
      phone_number: applicant.phone,
      nationality: applicant.nationality,
      address_line_1: applicant.address.line1,
      address_city: applicant.address.city,
      address_state: applicant.address.region,
      address_postal_code: applicant.address.postalCode,
      address_country_code: applicant.address.country,
      document: {
        type: DOCUMENT_TYPE.to(document.type),
        country: document.issuingCountry,
        number_masked: document.maskedNumber,
        expiration_date: document.expiresOn,
      },
    },
    services: record.checks.map((check) => ({
      name: SERVICE.to(check.type),
      status: SERVICE_STATUS.to(check.result),
      detail: check.detail,
      completed_at: toEpochMs(check.completedAt),
    })),
    reviews: record.decisions.map((decision) => ({
      decision: REVIEW_DECISION.to(decision.outcome),
      analyst: decision.reviewerId,
      reason: decision.reason,
      timestamp: toEpochMs(decision.decidedAt),
    })),
    assigned_analyst: record.assignedTo,
    notes: record.notes,
    created_at: toEpochMs(record.submittedAt),
    updated_at: toEpochMs(record.updatedAt),
  };
}

export const alloyEvaluations: VendorAdapter<AlloyEvaluation, KycVerification> = {
  vendor: "alloy",
  fileName: "alloy-evaluations.json",
  schema: alloyEvaluationSchema,
  seed: () =>
    seedKycVerifications()
      .filter((record) => record.vendor === "alloy")
      .map(toAlloyEvaluation),
  toEdge: toAlloyEvaluation,

  toDomain(edge) {
    const { summary, supplied } = edge;
    return {
      applicantId: edge.external_entity_id,
      vendor: "alloy",
      vendorReference: edge.evaluation_token,
      documentUrl: `${PORTAL_URL}${edge.evaluation_token}`,
      status: statusOf(edge),
      riskLevel: RISK_LEVEL.from(summary.risk_level),
      riskScore: Math.round(summary.score * 100),
      applicant: {
        firstName: supplied.name_first,
        lastName: supplied.name_last,
        dateOfBirth: supplied.birth_date,
        email: supplied.email_address,
        phone: supplied.phone_number,
        nationality: supplied.nationality,
        address: {
          line1: supplied.address_line_1,
          city: supplied.address_city,
          region: supplied.address_state,
          postalCode: supplied.address_postal_code,
          country: supplied.address_country_code,
        },
      },
      document: {
        type: DOCUMENT_TYPE.from(supplied.document.type),
        issuingCountry: supplied.document.country,
        maskedNumber: supplied.document.number_masked,
        expiresOn: supplied.document.expiration_date,
      },
      checks: edge.services.map((service) => ({
        type: SERVICE.from(service.name),
        result: SERVICE_STATUS.from(service.status),
        detail: service.detail,
        completedAt: fromEpochMs(service.completed_at),
      })),
      decisions: edge.reviews.map((review) => ({
        outcome: REVIEW_DECISION.from(review.decision),
        reviewerId: review.analyst,
        reason: review.reason,
        decidedAt: fromEpochMs(review.timestamp),
      })),
      assignedTo: edge.assigned_analyst,
      notes: edge.notes,
      submittedAt: fromEpochMs(edge.created_at),
      updatedAt: fromEpochMs(edge.updated_at),
    };
  },
};
