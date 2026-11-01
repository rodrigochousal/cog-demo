import type { IKycVendorClient, KycManualDecisionInput, KycVerification } from "@platform/backend-common";
import type { ApiErrorBody, KycReviewQueueResponse, KycReviewRow } from "@platform/shared-types";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createApp } from "../src/app.js";

type KycSpies = { [K in keyof IKycVendorClient]: Mock<IKycVendorClient[K]> };

/**
 * Stands in for the disk-backed KYC driver behind the backend-common hub, so the app under test
 * resolves `getKycVendorClient()` to spies and never touches the file system.
 */
const kycDriver = vi.hoisted(
  (): KycSpies => ({
    listVerifications: vi.fn(),
    getVerification: vi.fn(),
    submitManualDecision: vi.fn(),
  }),
);

vi.mock("@platform/backend-common", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/backend-common")>();
  return { ...actual, getKycVendorClient: (): IKycVendorClient => kycDriver };
});

const ROLE_HEADER = "x-authenticated-user-role";
const APPLICANT_ID = "app_1001";
const DECISIONS_PATH = `/api/kyc/verifications/${APPLICANT_ID}/decisions`;

const pendingPayload: KycVerification = {
  applicantId: APPLICANT_ID,
  vendor: "persona",
  vendorReference: "inq_test_1001",
  documentUrl: "https://app.withpersona.com/dashboard/inquiries/inq_test_1001",
  status: "pending_review",
  riskLevel: "medium",
  riskScore: 42,
  applicant: {
    firstName: "Ada",
    lastName: "Lovelace",
    dateOfBirth: "1990-12-10",
    email: "ada@example.com",
    phone: "+44 20 7946 0000",
    nationality: "GB",
    address: { line1: "1 Analytical Way", city: "London", region: "LDN", postalCode: "N1 9GU", country: "GB" },
  },
  document: { type: "passport", issuingCountry: "GB", maskedNumber: "•••••4821", expiresOn: "2031-01-01" },
  checks: [{ type: "watchlist", result: "needs_review", detail: "Partial name match", completedAt: "2026-10-30T10:00:00.000Z" }],
  decisions: [],
  assignedTo: null,
  notes: "",
  submittedAt: "2026-10-30T09:00:00.000Z",
  updatedAt: "2026-10-30T10:00:00.000Z",
};

const approvedPayload = (decision: KycManualDecisionInput): KycVerification => ({
  ...pendingPayload,
  status: "approved",
  decisions: [{ ...decision, decidedAt: "2026-11-01T12:00:00.000Z" }],
  updatedAt: "2026-11-01T12:00:00.000Z",
});

/** What the BFF sends for `pendingPayload`: the client row, not the backend record. */
const pendingRow: KycReviewRow = {
  id: APPLICANT_ID,
  status: "PENDING",
  applicantName: "Ada Lovelace",
  documentUrl: "https://app.withpersona.com/dashboard/inquiries/inq_test_1001",
  riskScore: 42,
  assignedTo: "Unassigned",
  notes: "",
};

const app = createApp({ allowedOrigins: ["http://localhost:3000"], logger: { debug() {}, info() {}, warn() {}, error() {} } });

const expectDriverUntouched = () => {
  expect(kycDriver.listVerifications).not.toHaveBeenCalled();
  expect(kycDriver.getVerification).not.toHaveBeenCalled();
  expect(kycDriver.submitManualDecision).not.toHaveBeenCalled();
};

const errorOf = (body: unknown): ApiErrorBody["error"] => (body as ApiErrorBody).error;

beforeEach(() => {
  kycDriver.listVerifications.mockResolvedValue([pendingPayload]);
  kycDriver.getVerification.mockResolvedValue(pendingPayload);
  kycDriver.submitManualDecision.mockImplementation(async (_id, decision) => approvedPayload(decision));
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("RBAC route guard", () => {
  it("rejects a read without the role header with 403 (it falls back to finance_analyst)", async () => {
    const res = await request(app).get("/api/kyc/verifications");

    expect(res.status).toBe(403);
    expect(errorOf(res.body).code).toBe("FORBIDDEN");
    expectDriverUntouched();
  });

  it.each(["finance_analyst", "engineer"])("rejects role %s with 403 on reads and mutations", async (role) => {
    const read = await request(app).get("/api/kyc/verifications").set(ROLE_HEADER, role);
    const mutate = await request(app)
      .post(DECISIONS_PATH)
      .set(ROLE_HEADER, role)
      .send({ outcome: "approve", reason: "Documents verified" });

    expect(read.status).toBe(403);
    expect(mutate.status).toBe(403);
    expect(errorOf(read.body)).toEqual({
      code: "FORBIDDEN",
      message: "User role does not possess required permissions for this action.",
    });
    expect(errorOf(mutate.body).code).toBe("FORBIDDEN");
    expectDriverUntouched();
  });

  it("rejects a mutation without the role header before it reaches the guard (400, CSRF protection)", async () => {
    const res = await request(app).post(DECISIONS_PATH).send({ outcome: "approve", reason: "Documents verified" });

    expect(res.status).toBe(400);
    expect(errorOf(res.body).code).toBe("BAD_REQUEST");
    expectDriverUntouched();
  });

  it.each(["compliance_analyst", "admin"])("lets role %s read the review queue", async (role) => {
    const res = await request(app).get("/api/kyc/verifications").set(ROLE_HEADER, role);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rows: [pendingRow] } satisfies KycReviewQueueResponse);
    expect(kycDriver.listVerifications).toHaveBeenCalledOnce();
  });
});

describe("Zod validation on POST /api/kyc/verifications/:applicantId/decisions", () => {
  const send = (body: unknown) =>
    request(app).post(DECISIONS_PATH).set(ROLE_HEADER, "compliance_analyst").send(body as object);

  it.each<[string, unknown, string]>([
    ["missing outcome", { reason: "Documents verified" }, "outcome"],
    ["unknown outcome", { outcome: "maybe", reason: "Documents verified" }, "outcome"],
    ["wrong type for reason", { outcome: "approve", reason: 42 }, "reason"],
    ["blank reason", { outcome: "approve", reason: "   " }, "reason"],
    ["client-supplied reviewerId", { outcome: "approve", reason: "Documents verified", reviewerId: "someone-else" }, ""],
    ["array instead of object", [{ outcome: "approve", reason: "Documents verified" }], ""],
  ])("short-circuits with 400 on %s", async (_case, body, path) => {
    const res = await send(body);

    expect(res.status).toBe(400);
    const error = errorOf(res.body);
    expect(error.code).toBe("VALIDATION_FAILED");
    const issues = error.details as { path: (string | number)[] }[];
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.map((issue) => issue.path.join("."))).toContain(path);
    expectDriverUntouched();
  });

  it("short-circuits with 400 when the body is missing entirely", async () => {
    const res = await request(app).post(DECISIONS_PATH).set(ROLE_HEADER, "compliance_analyst");

    expect(res.status).toBe(400);
    expect(errorOf(res.body).code).toBe("VALIDATION_FAILED");
    expectDriverUntouched();
  });

  it("rejects malformed JSON with 400 before validation runs", async () => {
    const res = await request(app)
      .post(DECISIONS_PATH)
      .set(ROLE_HEADER, "compliance_analyst")
      .set("content-type", "application/json")
      .send('{"outcome": "approve",');

    expect(res.status).toBe(400);
    expectDriverUntouched();
  });

  it("forwards a valid decision to the KYC driver with the caller as reviewer", async () => {
    const res = await send({ outcome: "approve", reason: "  Documents verified  " });

    expect(res.status).toBe(200);
    expect(kycDriver.submitManualDecision).toHaveBeenCalledExactlyOnceWith(APPLICANT_ID, {
      outcome: "approve",
      reason: "Documents verified",
      reviewerId: "mock-compliance_analyst",
    });
    expect(res.body).toEqual({ ...pendingRow, status: "APPROVED" } satisfies KycReviewRow);
  });
});
