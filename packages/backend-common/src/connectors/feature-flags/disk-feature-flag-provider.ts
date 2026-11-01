import { CUSTOMER_TIERS } from "@platform/shared-types";
import type { CustomerTier, FeatureFlag } from "@platform/shared-types";
import { indexOrThrow, invalidInput, requireId } from "../errors.js";
import type { DiskConnectorOptions, IFeatureFlagProvider, InitializableConnector } from "../interfaces.js";
import { JsonCollection } from "../json-collection.js";
import {
  defineSchema,
  isArrayOf,
  isBoolean,
  isIntegerBetween,
  isIsoDate,
  isNonEmptyString,
  isOneOf,
  isString,
} from "../schema.js";
import { seedFeatureFlags } from "./seed.js";

const ENTITY = "Feature flag";

export const featureFlagSchema = defineSchema<FeatureFlag>({
  key: (v) => typeof v === "string" && /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/.test(v),
  name: isNonEmptyString,
  description: isString,
  enabled: isBoolean,
  targetTiers: isArrayOf(isOneOf(CUSTOMER_TIERS)),
  rolloutPercentage: isIntegerBetween(0, 100),
  environment: isOneOf(["development", "staging", "production"]),
  ownerTeam: isNonEmptyString,
  tags: isArrayOf(isString),
  createdAt: isIsoDate,
  updatedAt: isIsoDate,
});

/** Validates and de-duplicates tiers, returning them in canonical CUSTOMER_TIERS order. */
function normalizeTiers(tiers: readonly CustomerTier[]): CustomerTier[] {
  if (!Array.isArray(tiers)) throw invalidInput("Targeting tiers must be an array");
  const unknown = tiers.filter((tier) => !(CUSTOMER_TIERS as readonly string[]).includes(tier));
  if (unknown.length > 0) {
    throw invalidInput(`Unknown customer tier(s): ${unknown.join(", ")}. Expected any of ${CUSTOMER_TIERS.join(", ")}`, {
      unknown,
    });
  }
  return CUSTOMER_TIERS.filter((tier) => tiers.includes(tier));
}

/** IFeatureFlagProvider over `<data dir>/feature-flags.json`. Stands in for LaunchDarkly / Unleash. */
export class DiskFeatureFlagProvider implements IFeatureFlagProvider, InitializableConnector {
  readonly #collection: JsonCollection<FeatureFlag>;
  readonly #now: () => Date;

  constructor({ filePath, mode, latency, now = () => new Date() }: DiskConnectorOptions) {
    this.#now = now;
    this.#collection = new JsonCollection({
      label: "feature-flags",
      filePath,
      mode,
      latency,
      schema: featureFlagSchema,
      seed: seedFeatureFlags,
    });
  }

  async initialize(): Promise<void> {
    return this.#collection.initialize();
  }

  async getFlags(): Promise<FeatureFlag[]> {
    return this.#collection.readAll();
  }

  async toggleFlag(key: string, enabledState: boolean): Promise<FeatureFlag> {
    requireId(ENTITY, key);
    if (typeof enabledState !== "boolean") throw invalidInput("enabledState must be a boolean");
    return this.#update(key, (flag) => {
      flag.enabled = enabledState;
    });
  }

  async updateTargeting(key: string, tiers: readonly CustomerTier[]): Promise<FeatureFlag> {
    requireId(ENTITY, key);
    const targetTiers = normalizeTiers(tiers);
    return this.#update(key, (flag) => {
      flag.targetTiers = targetTiers;
    });
  }

  #update(key: string, apply: (flag: FeatureFlag) => void): Promise<FeatureFlag> {
    return this.#collection.mutate((flags) => {
      const flag = flags[indexOrThrow(flags, ENTITY, key, (f) => f.key)] as FeatureFlag;
      apply(flag);
      flag.updatedAt = this.#now().toISOString();
      return structuredClone(flag);
    });
  }
}
