import type { FeatureFlagRow } from "@platform/shared-types";
import { RefreshCwIcon } from "lucide-react";
import { useMemo } from "react";
import { Button, CoreDataTable, describeError, formatCount, PageHeader, QueryErrorPanel, StatCard, StatGrid, TableSkeleton, toast } from "ui-shared";
import { useFeatureFlags } from "../api/use-feature-flags";
import { useToggleFeatureFlags } from "../api/use-toggle-feature-flags";
import { flagColumns } from "./columns";

/** Feature-Flag Panel: inspect rollout targeting and flip flags (single or bulk). */
export function FeatureFlagsPanel() {
  const flags = useFeatureFlags();
  const bulkToggle = useToggleFeatureFlags();

  const rows = flags.data;
  const stats = useMemo(() => {
    const list = rows ?? [];
    return {
      total: list.length,
      enabled: list.filter((f) => f.enabled).length,
      disabled: list.filter((f) => !f.enabled).length,
      untargeted: list.filter((f) => f.enabled && f.targetedTiers.length === 0).length,
    };
  }, [rows]);

  return (
    <>
      <PageHeader
        title="Feature-Flag Panel"
        description="Flags served across LaunchDarkly and Unleash. Every change is attributed to your role and audited."
        actions={
          <Button variant="outline" size="xs" onClick={() => void flags.refetch()} disabled={flags.isFetching}>
            <RefreshCwIcon className={flags.isFetching ? "animate-spin" : undefined} /> Refresh
          </Button>
        }
      />
      <StatGrid>
        <StatCard label="Flags" value={formatCount(stats.total)} />
        <StatCard label="Enabled" value={formatCount(stats.enabled)} tone="success" />
        <StatCard label="Disabled" value={formatCount(stats.disabled)} />
        <StatCard label="On but untargeted" value={formatCount(stats.untargeted)} hint="enabled with no tiers" tone="warning" />
      </StatGrid>

      {flags.isPending ? (
        <TableSkeleton />
      ) : flags.isError ? (
        <QueryErrorPanel error={flags.error} onRetry={() => void flags.refetch()} title="Could not load feature flags" />
      ) : (
        <CoreDataTable
          columns={flagColumns}
          data={flags.data}
          getRowId={(row: FeatureFlagRow) => row.id}
          enableRowSelection
          searchPlaceholder="Search flags…"
          emptyMessage="No flags match."
          pageSize={25}
          renderSelectionActions={({ selectedRows, clearSelection }) => (
            <>
              {[true, false].map((enabled) => (
                <Button
                  key={String(enabled)}
                  size="xs"
                  variant={enabled ? "default" : "outline"}
                  disabled={bulkToggle.isPending}
                  onClick={() =>
                    bulkToggle.mutate(
                      { flagIds: selectedRows.map((r) => r.id), enabled },
                      {
                        onSuccess: ({ succeeded, failed }) => {
                          clearSelection();
                          if (failed.length) toast.warning(`${succeeded.length} updated, ${failed.length} failed`, { description: describeError(failed[0]?.error) });
                          else toast.success(`${succeeded.length} flag(s) ${enabled ? "enabled" : "disabled"}`);
                        },
                        onError: (error) => toast.error("Bulk toggle failed", { description: describeError(error) }),
                      },
                    )
                  }
                >
                  {enabled ? "Enable" : "Disable"} selected
                </Button>
              ))}
            </>
          )}
        />
      )}
    </>
  );
}
