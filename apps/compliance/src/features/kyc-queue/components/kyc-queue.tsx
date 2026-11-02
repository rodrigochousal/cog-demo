import type { KycDecisionOutcomeValue, KycReviewRow } from "@platform/shared-types";
import { RefreshCwIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, CoreDataTable, describeError, formatCount, PageHeader, QueryErrorPanel, ReasonDialog, StatCard, StatGrid, TableSkeleton, toast } from "ui-shared";
import { useKycQueue } from "../api/use-kyc-queue";
import { useSubmitKycDecisions } from "../api/use-submit-kyc-decisions";
import { buildKycColumns, HIGH_RISK_THRESHOLD } from "./columns";

interface PendingDecision {
  applicantIds: string[];
  outcome: KycDecisionOutcomeValue;
  subject: string;
  onDone?: () => void;
}

const OUTCOME_LABEL: Record<KycDecisionOutcomeValue, string> = { approve: "Approve", reject: "Reject", escalate: "Escalate" };

/** KYC Review Queue: analysts triage identity verifications and submit manual decisions. */
export function KycQueue() {
  const queue = useKycQueue();
  const submit = useSubmitKycDecisions();
  const [pending, setPending] = useState<PendingDecision | null>(null);

  const columns = useMemo(
    () => buildKycColumns((row, outcome) => setPending({ applicantIds: [row.id], outcome, subject: row.applicantName })),
    [],
  );

  const rows = queue.data;
  const stats = useMemo(() => {
    const list = rows ?? [];
    return {
      total: list.length,
      pending: list.filter((r) => r.status === "PENDING").length,
      approved: list.filter((r) => r.status === "APPROVED").length,
      rejected: list.filter((r) => r.status === "REJECTED").length,
      highRisk: list.filter((r) => r.status === "PENDING" && r.riskScore >= HIGH_RISK_THRESHOLD).length,
    };
  }, [rows]);

  const confirm = (reason: string) => {
    if (!pending) return;
    const { applicantIds, outcome, subject, onDone } = pending;
    submit.mutate(
      { applicantIds, decision: { outcome, reason } },
      {
        onSuccess: ({ succeeded, failed }) => {
          setPending(null);
          onDone?.();
          if (failed.length) toast.warning(`${OUTCOME_LABEL[outcome]}: ${succeeded.length} done, ${failed.length} failed`, { description: describeError(failed[0]?.error) });
          else toast.success(`${OUTCOME_LABEL[outcome]} submitted for ${subject}`);
        },
        onError: (error) => toast.error("Decision failed", { description: describeError(error) }),
      },
    );
  };

  return (
    <>
      <PageHeader
        title="KYC Review Queue"
        description="Identity verifications awaiting manual review. Decisions are audited and sent to the KYC vendor."
        actions={
          <Button variant="outline" size="xs" onClick={() => void queue.refetch()} disabled={queue.isFetching}>
            <RefreshCwIcon className={queue.isFetching ? "animate-spin" : undefined} /> Refresh
          </Button>
        }
      />
      <StatGrid>
        <StatCard label="Pending review" value={formatCount(stats.pending)} hint={`of ${formatCount(stats.total)} verifications`} tone="warning" />
        <StatCard label="High risk pending" value={formatCount(stats.highRisk)} hint={`risk ≥ ${HIGH_RISK_THRESHOLD}`} tone="destructive" />
        <StatCard label="Approved" value={formatCount(stats.approved)} tone="success" />
        <StatCard label="Rejected" value={formatCount(stats.rejected)} />
      </StatGrid>

      {queue.isPending ? (
        <TableSkeleton />
      ) : queue.isError ? (
        <QueryErrorPanel error={queue.error} onRetry={() => void queue.refetch()} title="Could not load the KYC queue" />
      ) : (
        <CoreDataTable
          columns={columns}
          data={queue.data}
          getRowId={(row: KycReviewRow) => row.id}
          enableRowSelection={(row) => row.original.status === "PENDING"}
          searchPlaceholder="Search applicants, notes…"
          emptyMessage="No verifications match."
          renderSelectionActions={({ selectedRows, clearSelection }) => (
            <>
              {(["approve", "reject"] as const).map((outcome) => (
                <Button
                  key={outcome}
                  size="xs"
                  variant={outcome === "reject" ? "destructive" : "default"}
                  onClick={() =>
                    setPending({ applicantIds: selectedRows.map((r) => r.id), outcome, subject: `${selectedRows.length} applicants`, onDone: clearSelection })
                  }
                >
                  {OUTCOME_LABEL[outcome]} selected
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
        title={pending ? `${OUTCOME_LABEL[pending.outcome]} ${pending.subject}?` : ""}
        description="The reason is recorded on the verification and in the audit trail."
        confirmLabel={pending ? OUTCOME_LABEL[pending.outcome] : "Confirm"}
        destructive={pending?.outcome === "reject"}
        pending={submit.isPending}
        onConfirm={confirm}
      />
    </>
  );
}
