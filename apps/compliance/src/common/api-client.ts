import { createApiClient, mockIdentityHeaders } from "ui-shared";

/** The one and only backend this app talks to: services/compliance (:4000). */
export const apiClient = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_BFF_URL ?? "http://localhost:4000",
  getHeaders: mockIdentityHeaders,
});
