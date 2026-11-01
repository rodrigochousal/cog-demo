import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ApiErrorBody, AuthenticatedUser, PermissionDeniedBody, UserRole } from "@platform/shared-types";
import { USER_ROLES } from "@platform/shared-types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createMockIdentityMiddleware,
  createServiceApp,
  hasPermission,
  MOCK_USER_ROLE_HEADER,
  PERMISSION_DENIED_BODY,
  RESOURCE_ACTIONS,
  requirePermission,
  type Resource,
  type ResourceAction,
} from "../src/index.js";

const RESOURCES = Object.keys(RESOURCE_ACTIONS) as Resource[];
const DOMAIN_ROLE: Record<Resource, UserRole> = {
  compliance: "compliance_analyst",
  finance: "finance_analyst",
  engineering: "engineer",
};
const allPairs = RESOURCES.flatMap((r) => RESOURCE_ACTIONS[r].map((a) => [r, a] as ResourceAction));

describe("hasPermission", () => {
  it("grants admin every action on every resource, including unknown ones", () => {
    for (const [r, a] of allPairs) expect(hasPermission("admin", r, a)).toBe(true);
    expect(hasPermission("admin", "anything", "whatever")).toBe(true);
  });

  it.each(RESOURCES)("aligns the %s domain 1-to-1 with its role", (resource) => {
    for (const [r, a] of allPairs) {
      expect(hasPermission(DOMAIN_ROLE[resource], r, a)).toBe(r === resource);
    }
  });

  it("denies unknown resources/actions and prototype keys to domain roles", () => {
    expect(hasPermission("finance_analyst", "finance", "approve")).toBe(false);
    expect(hasPermission("finance_analyst", "payroll", "read")).toBe(false);
    expect(hasPermission("finance_analyst", "constructor", "read")).toBe(false);
    expect(hasPermission("finance_analyst", "toString", "read")).toBe(false);
  });
});

describe("injectMockUser + requirePermission", () => {
  let server: Server;
  let base: string;
  const warnings: string[] = [];
  let writes = 0;

  beforeAll(async () => {
    const identity = createMockIdentityMiddleware({ warn: (m) => warnings.push(m) });
    const app = createServiceApp({
      name: "auth-test",
      allowedOrigins: [],
      routes: (app) => {
        app.get("/unguarded", requirePermission("finance", "read"), (_req, res) => {
          res.json({ ok: true });
        });
        app.use("/api", identity);
        app.get("/api/me", (req, res) => {
          res.json(req.user);
        });
        app.post("/api/finance/execute", requirePermission("finance", "execute"), (_req, res) => {
          writes += 1;
          res.json({ ok: true });
        });
        for (const pair of allPairs) {
          app.get(`/api/${pair[0]}/${pair[1]}`, requirePermission(...pair), (_req, res) => {
            res.json({ ok: true });
          });
        }
      },
    });
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  const call = (path: string, role?: string) =>
    fetch(`${base}${path}`, { headers: role === undefined ? {} : { [MOCK_USER_ROLE_HEADER]: role } });

  it.each(USER_ROLES)("attaches the %s mock profile to req.user", async (role) => {
    const res = await call("/api/me", role);
    const user = (await res.json()) as AuthenticatedUser;
    expect(res.status).toBe(200);
    expect(user).toEqual({ id: `mock-${role}`, name: expect.any(String), role });
  });

  it("normalises header casing and whitespace", async () => {
    const user = (await (await call("/api/me", "  Compliance_Analyst ")).json()) as AuthenticatedUser;
    expect(user.role).toBe("compliance_analyst");
  });

  it("defaults reads to finance_analyst and warns only once when the header is missing", async () => {
    warnings.length = 0;
    const user = (await (await call("/api/me")).json()) as AuthenticatedUser;
    await call("/api/me");
    expect(user.role).toBe("finance_analyst");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(MOCK_USER_ROLE_HEADER);
  });

  it("rejects mutating requests without the header, including cross-site simple requests", async () => {
    writes = 0;
    const res = await fetch(`${base}/api/finance/execute`, {
      method: "POST",
      headers: { origin: "http://evil.example", "content-type": "text/plain" },
      body: "x",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe("BAD_REQUEST");
    expect(writes).toBe(0);

    const ok = await fetch(`${base}/api/finance/execute`, {
      method: "POST",
      headers: { [MOCK_USER_ROLE_HEADER]: "finance_analyst" },
    });
    expect(ok.status).toBe(200);
    expect(writes).toBe(1);
  });

  it("rejects unknown roles with 400", async () => {
    const res = await call("/api/me", "superuser");
    const body = (await res.json()) as ApiErrorBody;
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("lets authorised roles through", async () => {
    expect((await call("/api/finance/execute", "finance_analyst")).status).toBe(200);
    expect((await call("/api/compliance/approve", "compliance_analyst")).status).toBe(200);
    expect((await call("/api/engineering/toggle", "engineer")).status).toBe(200);
    expect((await call("/api/compliance/approve", "admin")).status).toBe(200);
  });

  it.each([
    ["finance_analyst", "/api/compliance/read"],
    ["compliance_analyst", "/api/engineering/toggle"],
    ["engineer", "/api/finance/execute"],
      ])("returns the 403 payload for %s on %s", async (role, path) => {
    const res = await call(path, role);
    expect(res.status).toBe(403);
    expect((await res.json()) as PermissionDeniedBody).toEqual({
      error: "Unauthorized",
      reason: "User role does not possess required permissions for this action.",
    });
    expect(PERMISSION_DENIED_BODY.error).toBe("Unauthorized");
  });

  it("fails closed when no identity middleware ran", async () => {
    const res = await call("/unguarded", "admin");
    expect(res.status).toBe(403);
  });
});
