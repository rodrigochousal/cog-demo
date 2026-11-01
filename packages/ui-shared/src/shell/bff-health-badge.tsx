"use client";

import { healthResponseSchema } from "@platform/shared-types";
import { useQuery } from "@tanstack/react-query";
import type { ApiClient } from "../api/api-client";
import { cn } from "../lib/utils";

/** Header indicator polling the paired BFF's `/health` through the schema-validating client. */
export function BffHealthBadge({ client }: { client: ApiClient }) {
  const health = useQuery({
    queryKey: ["bff-health", client.baseUrl],
    queryFn: ({ signal }) => client.getParsed("/health", healthResponseSchema, { signal }),
    refetchInterval: 10_000,
    retry: false,
  });
  const state = health.isPending ? "checking" : health.isSuccess ? "online" : "offline";
  return (
    <div
      className="flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
      title={health.isSuccess ? `${health.data.service} up ${Math.round(health.data.uptimeSeconds)}s` : client.baseUrl}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          state === "online" && "bg-success",
          state === "offline" && "bg-destructive",
          state === "checking" && "bg-muted-foreground",
        )}
      />
      {client.baseUrl.replace(/^https?:\/\//, "")} · {state}
    </div>
  );
}
