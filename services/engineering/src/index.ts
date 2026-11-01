import { createLogger, startService } from "@platform/backend-common";
import { createApp } from "./app.js";
import { config, SERVICE_NAME } from "./config.js";

const logger = createLogger(SERVICE_NAME);
const app = createApp({ allowedOrigins: config.allowedOrigins, logger });

startService(app, { name: SERVICE_NAME, port: config.port, logger });
