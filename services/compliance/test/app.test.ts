import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { HealthResponse } from "@platform/shared-types";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createApp } from "../src/app.js";

let server: Server;
let base: string;

beforeAll(async () => {
  server = createApp({ allowedOrigins: ["http://localhost:3000"] }).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

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
