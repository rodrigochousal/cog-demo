/**
 * The platform's generic (vendor-agnostic) domain types. Connectors map each vendor's edge
 * records to these; services work only with these and map them to the client-facing rows in
 * `@platform/shared-types`. Backend-only: apps never see them.
 */
export * from "./common.js";
export * from "./ledger.js";
export * from "./kyc.js";
export * from "./feature-flags.js";
