import {
  REFUND_APPROVALS_REQUIRED,
  REFUND_TRANSACTION_STATUSES,
  type RefundTransactionRow,
  type RefundTransactionStatus,
} from "@platform/shared-types";
import { Badge, Button, createCoreColumnHelper, formatDateTime, formatMoney } from "ui-shared";

const helper = createCoreColumnHelper<RefundTransactionRow>();

export type RefundDecision = "approve" | "reject";

const STATUS_VARIANT: Record<RefundTransactionStatus, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING_APPROVAL: "outline",
  PROCESSED: "secondary",
  FAILED: "destructive",
};

const STATUS_LABEL: Record<RefundTransactionStatus, string> = {
  PENDING_APPROVAL: "Pending approval",
  PROCESSED: "Processed",
  FAILED: "Failed",
};

export function buildRefundColumns(onDecide: (row: RefundTransactionRow, decision: RefundDecision) => void) {
  return helper.columns([
    helper.accessor("id", {
      header: "Refund ID",
      cell: (info) => <span className="font-mono text-[11px] text-muted-foreground">{info.getValue()}</span>,
    }),
    helper.accessor("customerId", {
      header: "Customer",
      filterFn: "includesString",
      meta: { label: "Customer", filter: { kind: "text", placeholder: "Customer ID…" } },
      cell: (info) => <span className="font-mono text-[11px]">{info.getValue()}</span>,
    }),
    helper.accessor("amount", {
      header: "Amount",
      sortFn: "basic",
      enableGlobalFilter: false,
      meta: { align: "end" },
      cell: (info) => <span className="font-medium tabular-nums">{formatMoney(info.getValue(), info.row.original.currency)}</span>,
    }),
    helper.accessor("currency", {
      header: "Ccy",
      filterFn: "equalsString",
      meta: { label: "Currency", filter: { kind: "select", options: ["USD", "EUR", "GBP", "CAD"].map((c) => ({ value: c, label: c })) } },
      cell: (info) => <span className="font-mono text-[11px]">{info.getValue()}</span>,
    }),
    helper.accessor("status", {
      header: "Status",
      filterFn: "equalsString",
      meta: { label: "Status", filter: { kind: "select", options: REFUND_TRANSACTION_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })) } },
      cell: (info) => <Badge variant={STATUS_VARIANT[info.getValue()]}>{STATUS_LABEL[info.getValue()]}</Badge>,
    }),
    helper.accessor((row) => row.approvalsReceived.length, {
      id: "approvals",
      header: "Approvals",
      sortFn: "basic",
      enableGlobalFilter: false,
      cell: (info) => (
        <span className="tabular-nums" title={info.row.original.approvalsReceived.join(", ") || "No approvals yet"}>
          {info.getValue()}/{REFUND_APPROVALS_REQUIRED}
          {info.row.original.approvalsReceived.length ? (
            <span className="ml-1.5 text-muted-foreground">{info.row.original.approvalsReceived.join(", ")}</span>
          ) : null}
        </span>
      ),
    }),
    helper.accessor("createdTimestamp", {
      header: "Created",
      sortFn: "text",
      enableGlobalFilter: false,
      cell: (info) => <span className="text-muted-foreground tabular-nums">{formatDateTime(info.getValue())}</span>,
    }),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) =>
        row.original.status === "PENDING_APPROVAL" ? (
          <div className="flex justify-end gap-1">
            <Button size="xs" onClick={() => onDecide(row.original, "approve")}>
              Approve
            </Button>
            <Button size="xs" variant="destructive" onClick={() => onDecide(row.original, "reject")}>
              Reject
            </Button>
          </div>
        ) : (
          <div className="text-right text-[11px] text-muted-foreground">Closed</div>
        ),
    }),
  ]);
}
