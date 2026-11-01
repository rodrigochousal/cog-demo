"use client";

import { isUserRole, type UserRole } from "@platform/shared-types";
import { useSyncExternalStore } from "react";

/**
 * The mock identity this browser acts as. Stored in a cookie (cookies ignore the port, so the
 * choice carries across every app on localhost) and sent to the BFF as the
 * `x-authenticated-user-role` header. Local development only; there is no real auth.
 */
const COOKIE = "mock-user-role";
export const ROLE_HEADER = "x-authenticated-user-role";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  compliance_analyst: "Compliance Analyst",
  finance_analyst: "Finance Analyst",
  engineer: "Engineer",
};

const listeners = new Set<() => void>();
let fallbackRole: UserRole = "admin";

/** Role used before the user picks one; each app sets its own domain analyst as the default. */
export function setDefaultMockRole(role: UserRole): void {
  fallbackRole = role;
}

export function getMockRole(): UserRole {
  if (typeof document === "undefined") return fallbackRole;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  const value = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  return value && isUserRole(value) ? value : fallbackRole;
}

export function setMockRole(role: UserRole): void {
  document.cookie = `${COOKIE}=${encodeURIComponent(role)}; path=/; max-age=31536000; samesite=lax`;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMockRole(): UserRole {
  return useSyncExternalStore(subscribe, getMockRole, () => fallbackRole);
}

/** Headers for `createApiClient({ getHeaders })`. */
export const mockIdentityHeaders = (): Record<string, string> => ({ [ROLE_HEADER]: getMockRole() });
