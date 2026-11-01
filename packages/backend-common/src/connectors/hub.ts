import path from "node:path";
import { resolveDataDir, resolveStorageMode, type StorageMode } from "../config.js";
import { DiskFeatureFlagProvider } from "./feature-flags/disk-feature-flag-provider.js";
import type { DiskConnectorOptions, IFeatureFlagProvider, IKycVendorClient, ILedgerDatabase, InitializableConnector } from "./interfaces.js";
import { DiskKycVendorClient } from "./kyc/disk-kyc-vendor-client.js";
import { parseLatencySetting, type LatencySetting } from "./latency.js";
import { DiskLedgerDatabase } from "./ledger/disk-ledger-database.js";

/**
 * Connector hub: the only place that knows which driver backs each connector
 * and where its data lives. Services call `getLedgerDatabase()` etc. and only
 * ever see the interfaces, so swapping the disk drivers for Postgres / vendor
 * REST clients is a change here, not in any endpoint handler.
 */

export type ConnectorName = "ledger" | "kyc" | "featureFlags";

export interface ConnectorSettings {
  /** Directory holding the JSON files. Env: PLATFORM_DATA_DIR. Default: packages/backend-common/data. */
  dataDir: string;
  /** `file` persists to `dataDir`; `memory` never touches disk (tests, demos). Env: PLATFORM_STORAGE. */
  mode: StorageMode;
  /** Simulated network latency. Env: PLATFORM_SIMULATED_LATENCY_MS ("50-150" default, "off" to disable). */
  latency: LatencySetting;
}

interface ConnectorMap {
  ledger: ILedgerDatabase;
  kyc: IKycVendorClient;
  featureFlags: IFeatureFlagProvider;
}

type Instance<N extends ConnectorName> = ConnectorMap[N] & InitializableConnector;

let overrides: Partial<ConnectorSettings> = {};
let instances: { [N in ConnectorName]?: Instance<N> } = {};

export function resolveConnectorSettings(): ConnectorSettings {
  return {
    dataDir: path.resolve(overrides.dataDir ?? resolveDataDir()),
    mode: overrides.mode ?? resolveStorageMode(),
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

function resolve<N extends ConnectorName>(name: N, create: (options: DiskConnectorOptions) => Instance<N>): Instance<N> {
  const existing = instances[name];
  if (existing) return existing;
  const { dataDir, mode, latency } = resolveConnectorSettings();
  const created = create({ dataDir, mode, latency });
  instances = { ...instances, [name]: created };
  return created;
}

export function getLedgerDatabase(): ILedgerDatabase {
  return resolve("ledger", (options) => new DiskLedgerDatabase(options));
}

export function getKycVendorClient(): IKycVendorClient {
  return resolve("kyc", (options) => new DiskKycVendorClient(options));
}

export function getFeatureFlagProvider(): IFeatureFlagProvider {
  return resolve("featureFlags", (options) => new DiskFeatureFlagProvider(options));
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
