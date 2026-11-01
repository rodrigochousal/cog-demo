import { readList, readPort } from "@platform/backend-common";

export const SERVICE_NAME = "finance-service";

export const config = {
  port: readPort("PORT", 4001),
  allowedOrigins: readList("APP_ORIGINS", ["http://localhost:3001"]),
};
