import { createApiClient, mockIdentityHeaders } from "ui-shared";

/** The one and only backend this app talks to: services/finance (:4001). */
export const apiClient = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_BFF_URL ?? "http://localhost:4001",
  getHeaders: mockIdentityHeaders,
});
