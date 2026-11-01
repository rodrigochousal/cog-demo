import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ApiErrorBody, AuthenticatedUser, HealthResponse } from "@platform/shared-types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express, RequestHandler } from "express";
import {
  createServiceApp,
  DomainError,
  HttpError,
  MOCK_USER_ROLE_HEADER,
  openKycMockStore,
  openLedgerStore,
  type ServiceAppOptions,
} from "../src/index.js";

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

describe("createServiceApp identity", () => {
  const echoUser = (app: Express) => {
    for (const path of ["/api/me", "/outside/me"]) {
      app.get(path, (req, res) => {
        res.json({ user: req.user ?? null });
      });
    }
    app.post("/api/write", (req, res) => {
      res.json({ user: req.user ?? null });
    });
  };

  async function withApp(identity: ServiceAppOptions["identity"], fn: (base: string) => Promise<void>) {
    const srv = createServiceApp({ name: "identity-test", allowedOrigins: [], identity, routes: echoUser }).listen(0);
    await new Promise((r) => srv.once("listening", r));
    try {
      await fn(`http://localhost:${(srv.address() as AddressInfo).port}`);
    } finally {
      srv.close();
    }
  }
  const userAt = async (url: string, init?: RequestInit) =>
    ((await (await fetch(url, init)).json()) as { user: AuthenticatedUser | null }).user;

  it("mounts injectMockUser on /api by default, and nowhere else", async () => {
    await withApp(undefined, async (base) => {
      const headers = { [MOCK_USER_ROLE_HEADER]: "engineer" };
      expect((await userAt(`${base}/api/me`, { headers }))?.role).toBe("engineer");
      expect(await userAt(`${base}/outside/me`, { headers })).toBeNull();
      expect((await fetch(`${base}/health`)).status).toBe(200);
      expect((await fetch(`${base}/api/write`, { method: "POST" })).status).toBe(400);
    });
  });

  it("uses a custom identity middleware when given", async () => {
    const custom: RequestHandler = (req, _res, next) => {
      req.user = { id: "u1", name: "Custom", role: "admin" };
      next();
    };
    await withApp(custom, async (base) => {
      expect(await userAt(`${base}/api/me`)).toEqual({ id: "u1", name: "Custom", role: "admin" });
    });
  });

  it("mounts no identity when disabled", async () => {
    await withApp(false, async (base) => {
      expect(await userAt(`${base}/api/me`, { headers: { [MOCK_USER_ROLE_HEADER]: "admin" } })).toBeNull();
      expect((await fetch(`${base}/api/write`, { method: "POST" })).status).toBe(200);
    });
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
