/**
 * @platform/backend-common — the closed backend module shared by every service.
 *
 * Boundary rule: this package may depend on npm packages and @platform/shared-types
 * only. It must never import from services/* or apps/* (enforced by
 * `pnpm lint:boundaries`).
 */
export * from "./config.js";
export * from "./errors.js";
export * from "./util.js";
export * from "./domain/index.js";
export * from "./connectors/index.js";
export * from "./http/index.js";
export * from "./auth/index.js";
export * from "./audit/index.js";
