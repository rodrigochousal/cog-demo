import { createServiceApp, getLedgerDatabase, type Logger } from "@platform/backend-common";
import { SERVICE_NAME } from "./config.js";
import { createApiRouter, type ApiDependencies } from "./routes/index.js";

export interface AppOptions {
  allowedOrigins: string[];
  logger?: Logger;
  /** Override connectors (e.g. fakes in tests). Defaults resolve through the backend-common hub. */
  dependencies?: Partial<ApiDependencies>;
}

export function createApp({ allowedOrigins, logger, dependencies }: AppOptions) {
  const deps: ApiDependencies = { ledger: dependencies?.ledger ?? getLedgerDatabase() };
  return createServiceApp({
    name: SERVICE_NAME,
    allowedOrigins,
    logger,
    routes: (app) => {
      app.use("/api", createApiRouter(deps));
    },
  });
}
