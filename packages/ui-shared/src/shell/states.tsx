import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { describeError } from "../api/errors";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";

/** Inline error panel for a failed query, with retry. */
export function QueryErrorPanel({ error, onRetry, title = "Could not load data" }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
      <div className="flex-1">
        <div className="font-medium text-destructive">{title}</div>
        <div className="text-muted-foreground">{describeError(error)}</div>
      </div>
      {onRetry ? (
        <Button size="xs" variant="outline" onClick={onRetry}>
          <RefreshCwIcon /> Retry
        </Button>
      ) : null}
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-1.5 rounded-md border p-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}
