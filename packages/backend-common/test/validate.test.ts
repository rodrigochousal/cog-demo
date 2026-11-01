import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  refundTransactionRowSchema,
  type ApiErrorBody,
  type RefundTransactionRow,
  type ValidationErrorDetails,
} from "@platform/shared-types";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  auditAction,
  createServiceApp,
  MOCK_USER_ROLE_HEADER,
  requirePermission,
  validateBody,
  type AuditLogPayload,
} from "../src/index.js";

const validRefund = {
  id: "rf_0001",
  amount: 125.5,
  status: "PENDING_APPROVAL",
  currency: "usd",
  customerId: "cus_42",
  createdTimestamp: "2026-11-01T12:00:00.000Z",
};

const reached = vi.fn<(body: RefundTransactionRow) => void>();
const audits: AuditLogPayload[] = [];
let server: Server;
let base: string;

beforeAll(async () => {
  const app = createServiceApp({
    name: "validate-test",
    allowedOrigins: [],
    audit: { sink: (payload) => void audits.push(payload) },
    routes: (app) => {
      const handler = validateBody(refundTransactionRowSchema);
      app.post("/api/refunds", auditAction("CREATE_REFUND"), requirePermission("finance", "execute"), handler, (req, res) => {
        reached(req.body);
        res.status(201).json(req.body);
      });
      app.put("/api/refunds/:id", handler, (req, res) => {
        reached(req.body);
        res.json(req.body);
      });
      app.get("/api/refunds", handler, (_req, res) => {
        res.json({ ok: true });
      });
    },
  });
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

/** Reads a validation 400 and returns its issues. */
async function issuesOf(res: Response) {
  const body = (await res.json()) as ApiErrorBody;
  expect(res.status).toBe(400);
  expect(body.error).toMatchObject({ code: "VALIDATION_FAILED", message: "Request body failed validation" });
  return (body.error.details as ValidationErrorDetails).issues;
}

const send = (method: string, path: string, body?: string, contentType = "application/json") =>
  fetch(`${base}${path}`, {
    method,
    headers: { "content-type": contentType, [MOCK_USER_ROLE_HEADER]: "finance_analyst" },
    body,
  });

describe("validateBody", () => {
  it("replaces req.body with the parsed output (trimmed, normalised, defaults, unknown keys stripped)", async () => {
    reached.mockClear();
    const res = await send("POST", "/api/refunds", JSON.stringify({ ...validRefund, customerId: "  cus_42 ", role: "admin" }));
    const expected: RefundTransactionRow = { ...validRefund, currency: "USD", approvalsReceived: [] } as RefundTransactionRow;
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(expected);
    expect(reached).toHaveBeenCalledWith(expected);
  });

  it("short-circuits with 400 and field-level issues before the handler runs", async () => {
    reached.mockClear();
    const res = await send(
      "PUT",
      "/api/refunds/rf_0001",
      JSON.stringify({ ...validRefund, amount: -1, currency: "dollars", approvalsReceived: ["a", "a"], id: undefined }),
    );
    const issues = await issuesOf(res);
    expect(issues.map((i) => [i.field, i.code])).toEqual([
      ["id", "invalid_type"],
      ["amount", "too_small"],
      ["currency", "invalid_format"],
      ["approvalsReceived.1", "custom"],
    ]);
    expect(issues[3]).toMatchObject({ path: ["approvalsReceived", 1], message: "Duplicate approver 'a'" });
    expect(reached).not.toHaveBeenCalled();
  });

  it.each([
    ["a JSON array", "[]", "application/json"],
    ["a non-JSON content type", JSON.stringify(validRefund), "text/plain"],
  ])("rejects %s as a body-level issue", async (_label, body, contentType) => {
    reached.mockClear();
    const res = await send("POST", "/api/refunds", body, contentType);
    expect(await issuesOf(res)).toEqual([expect.objectContaining({ path: [], field: "(body)", code: "invalid_type" })]);
    expect(reached).not.toHaveBeenCalled();
  });

  it("reports every required field when the body is empty", async () => {
    reached.mockClear();
    const res = await send("POST", "/api/refunds", "{}");
    expect((await issuesOf(res)).map((i) => i.field)).toEqual(["id", "amount", "status", "currency", "customerId", "createdTimestamp"]);
    expect(reached).not.toHaveBeenCalled();
  });

  it("passes non-body methods through untouched", async () => {
    const res = await send("GET", "/api/refunds");
    expect(res.status).toBe(200);
  });

  it("records validation failures in the audit trail", async () => {
    audits.length = 0;
    await send("POST", "/api/refunds", JSON.stringify({ ...validRefund, amount: 0 }));
    await vi.waitFor(() => expect(audits).toHaveLength(1));
    expect(audits[0]).toMatchObject({
      action: "CREATE_REFUND",
      status: "FAILED",
      error: { code: "VALIDATION_FAILED", details: { issues: [expect.objectContaining({ field: "amount" })] } },
    });
  });
});
