/** Identity of this UI surface and its paired BFF. */
export const surface: {
  team: string;
  product: string;
  resource: string;
  actions: readonly string[];
  bffUrl: string;
} = {
  team: "Operations & Support",
  product: "Refunds Dashboard",
  /** RBAC resource this surface's BFF guards, and its action verbs (`read` is GET, others POST). */
  resource: "finance",
  actions: ["read", "execute"],
  bffUrl: process.env.NEXT_PUBLIC_BFF_URL ?? "http://localhost:4001",
};

/** Sibling surfaces in the internal suite (navigation only — never data). */
export const suiteLinks = [
  { label: "Compliance", href: "http://localhost:3000", current: false },
  { label: "Finance", href: "http://localhost:3001", current: true },
  { label: "Engineering", href: "http://localhost:3002", current: false },
];
