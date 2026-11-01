import {
  featureFlagRowSchema,
  kycReviewRowSchema,
  refundTransactionRowSchema,
} from "@platform/shared-types";
import { describe, expect, it } from "vitest";
import type { z } from "zod";

const validKyc: z.input<typeof kycReviewRowSchema> = {
  id: "3f8a8c9e-6b1d-4d55-9f43-2b9c1e0e7a11",
  status: "PENDING",
  applicantName: "Ada Lovelace",
  documentUrl: "https://vendor.example.com/docs/abc",
  riskScore: 42.5,
  assignedTo: "analyst_7",
  notes: "Looks fine",
};

const validRefund: z.input<typeof refundTransactionRowSchema> = {
  id: "rf_0001",
  amount: 125.5,
  status: "PENDING_APPROVAL",
  currency: "USD",
  customerId: "cus_42",
  createdTimestamp: "2026-11-01T12:00:00.000Z",
  approvalsReceived: ["manager_1"],
};

const validFlag: z.input<typeof featureFlagRowSchema> = {
  id: "ff_1",
  key: "instant_payouts",
  description: "Pays out instantly",
  enabled: true,
  targetedTiers: ["enterprise", "growth"],
  updatedBy: "eng_3",
  updatedAt: "2026-11-01T12:00:00+02:00",
};

const issuesOf = (schema: z.ZodType, input: unknown) => {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("expected a validation failure");
  return result.error.issues.map((i) => ({ path: i.path, code: i.code }));
};

describe("kycReviewRowSchema", () => {
  it("accepts a valid record and trims text", () => {
    expect(kycReviewRowSchema.parse({ ...validKyc, applicantName: "  Ada Lovelace  ", assignedTo: " analyst_7\n" })).toEqual(
      validKyc,
    );
  });

  it("defaults missing notes to an empty string and strips unknown keys", () => {
    const { notes: _notes, ...withoutNotes } = validKyc;
    expect(kycReviewRowSchema.parse({ ...withoutNotes, isAdmin: true })).toEqual({ ...withoutNotes, notes: "" });
  });

  it.each([
    ["status", "APPROVED_ISH"],
    ["riskScore", 101],
    ["riskScore", -1],
    ["riskScore", Number.NaN],
    ["riskScore", "42"],
    ["documentUrl", "not a url"],
    ["documentUrl", "javascript:alert(1)"],
    ["documentUrl", "ftp://vendor.example.com/doc"],
    ["applicantName", "   "],
    ["assignedTo", ""],
    ["id", "../etc/passwd"],
    ["id", "  "],
  ])("rejects %s = %j", (field, value) => {
    expect(issuesOf(kycReviewRowSchema, { ...validKyc, [field]: value }).map((i) => i.path)).toEqual([[field]]);
  });

  it("reports every missing required field", () => {
    expect(issuesOf(kycReviewRowSchema, {}).map((i) => i.path.join("."))).toEqual([
      "id",
      "status",
      "applicantName",
      "documentUrl",
      "riskScore",
      "assignedTo",
    ]);
  });
});

describe("refundTransactionRowSchema", () => {
  it("accepts a valid refund and normalises the currency", () => {
    expect(refundTransactionRowSchema.parse({ ...validRefund, currency: " usd " })).toEqual(validRefund);
  });

  it("defaults approvalsReceived to []", () => {
    const { approvalsReceived: _a, ...rest } = validRefund;
    expect(refundTransactionRowSchema.parse(rest).approvalsReceived).toEqual([]);
  });

  it.each([
    ["amount", 0],
    ["amount", -5],
    ["amount", Number.POSITIVE_INFINITY],
    ["currency", "US"],
    ["currency", "USDT"],
    ["currency", "U5D"],
    ["status", "processed"],
    ["createdTimestamp", "2026-11-01"],
    ["createdTimestamp", "yesterday"],
    ["createdTimestamp", "2026-02-30T00:00:00Z"],
  ])("rejects %s = %j", (field, value) => {
    expect(issuesOf(refundTransactionRowSchema, { ...validRefund, [field]: value }).map((i) => i.path)).toEqual([[field]]);
  });

  it("flags blank and duplicate approvers at their index", () => {
    expect(issuesOf(refundTransactionRowSchema, { ...validRefund, approvalsReceived: ["a", " ", "a"] })).toEqual([
      { path: ["approvalsReceived", 1], code: "too_small" },
    ]);
    expect(issuesOf(refundTransactionRowSchema, { ...validRefund, approvalsReceived: ["a", "b", " a "] })).toEqual([
      { path: ["approvalsReceived", 2], code: "custom" },
    ]);
  });
});

describe("featureFlagRowSchema", () => {
  it("accepts a valid flag", () => {
    expect(featureFlagRowSchema.parse(validFlag)).toEqual(validFlag);
  });

  it.each(["InstantPayouts", "instant-payouts", "instant__payouts", "_instant", "instant_", "1st_flag", ""])(
    "rejects key %j",
    (key) => {
      expect(issuesOf(featureFlagRowSchema, { ...validFlag, key }).map((i) => i.path)).toEqual([["key"]]);
    },
  );

  it.each([
    ["enabled", "true"],
    ["targetedTiers", "enterprise"],
    ["targetedTiers", ["growth", "growth"]],
    ["updatedAt", "not-a-date"],
    ["description", " "],
  ])("rejects %s = %j", (field, value) => {
    expect(issuesOf(featureFlagRowSchema, { ...validFlag, [field]: value }).map((i) => i.path[0])).toEqual([field]);
  });
});
