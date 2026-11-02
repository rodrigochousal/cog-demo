"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ApiRequestError, SchemaMismatchError } from "../api/errors";

/** Client errors (4xx) and contract mismatches will not fix themselves; only retry network/5xx failures. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof SchemaMismatchError) return false;
  if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: shouldRetry },
      mutations: { retry: false },
    },
  });
}

/** TanStack Query root: one client per browser tab (and per SSR request). */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createAppQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
