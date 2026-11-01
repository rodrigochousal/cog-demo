"use client";

import type { HealthResponse } from "@platform/shared-types";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBffQuery } from "@/lib/use-bff-query";
import { surface } from "@/lib/surface";

/** Verifies the app → BFF wiring by calling the paired service's /health endpoint. */
export function BffStatus() {
  const { data, error, loading, refresh } = useBffQuery<HealthResponse>("/health");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paired BFF</CardTitle>
        <CardDescription className="font-mono">{surface.bffUrl}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : undefined} />
            Check
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="text-sm">
        {error ? (
          <div className="flex items-center gap-2">
            <Badge variant="destructive">Unreachable</Badge>
            <span className="text-muted-foreground">{error.message}</span>
          </div>
        ) : data ? (
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-600 text-white">Connected</Badge>
            <span className="text-muted-foreground">
              {data.service} · up {data.uptimeSeconds}s
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">Checking…</span>
        )}
      </CardContent>
    </Card>
  );
}
