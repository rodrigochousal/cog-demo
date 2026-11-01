import { z } from "zod";
import { CUSTOMER_TIERS, FLAG_ENVIRONMENTS, FLAG_KEY_PATTERN, type FeatureFlag } from "../../../domain/index.js";
import type { VendorAdapter } from "../../vendor-collection.js";
import { seedFeatureFlags } from "../seed.js";

/**
 * Edge: Unleash. Modelled on an Unleash feature toggle: `name` is the key, the owning team is
 * the `project`, tags are typed objects, and tier targeting is a `flexibleRollout` strategy
 * whose rollout percentage is a string parameter.
 */

export const unleashFeatureSchema = z.object({
  name: z.string().regex(FLAG_KEY_PATTERN),
  displayName: z.string().min(1),
  description: z.string(),
  type: z.literal("release"),
  project: z.string().min(1),
  tags: z.array(z.object({ type: z.literal("simple"), value: z.string() })),
  createdAt: z.iso.datetime(),
  /** The mock serves each feature from exactly one environment. */
  environments: z.tuple([
    z.object({
      name: z.enum(FLAG_ENVIRONMENTS),
      enabled: z.boolean(),
      lastChangedAt: z.iso.datetime(),
      lastChangedBy: z.string().min(1),
      strategies: z.tuple([
        z.object({
          name: z.literal("flexibleRollout"),
          parameters: z.object({ rollout: z.string().regex(/^(?:100|[1-9]?\d)$/), stickiness: z.literal("default") }),
          constraints: z.tuple([
            z.object({ contextName: z.literal("tier"), operator: z.literal("IN"), values: z.array(z.enum(CUSTOMER_TIERS)) }),
          ]),
        }),
      ]),
    }),
  ]),
});

export type UnleashFeature = z.infer<typeof unleashFeatureSchema>;

export const unleashFeatures: VendorAdapter<UnleashFeature, FeatureFlag> = {
  vendor: "unleash",
  fileName: "unleash-features.json",
  schema: unleashFeatureSchema,
  seed: () =>
    seedFeatureFlags()
      .filter((flag) => flag.provider === "unleash")
      .map((flag) => unleashFeatures.toEdge(flag)),

  toDomain(edge) {
    const [environment] = edge.environments;
    const [strategy] = environment.strategies;
    return {
      key: edge.name,
      provider: "unleash",
      name: edge.displayName,
      description: edge.description,
      enabled: environment.enabled,
      targetTiers: [...strategy.constraints[0].values],
      rolloutPercentage: Number(strategy.parameters.rollout),
      environment: environment.name,
      ownerTeam: edge.project,
      tags: edge.tags.map((tag) => tag.value),
      createdAt: edge.createdAt,
      updatedAt: environment.lastChangedAt,
      updatedBy: environment.lastChangedBy,
    };
  },

  toEdge(flag) {
    return {
      name: flag.key,
      displayName: flag.name,
      description: flag.description,
      type: "release",
      project: flag.ownerTeam,
      tags: flag.tags.map((value) => ({ type: "simple", value })),
      createdAt: flag.createdAt,
      environments: [
        {
          name: flag.environment,
          enabled: flag.enabled,
          lastChangedAt: flag.updatedAt,
          lastChangedBy: flag.updatedBy,
          strategies: [
            {
              name: "flexibleRollout",
              parameters: { rollout: String(flag.rolloutPercentage), stickiness: "default" },
              constraints: [{ contextName: "tier", operator: "IN", values: [...flag.targetTiers] }],
            },
          ],
        },
      ],
    };
  },
};
