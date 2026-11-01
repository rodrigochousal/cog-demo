export const refundKeys = {
  all: ["refunds"] as const,
  list: () => [...refundKeys.all, "list"] as const,
};
