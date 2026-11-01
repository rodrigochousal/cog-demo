import path from "node:path";
import { DiskFeatureFlagProvider } from "./feature-flags/disk-feature-flag-provider.js";
import type { IFeatureFlagProvider, IKycVendorClient, ILedgerDatabase, InitializableConnector } from "./interfaces.js";
import { DiskKycVendorClient } from "./kyc/disk-kyc-vendor-client.js";
import { parseLatencySetting, type LatencySetting } from "./latency.js";
import { DiskLedgerDatabase } from "./ledger/disk-ledger-database.js";
import { DEFAULT_CONNECTOR_DATA_DIR } from "./paths.js";

/**
 * Connector hub: the only place that knows which driver backs each connector
 * and where its data lives. Services call `getLedgerDatabase()` etc. and only
 * ever see the interfaces, so swapping the disk drivers for Postgres / vendor
 * REST clients is a change here, not in any endpoint handler.
 */

export type ConnectorName = "ledger" | "kyc" | "featureFlags";

export interface ConnectorSettings {
  /** Directory holding the JSON files. Env: PLATFORM_CONNECTOR_DATA_DIR. Default: packages/backend-common/data. */
  dataDir: string;
  /** Simulated network latency. Env: PLATFORM_SIMULATED_LATENCY_MS ("50-150" default, "off" to disable). */
  latency: LatencySetting;
}

interface ConnectorMap {
  ledger: ILedgerDatabase;
  kyc: IKycVendorClient;
  featureFlags: IFeatureFlagProvider;
}

type Instance<N extends ConnectorName> = ConnectorMap[N] & InitializableConnector;

const DATA_FILES: Record<ConnectorName, string> = {
  ledger: "ledger.json",
  kyc: "kyc-vendor.json",
  featureFlags: "feature-flags.json",
};

let overrides: Partial<ConnectorSettings> = {};
let instances: { [N in ConnectorName]?: Instance<N> } = {};

export function resolveConnectorSettings(): ConnectorSettings {
  const envDir = process.env.PLATFORM_CONNECTOR_DATA_DIR;
  return {
    dataDir: path.resolve(overrides.dataDir ?? (envDir ? envDir : DEFAULT_CONNECTOR_DATA_DIR)),
    latency: overrides.latency ?? parseLatencySetting(process.env.PLATFORM_SIMULATED_LATENCY_MS),
  };
}

/**
 * Overrides settings (e.g. a temp data dir and no latency in tests). Must run
 * before any connector is resolved, so every caller sees one consistent driver.
 */
export function configureConnectors(settings: Partial<ConnectorSettings>): void {
  if (Object.keys(instances).length > 0) {
    throw new Error("configureConnectors() must be called before any connector is resolved; call resetConnectors() first");
  }
  overrides = { ...overrides, ...settings };
}

/** Drops cached connectors and overrides. Intended for tests. */
export function resetConnectors(): void {
  overrides = {};
  instances = {};
}

function resolve<N extends ConnectorName>(name: N, create: (filePath: string, latency: LatencySetting) => Instance<N>): Instance<N> {
  const existing = instances[name];
  if (existing) return existing;
  const { dataDir, latency } = resolveConnectorSettings();
  const created = create(path.join(dataDir, DATA_FILES[name]), latency);
  instances = { ...instances, [name]: created };
  return created;
}

export function getLedgerDatabase(): ILedgerDatabase {
  return resolve("ledger", (filePath, latency) => new DiskLedgerDatabase({ filePath, latency }));
}

export function getKycVendorClient(): IKycVendorClient {
  return resolve("kyc", (filePath, latency) => new DiskKycVendorClient({ filePath, latency }));
}

export function getFeatureFlagProvider(): IFeatureFlagProvider {
  return resolve("featureFlags", (filePath, latency) => new DiskFeatureFlagProvider({ filePath, latency }));
}

const RESOLVERS: { [N in ConnectorName]: () => ConnectorMap[N] } = {
  ledger: getLedgerDatabase,
  kyc: getKycVendorClient,
  featureFlags: getFeatureFlagProvider,
};

/**
 * Prepares the named connectors' storage (creating and seeding data files if
 * missing). Services await this at boot so the first request is not the one
 * that pays for seeding.
 */
export async function initializeConnectors(names: readonly ConnectorName[]): Promise<void> {
  await Promise.all(
    names.map(async (name) => {
      RESOLVERS[name]();
      await instances[name]?.initialize();
    }),
  );
}
