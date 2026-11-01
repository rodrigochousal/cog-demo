/**
 * Strict runtime data contracts: the client-only row types each BFF returns to its app.
 * Each Zod schema is the single source of truth for its TypeScript type (`z.infer`), so
 * services validate and apps type against the same definition. Backend domain and vendor
 * types never appear here.
 */
export * from "./primitives.js";
export * from "./compliance.js";
export * from "./finance.js";
export * from "./engineering.js";
export * from "./api.js";
