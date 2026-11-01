import { readList, readPort } from "@platform/backend-common";

export const SERVICE_NAME = "engineering-service";

export const config = {
  port: readPort("PORT", 4002),
  allowedOrigins: readList("APP_ORIGINS", ["http://localhost:3002"]),
};
