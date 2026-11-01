import { describe, expect, it } from "vitest";
import { launchDarklyFlags } from "../src/connectors/feature-flags/vendors/launchdarkly.js";
import { unleashFeatures } from "../src/connectors/feature-flags/vendors/unleash.js";
import { seedFeatureFlags } from "../src/connectors/feature-flags/seed.js";
import { alloyEvaluations } from "../src/connectors/kyc/vendors/alloy.js";
import { personaInquiries } from "../src/connectors/kyc/vendors/persona.js";
import { seedKycVerifications } from "../src/connectors/kyc/seed.js";
import { paypalRefunds } from "../src/connectors/ledger/vendors/paypal.js";
import { stripeRefunds } from "../src/connectors/ledger/vendors/stripe.js";
import { seedRefunds } from "../src/connectors/ledger/seed.js";
import type { VendorAdapter } from "../src/connectors/vendor-collection.js";

function describeAdapter<E, D>(adapter: VendorAdapter<E, D>) {
  describe(`${adapter.vendor} adapter`, () => {
    const seed = adapter.seed();

    it("seeds records that satisfy its edge schema", () => {
      expect(seed.length).toBeGreaterThan(0);
      for (const edge of seed) expect(adapter.schema.safeParse(edge).error).toBeUndefined();
    });

    it("maps edge → domain → edge without loss", () => {
      for (const edge of seed) expect(adapter.toEdge(adapter.toDomain(edge))).toEqual(edge);
    });
  });
}

describeAdapter(stripeRefunds);
describeAdapter(paypalRefunds);
describeAdapter(personaInquiries);
describeAdapter(alloyEvaluations);
describeAdapter(launchDarklyFlags);
describeAdapter(unleashFeatures);

const byKey = <T>(key: (t: T) => string) => (a: T, b: T) => key(a).localeCompare(key(b));

describe("domain round trip", () => {
  it("rebuilds every generic seed record from the vendor mocks", () => {
    const refunds = [...stripeRefunds.seed().map(stripeRefunds.toDomain), ...paypalRefunds.seed().map(paypalRefunds.toDomain)];
    expect(refunds.sort(byKey((r) => r.id))).toEqual(seedRefunds().sort(byKey((r) => r.id)));

    const verifications = [
      ...personaInquiries.seed().map(personaInquiries.toDomain),
      ...alloyEvaluations.seed().map(alloyEvaluations.toDomain),
    ].map(({ documentUrl: _url, ...rest }) => rest);
    expect(verifications.sort(byKey((v) => v.applicantId))).toEqual(seedKycVerifications().sort(byKey((v) => v.applicantId)));

    const flags = [...launchDarklyFlags.seed().map(launchDarklyFlags.toDomain), ...unleashFeatures.seed().map(unleashFeatures.toDomain)];
    expect(flags.sort(byKey((f) => f.key))).toEqual(seedFeatureFlags().sort(byKey((f) => f.key)));
  });
});

describe("vendor-specific mapping", () => {
  it("Stripe: lower-case currency, unix seconds, workflow state in string metadata", () => {
    const edge = stripeRefunds.seed().find((r) => r.metadata.platform_refund_id === "rf_8f2c41a9d0b1");
    expect(edge).toMatchObject({
      id: "re_8f2c41a9d0b1",
      currency: "usd",
      status: "pending",
      reason: "requested_by_customer",
      created: Date.parse("2026-10-02T14:21:07.000Z") / 1000,
      metadata: { review_status: "pending_review", reason_code: "service_not_rendered", risk_score: "12" },
    });
    expect(edge?.metadata).not.toHaveProperty("reviewed_by");
    if (!edge) throw new Error("seed missing");
    expect(stripeRefunds.toDomain(edge)).toMatchObject({ status: "pending_review", reviewedBy: null, approvals: [], riskScore: 12 });
  });

  it("PayPal: decimal-string amounts and SCREAMING_CASE enums", () => {
    const edge = paypalRefunds.seed().find((r) => r.invoice_id === "rf_c40d5e6f7a83");
    expect(edge).toMatchObject({
      status: "PENDING",
      amount: { currency_code: "EUR", value: "214.50" },
      capture: { amount: { currency_code: "EUR", value: "643.50" }, funding_source: "CARD" },
      review: { state: "PROCESSING", reason_code: "PRODUCT_DEFECTIVE" },
    });
    if (!edge) throw new Error("seed missing");
    expect(paypalRefunds.toDomain(edge)).toMatchObject({ amount: { amountMinor: 21_450, currency: "EUR" }, status: "processing" });
  });

  it("Persona and Alloy: escalation is a tagged manual review; Alloy scores are 0–1", () => {
    const alloy = alloyEvaluations.seed().find((e) => e.external_entity_id === "app_01HZK429G3");
    expect(alloy?.summary).toEqual({ outcome: "Manual Review", tags: ["Escalated"], score: 0.63, risk_level: "Medium" });
    if (!alloy) throw new Error("seed missing");
    expect(alloyEvaluations.toDomain(alloy)).toMatchObject({
      status: "escalated",
      riskScore: 63,
      documentUrl: "https://app.alloy.co/evaluations/ev_A3s7DfG9hJ2k",
    });
    const persona = personaInquiries.seed()[0];
    if (!persona) throw new Error("seed missing");
    expect(personaInquiries.toDomain(persona).documentUrl).toBe(`https://app.withpersona.com/dashboard/inquiries/${persona.id}`);
  });

  it("LaunchDarkly and Unleash: rollout as weight vs string parameter", () => {
    const ld = launchDarklyFlags.seed().find((f) => f.key === "fraud-model-v3");
    expect(ld?.environments.production?.rules[0].rollout.weight).toBe(25_000);
    const unleash = unleashFeatures.seed().find((f) => f.name === "kyc-persona-v2-flow");
    expect(unleash?.environments[0].strategies[0].parameters.rollout).toBe("10");
  });
});
