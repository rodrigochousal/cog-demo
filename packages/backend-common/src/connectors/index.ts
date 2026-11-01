/**
 * Public surface of the connector layer: interfaces + hub factories only.
 * The Disk* drivers stay internal so services cannot bypass the hub or learn
 * where data lives.
 */
export type { IFeatureFlagProvider, IKycVendorClient, ILedgerDatabase } from "./interfaces.js";
export {
  configureConnectors,
  getFeatureFlagProvider,
  getKycVendorClient,
  getLedgerDatabase,
  initializeConnectors,
  resetConnectors,
  resolveConnectorSettings,
  type ConnectorName,
  type ConnectorSettings,
} from "./hub.js";
export { ConnectorError } from "./errors.js";
export {
  DEFAULT_LATENCY,
  parseLatencySetting,
  withSimulatedLatency,
  type LatencyRange,
  type LatencySetting,
} from "./latency.js";
