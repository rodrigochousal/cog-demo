/**
 * The only way this app reaches a backend: HTTP to its dedicated BFF.
 * No database clients, no third-party SDKs, no other services.
 */
import { isPermissionDeniedBody, type ApiErrorBody } from "@platform/shared-types";
import { getMockRole, ROLE_HEADER } from "./mock-role";
import { surface } from "./surface";

export class BffError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "BffError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${surface.bffUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: { "content-type": "application/json", [ROLE_HEADER]: getMockRole(), ...init.headers },
    });
  } catch {
    throw new BffError(0, "NETWORK_ERROR", `Cannot reach the BFF at ${surface.bffUrl}. Is it running?`);
  }
  if (!res.ok) {
    const raw: unknown = await res.json().catch(() => null);
    if (isPermissionDeniedBody(raw)) throw new BffError(res.status, "FORBIDDEN", raw.reason);
    const body = raw as ApiErrorBody | null;
    throw new BffError(res.status, body?.error.code ?? "UNKNOWN", body?.error.message ?? res.statusText, body?.error.details);
  }
  return (await res.json()) as T;
}

export const bff = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
};
