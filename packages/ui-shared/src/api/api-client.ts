import type { ApiErrorBody, ApiErrorCode } from "@platform/shared-types";
import type { z } from "zod";
import { ApiRequestError, SchemaMismatchError } from "./errors";

/**
 * The only place any app calls `fetch` (enforced by `pnpm lint:boundaries`). Each app builds one
 * client bound to its paired BFF; every payload is parsed against its Zod contract before a
 * component sees it, so an out-of-contract response fails loudly instead of rendering garbage.
 */

export interface ApiClientConfig {
  /** Origin of the app's one BFF, e.g. `http://localhost:4000`. */
  baseUrl: string;
  /** Headers added to every request (e.g. the mock identity header), read per request. */
  getHeaders?: () => Record<string, string>;
}

export type MutationMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiClient {
  readonly baseUrl: string;
  /** GET `url` and return the payload parsed by `schema`; throws `SchemaMismatchError` when it does not match. */
  getParsed<S extends z.ZodType>(url: string, schema: S, init?: { signal?: AbortSignal }): Promise<z.output<S>>;
  /** Send `body` with `method` and return the response payload parsed by `schema`. */
  sendParsed<S extends z.ZodType>(method: MutationMethod, url: string, body: unknown, schema: S): Promise<z.output<S>>;
  postParsed<S extends z.ZodType>(url: string, body: unknown, schema: S): Promise<z.output<S>>;
}

const KNOWN_CODES: readonly ApiErrorCode[] = [
  "BAD_REQUEST",
  "VALIDATION_FAILED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "BUSINESS_RULE_VIOLATION",
  "INTERNAL_ERROR",
];

function isErrorEnvelope(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error: unknown = value.error;
  return typeof error === "object" && error !== null && "message" in error && typeof error.message === "string";
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function createApiClient({ baseUrl, getHeaders }: ApiClientConfig): ApiClient {
  async function request<S extends z.ZodType>(
    method: "GET" | MutationMethod,
    url: string,
    schema: S,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<z.output<S>> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${url}`, {
        method,
        signal,
        cache: "no-store",
        headers: { accept: "application/json", "content-type": "application/json", ...getHeaders?.() },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      throw new ApiRequestError(0, "NETWORK_ERROR", `Cannot reach the BFF at ${baseUrl}. Is it running?`);
    }

    const payload = await readJson(res);
    if (!res.ok) {
      if (isErrorEnvelope(payload)) {
        const code = KNOWN_CODES.find((c) => c === payload.error.code) ?? "UNKNOWN";
        throw new ApiRequestError(res.status, code, payload.error.message, payload.error.details);
      }
      throw new ApiRequestError(res.status, "UNKNOWN", res.statusText || `HTTP ${res.status}`);
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new SchemaMismatchError(method, url, parsed.error);
    return parsed.data;
  }

  return {
    baseUrl,
    getParsed: (url, schema, init) => request("GET", url, schema, undefined, init?.signal),
    sendParsed: (method, url, body, schema) => request(method, url, schema, body),
    postParsed: (url, body, schema) => request("POST", url, schema, body),
  };
}
