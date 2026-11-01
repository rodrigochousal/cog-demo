import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ApiErrorBody, HealthResponse } from "@platform/shared-types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceApp, DomainError, HttpError, openKycMockStore, openLedgerStore } from "../src/index.js";

let server: Server;
let base: string;

beforeAll(async () => {
  const app = createServiceApp({
    name: "test-service",
    allowedOrigins: ["http://localhost:3999"],
    routes: (app) => {
      app.get("/boom/http", () => {
        throw new HttpError(400, "BAD_REQUEST", "nope");
      });
      app.get("/boom/domain", () => {
        throw new DomainError("CONFLICT", "already done");
      });
    },
  });
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe("createServiceApp", () => {
  it("serves /health", async () => {
    const res = await fetch(`${base}/health`);
    const body = (await res.json()) as HealthResponse;
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ service: "test-service", status: "ok" });
  });

  it("only allows the configured frontend origin", async () => {
    const ok = await fetch(`${base}/health`, { headers: { origin: "http://localhost:3999" } });
    const other = await fetch(`${base}/health`, { headers: { origin: "http://evil.local" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:3999");
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  it.each([
    ["/missing", 404, "NOT_FOUND"],
    ["/boom/http", 400, "BAD_REQUEST"],
    ["/boom/domain", 409, "CONFLICT"],
  ])("maps %s to the shared error envelope", async (path, status, code) => {
    const res = await fetch(`${base}${path}`);
    const body = (await res.json()) as ApiErrorBody;
    expect(res.status).toBe(status);
    expect(body.error.code).toBe(code);
  });
});

describe("local stores", () => {
  it("start empty and persist appended records", () => {
    const ledger = openLedgerStore({ mode: "memory" });
    expect(ledger.read().entries).toEqual([]);
    ledger.transact((d) =>
      d.entries.push({ id: "le_1", accountId: "acc_1", amount: { amountMinor: 100, currency: "USD" }, reference: "t", createdAt: new Date().toISOString() }),
    );
    expect(ledger.read().entries).toHaveLength(1);
    expect(openKycMockStore({ mode: "memory" }).read().records).toEqual([]);
  });
});
