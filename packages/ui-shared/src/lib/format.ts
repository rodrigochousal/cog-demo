const dateTime = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

/** `2026-10-04T16:45:12.000Z` → `Oct 04, 2026, 16:45 UTC` (fixed UTC so SSR and browser agree). */
export const formatDateTime = (iso: string): string => `${dateTime.format(new Date(iso))} UTC`;

const currencyFormatters = new Map<string, Intl.NumberFormat>();

/** Major-unit amount in its ISO-4217 currency, e.g. `formatMoney(214.5, "EUR")` → `€214.50`. */
export function formatMoney(amount: number, currency: string): string {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
    currencyFormatters.set(currency, formatter);
  }
  return formatter.format(amount);
}

export const formatCount = (value: number): string => value.toLocaleString("en-US");
