import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { configureConnectors, resetConnectors } from "@platform/backend-common";
import { refundTransactionRowSchema, type HealthResponse, type RefundTransactionsResponse } from "@platform/shared-types";
import { afterAll, beforeAll, expect, it } from "vitest";
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
