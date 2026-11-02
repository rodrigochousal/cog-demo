import {
  auditAction,
  businessRuleViolation,
  parseOrThrow,
  permissionDenied,
  requirePermission,
  useAudit,
  type ILedgerDatabase,
  type Refund,
  type UpdateRefundInput,
} from "@platform/backend-common";
import {
  REFUND_APPROVALS_REQUIRED,
  refundDecisionRequestSchema,
  type RefundDecisionRequest,
  type RefundTransactionRow,
  type RefundTransactionsResponse,
} from "@platform/shared-types";
import { Router } from "express";
import { z } from "zod";
import { toRefundTransactionRow } from "../presenters/refund-transaction-row.js";

const refundParamsSchema = z.object({ refundId: z.string().trim().min(1, "refundId is required") });

/**
 * Dual-control rule: a pending refund is released (`approved`) once it has
 * `REFUND_APPROVALS_REQUIRED` distinct approvers; any single reviewer may reject it.
 */
export function applyRefundDecision(refund: Refund, decision: RefundDecisionRequest, actor: string): UpdateRefundInput {
  if (refund.status !== "pending_review") {
    throw businessRuleViolation(`Refund '${refund.id}' is ${refund.status}; only pending refunds accept decisions`);
  }
  if (decision.decision === "reject") {
    return { status: "rejected", reviewedBy: actor, notes: decision.reason ?? refund.notes };
  }
  if (refund.approvals.includes(actor)) {
    throw businessRuleViolation(`${actor} has already approved refund '${refund.id}'; a second, different approver is required`);
  }
  const approvals = [...refund.approvals, actor];
  return approvals.length >= REFUND_APPROVALS_REQUIRED
    ? { approvals, status: "approved", reviewedBy: actor }
    : { approvals };
}

/** Refund endpoints, mounted at `/api/refunds`. Responses are client rows (`RefundTransactionRow`). */
export function createRefundsRouter(ledger: ILedgerDatabase): Router {
  const router = Router();

  router.get("/", requirePermission("finance", "read"), async (_req, res) => {
    const body: RefundTransactionsResponse = { rows: (await ledger.findAll()).map(toRefundTransactionRow) };
    res.json(body);
  });

  router.post("/:refundId/decisions", auditAction("SUBMIT_REFUND_DECISION"), requirePermission("finance", "execute"), async (req, res) => {
    const { refundId } = parseOrThrow(refundParamsSchema, req.params);
    const decision = parseOrThrow(refundDecisionRequestSchema, req.body);
    if (!req.user) throw permissionDenied();

    const audit = useAudit(req);
    const current = await ledger.findById(refundId);
    audit.before(current);
    const updated = await ledger.updateRecord(refundId, applyRefundDecision(current, decision, req.user.id));
    audit.after(updated);
    const row: RefundTransactionRow = toRefundTransactionRow(updated);
    res.json(row);
  });

  return router;
}
