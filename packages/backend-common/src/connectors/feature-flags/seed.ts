import type { CustomerTier, FeatureFlag, FeatureFlagProvider, FlagEnvironment } from "../../domain/index.js";

type Row = [
  key: string,
  name: string,
  description: string,
  enabled: boolean,
  tiers: CustomerTier[],
  rollout: number,
  environment: FlagEnvironment,
  ownerTeam: string,
  tags: string[],
  dates: [createdAt: string, updatedAt: string],
];

const ROWS: Row[] = [
  ["instant-payouts", "Instant payouts", "Settle merchant payouts over RTP/FedNow within seconds instead of next-day ACH.", true, ["growth", "enterprise", "internal"], 100, "production", "payments-core", ["payouts", "rtp"], ["2026-03-04T10:00:00.000Z", "2026-10-12T16:20:00.000Z"]],
  ["ach-same-day", "Same-day ACH", "Submit eligible ACH credits in the same-day Nacha windows.", true, ["starter", "growth", "enterprise"], 100, "production", "payments-core", ["ach"], ["2026-01-15T09:30:00.000Z", "2026-09-01T11:05:00.000Z"]],
  ["fraud-model-v3", "Fraud model v3 (shadow)", "Score card transactions with the gradient-boosted v3 model in shadow mode alongside v2.", true, ["internal"], 25, "production", "risk-ml", ["fraud", "ml", "shadow"], ["2026-08-20T14:12:00.000Z", "2026-10-25T08:40:00.000Z"]],
  ["kyc-persona-v2-flow", "Persona v2 onboarding flow", "Use Persona's dynamic inquiry template with NFC passport reads.", false, ["free", "starter"], 10, "staging", "identity", ["kyc", "onboarding"], ["2026-09-10T12:00:00.000Z", "2026-10-18T13:15:00.000Z"]],
  ["multi-currency-wallets", "Multi-currency wallets", "Hold balances in USD, EUR and GBP with on-demand FX conversion.", true, ["enterprise"], 50, "production", "treasury", ["fx", "wallets"], ["2026-05-02T08:45:00.000Z", "2026-10-02T09:30:00.000Z"]],
  ["virtual-cards-bulk-issue", "Bulk virtual card issuance", "Issue up to 5,000 virtual cards per request via CSV upload.", true, ["growth", "enterprise"], 100, "production", "card-issuing", ["cards"], ["2026-04-18T15:20:00.000Z", "2026-08-30T10:10:00.000Z"]],
  ["refund-auto-approve", "Auto-approve low-risk refunds", "Skip manual review for refunds under $50 with risk score below 20.", false, ["starter", "growth"], 0, "production", "finance-ops", ["refunds", "automation"], ["2026-07-07T11:00:00.000Z", "2026-10-21T17:45:00.000Z"]],
  ["new-ledger-reconciliation", "Ledger reconciliation engine v2", "Stream-based three-way reconciliation between ledger, processor and bank files.", true, ["internal"], 100, "staging", "ledger", ["ledger", "reconciliation"], ["2026-09-25T07:30:00.000Z", "2026-10-26T12:00:00.000Z"]],
  ["sanctions-rescreen-nightly", "Nightly sanctions rescreening", "Re-screen the full customer base against updated OFAC/EU lists every night.", true, ["free", "starter", "growth", "enterprise", "internal"], 100, "production", "compliance-eng", ["sanctions", "compliance"], ["2026-02-11T10:00:00.000Z", "2026-07-19T09:00:00.000Z"]],
  ["dashboard-dark-mode", "Dashboard dark mode", "Enable the dark theme toggle in the merchant dashboard.", true, ["free", "starter", "growth", "enterprise", "internal"], 60, "production", "web-platform", ["ui"], ["2026-06-01T13:00:00.000Z", "2026-10-09T15:30:00.000Z"]],
  ["open-banking-pay-by-bank", "Pay by bank (open banking)", "Offer account-to-account checkout via Plaid/TrueLayer payment initiation.", false, ["growth", "enterprise"], 5, "staging", "payments-core", ["open-banking", "checkout"], ["2026-10-01T09:00:00.000Z", "2026-10-27T10:20:00.000Z"]],
  ["chargeback-evidence-ai", "AI chargeback evidence drafts", "Draft representment evidence packets from order and delivery data.", false, ["internal"], 0, "development", "disputes", ["disputes", "ai"], ["2026-10-14T16:00:00.000Z", "2026-10-28T11:10:00.000Z"]],
  ["treasury-sweeps", "Automated treasury sweeps", "Sweep idle balances above a threshold into money-market funds daily.", true, ["enterprise"], 100, "production", "treasury", ["treasury", "yield"], ["2026-03-22T10:30:00.000Z", "2026-09-14T08:00:00.000Z"]],
  ["webhooks-v2", "Webhooks v2 (signed, retried)", "Deliver events with Ed25519 signatures and exponential-backoff retries for 72h.", true, ["starter", "growth", "enterprise", "internal"], 80, "production", "developer-platform", ["api", "webhooks"], ["2026-05-28T12:45:00.000Z", "2026-10-20T14:35:00.000Z"]],
  ["spend-controls-mcc", "MCC-based spend controls", "Let admins block card spend by merchant category code.", true, ["growth", "enterprise"], 100, "production", "card-issuing", ["cards", "controls"], ["2026-02-27T09:15:00.000Z", "2026-06-11T10:40:00.000Z"]],
  ["invoice-financing-beta", "Invoice financing beta", "Advance up to 90% of outstanding invoice value to eligible merchants.", false, ["enterprise"], 0, "staging", "lending", ["lending", "beta"], ["2026-10-05T10:00:00.000Z", "2026-10-05T10:00:00.000Z"]],
  ["audit-log-export", "Audit log CSV export", "Allow admins to export 13 months of audit events as CSV.", true, ["enterprise", "internal"], 100, "production", "compliance-eng", ["audit", "export"], ["2026-04-09T11:30:00.000Z", "2026-08-02T16:00:00.000Z"]],
  ["rate-limit-adaptive", "Adaptive API rate limiting", "Scale per-key rate limits by historical traffic and plan tier.", false, ["free", "starter"], 15, "development", "developer-platform", ["api", "reliability"], ["2026-10-19T08:20:00.000Z", "2026-10-29T09:50:00.000Z"]],
];

/** Flags alternate between providers (mid-migration from Unleash to LaunchDarkly). */
const PROVIDERS: readonly FeatureFlagProvider[] = ["launchdarkly", "unleash"];
const ENGINEERS = ["eng.akumar", "eng.jsmith", "eng.lnguyen", "eng.ptorres"] as const;

/**
 * 18 flags across environments, tiers, rollout stages and both providers, in the platform's
 * generic shape. Each provider mock seeds its own file from these.
 */
export function seedFeatureFlags(): FeatureFlag[] {
  return ROWS.map(([key, name, description, enabled, targetTiers, rolloutPercentage, environment, ownerTeam, tags, [createdAt, updatedAt]], index) => ({
    key,
    provider: PROVIDERS[index % PROVIDERS.length] ?? "launchdarkly",
    name,
    description,
    enabled,
    targetTiers,
    rolloutPercentage,
    environment,
    ownerTeam,
    tags,
    createdAt,
    updatedAt,
    updatedBy: ENGINEERS[index % ENGINEERS.length] ?? "eng.akumar",
  }));
}
