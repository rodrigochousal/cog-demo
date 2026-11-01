import type { CurrencyCode, PaymentRail, RefundReason, RefundRecord, RefundStatus } from "@platform/shared-types";

type Row = [
  id: string,
  customer: [id: string, name: string, email: string],
  merchant: [name: string, mcc: string],
  amounts: [refund: number, original: number, currency: CurrencyCode],
  reason: RefundReason,
  status: RefundStatus,
  rail: [rail: PaymentRail, last4: string],
  riskScore: number,
  people: [requestedBy: string, reviewedBy: string | null],
  notes: string,
  dates: [createdAt: string, updatedAt: string],
];

const ROWS: Row[] = [
  ["rf_8f2c41a9d0b1", ["cus_Q7mT2kLp9x", "Amelia Hartley", "amelia.hartley@fastmail.com"], ["Northwind Airlines", "4511"], [48_900, 48_900, "USD"], "service_not_rendered", "pending_review", ["card", "4242"], 12, ["ops.jlee", null], "Flight NW2281 cancelled by carrier; customer rebooked with another airline.", ["2026-10-02T14:21:07.000Z", "2026-10-02T14:21:07.000Z"]],
  ["rf_1b7e93c04f22", ["cus_Z3rY8vNb1q", "Marcus Oyelaran", "m.oyelaran@gmail.com"], ["Brightline Fitness", "7997"], [5_999, 5_999, "USD"], "duplicate_charge", "approved", ["card", "1881"], 6, ["support.akim", "fin.rpatel"], "Monthly membership billed twice on 2026-09-30 (processor retry).", ["2026-10-03T09:02:44.000Z", "2026-10-03T11:40:19.000Z"]],
  ["rf_c40d5e6f7a83", ["cus_H8dK1sWq4e", "Sofia Lindqvist", "sofia.lindqvist@proton.me"], ["Nordic Home Goods", "5712"], [21_450, 64_350, "EUR"], "product_defective", "processing", ["card", "0057"], 18, ["support.mgarcia", "fin.rpatel"], "Partial refund: one of three dining chairs arrived with a cracked leg.", ["2026-10-04T16:45:12.000Z", "2026-10-05T08:12:55.000Z"]],
  ["rf_9a0b1c2d3e44", ["cus_P2nV6hTz8r", "Daniel Okafor", "dokafor@outlook.com"], ["Cloudpeak SaaS", "5734"], [129_900, 129_900, "USD"], "billing_error", "completed", ["ach", "6620"], 4, ["fin.tnguyen", "fin.rpatel"], "Annual plan charged at list price instead of the negotiated enterprise rate.", ["2026-10-05T10:15:00.000Z", "2026-10-07T17:03:31.000Z"]],
  ["rf_5e6f7a8b9c05", ["cus_K9wB3jRm2t", "Priya Raman", "priya.raman@icloud.com"], ["Electra Mart", "5732"], [189_999, 189_999, "USD"], "fraudulent_transaction", "pending_review", ["card", "9310"], 87, ["risk.bot", null], "Cardholder disputes purchase; device fingerprint and shipping address unseen on account.", ["2026-10-06T03:58:41.000Z", "2026-10-06T03:58:41.000Z"]],
  ["rf_2d3e4f5a6b16", ["cus_T4xC7gYn5u", "Oliver Bennett", "oliver.bennett@btinternet.com"], ["Thames Rail", "4112"], [3_420, 3_420, "GBP"], "service_not_rendered", "completed", ["card", "7781"], 3, ["support.akim", "fin.ehughes"], "Delay Repay claim: service delayed 64 minutes.", ["2026-10-06T12:30:09.000Z", "2026-10-08T09:47:20.000Z"]],
  ["rf_7a8b9c0d1e27", ["cus_M1qF5dLs7w", "Lucía Fernández", "lucia.fdz@yahoo.es"], ["Atlas Hotels Madrid", "7011"], [36_000, 108_000, "EUR"], "customer_request", "rejected", ["card", "5116"], 22, ["support.mgarcia", "fin.ehughes"], "Requested refund of a non-refundable rate one day before arrival; policy acknowledged at booking.", ["2026-10-07T18:22:53.000Z", "2026-10-08T10:05:14.000Z"]],
  ["rf_4f5a6b7c8d38", ["cus_B6sJ9kWe3y", "Hiroshi Tanaka", "h.tanaka@me.com"], ["Pixelforge Games", "5816"], [6_999, 6_999, "USD"], "customer_request", "approved", ["card", "3398"], 9, ["support.jlee", "fin.tnguyen"], "Pre-order cancelled within the 14-day window.", ["2026-10-08T07:11:36.000Z", "2026-10-08T15:28:02.000Z"]],
  ["rf_0c1d2e3f4a49", ["cus_R5tN2pHx6i", "Grace Mwangi", "grace.mwangi@gmail.com"], ["Summit Wealth Advisors", "8931"], [250_000, 250_000, "USD"], "billing_error", "failed", ["wire", "4410"], 15, ["fin.tnguyen", "fin.rpatel"], "Wire return rejected by beneficiary bank (account closed); needs updated instructions.", ["2026-10-09T13:40:27.000Z", "2026-10-11T09:16:44.000Z"]],
  ["rf_6b7c8d9e0f5a", ["cus_D8vL4mQa1o", "Ethan Caldwell", "ethan.caldwell@hey.com"], ["Greenleaf Grocers", "5411"], [1_874, 1_874, "USD"], "duplicate_charge", "completed", ["rtp", "2207"], 2, ["support.akim", "fin.ehughes"], "POS terminal double-tap; second authorisation captured in error.", ["2026-10-10T19:05:58.000Z", "2026-10-10T19:44:10.000Z"]],
  ["rf_3e4f5a6b7c6b", ["cus_W2kG8nVr4p", "Chloé Dubois", "chloe.dubois@orange.fr"], ["Maison Lumière", "5944"], [84_500, 84_500, "EUR"], "fraudulent_transaction", "processing", ["card", "6604"], 74, ["risk.bot", "risk.sbrooks"], "Confirmed account takeover; refund issued ahead of chargeback.", ["2026-10-11T02:17:30.000Z", "2026-10-12T08:55:47.000Z"]],
  ["rf_8d9e0f1a2b7c", ["cus_F7hP3sTb9a", "Noah Fischer", "noah.fischer@posteo.de"], ["Alpine Outfitters", "5941"], [12_995, 25_990, "EUR"], "product_defective", "pending_review", ["card", "8823"], 27, ["support.mgarcia", null], "Jacket zipper failed after two uses; customer kept the second item.", ["2026-10-12T11:33:19.000Z", "2026-10-12T11:33:19.000Z"]],
  ["rf_5a6b7c8d9e8d", ["cus_J3cX6wKd2s", "Isabella Rossi", "isabella.rossi@libero.it"], ["StreamBox Media", "4899"], [1_599, 1_599, "USD"], "customer_request", "completed", ["card", "1209"], 5, ["support.jlee", "fin.tnguyen"], "Subscription renewed after cancellation request logged in support ticket #48213.", ["2026-10-13T08:48:02.000Z", "2026-10-13T16:20:39.000Z"]],
  ["rf_2b3c4d5e6f9e", ["cus_L9mR1yUf7d", "Kwame Asante", "kwame.asante@gmail.com"], ["Swift Logistics", "4215"], [9_850, 9_850, "GBP"], "service_not_rendered", "approved", ["ach", "3075"], 11, ["support.akim", "fin.ehughes"], "Parcel lost in transit; carrier claim CL-77120 filed.", ["2026-10-14T15:26:45.000Z", "2026-10-15T09:02:11.000Z"]],
  ["rf_9c0d1e2f3aaf", ["cus_N4bH7qZg3f", "Mia Thompson", "mia.thompson@gmail.com"], ["Luxe Timepieces", "5944"], [425_000, 425_000, "USD"], "fraudulent_transaction", "rejected", ["card", "4999"], 92, ["risk.bot", "risk.sbrooks"], "3-D Secure authenticated on the cardholder's own device; dispute evidence contradicts claim.", ["2026-10-15T22:09:14.000Z", "2026-10-17T10:41:58.000Z"]],
  ["rf_6e7f8a9b0cb0", ["cus_V1dS5eMh8g", "Arjun Mehta", "arjun.mehta@zoho.com"], ["Cloudpeak SaaS", "5734"], [24_000, 96_000, "USD"], "billing_error", "pending_review", ["ach", "5512"], 8, ["fin.tnguyen", null], "Seat count overbilled by 4 seats for Q3 true-up.", ["2026-10-16T14:52:37.000Z", "2026-10-16T14:52:37.000Z"]],
  ["rf_3a4b5c6d7ec1", ["cus_X6fT9rNj4h", "Emily Clarke", "emily.clarke@sky.com"], ["Bloom & Co Florists", "5992"], [4_500, 7_500, "GBP"], "product_defective", "processing", ["card", "2846"], 14, ["support.mgarcia", "fin.ehughes"], "Arrangement delivered wilted; partial refund agreed with customer.", ["2026-10-17T09:17:22.000Z", "2026-10-18T07:30:05.000Z"]],
  ["rf_0e1f2a3b4cd2", ["cus_C2gW4tPk5j", "Lucas Martin", "lucas.martin@free.fr"], ["Velocity Car Rental", "7512"], [17_830, 17_830, "EUR"], "duplicate_charge", "pending_review", ["card", "7123"], 31, ["support.jlee", null], "Deposit hold captured instead of released at vehicle return.", ["2026-10-18T17:44:50.000Z", "2026-10-18T17:44:50.000Z"]],
];

/** 18 refunds across every status, reason, rail and currency. */
export function seedRefunds(): RefundRecord[] {
  return ROWS.map(([id, [customerId, customerName, customerEmail], [merchantName, merchantCategoryCode], [refund, original, currency], reason, status, [paymentRail, destinationLast4], riskScore, [requestedBy, reviewedBy], notes, [createdAt, updatedAt]]) => ({
    id,
    transactionId: `txn_${id.slice(3)}`,
    customerId,
    customerName,
    customerEmail,
    merchantName,
    merchantCategoryCode,
    amount: { amountMinor: refund, currency },
    originalAmount: { amountMinor: original, currency },
    reason,
    status,
    paymentRail,
    destinationLast4,
    riskScore,
    requestedBy,
    reviewedBy,
    notes,
    createdAt,
    updatedAt,
  }));
}
