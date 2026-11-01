/** ISO-4217 currencies the platform settles in. */
export const CURRENCY_CODES = ["USD", "EUR", "GBP"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

/** Monetary values are always integers in minor units (e.g. cents) to avoid float drift. */
export interface Money {
  amountMinor: number;
  currency: CurrencyCode;
}
