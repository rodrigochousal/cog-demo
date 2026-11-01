/**
 * Strict runtime data contracts. Each Zod schema is the single source of truth for its
 * TypeScript type (`z.infer`), so services validate and apps type against the same definition.
 */
export * from "./primitives.js";
export * from "./compliance.js";
export * from "./finance.js";
export * from "./engineering.js";
