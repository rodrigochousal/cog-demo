import type {
  KycCheck,
  KycCheckResult,
  KycDocumentType,
  KycManualDecision,
  KycRiskLevel,
  KycVendor,
  KycVerification,
  KycVerificationStatus,
} from "../../domain/index.js";

/** A generic verification before a vendor adapter derives its vendor-specific `documentUrl`. */
export type KycVerificationSeed = Omit<KycVerification, "documentUrl">;

interface Row {
  id: string;
  vendor: KycVendor;
  ref: string;
  status: KycVerificationStatus;
  risk: [KycRiskLevel, number];
  person: [first: string, last: string, dob: string, email: string, phone: string, nationality: string];
  address: [line1: string, city: string, region: string, postalCode: string, country: string];
  doc: [type: KycDocumentType, country: string, last4: string, expiresOn: string];
  /** document, selfie, watchlist, address, database */
  results: [KycCheckResult, KycCheckResult, KycCheckResult, KycCheckResult, KycCheckResult];
  flag?: string;
  submittedAt: string;
  decisions?: KycManualDecision[];
}

const ROWS: Row[] = [
  { id: "app_01HZK3M8Q2", vendor: "persona", ref: "inq_7Ldq2VbWmA4sYk9", status: "pending_review", risk: ["medium", 54], person: ["Elena", "Petrova", "1991-04-17", "elena.petrova@gmail.com", "+1 415 555 0182", "BG"], address: ["2148 Mission St Apt 5", "San Francisco", "CA", "94110", "US"], doc: ["passport", "BG", "4821", "2031-06-30"], results: ["pass", "needs_review", "pass", "pass", "pass"], flag: "Selfie similarity 0.71 below 0.80 auto-approve threshold.", submittedAt: "2026-10-20T15:04:11.000Z" },
  { id: "app_01HZK3N1R7", vendor: "alloy", ref: "ev_K2m9QwX4pL7n", status: "pending_review", risk: ["high", 81], person: ["Omar", "Haddad", "1987-11-02", "omar.haddad@outlook.com", "+44 20 7946 0321", "JO"], address: ["14 Wellington Row", "London", "Greater London", "E2 7BB", "GB"], doc: ["residence_permit", "GB", "9034", "2028-02-14"], results: ["pass", "pass", "needs_review", "pass", "pass"], flag: "Potential PEP match (62% name similarity) on OFAC-adjacent list.", submittedAt: "2026-10-21T09:41:37.000Z" },
  { id: "app_01HZK3P5T3", vendor: "persona", ref: "inq_Q8vR3nT6yH2cJp1", status: "pending_review", risk: ["low", 18], person: ["Jasmine", "Wu", "1996-08-23", "jasmine.wu@icloud.com", "+1 646 555 0147", "US"], address: ["88 Greenwich St Unit 1204", "New York", "NY", "10006", "US"], doc: ["drivers_license", "US", "7712", "2029-08-23"], results: ["pass", "pass", "pass", "needs_review", "pass"], flag: "Address on licence differs from application address (recent move).", submittedAt: "2026-10-21T13:18:05.000Z" },
  { id: "app_01HZK3Q9W8", vendor: "alloy", ref: "ev_T7b3NcV8sD1f", status: "escalated", risk: ["high", 88], person: ["Viktor", "Sokolov", "1979-01-30", "v.sokolov@proton.me", "+357 22 555 019", "CY"], address: ["27 Makarios III Ave", "Nicosia", "Nicosia", "1065", "CY"], doc: ["passport", "CY", "1150", "2027-03-11"], results: ["pass", "pass", "fail", "pass", "needs_review"], flag: "Sanctions list hit (EU consolidated list) on date of birth + surname.", submittedAt: "2026-10-19T07:55:48.000Z", decisions: [{ outcome: "escalate", reviewerId: "cmp.adiaz", reason: "Possible sanctions match; requires MLRO sign-off.", decidedAt: "2026-10-19T12:30:00.000Z" }] },
  { id: "app_01HZK3S2X4", vendor: "persona", ref: "inq_B4kL9mP2wQ7xZr3", status: "approved", risk: ["low", 9], person: ["Thomas", "Müller", "1985-05-09", "thomas.mueller@web.de", "+49 30 5557 0194", "DE"], address: ["Torstraße 112", "Berlin", "Berlin", "10119", "DE"], doc: ["national_id", "DE", "3307", "2032-05-09"], results: ["pass", "pass", "pass", "pass", "pass"], submittedAt: "2026-10-18T10:12:26.000Z", decisions: [{ outcome: "approve", reviewerId: "cmp.kobrien", reason: "All checks clear; manual spot check of ID hologram passed.", decidedAt: "2026-10-18T14:02:51.000Z" }] },
  { id: "app_01HZK3T6Y9", vendor: "alloy", ref: "ev_P9x2KdR5mW3h", status: "rejected", risk: ["high", 95], person: ["Brandon", "Cole", "1999-12-12", "bcole.biz@mail.com", "+1 702 555 0109", "US"], address: ["4100 Paradise Rd", "Las Vegas", "NV", "89169", "US"], doc: ["drivers_license", "US", "0420", "2027-12-12"], results: ["fail", "fail", "pass", "fail", "needs_review"], flag: "Template-matched forged licence; selfie is a screen replay.", submittedAt: "2026-10-17T22:47:03.000Z", decisions: [{ outcome: "reject", reviewerId: "cmp.adiaz", reason: "Document tampering confirmed by vendor forensics.", decidedAt: "2026-10-18T09:15:44.000Z" }] },
  { id: "app_01HZK3V1Z5", vendor: "persona", ref: "inq_H3nW8qY1tK6vLm4", status: "pending_review", risk: ["medium", 47], person: ["Ana", "Souza", "1993-02-28", "ana.souza@uol.com.br", "+55 11 95555 0172", "BR"], address: ["Rua Augusta 1508", "São Paulo", "SP", "01304-001", "BR"], doc: ["passport", "BR", "6619", "2030-09-01"], results: ["needs_review", "pass", "pass", "pass", "pass"], flag: "MRZ check digit mismatch; image glare on data page.", submittedAt: "2026-10-22T11:26:59.000Z" },
  { id: "app_01HZK3W5B1", vendor: "alloy", ref: "ev_D6q1ZsF8nB4k", status: "pending_review", risk: ["medium", 58], person: ["Liam", "O'Connor", "1990-07-04", "liam.oconnor@eircom.net", "+353 1 555 0136", "IE"], address: ["9 Fitzwilliam Square", "Dublin", "Dublin", "D02 X285", "IE"], doc: ["passport", "IE", "2287", "2029-11-20"], results: ["pass", "pass", "pass", "pass", "needs_review"], flag: "Thin credit file: no bureau match for date of birth.", submittedAt: "2026-10-22T16:40:22.000Z" },
  { id: "app_01HZK3X9C6", vendor: "persona", ref: "inq_R1tY6uI3oP8aSd2", status: "approved", risk: ["low", 12], person: ["Aisha", "Bello", "1994-09-15", "aisha.bello@gmail.com", "+234 803 555 0128", "NG"], address: ["12 Admiralty Way", "Lagos", "Lagos", "106104", "NG"], doc: ["passport", "NG", "5530", "2030-01-15"], results: ["pass", "pass", "pass", "needs_review", "pass"], submittedAt: "2026-10-16T08:03:17.000Z", decisions: [{ outcome: "approve", reviewerId: "cmp.kobrien", reason: "Utility bill uploaded confirms address.", decidedAt: "2026-10-16T13:22:08.000Z" }] },
  { id: "app_01HZK3Z3D2", vendor: "alloy", ref: "ev_M8w4XbN2cV6j", status: "pending_review", risk: ["high", 76], person: ["Chen", "Wei", "1983-03-21", "chen.wei@163.com", "+852 5555 0193", "HK"], address: ["18 Harbour Rd, Flat 32B", "Wan Chai", "Hong Kong Island", "000000", "HK"], doc: ["national_id", "HK", "8845", "2033-03-21"], results: ["pass", "pass", "needs_review", "pass", "pass"], flag: "Adverse media: named in 2024 regulatory enforcement article.", submittedAt: "2026-10-23T03:14:45.000Z" },
  { id: "app_01HZK415F7", vendor: "persona", ref: "inq_X5cV2bN7mQ4wEr9", status: "pending_review", risk: ["low", 23], person: ["Sarah", "Goldberg", "1988-06-11", "sarah.goldberg@gmail.com", "+1 312 555 0164", "US"], address: ["455 N Cityfront Plaza Dr", "Chicago", "IL", "60611", "US"], doc: ["drivers_license", "US", "3196", "2028-06-11"], results: ["pass", "needs_review", "pass", "pass", "pass"], flag: "Selfie capture blurred; applicant wearing glasses.", submittedAt: "2026-10-23T14:51:30.000Z" },
  { id: "app_01HZK429G3", vendor: "alloy", ref: "ev_A3s7DfG9hJ2k", status: "escalated", risk: ["medium", 63], person: ["Rafael", "Gómez", "1975-10-08", "rafael.gomez@telefonica.net", "+34 91 555 0177", "ES"], address: ["Calle de Serrano 45", "Madrid", "Madrid", "28001", "ES"], doc: ["national_id", "ES", "7008", "2027-10-08"], results: ["pass", "pass", "needs_review", "pass", "pass"], flag: "Shares surname and birth year with a listed PEP (regional official).", submittedAt: "2026-10-20T10:08:12.000Z", decisions: [{ outcome: "escalate", reviewerId: "cmp.mfarah", reason: "Need source-of-funds documentation before deciding.", decidedAt: "2026-10-21T08:45:00.000Z" }] },
  { id: "app_01HZK43D8H", vendor: "persona", ref: "inq_L7kJ3hG8fD1sAq6", status: "pending_review", risk: ["medium", 41], person: ["Nadia", "Khan", "1997-01-19", "nadia.khan@hotmail.co.uk", "+44 161 555 0158", "GB"], address: ["3 Deansgate Square", "Manchester", "Greater Manchester", "M15 4UP", "GB"], doc: ["drivers_license", "GB", "2651", "2034-01-19"], results: ["pass", "pass", "pass", "pass", "needs_review"], flag: "Electoral roll match on name only; DOB not confirmed.", submittedAt: "2026-10-24T09:33:48.000Z" },
  { id: "app_01HZK44H4J", vendor: "alloy", ref: "ev_Z1x5CvB7nM3q", status: "rejected", risk: ["high", 90], person: ["Kevin", "Dupont", "2001-05-30", "kev.dupont01@gmail.com", "+33 6 55 55 01 44", "FR"], address: ["7 Rue de la Paix", "Paris", "Île-de-France", "75002", "FR"], doc: ["national_id", "FR", "1342", "2031-05-30"], results: ["pass", "fail", "pass", "pass", "fail"], flag: "Synthetic identity pattern: SSN-equivalent issued after DOB+18y, velocity of 4 applications in 24h.", submittedAt: "2026-10-15T19:20:36.000Z", decisions: [{ outcome: "reject", reviewerId: "cmp.mfarah", reason: "Synthetic identity indicators; linked to 3 prior declined applications.", decidedAt: "2026-10-16T10:11:29.000Z" }] },
  { id: "app_01HZK459K5", vendor: "persona", ref: "inq_P2oI9uY4tR6eWq8", status: "pending_review", risk: ["low", 15], person: ["Mateo", "Silva", "1992-12-03", "mateo.silva@gmail.com", "+1 305 555 0115", "AR"], address: ["1200 Brickell Ave Apt 2210", "Miami", "FL", "33131", "US"], doc: ["passport", "AR", "9902", "2030-12-03"], results: ["pass", "pass", "pass", "needs_review", "needs_review"], flag: "Foreign national; US address unverified by bureau.", submittedAt: "2026-10-24T17:02:14.000Z" },
  { id: "app_01HZK46C1L", vendor: "alloy", ref: "ev_Q4w8ErT2yU6i", status: "pending_review", risk: ["medium", 52], person: ["Fatima", "Al-Sayed", "1986-08-27", "fatima.alsayed@yahoo.com", "+971 50 555 0186", "AE"], address: ["Marina Gate 2, Apt 1702", "Dubai", "Dubai", "00000", "AE"], doc: ["passport", "AE", "4477", "2029-04-12"], results: ["pass", "pass", "pass", "needs_review", "pass"], flag: "High-risk jurisdiction rule triggered for funding source country.", submittedAt: "2026-10-25T06:47:59.000Z" },
];

const CHECK_TYPES = ["document_authenticity", "selfie_match", "watchlist", "address", "database"] as const;
const PASS_DETAIL: Record<(typeof CHECK_TYPES)[number], string> = {
  document_authenticity: "Security features, MRZ and font checks passed.",
  selfie_match: "Face match 0.96 with liveness confirmed.",
  watchlist: "No hits across OFAC, UN, EU, HMT and PEP lists.",
  address: "Address matched to bureau and utility records.",
  database: "Name, DOB and national ID matched to authoritative sources.",
};

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

/** Analysts that open (undecided) reviews rotate through; every third one is unassigned. */
const ANALYSTS = ["cmp.mfarah", "cmp.adiaz", null] as const;

/**
 * 16 verifications across both vendors, all statuses and risk levels, in the platform's
 * generic shape. Each vendor mock seeds its own file from these.
 */
export function seedKycVerifications(): KycVerificationSeed[] {
  return ROWS.map((row, index) => {
    const [firstName, lastName, dateOfBirth, email, phone, nationality] = row.person;
    const [line1, city, region, postalCode, country] = row.address;
    const [type, issuingCountry, last4, expiresOn] = row.doc;
    const checks: KycCheck[] = CHECK_TYPES.map((checkType, i) => {
      const result = row.results[i] ?? "pass";
      return {
        type: checkType,
        result,
        detail: result === "pass" ? PASS_DETAIL[checkType] : (row.flag ?? "Flagged for manual review."),
        completedAt: addMinutes(row.submittedAt, i + 1),
      };
    });
    const decisions = row.decisions ?? [];
    return {
      applicantId: row.id,
      vendor: row.vendor,
      vendorReference: row.ref,
      status: row.status,
      riskLevel: row.risk[0],
      riskScore: row.risk[1],
      applicant: { firstName, lastName, dateOfBirth, email, phone, nationality, address: { line1, city, region, postalCode, country } },
      document: { type, issuingCountry, maskedNumber: `•••••${last4}`, expiresOn },
      checks,
      decisions,
      assignedTo: decisions.at(-1)?.reviewerId ?? ANALYSTS[index % ANALYSTS.length] ?? null,
      notes: row.flag ?? "",
      submittedAt: row.submittedAt,
      updatedAt: decisions.at(-1)?.decidedAt ?? addMinutes(row.submittedAt, CHECK_TYPES.length),
    };
  });
}
