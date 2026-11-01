import { CUSTOMER_TIERS } from "../../domain/index.js";
import type { CustomerTier, FeatureFlag } from "../../domain/index.js";
import { invalidInput, requireId } from "../errors.js";
import type { DiskConnectorOptions, IFeatureFlagProvider, InitializableConnector } from "../interfaces.js";
import { ownerOf, readAllFrom, VendorCollection, type DomainCollection, type VendorAdapter } from "../vendor-collection.js";
import { launchDarklyFlags } from "./vendors/launchdarkly.js";
import { unleashFeatures } from "./vendors/unleash.js";

const ENTITY = "Feature flag";

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

function requireActor(actor: string): string {
  if (typeof actor !== "string" || actor.trim() === "") throw invalidInput("actor is required");
  return actor.trim();
}

/**
 * IFeatureFlagProvider over one mock API per provider (`<data dir>/launchdarkly-flags.json`,
 * `unleash-features.json`). Each provider's adapter maps its own flag shape to the generic
 * `FeatureFlag`; nothing outside this connector sees a provider's shape.
 */
export class DiskFeatureFlagProvider implements IFeatureFlagProvider, InitializableConnector {
  readonly #collections: DomainCollection<FeatureFlag>[];
  readonly #now: () => Date;

  constructor({ dataDir, mode, latency, now = () => new Date() }: DiskConnectorOptions) {
    this.#now = now;
    const open = <E>(adapter: VendorAdapter<E, FeatureFlag>) =>
      new VendorCollection(adapter, { dataDir, mode, latency }, { connector: "feature-flags", entity: ENTITY, idOf: (f) => f.key });
    this.#collections = [open(launchDarklyFlags), open(unleashFeatures)];
  }

  async initialize(): Promise<void> {
    await Promise.all(this.#collections.map((collection) => collection.initialize()));
  }

  async getFlags(): Promise<FeatureFlag[]> {
    return (await readAllFrom(this.#collections)).sort((a, b) => a.key.localeCompare(b.key));
  }

  async toggleFlag(key: string, enabledState: boolean, actor: string): Promise<FeatureFlag> {
    requireId(ENTITY, key);
    if (typeof enabledState !== "boolean") throw invalidInput("enabledState must be a boolean");
    return this.#update(key, actor, (flag) => ({ ...flag, enabled: enabledState }));
  }

  async updateTargeting(key: string, tiers: readonly CustomerTier[], actor: string): Promise<FeatureFlag> {
    requireId(ENTITY, key);
    const targetTiers = normalizeTiers(tiers);
    return this.#update(key, actor, (flag) => ({ ...flag, targetTiers }));
  }

  async #update(key: string, actor: string, apply: (flag: FeatureFlag) => FeatureFlag): Promise<FeatureFlag> {
    const updatedBy = requireActor(actor);
    const owner = await ownerOf(this.#collections, ENTITY, key, (f) => f.key);
    return owner.update(key, (flag) => ({ ...apply(flag), updatedAt: this.#now().toISOString(), updatedBy }));
  }
}
