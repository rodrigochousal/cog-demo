import { REFUND_APPROVALS_REQUIRED, type RefundTransactionRow } from "@platform/shared-types";
import { RefreshCwIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, CoreDataTable, describeError, formatCount, PageHeader, QueryErrorPanel, ReasonDialog, StatCard, StatGrid, TableSkeleton, toast } from "ui-shared";
import { useRefunds } from "../api/use-refunds";
import { useSubmitRefundDecisions } from "../api/use-submit-refund-decisions";
import { buildRefundColumns, type RefundDecision } from "./columns";

interface PendingDecision {
  refundIds: string[];
  decision: RefundDecision;
  subject: string;
  onDone?: () => void;
}

const DECISION_LABEL: Record<RefundDecision, string> = { approve: "Approve", reject: "Reject" };

/** Refunds Dashboard: dual-control approval of refunds across payment processors. */
export function RefundsPanel() {
  const refunds = useRefunds();
  const submit = useSubmitRefundDecisions();
  const [pending, setPending] = useState<PendingDecision | null>(null);

  const columns = useMemo(
    () => buildRefundColumns((row, decision) => setPending({ refundIds: [row.id], decision, subject: row.id })),
    [],
  );

  const rows = refunds.data;
  const stats = useMemo(() => {
    const list = rows ?? [];
    const open = list.filter((r) => r.status === "PENDING_APPROVAL");
    return {
      total: list.length,
      pending: open.length,
      awaitingSecond: open.filter((r) => r.approvalsReceived.length === REFUND_APPROVALS_REQUIRED - 1).length,
      processed: list.filter((r) => r.status === "PROCESSED").length,
      failed: list.filter((r) => r.status === "FAILED").length,
    };
  }, [rows]);

  const confirm = (reason: string) => {
    if (!pending) return;
    const { refundIds, decision, subject, onDone } = pending;
    submit.mutate(
      { refundIds, decision: { decision, ...(reason ? { reason } : {}) } },
      {
        onSuccess: ({ succeeded, failed }) => {
          setPending(null);
          onDone?.();
          if (failed.length) toast.warning(`${DECISION_LABEL[decision]}: ${succeeded.length} done, ${failed.length} failed`, { description: describeError(failed[0]?.error) });
          else toast.success(`${DECISION_LABEL[decision]} recorded for ${subject}`);
        },
        onError: (error) => toast.error("Decision failed", { description: describeError(error) }),
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Refunds Dashboard"
        description={`Refund requests across Stripe and PayPal. Each refund needs ${REFUND_APPROVALS_REQUIRED} distinct approvers before it is released.`}
        actions={
          <Button variant="outline" size="xs" onClick={() => void refunds.refetch()} disabled={refunds.isFetching}>
            <RefreshCwIcon className={refunds.isFetching ? "animate-spin" : undefined} /> Refresh
          </Button>
        }
      />
      <StatGrid>
        <StatCard label="Pending approval" value={formatCount(stats.pending)} hint={`of ${formatCount(stats.total)} refunds`} tone="warning" />
        <StatCard label="Awaiting 2nd approver" value={formatCount(stats.awaitingSecond)} hint="one sign-off received" />
        <StatCard label="Processed" value={formatCount(stats.processed)} tone="success" />
        <StatCard label="Failed / rejected" value={formatCount(stats.failed)} tone="destructive" />
      </StatGrid>

      {refunds.isPending ? (
        <TableSkeleton />
      ) : refunds.isError ? (
        <QueryErrorPanel error={refunds.error} onRetry={() => void refunds.refetch()} title="Could not load refunds" />
      ) : (
        <CoreDataTable
          columns={columns}
          data={refunds.data}
          getRowId={(row: RefundTransactionRow) => row.id}
          enableRowSelection={(row) => row.original.status === "PENDING_APPROVAL"}
          searchPlaceholder="Search refunds, customers…"
          emptyMessage="No refunds match."
          renderSelectionActions={({ selectedRows, clearSelection }) => (
            <>
              {(["approve", "reject"] as const).map((decision) => (
                <Button
                  key={decision}
                  size="xs"
                  variant={decision === "reject" ? "destructive" : "default"}
                  onClick={() => setPending({ refundIds: selectedRows.map((r) => r.id), decision, subject: `${selectedRows.length} refunds`, onDone: clearSelection })}
                >
                  {DECISION_LABEL[decision]} selected
                </Button>
              ))}
            </>
          )}
        />
      )}

      <ReasonDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={pending ? `${DECISION_LABEL[pending.decision]} ${pending.subject}?` : ""}
        description={pending?.decision === "approve" ? "Your approval counts once per refund; a different approver must give the second." : "Rejected refunds are closed and not paid out."}
        confirmLabel={pending ? DECISION_LABEL[pending.decision] : "Confirm"}
        destructive={pending?.decision === "reject"}
        reasonRequired={pending?.decision === "reject"}
        pending={submit.isPending}
        onConfirm={confirm}
      />
    </>
  );
}
