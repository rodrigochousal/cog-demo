import { z } from "zod";
import { CUSTOMER_TIERS, FLAG_ENVIRONMENTS, FLAG_KEY_PATTERN, type FeatureFlag, type FlagEnvironment } from "../../../domain/index.js";
import { fromEpochMs, toEpochMs, type VendorAdapter } from "../../vendor-collection.js";
import { seedFeatureFlags } from "../seed.js";

/**
 * Edge: LaunchDarkly. Modelled on a LaunchDarkly boolean flag: per-environment state keyed by
 * environment, `_`-prefixed metadata, epoch-millisecond dates, and tier targeting as one rule
 * whose rollout weight is in thousandths of a percent (100000 = 100%).
 */

const WEIGHT_PER_PERCENT = 1000;
const epochMs = z.number().int().nonnegative();

const environmentSchema = z.object({
  on: z.boolean(),
  _lastModified: epochMs,
  _lastModifiedBy: z.string().min(1),
  rules: z.tuple([
    z.object({
      clauses: z.tuple([
        z.object({ attribute: z.literal("tier"), op: z.literal("in"), values: z.array(z.enum(CUSTOMER_TIERS)) }),
      ]),
      rollout: z.object({ weight: z.number().int().min(0).max(100 * WEIGHT_PER_PERCENT).multipleOf(WEIGHT_PER_PERCENT) }),
    }),
  ]),
});

export const launchDarklyFlagSchema = z.object({
  key: z.string().regex(FLAG_KEY_PATTERN),
  name: z.string().min(1),
  description: z.string(),
  kind: z.literal("boolean"),
  tags: z.array(z.string()),
  creationDate: epochMs,
  _maintainerTeam: z.object({ key: z.string().min(1) }),
  /** The mock serves each flag from exactly one environment. */
  environments: z.partialRecord(z.enum(FLAG_ENVIRONMENTS), environmentSchema),
});

export type LaunchDarklyFlag = z.infer<typeof launchDarklyFlagSchema>;

const isFlagEnvironment = (value: string): value is FlagEnvironment => (FLAG_ENVIRONMENTS as readonly string[]).includes(value);

export const launchDarklyFlags: VendorAdapter<LaunchDarklyFlag, FeatureFlag> = {
  vendor: "launchdarkly",
  fileName: "launchdarkly-flags.json",
  schema: launchDarklyFlagSchema,
  seed: () =>
    seedFeatureFlags()
      .filter((flag) => flag.provider === "launchdarkly")
      .map((flag) => launchDarklyFlags.toEdge(flag)),

  toDomain(edge) {
    const environments = Object.entries(edge.environments);
    const [entry] = environments;
    if (environments.length !== 1 || !entry) throw new Error(`flag ${edge.key} must be served from exactly one environment`);
    const [environment, state] = entry;
    if (!isFlagEnvironment(environment) || !state) throw new Error(`flag ${edge.key} has an unknown environment '${environment}'`);
    const [rule] = state.rules;
    return {
      key: edge.key,
      provider: "launchdarkly",
      name: edge.name,
      description: edge.description,
      enabled: state.on,
      targetTiers: [...rule.clauses[0].values],
      rolloutPercentage: rule.rollout.weight / WEIGHT_PER_PERCENT,
      environment,
      ownerTeam: edge._maintainerTeam.key,
      tags: [...edge.tags],
      createdAt: fromEpochMs(edge.creationDate),
      updatedAt: fromEpochMs(state._lastModified),
      updatedBy: state._lastModifiedBy,
    };
  },

  toEdge(flag) {
    return {
      key: flag.key,
      name: flag.name,
      description: flag.description,
      kind: "boolean",
      tags: [...flag.tags],
      creationDate: toEpochMs(flag.createdAt),
      _maintainerTeam: { key: flag.ownerTeam },
      environments: {
        [flag.environment]: {
          on: flag.enabled,
          _lastModified: toEpochMs(flag.updatedAt),
          _lastModifiedBy: flag.updatedBy,
          rules: [
            {
              clauses: [{ attribute: "tier", op: "in", values: [...flag.targetTiers] }],
              rollout: { weight: flag.rolloutPercentage * WEIGHT_PER_PERCENT },
            },
          ],
        },
      },
    };
  },
};
