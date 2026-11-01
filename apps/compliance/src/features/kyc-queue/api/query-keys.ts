export const kycQueueKeys = {
  all: ["kyc-queue"] as const,
  list: () => [...kycQueueKeys.all, "list"] as const,
};
