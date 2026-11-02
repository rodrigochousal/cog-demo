import { KYC_REVIEW_STATUSES, type KycDecisionOutcomeValue, type KycReviewRow, type KycReviewStatus } from "@platform/shared-types";
import { ExternalLinkIcon } from "lucide-react";
import { Badge, Button, createCoreColumnHelper } from "ui-shared";
import { cn } from "ui-shared";

const helper = createCoreColumnHelper<KycReviewRow>();

const STATUS_VARIANT: Record<KycReviewStatus, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "outline",
  APPROVED: "secondary",
  REJECTED: "destructive",
};

export const HIGH_RISK_THRESHOLD = 70;

export function RiskScore({ score }: { score: number }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", score >= HIGH_RISK_THRESHOLD ? "bg-destructive" : score >= 40 ? "bg-warning" : "bg-success")}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="w-6 text-right font-medium tabular-nums">{score}</span>
    </div>
  );
}

export function buildKycColumns(onDecide: (row: KycReviewRow, outcome: KycDecisionOutcomeValue) => void) {
  return helper.columns([
    helper.accessor("id", {
      header: "Applicant ID",
      cell: (info) => <span className="font-mono text-[11px] text-muted-foreground">{info.getValue()}</span>,
    }),
    helper.accessor("applicantName", { header: "Applicant", cell: (info) => <span className="font-medium">{info.getValue()}</span> }),
    helper.accessor("status", {
      header: "Status",
      filterFn: "equalsString",
      meta: { label: "Status", filter: { kind: "select", options: KYC_REVIEW_STATUSES.map((s) => ({ value: s, label: s })) } },
      cell: (info) => <Badge variant={STATUS_VARIANT[info.getValue()]}>{info.getValue()}</Badge>,
    }),
    helper.accessor("riskScore", {
      header: "Risk",
      sortFn: "basic",
      enableGlobalFilter: false,
      meta: { align: "end" },
      cell: (info) => <RiskScore score={info.getValue()} />,
    }),
    helper.accessor("assignedTo", {
      header: "Assignee",
      filterFn: "includesString",
      meta: { label: "Assignee", filter: { kind: "text", placeholder: "Assignee…" } },
    }),
    helper.accessor("notes", {
      header: "Notes",
      enableSorting: false,
      cell: (info) => (
        <span className="block max-w-72 truncate text-muted-foreground" title={info.getValue()}>
          {info.getValue() || "—"}
        </span>
      ),
    }),
    helper.accessor("documentUrl", {
      header: "Document",
      enableSorting: false,
      enableGlobalFilter: false,
      cell: (info) => (
        <a href={info.getValue()} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
          Open <ExternalLinkIcon className="size-3" />
        </a>
      ),
    }),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) =>
        row.original.status === "PENDING" ? (
          <div className="flex justify-end gap-1">
            <Button size="xs" onClick={() => onDecide(row.original, "approve")}>
              Approve
            </Button>
            <Button size="xs" variant="outline" onClick={() => onDecide(row.original, "escalate")}>
              Escalate
            </Button>
            <Button size="xs" variant="destructive" onClick={() => onDecide(row.original, "reject")}>
              Reject
            </Button>
          </div>
        ) : (
          <div className="text-right text-[11px] text-muted-foreground">Decided</div>
        ),
    }),
  ]);
}
