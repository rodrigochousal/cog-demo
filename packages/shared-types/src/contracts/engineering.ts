import { z } from "zod";
import { isoDateTimeSchema, recordIdSchema, requiredText, uniqueArray } from "./primitives.js";

/** API contract for a feature flag on the engineering console (apps/engineering ↔ services/engineering). */

const MAX_FLAG_KEY_LENGTH = 64;

/** Lower snake_case identifier, e.g. `instant_payouts` or `v2_checkout`. */
export const featureFlagKeySchema = z
  .string()
  .trim()
  .min(1, { error: "Must not be empty", abort: true })
  .max(MAX_FLAG_KEY_LENGTH, `Must be at most ${MAX_FLAG_KEY_LENGTH} characters`)
  .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/, "Must be snake_case, e.g. instant_payouts");

export const featureFlagSchema = z.object({
  id: recordIdSchema,
  key: featureFlagKeySchema,
  description: requiredText(1000),
  enabled: z.boolean(),
  /** Customer tiers the flag is served to while enabled; must be distinct. Empty = nobody. */
  targetedTiers: uniqueArray(requiredText(64), "tier"),
  updatedBy: requiredText(128),
  updatedAt: isoDateTimeSchema,
});

/** A validated feature flag (schema output: trimmed). Named `…Record` to avoid clashing with the provider's `FeatureFlag`. */
export type FeatureFlagRecord = z.infer<typeof featureFlagSchema>;
/** What a client may send before parsing. */
export type FeatureFlagRecordInput = z.input<typeof featureFlagSchema>;
