import { createServiceApp, injectMockUser, type Logger } from "@platform/backend-common";
import { SERVICE_NAME } from "./config.js";
import { createApiRouter } from "./routes/index.js";

export interface AppOptions {
  allowedOrigins: string[];
  logger?: Logger;
}

export function createApp({ allowedOrigins, logger }: AppOptions) {
  return createServiceApp({
    name: SERVICE_NAME,
    allowedOrigins,
    logger,
    routes: (app) => {
      app.use("/api", injectMockUser, createApiRouter());
    },
  });
}
