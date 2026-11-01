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
export * from "./storage/index.js";
export * from "./ledger/index.js";
export * from "./kyc/index.js";
export * from "./http/index.js";
