"use client";

import type { AccessCheckResponse } from "@platform/shared-types";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { bff, BffError } from "@/lib/api-client";
import { ROLE_LABELS, useMockRole } from "@/lib/mock-role";
import { surface } from "@/lib/surface";

type Result = { state: "pending" } | { state: "allowed" | "denied" | "error"; message: string };

const pathFor = (action: string) => `/api/access/${action}`;
const methodFor = (action: string) => (action === "read" ? "GET" : "POST");

/** Calls each RBAC-guarded probe on the paired BFF as the current mock role. */
export function AccessCheck() {
  const role = useMockRole();
  const [results, setResults] = useState<Partial<Record<string, Result>>>({});

  useEffect(() => {
    setResults({});
  }, [role]);

  async function run(action: string) {
    setResults((r) => ({ ...r, [action]: { state: "pending" } }));
    let result: Result;
    try {
      const body =
        methodFor(action) === "GET"
          ? await bff.get<AccessCheckResponse>(pathFor(action))
          : await bff.post<AccessCheckResponse>(pathFor(action), {});
      result = { state: "allowed", message: `Allowed as ${body.user.name}` };
    } catch (err) {
      const e = err instanceof BffError ? err : new BffError(0, "UNKNOWN", String(err));
      result =
        e.status === 403
          ? { state: "denied", message: `${e.status} Unauthorized: ${e.message}` }
          : { state: "error", message: `${e.status || ""} ${e.message}`.trim() };
    }
    setResults((r) => ({ ...r, [action]: result }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Access check</CardTitle>
        <CardDescription>
          Calls the <span className="font-mono">{surface.resource}</span> permissions on this app&apos;s BFF as{" "}
          <span className="font-medium text-foreground">{ROLE_LABELS[role]}</span>.
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => surface.actions.forEach((a) => void run(a))}>
            Run all
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="divide-y text-sm">
        {surface.actions.map((action) => {
          const result = results[action];
          return (
            <div key={action} className="flex items-center gap-4 py-2" data-testid={`access-${action}`}>
              <span className="w-20 font-medium">{action}</span>
              <span className="w-48 font-mono text-xs text-muted-foreground">
                {methodFor(action)} {pathFor(action)}
              </span>
              <Button variant="outline" size="sm" onClick={() => void run(action)}>
                Send
              </Button>
              {result?.state === "pending" ? (
                <span className="text-muted-foreground">Sending…</span>
              ) : result ? (
                <div className="flex items-center gap-2">
                  <Badge
                    variant={result.state === "allowed" ? "default" : "destructive"}
                    className={result.state === "allowed" ? "bg-emerald-600 text-white" : undefined}
                  >
                    {result.state === "allowed" ? "Allowed" : result.state === "denied" ? "Unauthorized" : "Error"}
                  </Badge>
                  <span className="text-muted-foreground">{result.message}</span>
                </div>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
