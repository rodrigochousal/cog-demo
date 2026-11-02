import { ApiRequestError } from "../api/errors";

export interface BatchResult<TResult> {
  succeeded: TResult[];
  failed: { id: string; error: unknown }[];
}

/** Run one request per id concurrently and report per-id outcomes (bulk table actions). */
export async function runBatch<TResult>(ids: readonly string[], run: (id: string) => Promise<TResult>): Promise<BatchResult<TResult>> {
  const results = await Promise.allSettled(ids.map(run));
  const out: BatchResult<TResult> = { succeeded: [], failed: [] };
  results.forEach((result, i) => {
    if (result.status === "fulfilled") out.succeeded.push(result.value);
    else out.failed.push({ id: ids[i] ?? "", error: result.reason });
  });
  if (out.succeeded.length === 0 && out.failed.length > 0) {
    const first = out.failed[0]?.error;
    throw first instanceof Error ? first : new ApiRequestError(0, "UNKNOWN", String(first));
  }
  return out;
}
