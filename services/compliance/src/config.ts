import { readList, readPort } from "@platform/backend-common";

export const SERVICE_NAME = "compliance-service";

export const config = {
  port: readPort("PORT", 4000),
  allowedOrigins: readList("APP_ORIGINS", ["http://localhost:3000"]),
};
