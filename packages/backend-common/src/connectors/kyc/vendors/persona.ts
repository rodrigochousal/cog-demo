import { z } from "zod";
import { KYC_RISK_LEVELS, type KycVerification, type KycVerificationStatus } from "../../../domain/index.js";
import { bijection, type VendorAdapter } from "../../vendor-collection.js";
import { seedKycVerifications, type KycVerificationSeed } from "../seed.js";

/**
 * Edge: Persona. Modelled on Persona's JSON:API inquiry resource: snake_case attributes,
 * flattened applicant fields, verifications and reviews as relationships. Persona has no
 * "escalated" status; escalation is a `needs_review` inquiry tagged `escalated`.
 */

const STATUSES = { pending_review: "needs_review", approved: "approved", rejected: "declined" } as const;
const ESCALATED_TAG = "escalated";
const DOCUMENT_KINDS = { passport: "pp", drivers_license: "dl", national_id: "id", residence_permit: "rp" } as const;
const VERIFICATION_TYPES = {
  document_authenticity: "verification/government-id",
  selfie_match: "verification/selfie",
  watchlist: "report/watchlist",
  address: "verification/address",
  database: "verification/database",
} as const;
const VERIFICATION_STATUSES = { pass: "passed", fail: "failed", needs_review: "requires_review" } as const;
const REVIEW_ACTIONS = { approve: "approve", reject: "decline", escalate: "escalate" } as const;

const STATUS = bijection(STATUSES);
const DOCUMENT_KIND = bijection(DOCUMENT_KINDS);
const VERIFICATION_TYPE = bijection(VERIFICATION_TYPES);
const VERIFICATION_STATUS = bijection(VERIFICATION_STATUSES);
const REVIEW_ACTION = bijection(REVIEW_ACTIONS);

const PORTAL_URL = "https://app.withpersona.com/dashboard/inquiries/";

export const personaInquirySchema = z.object({
  type: z.literal("inquiry"),
  id: z.string().regex(/^inq_[A-Za-z0-9]+$/),
  attributes: z.object({
    status: z.enum(STATUSES),
    /** The platform's applicant id. */
    reference_id: z.string().min(1),
    tags: z.array(z.string()),
    risk: z.object({ level: z.enum(KYC_RISK_LEVELS), score: z.number().int().min(0).max(100) }),
    name_first: z.string().min(1),
    name_last: z.string().min(1),
    birthdate: z.string().min(1),
    email_address: z.string().min(1),
    phone_number: z.string().min(1),
    nationality_country_code: z.string().min(1),
    address_street_1: z.string().min(1),
    address_city: z.string().min(1),
    address_subdivision: z.string(),
    address_postal_code: z.string(),
    address_country_code: z.string().min(1),
    assignee: z.string().min(1).nullable(),
    notes: z.string(),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  }),
  relationships: z.object({
    documents: z.tuple([
      z.object({
        kind: z.enum(DOCUMENT_KINDS),
        issuing_country: z.string().min(1),
        id_number_masked: z.string().min(1),
        expiration_date: z.string().min(1),
      }),
    ]),
    verifications: z.array(
      z.object({
        type: z.enum(VERIFICATION_TYPES),
        status: z.enum(VERIFICATION_STATUSES),
        detail: z.string(),
        completed_at: z.iso.datetime(),
      }),
    ),
    reviews: z.array(
      z.object({
        action: z.enum(REVIEW_ACTIONS),
        reviewer: z.string().min(1),
        comment: z.string().min(1),
        created_at: z.iso.datetime(),
      }),
    ),
  }),
});

export type PersonaInquiry = z.infer<typeof personaInquirySchema>;

function statusOf({ attributes }: PersonaInquiry): KycVerificationStatus {
  if (attributes.status === "needs_review" && attributes.tags.includes(ESCALATED_TAG)) return "escalated";
  return STATUS.from(attributes.status);
}

function toPersonaInquiry(record: KycVerificationSeed): PersonaInquiry {
  const { applicant, document } = record;
  const escalated = record.status === "escalated";
  return {
    type: "inquiry",
    id: record.vendorReference,
    attributes: {
      status: escalated ? "needs_review" : STATUS.to(record.status as Exclude<KycVerificationStatus, "escalated">),
      reference_id: record.applicantId,
      tags: escalated ? [ESCALATED_TAG] : [],
      risk: { level: record.riskLevel, score: record.riskScore },
      name_first: applicant.firstName,
      name_last: applicant.lastName,
      birthdate: applicant.dateOfBirth,
      email_address: applicant.email,
      phone_number: applicant.phone,
      nationality_country_code: applicant.nationality,
      address_street_1: applicant.address.line1,
      address_city: applicant.address.city,
      address_subdivision: applicant.address.region,
      address_postal_code: applicant.address.postalCode,
      address_country_code: applicant.address.country,
      assignee: record.assignedTo,
      notes: record.notes,
      created_at: record.submittedAt,
      updated_at: record.updatedAt,
    },
    relationships: {
      documents: [
        {
          kind: DOCUMENT_KIND.to(document.type),
          issuing_country: document.issuingCountry,
          id_number_masked: document.maskedNumber,
          expiration_date: document.expiresOn,
        },
      ],
      verifications: record.checks.map((check) => ({
        type: VERIFICATION_TYPE.to(check.type),
        status: VERIFICATION_STATUS.to(check.result),
        detail: check.detail,
        completed_at: check.completedAt,
      })),
      reviews: record.decisions.map((decision) => ({
        action: REVIEW_ACTION.to(decision.outcome),
        reviewer: decision.reviewerId,
        comment: decision.reason,
        created_at: decision.decidedAt,
      })),
    },
  };
}

export const personaInquiries: VendorAdapter<PersonaInquiry, KycVerification> = {
  vendor: "persona",
  fileName: "persona-inquiries.json",
  schema: personaInquirySchema,
  seed: () =>
    seedKycVerifications()
      .filter((record) => record.vendor === "persona")
      .map(toPersonaInquiry),
  toEdge: toPersonaInquiry,

  toDomain(edge) {
    const { attributes: a, relationships } = edge;
    const [document] = relationships.documents;
    return {
      applicantId: a.reference_id,
      vendor: "persona",
      vendorReference: edge.id,
      documentUrl: `${PORTAL_URL}${edge.id}`,
      status: statusOf(edge),
      riskLevel: a.risk.level,
      riskScore: a.risk.score,
      applicant: {
        firstName: a.name_first,
        lastName: a.name_last,
        dateOfBirth: a.birthdate,
        email: a.email_address,
        phone: a.phone_number,
        nationality: a.nationality_country_code,
        address: {
          line1: a.address_street_1,
          city: a.address_city,
          region: a.address_subdivision,
          postalCode: a.address_postal_code,
          country: a.address_country_code,
        },
      },
      document: {
        type: DOCUMENT_KIND.from(document.kind),
        issuingCountry: document.issuing_country,
        maskedNumber: document.id_number_masked,
        expiresOn: document.expiration_date,
      },
      checks: relationships.verifications.map((v) => ({
        type: VERIFICATION_TYPE.from(v.type),
        result: VERIFICATION_STATUS.from(v.status),
        detail: v.detail,
        completedAt: v.completed_at,
      })),
      decisions: relationships.reviews.map((review) => ({
        outcome: REVIEW_ACTION.from(review.action),
        reviewerId: review.reviewer,
        reason: review.comment,
        decidedAt: review.created_at,
      })),
      assignedTo: a.assignee,
      notes: a.notes,
      submittedAt: a.created_at,
      updatedAt: a.updated_at,
    };
  },
};
