/**
 * Format an amount in minor units (cents) as a human-readable string.
 * Always uses sv-SE locale (space thousands separator, comma decimal).
 * Appends the 3-letter currency code as a suffix.
 *
 * Examples:
 *   formatMoney(123456, "SEK") → "1 234,56 SEK"
 *   formatMoney(-50000, "USD") → "-500,00 USD"
 */
export function formatMoney(amountCents: number, currency: string): string {
  return (
    (amountCents / 100).toLocaleString("sv-SE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) +
    " " +
    currency
  );
}

/**
 * Format an amount in minor units without a currency suffix.
 * Use this only when currency is shown elsewhere in context (column header, etc.).
 */
export function formatAmount(amountCents: number): string {
  return (amountCents / 100).toLocaleString("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const MILLION = 1_000_000;

/**
 * Money as people say it: whole kronor with "kr", other currencies with their
 * code. Compact turns a million or more into "2,97 mn kr" so it fits a tile.
 *
 *   formatKr(123456)                                → "1 235 kr"
 *   formatKr(297_000_000, "SEK", { compact: true }) → "2,97 mn kr"
 *   formatKr(5000, "SEK", { sign: true })           → "+50 kr"
 *   formatKr(8950, "SEK", { exact: true })          → "89,50 kr"
 */
export function formatKr(
  minor: number,
  currency = "SEK",
  {
    compact = false,
    sign = false,
    exact = false,
  }: { compact?: boolean; sign?: boolean; exact?: boolean } = {},
): string {
  const suffix = currency === "SEK" ? "kr" : currency;
  // One purchase or price keeps its öre; totals don't need them.
  if (exact && minor % 100 !== 0) {
    const plus = sign && minor > 0 ? "+" : "";
    const value = (minor / 100).toLocaleString("sv-SE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${plus}${value} ${suffix}`;
  }
  const units = Math.round(minor / 100);
  const plus = sign && units > 0 ? "+" : "";
  if (compact && Math.abs(units) >= MILLION) {
    const millions = (units / MILLION).toLocaleString("sv-SE", {
      maximumFractionDigits: 2,
    });
    return `${plus}${millions} mn ${suffix}`;
  }
  return `${plus}${units.toLocaleString("sv-SE")} ${suffix}`;
}

/** A chart axis tick in whole units: "950", "340k", "1,2 mn". */
export function formatAxisKr(minor: number): string {
  const units = minor / 100;
  if (Math.abs(units) >= MILLION) {
    const millions = (units / MILLION).toLocaleString("sv-SE", {
      maximumFractionDigits: 1,
    });
    return `${millions} mn`;
  }
  if (Math.abs(units) >= 1000) return `${Math.round(units / 1000)}k`;
  return Math.round(units).toLocaleString("sv-SE");
}

/**
 * Format a quantity in micro-units (millionths) as a human-readable number.
 * Used for investment quantities.
 */
export function formatQuantity(microUnits: number): string {
  return (microUnits / 1_000_000).toLocaleString("sv-SE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}
