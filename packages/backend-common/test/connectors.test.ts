import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CreateRefundInput, CustomerTier } from "@platform/shared-types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DiskFeatureFlagProvider } from "../src/connectors/feature-flags/disk-feature-flag-provider.js";
import { DiskKycVendorClient } from "../src/connectors/kyc/disk-kyc-vendor-client.js";
import { DiskLedgerDatabase } from "../src/connectors/ledger/disk-ledger-database.js";
import {
  ConnectorError,
  configureConnectors,
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

const file = (name: string) => path.join(dir, "nested", name);
const ledger = () => new DiskLedgerDatabase({ filePath: file("ledger.json"), latency: false });
const kyc = () => new DiskKycVendorClient({ filePath: file("kyc-vendor.json"), latency: false });
const flags = () => new DiskFeatureFlagProvider({ filePath: file("feature-flags.json"), latency: false });

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
  notes: "",
  ...overrides,
});

describe("seeding", () => {
  it.each([
    ["ledger.json", () => ledger().findAll()],
    ["kyc-vendor.json", () => kyc().listVerificationPayloads()],
    ["feature-flags.json", () => flags().getFlags()],
  ])("creates the directory and seeds %s with >= 15 valid records", async (name, readAll) => {
    const records = await readAll();
    expect(records.length).toBeGreaterThanOrEqual(15);
    const onDisk = JSON.parse(readFileSync(file(name), "utf8")) as { schemaVersion: number; records: unknown[] };
    expect(onDisk.schemaVersion).toBe(1);
    expect(onDisk.records).toHaveLength(records.length);
  });

  it("does not reseed an existing file and reseeds after deletion", async () => {
    const db = ledger();
    await db.createRecord(newRefund());
    expect(await ledger().findAll()).toHaveLength(19);
    rmSync(file("ledger.json"));
    expect(await db.findAll()).toHaveLength(18);
  });

  it("uses unique ids in every seed", async () => {
    const ids = (await ledger().findAll()).map((r) => r.id);
    const applicants = (await kyc().listVerificationPayloads()).map((p) => p.applicantId);
    const keys = (await flags().getFlags()).map((f) => f.key);
    for (const list of [ids, applicants, keys]) expect(new Set(list).size).toBe(list.length);
  });
});

describe("DiskLedgerDatabase", () => {
  it("creates, finds and updates records, persisting across instances", async () => {
    const created = await ledger().createRecord(newRefund());
    expect(created.id).toMatch(/^rf_[0-9a-f]{12}$/);
    expect(await ledger().findById(created.id)).toEqual(created);

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

  it("serialises concurrent writes without losing any", async () => {
    const db = ledger();
    await Promise.all(Array.from({ length: 10 }, (_, i) => db.createRecord(newRefund({ notes: `n${i}` }))));
    expect(await new DiskLedgerDatabase({ filePath: file("ledger.json"), latency: false }).findAll()).toHaveLength(28);
  });

  it("raises a ConnectorError for a corrupt data file", async () => {
    await ledger().findAll();
    writeFileSync(file("ledger.json"), "{ not json");
    await expect(ledger().findAll()).rejects.toBeInstanceOf(ConnectorError);
    writeFileSync(file("ledger.json"), JSON.stringify({ schemaVersion: 1, records: [{ id: "rf_1" }] }));
    await expect(ledger().findAll()).rejects.toThrow(/record 0 .* is invalid/);
  });
});

describe("DiskKycVendorClient", () => {
  it("lists the queue oldest-first and fetches payloads", async () => {
    const queue = await kyc().listVerificationPayloads();
    const times = queue.map((p) => p.submittedAt);
    expect(times).toEqual([...times].sort());
    const first = queue[0];
    if (!first) throw new Error("seed is empty");
    expect(await kyc().getVerificationPayload(first.applicantId)).toEqual(first);
    await expectDomainError(kyc().getVerificationPayload("app_missing"), "NOT_FOUND", /KYC applicant 'app_missing'/);
  });

  it("records decisions, updates status and rejects decisions on finalised applicants", async () => {
    const pending = (await kyc().listVerificationPayloads()).find((p) => p.status === "pending_review");
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
    const [first] = await kyc().listVerificationPayloads();
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
    expect((await flags().toggleFlag(flag.key, !flag.enabled)).enabled).toBe(!flag.enabled);
    const targeted = await flags().updateTargeting(flag.key, ["enterprise", "free", "enterprise"]);
    expect(targeted.targetTiers).toEqual(["free", "enterprise"]);
    expect((await flags().getFlags()).find((f) => f.key === flag.key)?.targetTiers).toEqual(["free", "enterprise"]);
  });

  it("rejects unknown keys and tiers", async () => {
    await expectDomainError(flags().toggleFlag("nope", true), "NOT_FOUND", /Feature flag 'nope'/);
    const [flag] = await flags().getFlags();
    if (!flag) throw new Error("seed is empty");
    const bogus = ["platinum"] as unknown as CustomerTier[];
    await expectDomainError(flags().updateTargeting(flag.key, bogus), "BUSINESS_RULE_VIOLATION", /Unknown customer tier/);
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
    for (const name of ["ledger.json", "kyc-vendor.json", "feature-flags.json"]) {
      expect(readFileSync(path.join(dir, name), "utf8")).toContain('"schemaVersion": 1');
    }
    expect(await getKycVendorClient().listVerificationPayloads()).toHaveLength(16);
    expect(await getFeatureFlagProvider().getFlags()).toHaveLength(18);
  });

  it("refuses to reconfigure after a connector was resolved", () => {
    configureConnectors({ dataDir: dir, latency: false });
    getLedgerDatabase();
    expect(() => configureConnectors({ dataDir: "/elsewhere" })).toThrow(/before any connector is resolved/);
  });

  it("reads settings from the environment", () => {
    process.env.PLATFORM_CONNECTOR_DATA_DIR = dir;
    process.env.PLATFORM_SIMULATED_LATENCY_MS = "off";
    try {
      expect(resolveConnectorSettings()).toEqual({ dataDir: dir, latency: false });
    } finally {
      delete process.env.PLATFORM_CONNECTOR_DATA_DIR;
      delete process.env.PLATFORM_SIMULATED_LATENCY_MS;
    }
  });

  it("defaults to packages/backend-common/data", () => {
    expect(resolveConnectorSettings().dataDir).toBe(path.resolve(import.meta.dirname, "../data"));
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
