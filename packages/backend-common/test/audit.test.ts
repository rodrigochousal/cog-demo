import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Request, Response } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditAction,
  auditLogger,
  createMemoryStore,
  createServiceApp,
  createStdoutAuditSink,
  formatAuditLine,
  injectMockUser,
  MOCK_USER_ROLE_HEADER,
  parseOrThrow,
  PERMISSION_DENIED_MESSAGE,
  requirePermission,
  useAudit,
  type AuditLogPayload,
  type AuditSink,
  type SafeParser,
} from "../src/index.js";

interface Widget {
  id: string;
  name: string;
  enabled: boolean;
  owner: { team: string };
  secret?: string;
}

const nameSchema: SafeParser<{ name: string }> = {
  safeParse(input) {
    if (typeof input === "object" && input !== null && "name" in input && typeof input.name === "string") {
      return { success: true, data: { name: input.name } };
    }
    return { success: false, error: { issues: [{ path: ["name"], message: "Required" }] } };
  },
};

const FIXED_NOW = new Date("2026-11-01T12:00:00.000Z");

/** Collects payloads; `next()` resolves with the next one written. */
function createCollector() {
  const lines: AuditLogPayload[] = [];
  const waiters: ((p: AuditLogPayload) => void)[] = [];
  const sink: AuditSink = (payload) => {
    lines.push(payload);
    waiters.shift()?.(payload);
  };
  const next = () =>
    new Promise<AuditLogPayload>((resolve) => {
      waiters.push(resolve);
    });
  return { lines, sink, next };
}

describe("auditLogger via createServiceApp", () => {
  const collector = createCollector();
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const widgets = createMemoryStore<Record<string, Widget>>("widgets", () => ({
      w1: { id: "w1", name: "Alpha", enabled: false, owner: { team: "ops" }, secret: "s3cr3t" },
      w2: { id: "w2", name: "Beta", enabled: true, owner: { team: "ops" } },
    }));
    const app = createServiceApp({
      name: "widget-service",
      allowedOrigins: [],
      audit: { sink: collector.sink, now: () => FIXED_NOW },
      routes: (app) => {
        app.use("/api", injectMockUser);
        app.post(
          "/api/v1/widgets",
          auditAction("CREATE_WIDGET"),
          requirePermission("engineering", "toggle"),
          (req, res) => {
            const { name } = parseOrThrow(nameSchema, req.body);
            const audit = useAudit(req);
            const created = widgets.transact((draft) => {
              const widget: Widget = { id: "w3", name, enabled: false, owner: { team: "ops" } };
              draft[widget.id] = widget;
              audit.after(widget);
              return widget;
            });
            res.status(201).json(created);
          },
        );
        app.put("/api/v1/widgets/:id/toggle", auditAction("TOGGLE_FLAG"), (req, res) => {
          const audit = useAudit(req);
          const id = String(req.params.id);
          const updated = widgets.transact((draft) => {
            const widget = draft[id];
            if (!widget) throw new Error("missing");
            audit.before(widget);
            widget.enabled = !widget.enabled;
            widget.secret = "rotated";
            audit.after(widget);
            widget.name = "mutated after snapshot";
            return widget;
          });
          res.json(updated);
        });
        app.delete("/api/v1/widgets/:id", auditAction("DELETE_WIDGET"), (req, res) => {
          const audit = useAudit(req);
          const id = String(req.params.id);
          widgets.transact((draft) => {
            audit.record(draft[id], null);
            delete draft[id];
          });
          res.status(204).end();
        });
        app.post("/api/v1/soft-fail", auditAction("SOFT_FAIL"), (req, res) => {
          useAudit(req).fail("business rule tripped");
          res.status(200).json({ ok: false });
        });
        app.post("/api/v1/unnamed/:id", (req, res) => {
          useAudit(req);
          res.json({ ok: true });
        });
        app.get("/api/v1/widgets", (_req, res) => {
          res.json([]);
        });
      },
    });
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());
  beforeEach(() => {
    collector.lines.length = 0;
  });

  const call = (method: string, path: string, init: { role?: string; body?: string; headers?: Record<string, string> } = {}) =>
    fetch(`${base}${path}`, {
      method,
      body: init.body,
      headers: {
        "content-type": "application/json",
        ...(init.role && { [MOCK_USER_ROLE_HEADER]: init.role }),
        ...init.headers,
      },
    });

  it("POST create: SUCCESS with actor, route pattern, service name and full newValue", async () => {
    const line = collector.next();
    const res = await call("POST", "/api/v1/widgets", { role: "engineer", body: JSON.stringify({ name: "Gamma" }) });
    expect(res.status).toBe(201);
    expect(await line).toEqual({
      kind: "audit",
      timestamp: FIXED_NOW.toISOString(),
      actorId: "mock-engineer",
      actorRole: "engineer",
      targetService: "widget-service",
      endpoint: "/api/v1/widgets",
      action: "CREATE_WIDGET",
      status: "SUCCESS",
      delta: { oldValue: null, newValue: { id: "w3", name: "Gamma", enabled: false, owner: { team: "ops" } } },
      method: "POST",
      httpStatus: 201,
      requestId: res.headers.get("x-request-id"),
      durationMs: expect.any(Number),
    });
  });

  it("PUT update: only changed keys, snapshots immune to later mutation, secrets redacted", async () => {
    const line = collector.next();
    const res = await call("PUT", "/api/v1/widgets/w1/toggle", { role: "admin", headers: { "x-request-id": "req-123" } });
    expect(res.status).toBe(200);
    const payload = await line;
    expect(payload).toMatchObject({
      endpoint: "/api/v1/widgets/:id/toggle",
      action: "TOGGLE_FLAG",
      status: "SUCCESS",
      requestId: "req-123",
      delta: { oldValue: { enabled: false, secret: "[REDACTED]" }, newValue: { enabled: true, secret: "[REDACTED]" } },
    });
    expect(payload.error).toBeUndefined();
    expect(res.headers.get("x-request-id")).toBe("req-123");
  });

  it("DELETE: full oldValue, newValue null", async () => {
    const line = collector.next();
    expect((await call("DELETE", "/api/v1/widgets/w2", { role: "admin" })).status).toBe(204);
    expect((await line).delta).toEqual({
      oldValue: { id: "w2", name: "Beta", enabled: true, owner: { team: "ops" } },
      newValue: null,
    });
  });

  it("validation failure (parseOrThrow/zod): FAILED with VALIDATION_FAILED issues", async () => {
    const line = collector.next();
    const res = await call("POST", "/api/v1/widgets", { role: "engineer", body: JSON.stringify({}) });
    expect(res.status).toBe(400);
    expect(await line).toMatchObject({
      action: "CREATE_WIDGET",
      status: "FAILED",
      httpStatus: 400,
      delta: { oldValue: null, newValue: null },
      error: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
        details: [{ path: ["name"], message: "Required" }],
      },
    });
  });

  it("RBAC denial: FAILED with the FORBIDDEN envelope, action still named", async () => {
    const line = collector.next();
    const res = await call("POST", "/api/v1/widgets", { role: "finance_analyst", body: JSON.stringify({ name: "x" }) });
    expect(res.status).toBe(403);
    expect(await line).toMatchObject({
      actorId: "mock-finance_analyst",
      actorRole: "finance_analyst",
      action: "CREATE_WIDGET",
      endpoint: "/api/v1/widgets",
      status: "FAILED",
      httpStatus: 403,
      error: { code: "FORBIDDEN", message: PERMISSION_DENIED_MESSAGE },
    });
  });

  it("identity rejection: FAILED and anonymous actor", async () => {
    const line = collector.next();
    expect((await call("POST", "/api/v1/widgets", { role: "superuser", body: "{}" })).status).toBe(400);
    expect(await line).toMatchObject({
      actorId: "anonymous",
      actorRole: "anonymous",
      action: "HTTP_POST",
      endpoint: "/api/v1/widgets",
      status: "FAILED",
      error: { code: "BAD_REQUEST", message: "Unknown role in 'x-authenticated-user-role' header" },
    });
  });

  it("malformed JSON and unknown routes are audited as FAILED", async () => {
    const bad = collector.next();
    expect((await call("POST", "/api/v1/widgets?debug=1", { role: "engineer", body: "{nope" })).status).toBe(400);
    expect(await bad).toMatchObject({ endpoint: "/api/v1/widgets", status: "FAILED", error: { code: "BAD_REQUEST" } });

    const missing = collector.next();
    expect((await call("DELETE", "/api/nowhere", { role: "admin" })).status).toBe(404);
    expect(await missing).toMatchObject({ endpoint: "/api/nowhere", status: "FAILED", error: { code: "NOT_FOUND" } });
  });

  it("trail.fail() marks a 2xx response FAILED", async () => {
    const line = collector.next();
    expect((await call("POST", "/api/v1/soft-fail", { role: "admin" })).status).toBe(200);
    expect(await line).toMatchObject({ status: "FAILED", error: { code: "FAILED", message: "business rule tripped" } });
  });

  it("useAudit captures the route pattern even without auditAction", async () => {
    const line = collector.next();
    await call("POST", "/api/v1/unnamed/abc", { role: "admin" });
    expect(await line).toMatchObject({ endpoint: "/api/v1/unnamed/:id", action: "HTTP_POST", status: "SUCCESS" });
  });

  it("does not audit reads", async () => {
    expect((await call("GET", "/api/v1/widgets", { role: "admin" })).status).toBe(200);
    expect((await call("GET", "/health")).status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    expect(collector.lines).toHaveLength(0);
  });
});

describe("createServiceApp audit option", () => {
  it("can be disabled, in which case useAudit fails closed", async () => {
    const app = createServiceApp({
      name: "quiet-service",
      allowedOrigins: [],
      audit: false,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      routes: (app) => {
        app.post("/x", (req, res) => {
          useAudit(req);
          res.json({});
        });
      },
    });
    const server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    const res = await fetch(`http://localhost:${(server.address() as AddressInfo).port}/x`, { method: "POST" });
    server.close();
    expect(res.status).toBe(500);
  });
});

/** Minimal request/response doubles for lifecycle tests. */
function fakeExchange(method = "POST") {
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    writableFinished: false,
    headers: new Map<string, string>(),
    setHeader(name: string, value: string) {
      this.headers.set(name, value);
    },
    json(_body: unknown) {
      return this;
    },
  });
  const req = { method, originalUrl: "/api/thing", baseUrl: "", get: () => undefined } as unknown as Request;
  return { req, res, response: res as unknown as Response };
}

describe("auditLogger lifecycle", () => {
  it("writes after the response finishes, off the response's tick", async () => {
    const sink = vi.fn<AuditSink>();
    const { req, res, response } = fakeExchange();
    auditLogger({ targetService: "svc", sink })(req, response, () => {});
    res.writableFinished = true;
    res.emit("finish");
    res.emit("close");
    expect(sink).not.toHaveBeenCalled();
    await new Promise((r) => setImmediate(r));
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0]?.[0]).toMatchObject({ status: "SUCCESS", endpoint: "/api/thing" });
  });

  it("records client disconnects as FAILED", async () => {
    const sink = vi.fn<AuditSink>();
    const { req, res, response } = fakeExchange("DELETE");
    auditLogger({ targetService: "svc", sink })(req, response, () => {});
    res.emit("close");
    await new Promise((r) => setImmediate(r));
    expect(sink.mock.calls[0]?.[0]).toMatchObject({ status: "FAILED", error: { code: "CLIENT_CLOSED_REQUEST" } });
  });

  it("routes sink errors to onError instead of the request", async () => {
    const onError = vi.fn();
    const { req, res, response } = fakeExchange();
    const next = vi.fn();
    auditLogger({
      targetService: "svc",
      onError,
      sink: () => {
        throw new Error("disk full");
      },
    })(req, response, next);
    expect(next).toHaveBeenCalledWith();
    res.emit("finish");
    await new Promise((r) => setImmediate(r));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "disk full" }));
  });

  it("skips non-mutating methods entirely", () => {
    const { req, response } = fakeExchange("GET");
    auditLogger({ targetService: "svc" })(req, response, () => {});
    expect(req.audit).toBeUndefined();
  });
});

describe("stdout sink", () => {
  it("writes exactly one newline-terminated JSON line per payload", () => {
    const chunks: string[] = [];
    const payload: AuditLogPayload = {
      kind: "audit",
      timestamp: FIXED_NOW.toISOString(),
      actorId: "u",
      actorRole: "admin",
      targetService: "svc",
      endpoint: "/x",
      action: "A",
      status: "SUCCESS",
      delta: { oldValue: null, newValue: { note: "line1\nline2" } },
      method: "POST",
      httpStatus: 200,
      requestId: "r",
      durationMs: 1,
    };
    createStdoutAuditSink({ write: (c) => chunks.push(c) > 0 })(payload);
    expect(chunks).toEqual([formatAuditLine(payload)]);
    expect(chunks[0]?.match(/\n/g)).toHaveLength(1);
    expect(JSON.parse(chunks[0] ?? "")).toEqual(payload);
  });

  it("defaults to process.stdout", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      createStdoutAuditSink()({
        kind: "audit",
        timestamp: "t",
        actorId: "u",
        actorRole: "anonymous",
        targetService: "svc",
        endpoint: "/x",
        action: "A",
        status: "FAILED",
        delta: { oldValue: null, newValue: null },
        method: "DELETE",
        httpStatus: 500,
        requestId: "r",
        durationMs: 0,
        error: { code: "INTERNAL_ERROR", message: "boom" },
      });
      expect(write).toHaveBeenCalledTimes(1);
    } finally {
      write.mockRestore();
    }
  });
});
