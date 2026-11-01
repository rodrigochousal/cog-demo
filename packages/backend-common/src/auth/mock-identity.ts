import { isUserRole, USER_ROLES, type AuthenticatedUser, type UserRole } from "@platform/shared-types";
import type { RequestHandler } from "express";
import { HttpError } from "../http/errors.js";
import "./request.js";

/** Header a caller (or local tooling) sets to pick which mock identity a request runs as. */
export const MOCK_USER_ROLE_HEADER = "x-authenticated-user-role";

/** Role used when the header is absent. */
export const DEFAULT_MOCK_ROLE: UserRole = "finance_analyst";

const titleCase = (role: UserRole) =>
  role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** One fixed, deterministic mock profile per role. */
export const MOCK_USERS: Readonly<Record<UserRole, Readonly<AuthenticatedUser>>> = Object.freeze(
  Object.fromEntries(
    USER_ROLES.map((role) => [role, Object.freeze({ id: `mock-${role}`, name: `Mock ${titleCase(role)}`, role })]),
  ) as Record<UserRole, Readonly<AuthenticatedUser>>,
);

export interface MockIdentityOptions {
  /** Role to assume when the header is missing. Defaults to {@link DEFAULT_MOCK_ROLE}. */
  defaultRole?: UserRole;
  /** Receives the missing-header warning. Defaults to a one-line message on stdout. */
  warn?: (message: string) => void;
}

const warnToStdout = (message: string) => {
  process.stdout.write(`${new Date().toISOString()} WARN  [auth] ${message}\n`);
};

/**
 * Builds a "Mock Identity Injection" middleware: simulates enterprise authentication by reading
 * the role from the `x-authenticated-user-role` header and attaching the matching mock profile to
 * `req.user`.
 *
 * - Missing/blank header: logs a warning and falls back to `defaultRole`.
 * - Unrecognised role: rejects with HTTP 400 (shared error envelope) rather than guessing.
 *
 * LOCAL DEVELOPMENT ONLY — any caller can claim any role. Replace with real authentication
 * before a BFF is exposed beyond the local machine.
 */
export function createMockIdentityMiddleware(options: MockIdentityOptions = {}): RequestHandler {
  const defaultRole = options.defaultRole ?? DEFAULT_MOCK_ROLE;
  const warn = options.warn ?? warnToStdout;

  return (req, _res, next) => {
    const raw = req.get(MOCK_USER_ROLE_HEADER)?.trim().toLowerCase();
    let role: UserRole;
    if (!raw) {
      warn(
        `${req.method} ${req.originalUrl}: missing '${MOCK_USER_ROLE_HEADER}' header, defaulting to role '${defaultRole}'`,
      );
      role = defaultRole;
    } else if (isUserRole(raw)) {
      role = raw;
    } else {
      next(
        new HttpError(400, "BAD_REQUEST", `Unknown role in '${MOCK_USER_ROLE_HEADER}' header`, {
          allowedRoles: USER_ROLES,
        }),
      );
      return;
    }
    req.user = { ...MOCK_USERS[role] };
    next();
  };
}

/**
 * Default mock identity middleware (missing header -> `finance_analyst` + stdout warning).
 *
 * @example
 * app.use("/api", injectMockUser, createApiRouter());
 */
export const injectMockUser: RequestHandler = createMockIdentityMiddleware();
