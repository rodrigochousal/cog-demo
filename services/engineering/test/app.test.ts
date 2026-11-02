import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { configureConnectors, resetConnectors } from "@platform/backend-common";
import { featureFlagRowSchema, type HealthResponse, type FeatureFlagsResponse } from "@platform/shared-types";
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

it("reports health as engineering-service", async () => {
  const body = (await (await fetch(`${base}/health`)).json()) as HealthResponse;
  expect(body).toMatchObject({ service: "engineering-service", status: "ok" });
});

it("returns the shared 404 envelope for unknown API routes", async () => {
  const res = await fetch(`${base}/api/does-not-exist`);
  expect(res.status).toBe(404);
  expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});

it("sets the caller identity on /api and guards the access probes", async () => {
  const as = (role: string) => ({ method: "POST", headers: { "x-authenticated-user-role": role } });
  expect((await fetch(`${base}/api/access/toggle`, as("admin"))).status).toBe(200);
  expect((await fetch(`${base}/api/access/toggle`, as("compliance_analyst"))).status).toBe(403);
  expect((await fetch(`${base}/api/access/toggle`, { method: "POST" })).status).toBe(400);
});

it("serves client rows mapped from every provider, validated against the row contract", async () => {
  const res = await fetch(`${base}/api/feature-flags`, { headers: { "x-authenticated-user-role": "engineer" } });
  expect(res.status).toBe(200);
  const { rows } = (await res.json()) as FeatureFlagsResponse;
  expect(rows).toHaveLength(18);
  for (const row of rows) {
    expect(featureFlagRowSchema.parse(row)).toEqual(row);
    expect(Object.keys(row).sort()).toEqual(["description", "enabled", "id", "key", "targetedTiers", "updatedAt", "updatedBy"]);
  }
  expect(rows.find((r) => r.id === "instant-payouts")).toEqual({ id: "instant-payouts", key: "instant_payouts", description: "Settle merchant payouts over RTP/FedNow within seconds instead of next-day ACH.", enabled: true, targetedTiers: ["growth", "enterprise", "internal"], updatedBy: "eng.akumar", updatedAt: "2026-10-12T16:20:00.000Z" });
});

it("guards /api/feature-flags with the read permission", async () => {
  const res = await fetch(`${base}/api/feature-flags`, { headers: { "x-authenticated-user-role": "compliance_analyst" } });
  expect(res.status).toBe(403);
});

describe("POST /api/feature-flags/:flagId/toggle", () => {
  const toggle = (id: string, role: string, body: unknown) =>
    fetch(`${base}/api/feature-flags/${id}/toggle`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-authenticated-user-role": role },
      body: JSON.stringify(body),
    });

  it("flips the flag and records the caller as the last editor", async () => {
    const res = await toggle("chargeback-evidence-ai", "engineer", { enabled: true });
    expect(res.status).toBe(200);
    expect(featureFlagRowSchema.parse(await res.json())).toMatchObject({ id: "chargeback-evidence-ai", enabled: true, updatedBy: "mock-engineer" });

    const list = (await (await fetch(`${base}/api/feature-flags`, { headers: { "x-authenticated-user-role": "engineer" } })).json()) as FeatureFlagsResponse;
    expect(list.rows.find((r) => r.id === "chargeback-evidence-ai")?.enabled).toBe(true);
  });

  it("validates the body, guards with the toggle permission and 404s unknown flags", async () => {
    expect((await toggle("webhooks-v2", "engineer", { enabled: "yes" })).status).toBe(400);
    expect((await toggle("webhooks-v2", "engineer", {})).status).toBe(400);
    expect((await toggle("webhooks-v2", "compliance_analyst", { enabled: false })).status).toBe(403);
    expect((await toggle("no-such-flag", "engineer", { enabled: false })).status).toBe(404);
  });
});
