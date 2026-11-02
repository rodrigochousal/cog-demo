import type { FeatureFlagRow } from "@platform/shared-types";
import { Badge, createCoreColumnHelper, formatDateTime } from "ui-shared";
import { FlagSwitch } from "./flag-switch";

const helper = createCoreColumnHelper<FeatureFlagRow>();

export const flagColumns = helper.columns([
  helper.accessor("key", {
    header: "Flag",
    cell: (info) => <span className="font-mono text-[11px] font-medium">{info.getValue()}</span>,
  }),
  helper.accessor("description", {
    header: "Description",
    enableSorting: false,
    cell: (info) => (
      <span className="block max-w-96 truncate text-muted-foreground" title={info.getValue()}>
        {info.getValue()}
      </span>
    ),
  }),
  helper.accessor((row) => (row.enabled ? "on" : "off"), {
    id: "state",
    header: "State",
    filterFn: "equalsString",
    enableGlobalFilter: false,
    meta: { label: "State", filter: { kind: "select", options: [{ value: "on", label: "On" }, { value: "off", label: "Off" }] } },
    cell: (info) => <FlagSwitch flag={info.row.original} />,
  }),
  helper.accessor((row) => row.targetedTiers.join(" "), {
    id: "tiers",
    header: "Targeted tiers",
    filterFn: "includesString",
    enableSorting: false,
    meta: { label: "Tier", filter: { kind: "select", options: ["free", "starter", "growth", "enterprise", "internal"].map((t) => ({ value: t, label: t })) } },
    cell: (info) =>
      info.row.original.targetedTiers.length ? (
        <div className="flex flex-wrap gap-0.5">
          {info.row.original.targetedTiers.map((tier) => (
            <Badge key={tier} variant="outline" className="px-1 py-0 text-[10px]">
              {tier}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="text-muted-foreground">nobody</span>
      ),
  }),
  helper.accessor("updatedBy", {
    header: "Updated by",
    filterFn: "includesString",
    meta: { label: "Editor", filter: { kind: "text", placeholder: "Editor…" } },
    cell: (info) => <span className="font-mono text-[11px]">{info.getValue()}</span>,
  }),
  helper.accessor("updatedAt", {
    header: "Updated",
    sortFn: "text",
    enableGlobalFilter: false,
    cell: (info) => <span className="text-muted-foreground tabular-nums">{formatDateTime(info.getValue())}</span>,
  }),
]);
