import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DiskFeatureFlagProvider } from "../src/connectors/feature-flags/disk-feature-flag-provider.js";
import { DiskKycVendorClient } from "../src/connectors/kyc/disk-kyc-vendor-client.js";
import { DiskLedgerDatabase } from "../src/connectors/ledger/disk-ledger-database.js";
import {
  ConnectorError,
  configureConnectors,
  type CreateRefundInput,
  type CustomerTier,
  type UpdateRefundInput,
  DomainError,
  getFeatureFlagProvider,
  getKycVendorClient,
  getLedgerDatabase,
  initializeConnectors,
  parseLatencySetting,
  resetConnectors,
  resolveConnectorSettings,
  withSimulatedLatency,
} from "../src/index.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "connectors-"));
});
afterEach(() => {
  resetConnectors();
  rmSync(dir, { recursive: true, force: true });
});

const dataDir = () => path.join(dir, "nested");
const file = (name: string) => path.join(dataDir(), name);
const ledger = () => new DiskLedgerDatabase({ dataDir: dataDir(), latency: false });
const kyc = () => new DiskKycVendorClient({ dataDir: dataDir(), latency: false });
const flags = () => new DiskFeatureFlagProvider({ dataDir: dataDir(), latency: false });
const VENDOR_FILES = [
  "stripe-refunds.json",
  "paypal-refunds.json",
  "persona-inquiries.json",
  "alloy-evaluations.json",
  "launchdarkly-flags.json",
  "unleash-features.json",
];
const recordsIn = (name: string) => (JSON.parse(readFileSync(file(name), "utf8")) as { schemaVersion: number; records: unknown[] }).records;

async function expectDomainError(promise: Promise<unknown>, code: DomainError["code"], message: RegExp) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DomainError);
  expect((err as DomainError).code).toBe(code);
  expect((err as DomainError).message).toMatch(message);
}

const newRefund = (overrides: Partial<CreateRefundInput> = {}): CreateRefundInput => ({
  processor: "stripe",
  transactionId: "txn_test",
  customerId: "cus_test",
  customerName: "Test Customer",
  customerEmail: "test@example.com",
  merchantName: "Test Merchant",
  merchantCategoryCode: "5411",
  amount: { amountMinor: 1_000, currency: "USD" },
  originalAmount: { amountMinor: 2_000, currency: "USD" },
  reason: "customer_request",
  status: "pending_review",
  paymentRail: "card",
  destinationLast4: "4242",
  riskScore: 10,
  requestedBy: "ops.test",
  reviewedBy: null,
  approvals: [],
  notes: "",
  ...overrides,
});

describe("seeding", () => {
  it.each([
    [["stripe-refunds.json", "paypal-refunds.json"], () => ledger().findAll()],
    [["persona-inquiries.json", "alloy-evaluations.json"], () => kyc().listVerifications()],
    [["launchdarkly-flags.json", "unleash-features.json"], () => flags().getFlags()],
  ])("creates the directory and seeds one file per vendor (%j) with >= 15 records in total", async (names, readAll) => {
    const records = await readAll();
    expect(records.length).toBeGreaterThanOrEqual(15);
    const perVendor = names.map((name) => recordsIn(name).length);
    for (const count of perVendor) expect(count).toBeGreaterThan(0);
    expect(perVendor.reduce((a, b) => a + b, 0)).toBe(records.length);
  });

  it("does not reseed an existing file and reseeds after deletion", async () => {
    const db = ledger();
    await db.createRecord(newRefund());
    expect(await ledger().findAll()).toHaveLength(19);
    rmSync(file("stripe-refunds.json"));
    expect(await db.findAll()).toHaveLength(18);
  });

  it("uses unique ids in every seed", async () => {
    const ids = (await ledger().findAll()).map((r) => r.id);
    const applicants = (await kyc().listVerifications()).map((p) => p.applicantId);
    const keys = (await flags().getFlags()).map((f) => f.key);
    for (const list of [ids, applicants, keys]) expect(new Set(list).size).toBe(list.length);
  });
});

describe("DiskLedgerDatabase", () => {
  it("creates, finds and updates records, persisting across instances", async () => {
    const created = await ledger().createRecord(newRefund());
    expect(created.id).toMatch(/^rf_[0-9a-f]{12}$/);
    expect(await ledger().findById(created.id)).toEqual(created);
    expect(created).toMatchObject({ processor: "stripe", processorReference: expect.stringMatching(/^re_/) });
    expect(recordsIn("stripe-refunds.json")).toContainEqual(expect.objectContaining({ metadata: expect.objectContaining({ platform_refund_id: created.id }) }));

    const updated = await ledger().updateRecord(created.id, { status: "approved", reviewedBy: "fin.test" });
    expect(updated).toMatchObject({ id: created.id, status: "approved", reviewedBy: "fin.test", createdAt: created.createdAt });
    expect((await ledger().findById(created.id)).status).toBe("approved");
  });

  it("returns copies that cannot mutate storage", async () => {
    const db = ledger();
    const [first] = await db.findAll();
    if (!first) throw new Error("seed is empty");
    first.status = "failed";
    expect((await db.findById(first.id)).status).not.toBe("failed");
  });

  it("throws descriptive errors for missing and blank ids", async () => {
    await expectDomainError(ledger().findById("rf_missing"), "NOT_FOUND", /Refund 'rf_missing' was not found/);
    await expectDomainError(ledger().updateRecord("rf_missing", { notes: "x" }), "NOT_FOUND", /rf_missing/);
    await expectDomainError(ledger().findById("  "), "BUSINESS_RULE_VIOLATION", /Refund id is required/);
  });

  it("enforces ledger constraints and leaves storage untouched on failure", async () => {
    const db = ledger();
    await expectDomainError(
      db.createRecord(newRefund({ amount: { amountMinor: 5_000, currency: "USD" } })),
      "BUSINESS_RULE_VIOLATION",
      /exceeds the original charge/,
    );
    await expectDomainError(
      db.createRecord(newRefund({ amount: { amountMinor: 500, currency: "EUR" } })),
      "BUSINESS_RULE_VIOLATION",
      /does not match/,
    );
    await expectDomainError(db.createRecord(newRefund({ riskScore: 140 })), "BUSINESS_RULE_VIOLATION", /riskScore/);
    expect(await db.findAll()).toHaveLength(18);
  });

  it("ignores attempts to overwrite id/createdAt and drops unknown fields", async () => {
    const [first] = await ledger().findAll();
    if (!first) throw new Error("seed is empty");
    const sneaky = { notes: "changed", id: "rf_hijack", createdAt: "2000-01-01T00:00:00.000Z", extra: true };
    const updated = await ledger().updateRecord(first.id, sneaky);
    expect(updated).toMatchObject({ id: first.id, createdAt: first.createdAt, notes: "changed" });
    expect(updated).not.toHaveProperty("extra");
  });

  it("routes new refunds to their processor and keeps the processor immutable", async () => {
    const db = ledger();
    const created = await db.createRecord(newRefund({ processor: "paypal", amount: { amountMinor: 1_250, currency: "EUR" }, originalAmount: { amountMinor: 2_000, currency: "EUR" } }));
    expect(created.processorReference).toMatch(/^[A-Z0-9]{17}$/);
    expect(recordsIn("paypal-refunds.json")).toContainEqual(expect.objectContaining({ invoice_id: created.id, amount: { currency_code: "EUR", value: "12.50" } }));
    const moved = { processor: "stripe", approvals: ["fin.a", "fin.b"] } as UpdateRefundInput;
    expect(await db.updateRecord(created.id, moved)).toMatchObject({ processor: "paypal", approvals: ["fin.a", "fin.b"] });
    await expectDomainError(db.updateRecord(created.id, { approvals: ["fin.a", "fin.a"] }), "BUSINESS_RULE_VIOLATION", /distinct/);
    await expectDomainError(db.createRecord(newRefund({ processor: "square" as "stripe" })), "BUSINESS_RULE_VIOLATION", /processor must be one of/);
  });

  it("serialises concurrent writes without losing any", async () => {
    const db = ledger();
    await Promise.all(Array.from({ length: 10 }, (_, i) => db.createRecord(newRefund({ notes: `n${i}` }))));
    expect(await new DiskLedgerDatabase({ dataDir: dataDir(), latency: false }).findAll()).toHaveLength(28);
  });

  it("raises a ConnectorError for a corrupt data file", async () => {
    await ledger().findAll();
    writeFileSync(file("stripe-refunds.json"), "{ not json");
    await expect(ledger().findAll()).rejects.toBeInstanceOf(ConnectorError);
    writeFileSync(file("stripe-refunds.json"), JSON.stringify({ schemaVersion: 1, records: [{ id: "re_1" }] }));
    await expect(ledger().findAll()).rejects.toThrow(/record 0 .* is invalid/);
  });

  it("raises a ConnectorError when a valid vendor record cannot be mapped to the domain", async () => {
    await ledger().findAll();
    const [pending] = recordsIn("stripe-refunds.json").filter((r) => (r as { status: string }).status === "pending") as {
      metadata: Record<string, string>;
    }[];
    if (!pending) throw new Error("no pending Stripe refund in seed");
    delete pending.metadata.review_status;
    writeFileSync(file("stripe-refunds.json"), JSON.stringify({ schemaVersion: 1, records: [pending] }));
    await expect(ledger().findAll()).rejects.toThrow(/could not map a stripe record/);
  });
});

describe("DiskKycVendorClient", () => {
  it("lists the queue oldest-first and fetches payloads", async () => {
    const queue = await kyc().listVerifications();
    const times = queue.map((p) => p.submittedAt);
    expect(times).toEqual([...times].sort());
    const first = queue[0];
    if (!first) throw new Error("seed is empty");
    expect(await kyc().getVerification(first.applicantId)).toEqual(first);
    await expectDomainError(kyc().getVerification("app_missing"), "NOT_FOUND", /KYC applicant 'app_missing'/);
  });

  it("records decisions, updates status and rejects decisions on finalised applicants", async () => {
    const pending = (await kyc().listVerifications()).find((p) => p.status === "pending_review");
    if (!pending) throw new Error("no pending applicant in seed");
    const escalated = await kyc().submitManualDecision(pending.applicantId, {
      outcome: "escalate",
      reviewerId: "cmp.test",
      reason: "Need more docs",
    });
    expect(escalated.status).toBe("escalated");
    const approved = await kyc().submitManualDecision(pending.applicantId, {
      outcome: "approve",
      reviewerId: "cmp.test",
      reason: "Docs received",
    });
    expect(approved.status).toBe("approved");
    expect(approved.decisions.slice(-2).map((d) => d.outcome)).toEqual(["escalate", "approve"]);
    await expectDomainError(
      kyc().submitManualDecision(pending.applicantId, { outcome: "reject", reviewerId: "cmp.test", reason: "late" }),
      "CONFLICT",
      /already approved/,
    );
  });

  it("validates decisions", async () => {
    const [first] = await kyc().listVerifications();
    if (!first) throw new Error("seed is empty");
    await expectDomainError(
      kyc().submitManualDecision(first.applicantId, { outcome: "approve", reviewerId: "cmp.test", reason: "   " }),
      "BUSINESS_RULE_VIOLATION",
      /reason is required/,
    );
  });
});

describe("DiskFeatureFlagProvider", () => {
  it("toggles flags and normalises targeting tiers", async () => {
    const [flag] = await flags().getFlags();
    if (!flag) throw new Error("seed is empty");
    expect(await flags().toggleFlag(flag.key, !flag.enabled, "eng.test")).toMatchObject({ enabled: !flag.enabled, updatedBy: "eng.test" });
    const targeted = await flags().updateTargeting(flag.key, ["enterprise", "free", "enterprise"], " eng.other ");
    expect(targeted).toMatchObject({ targetTiers: ["free", "enterprise"], updatedBy: "eng.other", provider: flag.provider });
    expect((await flags().getFlags()).find((f) => f.key === flag.key)?.targetTiers).toEqual(["free", "enterprise"]);
  });

  it("rejects unknown keys and tiers", async () => {
    await expectDomainError(flags().toggleFlag("nope", true, "eng.test"), "NOT_FOUND", /Feature flag 'nope'/);
    const [flag] = await flags().getFlags();
    if (!flag) throw new Error("seed is empty");
    const bogus = ["platinum"] as unknown as CustomerTier[];
    await expectDomainError(flags().updateTargeting(flag.key, bogus, "eng.test"), "BUSINESS_RULE_VIOLATION", /Unknown customer tier/);
    await expectDomainError(flags().toggleFlag(flag.key, true, "  "), "BUSINESS_RULE_VIOLATION", /actor is required/);
  });
});

describe("latency", () => {
  it("parses settings", () => {
    expect(parseLatencySetting(undefined)).toEqual({ minMs: 50, maxMs: 150 });
    expect(parseLatencySetting("10-20")).toEqual({ minMs: 10, maxMs: 20 });
    expect(parseLatencySetting("80")).toEqual({ minMs: 80, maxMs: 80 });
    expect(parseLatencySetting("off")).toBe(false);
    expect(() => parseLatencySetting("20-10")).toThrow(/PLATFORM_SIMULATED_LATENCY_MS/);
    expect(() => parseLatencySetting("fast")).toThrow();
  });

  it("delays the wrapped operation within the range", async () => {
    const start = performance.now();
    expect(await withSimulatedLatency(async () => "ok", { minMs: 40, maxMs: 60 })).toBe("ok");
    expect(performance.now() - start).toBeGreaterThanOrEqual(38);
  });
});

describe("connector hub", () => {
  it("returns singletons backed by the configured data dir and seeds on initialize", async () => {
    configureConnectors({ dataDir: dir, latency: false });
    expect(getLedgerDatabase()).toBe(getLedgerDatabase());
    await initializeConnectors(["ledger", "kyc", "featureFlags"]);
    for (const name of VENDOR_FILES) {
      expect(readFileSync(path.join(dir, name), "utf8")).toContain('"schemaVersion": 1');
    }
    expect(await getKycVendorClient().listVerifications()).toHaveLength(16);
    expect(await getFeatureFlagProvider().getFlags()).toHaveLength(18);
  });

  it("refuses to reconfigure after a connector was resolved", () => {
    configureConnectors({ dataDir: dir, latency: false });
    getLedgerDatabase();
    expect(() => configureConnectors({ dataDir: "/elsewhere" })).toThrow(/before any connector is resolved/);
  });

  it("reads settings from the environment", () => {
    process.env.PLATFORM_DATA_DIR = dir;
    process.env.PLATFORM_STORAGE = "memory";
    process.env.PLATFORM_SIMULATED_LATENCY_MS = "off";
    try {
      expect(resolveConnectorSettings()).toEqual({ dataDir: dir, mode: "memory", latency: false });
    } finally {
      delete process.env.PLATFORM_DATA_DIR;
      delete process.env.PLATFORM_STORAGE;
      delete process.env.PLATFORM_SIMULATED_LATENCY_MS;
    }
  });

  it("defaults to file storage in packages/backend-common/data", () => {
    expect(resolveConnectorSettings()).toMatchObject({ dataDir: path.resolve(import.meta.dirname, "../data"), mode: "file" });
  });

  it("serves every connector from memory without touching disk", async () => {
    configureConnectors({ dataDir: dir, mode: "memory", latency: false });
    await initializeConnectors(["ledger", "kyc", "featureFlags"]);
    const created = await getLedgerDatabase().createRecord(newRefund());
    expect(await getLedgerDatabase().findById(created.id)).toEqual(created);
    expect(await getLedgerDatabase().findAll()).toHaveLength(19);
    await getFeatureFlagProvider().toggleFlag((await getFeatureFlagProvider().getFlags())[0]!.key, false, "eng.test");
    expect(await getKycVendorClient().listVerifications()).toHaveLength(16);
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("cross-instance locking", () => {
  it("serialises writes from independent instances sharing a file", async () => {
    const a = ledger();
    const b = ledger();
    await a.findAll();
    await Promise.all(
      Array.from({ length: 6 }, (_, i) => (i % 2 === 0 ? a : b).createRecord(newRefund({ notes: `x${i}` }))),
    );
    expect(await ledger().findAll()).toHaveLength(24);
  });
});
