"use client";

import { useCallback, useEffect, useState } from "react";
import { bff, BffError } from "./api-client";

/** Minimal data hook for GET endpoints on this app's BFF. */
export function useBffQuery<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<BffError | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await bff.get<T>(path));
      setError(null);
    } catch (err) {
      setError(err instanceof BffError ? err : new BffError(0, "UNKNOWN", String(err)));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, error, loading, refresh };
}
