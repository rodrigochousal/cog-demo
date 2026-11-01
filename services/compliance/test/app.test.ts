import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { configureConnectors, resetConnectors } from "@platform/backend-common";
import { kycReviewRowSchema, type HealthResponse, type KycReviewQueueResponse } from "@platform/shared-types";
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

it("reports health as compliance-service", async () => {
  const body = (await (await fetch(`${base}/health`)).json()) as HealthResponse;
  expect(body).toMatchObject({ service: "compliance-service", status: "ok" });
});

it("returns the shared 404 envelope for unknown API routes", async () => {
  const res = await fetch(`${base}/api/does-not-exist`);
  expect(res.status).toBe(404);
  expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});

it("sets the caller identity on /api and guards the access probes", async () => {
  const as = (role: string) => ({ method: "POST", headers: { "x-authenticated-user-role": role } });
  expect((await fetch(`${base}/api/access/approve`, as("admin"))).status).toBe(200);
  expect((await fetch(`${base}/api/access/approve`, as("finance_analyst"))).status).toBe(403);
  expect((await fetch(`${base}/api/access/approve`, { method: "POST" })).status).toBe(400);
});

it("serves client rows mapped from every vendor, validated against the row contract", async () => {
  const res = await fetch(`${base}/api/kyc-reviews`, { headers: { "x-authenticated-user-role": "compliance_analyst" } });
  expect(res.status).toBe(200);
  const { rows } = (await res.json()) as KycReviewQueueResponse;
  expect(rows).toHaveLength(16);
  for (const row of rows) {
    expect(kycReviewRowSchema.parse(row)).toEqual(row);
    expect(Object.keys(row).sort()).toEqual(["applicantName", "assignedTo", "documentUrl", "id", "notes", "riskScore", "status"]);
  }
  expect(rows.find((r) => r.id === "app_01HZK429G3")).toEqual({ id: "app_01HZK429G3", status: "PENDING", applicantName: "Rafael Gómez", documentUrl: "https://app.alloy.co/evaluations/ev_A3s7DfG9hJ2k", riskScore: 63, assignedTo: "cmp.mfarah", notes: "Shares surname and birth year with a listed PEP (regional official)." });
});

it("guards /api/kyc-reviews with the read permission", async () => {
  const res = await fetch(`${base}/api/kyc-reviews`, { headers: { "x-authenticated-user-role": "finance_analyst" } });
  expect(res.status).toBe(403);
});
