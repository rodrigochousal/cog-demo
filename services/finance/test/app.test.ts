import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { configureConnectors, resetConnectors } from "@platform/backend-common";
import { refundTransactionRowSchema, type HealthResponse, type RefundTransactionsResponse } from "@platform/shared-types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

let server: Server;
let base: string;

beforeAll(async () => {
  configureConnectors({ mode: "memory", latency: false });
  server = createApp({ allowedOrigins: ["http://localhost:3000"] }).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  resetConnectors();
});

it("reports health as finance-service", async () => {
  const body = (await (await fetch(`${base}/health`)).json()) as HealthResponse;
  expect(body).toMatchObject({ service: "finance-service", status: "ok" });
});

it("returns the shared 404 envelope for unknown API routes", async () => {
  const res = await fetch(`${base}/api/does-not-exist`);
  expect(res.status).toBe(404);
  expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});

it("sets the caller identity on /api and guards the access probes", async () => {
  const as = (role: string) => ({ method: "POST", headers: { "x-authenticated-user-role": role } });
  expect((await fetch(`${base}/api/access/execute`, as("admin"))).status).toBe(200);
  expect((await fetch(`${base}/api/access/execute`, as("engineer"))).status).toBe(403);
  expect((await fetch(`${base}/api/access/execute`, { method: "POST" })).status).toBe(400);
});

it("serves client rows mapped from every processor, validated against the row contract", async () => {
  const res = await fetch(`${base}/api/refunds`, { headers: { "x-authenticated-user-role": "finance_analyst" } });
  expect(res.status).toBe(200);
  const { rows } = (await res.json()) as RefundTransactionsResponse;
  expect(rows).toHaveLength(18);
  for (const row of rows) {
    expect(refundTransactionRowSchema.parse(row)).toEqual(row);
    expect(Object.keys(row).sort()).toEqual(["amount", "approvalsReceived", "createdTimestamp", "currency", "customerId", "id", "status"]);
  }
  expect(rows.find((r) => r.id === "rf_c40d5e6f7a83")).toEqual({ id: "rf_c40d5e6f7a83", amount: 214.5, status: "PROCESSED", currency: "EUR", customerId: "cus_H8dK1sWq4e", createdTimestamp: "2026-10-04T16:45:12.000Z", approvalsReceived: ["fin.rpatel"] });
});

it("guards /api/refunds with the read permission", async () => {
  const res = await fetch(`${base}/api/refunds`, { headers: { "x-authenticated-user-role": "engineer" } });
  expect(res.status).toBe(403);
});

describe("POST /api/refunds/:refundId/decisions", () => {
  const decide = (id: string, role: string, body: unknown) =>
    fetch(`${base}/api/refunds/${id}/decisions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-authenticated-user-role": role },
      body: JSON.stringify(body),
    });

  it("releases a pending refund only after two distinct approvers (dual control)", async () => {
    const first = await decide("rf_8f2c41a9d0b1", "finance_analyst", { decision: "approve" });
    expect(first.status).toBe(200);
    expect(refundTransactionRowSchema.parse(await first.json())).toMatchObject({ status: "PENDING_APPROVAL", approvalsReceived: ["mock-finance_analyst"] });

    const repeat = await decide("rf_8f2c41a9d0b1", "finance_analyst", { decision: "approve" });
    expect(repeat.status).toBe(422);
    expect(await repeat.json()).toMatchObject({ error: { code: "BUSINESS_RULE_VIOLATION" } });

    const second = await decide("rf_8f2c41a9d0b1", "admin", { decision: "approve" });
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ status: "PROCESSED", approvalsReceived: ["mock-finance_analyst", "mock-admin"] });

    expect((await decide("rf_8f2c41a9d0b1", "admin", { decision: "reject", reason: "late" })).status).toBe(422);
  });

  it("rejects a pending refund with a reason", async () => {
    const res = await decide("rf_5e6f7a8b9c05", "finance_analyst", { decision: "reject", reason: "Duplicate request" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "rf_5e6f7a8b9c05", status: "FAILED" });
  });

  it("validates the body and requires a reason to reject", async () => {
    const missingReason = await decide("rf_8d9e0f1a2b7c", "finance_analyst", { decision: "reject" });
    expect(missingReason.status).toBe(400);
    expect(await missingReason.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    expect((await decide("rf_8d9e0f1a2b7c", "finance_analyst", { decision: "maybe" })).status).toBe(400);
  });

  it("guards decisions with the execute permission and 404s unknown refunds", async () => {
    expect((await decide("rf_8d9e0f1a2b7c", "engineer", { decision: "approve" })).status).toBe(403);
    expect((await decide("rf_does_not_exist", "finance_analyst", { decision: "approve" })).status).toBe(404);
  });
});
